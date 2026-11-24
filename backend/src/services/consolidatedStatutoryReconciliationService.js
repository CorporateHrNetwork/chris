"use strict";
/**
 * Review historical source matches against authoritative tenant Employee and
 * OrganizationLocation records. No implicit cross-branch matching or fuzzy merge.
 * Source payload is immutable; a reviewed overlay supplies employee and branch.
 */
const crypto = require("node:crypto");
const prisma = () => require("../config/prisma");
const { buildConsolidatedReport } = require("./consolidatedStatutoryReportService");

function error(code,message,statusCode=400) { return Object.assign(new Error(message),{code,statusCode}); }
function branchName(value) {
  const k=String(value||"").toLowerCase().replace(/[^a-z]/g,"");
  if (/^(abuja|abj)(branch|office)?$/.test(k)) return "Abuja";
  if (/^(lagos|lgs)(branch|office)?$/.test(k)) return "Lagos";
  if (/^(portharcourt|phc)(branch|office)?$/.test(k)) return "Port Harcourt";
  return null;
}
async function batchForReview(db,organizationId,batchId) {
  const rows=await db.$queryRawUnsafe(
    'SELECT "id","organizationId","reportYear","status","payload","diagnostics" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',
    organizationId,batchId);
  if(!rows.length) throw error("IMPORT_BATCH_NOT_FOUND","Historical batch not found for this organization.",404);
  return rows[0];
}
async function reviewedMatches(db,organizationId,batchId) {
  return db.$queryRawUnsafe(
    'SELECT "sourceId","employeeId","locationId","identityDisposition","reviewNote","reviewedAt" FROM "consolidated_statutory_import_matches" WHERE "organizationId"=$1 AND "batchId"=$2',
    organizationId,batchId);
}
async function reviewSummary({organizationId,batchId,prismaClient}) {
  const db=prismaClient||prisma();
  const batch=await batchForReview(db,organizationId,batchId);
  const sourceRows=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
  const decisions=await reviewedMatches(db,organizationId,batchId);
  const bySource=new Map(decisions.map(d=>[d.sourceId,d]));
  const unresolved=sourceRows.filter(r=>!bySource.has(r.sourceId)).map(r=>({
    sourceId:r.sourceId, employeeNo:r.employeeNo, employeeName:r.employeeName,
    period:r.period, sourceSheet:r.sourceId.split(":").at(-2),
  }));
  const sourceExceptions=Array.isArray(batch.diagnostics?.exceptions)?batch.diagnostics.exceptions:[];
  return {batchId,reportYear:batch.reportYear,status:batch.status,total:sourceRows.length,
    reviewed:sourceRows.length-unresolved.length,unresolved,sourceExceptions,
    canVerify:unresolved.length===0 && sourceRows.length>0 &&
      !sourceExceptions.some(x=>["MISSING_HEADERS","MISSING_SHEET","PENSION_TOTAL_MISMATCH","PAYE_SOURCE_TOTAL_MISMATCH","UNRECOGNIZED_PERIOD"].includes(x.code))};
}
async function approveSourceMatch({organizationId,batchId,sourceId,employeeId,locationId,reviewNote,actorUserId,prismaClient}) {
  const db=prismaClient||prisma();
  const note=String(reviewNote||"").trim();
  if(!organizationId||!actorUserId||!batchId||!sourceId||!employeeId||!locationId||note.length<12)
    throw error("MATCH_DETAILS_REQUIRED","Select a verified employee, historical branch and review note (at least 12 characters).");
  const batch=await batchForReview(db,organizationId,batchId);
  if(batch.status!=="PENDING_RECONCILIATION") throw error("BATCH_NOT_EDITABLE","Only pending historical batches can be reconciled.",409);
  const rows=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
  const source=rows.find(x=>x.sourceId===sourceId);
  if(!source) throw error("SOURCE_ROW_NOT_FOUND","Selected source transaction does not belong to this batch.",404);
  const employee=await db.employee.findFirst({where:{organizationId,id:employeeId},
    select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true}});
  const location=await db.organizationLocation.findFirst({where:{organizationId,id:locationId},
    select:{id:true,name:true,code:true}});
  if(!employee||!location) throw error("TENANT_EMPLOYEE_OR_LOCATION_INVALID","Employee or branch is not within your organization.",403);
  const branch=branchName(location.name)||branchName(location.code);
  if(!branch) throw error("UNSUPPORTED_BRANCH","Verify the historical location against Abuja, Lagos, or Port Harcourt.",400);
  // A number mismatch is never silently approved, even when a reviewer knows an alias;
  // explicit audit note captures the reason.
  if(source.employeeNo && source.employeeNo.trim().toUpperCase()!==employee.employeeNumber.trim().toUpperCase()
    && !/alias|legacy|renumber|employee number/i.test(note))
    throw error("EMPLOYEE_NUMBER_MISMATCH","Employee number differs from the historical file; explain the legacy/alias mapping in the review note.",409);
  const id=crypto.randomUUID();
  await db.$transaction(async tx=>{
    // Serialize match edits with verification of this batch. A source cannot
    // be remapped after the batch has been verified by another reviewer.
    const locked=await tx.$queryRawUnsafe(
      `SELECT "status" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
      organizationId,batchId);
    if(locked[0]?.status!=="PENDING_RECONCILIATION")
      throw error("BATCH_NOT_EDITABLE","Historical batch is no longer pending reconciliation.",409);
    await tx.$queryRawUnsafe(
      `INSERT INTO "consolidated_statutory_import_matches"
        ("id","organizationId","batchId","sourceId","employeeId","locationId","reviewNote","reviewedByUserId")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("organizationId","batchId","sourceId")
        DO UPDATE SET "employeeId"=EXCLUDED."employeeId","locationId"=EXCLUDED."locationId",
                      "identityDisposition"='MATCHED_EMPLOYEE',
                      "reviewNote"=EXCLUDED."reviewNote","reviewedByUserId"=EXCLUDED."reviewedByUserId",
                      "reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
      id,organizationId,batchId,sourceId,employee.id,location.id,note,actorUserId);
    await tx.organizationAudit.create({data:{organizationId,actorUserId,
      entityType:"ConsolidatedStatutoryImportMatch",entityId:sourceId,
      action:"HISTORICAL_SOURCE_MATCH_REVIEWED",
      newValue:{batchId,sourceId,employeeId:employee.id,locationId:location.id,branch,reviewNote:note},
      reason:"Manual historical employee identity and branch verification"}});
  });
  return {sourceId,employeeId:employee.id,employeeNumber:employee.employeeNumber,branch,status:"REVIEWED"};
}
async function recordExitedHistorical({organizationId,batchId,sourceId,locationId=null,reviewNote,actorUserId,prismaClient}) {
  const db=prismaClient||prisma();
  const note=String(reviewNote||"").trim();
  if(!organizationId||!actorUserId||!batchId||!sourceId||note.length<12)
    throw error("EXITED_EVIDENCE_REQUIRED","Record an HR evidence note of at least 12 characters for the exited historical employee.");
  const batch=await batchForReview(db,organizationId,batchId);
  if(batch.status!=="PENDING_RECONCILIATION") throw error("BATCH_NOT_EDITABLE","Historical batch is no longer editable.",409);
  const sourceRows=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
  const source=sourceRows.find(x=>x.sourceId===sourceId);
  if(!source)throw error("SOURCE_ROW_NOT_FOUND","Source transaction does not belong to this historical batch.",404);
  let branch=null;
  if(locationId){
    const location=await db.organizationLocation.findFirst({where:{organizationId,id:locationId},
      select:{id:true,name:true,code:true}});
    if(!location) throw error("INVALID_HISTORICAL_BRANCH","Branch does not belong to this organization.",403);
    branch=branchName(location.name)||branchName(location.code);
    if(!branch)throw error("UNSUPPORTED_BRANCH","Only Abuja, Lagos and Port Harcourt are supported.",400);
  }
  const id=crypto.randomUUID();
  await db.$transaction(async tx=>{
    const locked=await tx.$queryRawUnsafe(
      `SELECT "status" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
      organizationId,batchId);
    if(locked[0]?.status!=="PENDING_RECONCILIATION")
      throw error("BATCH_NOT_EDITABLE","Historical batch was verified while it was being reviewed.",409);
    await tx.$queryRawUnsafe(
      `INSERT INTO "consolidated_statutory_import_matches"
       ("id","organizationId","batchId","sourceId","employeeId","locationId","identityDisposition","reviewNote","reviewedByUserId")
       VALUES ($1,$2,$3,$4,NULL,$5,'EXITED_HISTORICAL',$6,$7)
       ON CONFLICT ("organizationId","batchId","sourceId")
       DO UPDATE SET "employeeId"=NULL,"locationId"=EXCLUDED."locationId",
         "identityDisposition"='EXITED_HISTORICAL',"reviewNote"=EXCLUDED."reviewNote",
         "reviewedByUserId"=EXCLUDED."reviewedByUserId",
         "reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
      id,organizationId,batchId,sourceId,locationId||null,note,actorUserId);
    await tx.organizationAudit.create({data:{organizationId,actorUserId,
      entityType:"ConsolidatedStatutoryImportMatch",entityId:sourceId,
      action:"EXITED_HISTORICAL_SOURCE_REVIEWED",
      newValue:{batchId,sourceId,identityDisposition:"EXITED_HISTORICAL",
        employeeId:null,employeeNo:null,branch,reviewNote:note},
      reason:"HR-confirmed exited historical employee; no employee number invented"}});
  });
  return {sourceId,status:"EXITED_HISTORICAL",employeeId:null,employeeNo:null,branch};
}
async function recordExitedHistoricalBulk({organizationId,batchId,sourceIds,reviewNote,actorUserId,prismaClient}) {
  const db=prismaClient||prisma();
  const note=String(reviewNote||"").trim();
  if(!organizationId||!batchId||!actorUserId||note.length<12)
    throw error("EXITED_EVIDENCE_REQUIRED","A signed-in HR reviewer and written exit confirmation are required.");
  if(!Array.isArray(sourceIds)||sourceIds.length===0||sourceIds.length>100||
     sourceIds.some(x=>typeof x!=="string"||!x)||new Set(sourceIds).size!==sourceIds.length)
    throw error("INVALID_SOURCE_SELECTION","Select between 1 and 100 unique historical source rows.");
  const batch=await batchForReview(db,organizationId,batchId);
  if(batch.status!=="PENDING_RECONCILIATION")throw error("BATCH_NOT_EDITABLE","Historical batch is not pending review.",409);
  const records=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
  const validIds=new Set(records.map(x=>x.sourceId));
  if(sourceIds.some(x=>!validIds.has(x)))
    throw error("SOURCE_ROW_NOT_FOUND","One or more selected rows do not belong to this source batch.",404);
  await db.$transaction(async tx=>{
    const locked=await tx.$queryRawUnsafe(
      `SELECT "status" FROM "consolidated_statutory_import_batches"
       WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,organizationId,batchId);
    if(locked[0]?.status!=="PENDING_RECONCILIATION")
      throw error("BATCH_NOT_EDITABLE","Batch was verified or changed during exited historical review.",409);
    // Refuse to silently replace established employee identity assignments.
    const existing=await tx.$queryRawUnsafe(
      `SELECT "sourceId","identityDisposition" FROM "consolidated_statutory_import_matches"
       WHERE "organizationId"=$1 AND "batchId"=$2 AND "sourceId"=ANY($3::text[])`,
       organizationId,batchId,sourceIds);
    if(existing.some(x=>x.identityDisposition!=="EXITED_HISTORICAL"))
      throw error("ALREADY_MATCHED_EMPLOYEE","One or more selected rows already have a reviewed CHRiS employee identity. Resolve them individually.",409);
    for(const sourceId of sourceIds){
      await tx.$queryRawUnsafe(
        `INSERT INTO "consolidated_statutory_import_matches"
          ("id","organizationId","batchId","sourceId","employeeId","locationId","identityDisposition","reviewNote","reviewedByUserId")
          VALUES ($1,$2,$3,$4,NULL,NULL,'EXITED_HISTORICAL',$5,$6)
          ON CONFLICT ("organizationId","batchId","sourceId") DO UPDATE SET
          "reviewNote"=EXCLUDED."reviewNote","reviewedByUserId"=EXCLUDED."reviewedByUserId",
          "reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
        crypto.randomUUID(),organizationId,batchId,sourceId,note,actorUserId);
    }
    await tx.organizationAudit.create({data:{
      organizationId,actorUserId,entityType:"ConsolidatedStatutoryImport",entityId:batchId,
      action:"BULK_EXITED_HISTORICAL_REVIEW",
      newValue:{sourceIds,recordCount:sourceIds.length,identityDisposition:"EXITED_HISTORICAL",
        employeeNumbersAssigned:0,branchesAssigned:0,reviewNote:note},
      reason:"Explicit HR-confirmed exited historical records; no new employee accounts or remittances"}});
  });
  return {batchId,recorded:sourceIds.length,status:"EXITED_HISTORICAL",
    verifiedBatch:false,employeeNumbersAssigned:0,branchesAssigned:0};
}
async function verifyHistoricalBatch({organizationId,batchId,actorUserId,prismaClient}) {
  const db=prismaClient||prisma();
  if(!actorUserId) throw error("REVIEWER_REQUIRED","A signed-in reviewer is required.",403);
  const summary=await reviewSummary({organizationId,batchId,prismaClient:db});
  if(summary.status!=="PENDING_RECONCILIATION") throw error("BATCH_NOT_PENDING","Historical batch is not pending reconciliation.",409);
  if(!summary.canVerify) throw error("RECONCILIATION_INCOMPLETE","Resolve all employee mappings and critical source differences before verification.",409);
  await db.$transaction(async tx=>{
    const locked=await tx.$queryRawUnsafe(
      `SELECT "status" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
      organizationId,batchId);
    if(locked[0]?.status!=="PENDING_RECONCILIATION")
      throw error("BATCH_CONFLICT","Historical batch status changed before verification.",409);
    // Recheck completeness while holding the same batch lock used by match edits.
    const latest=await reviewSummary({organizationId,batchId,prismaClient:tx});
    if(!latest.canVerify) throw error("RECONCILIATION_INCOMPLETE","Historical matches changed before verification.",409);
    const other=await tx.$queryRawUnsafe(
      `SELECT "id" FROM "consolidated_statutory_import_batches"
         WHERE "organizationId"=$1 AND "reportYear"=$2 AND "status"='VERIFIED' AND "id"<>$3
         LIMIT 1 FOR UPDATE`, organizationId,summary.reportYear,batchId);
    if(other.length) throw error("ANOTHER_VERIFIED_BATCH","A verified historical batch already exists for this year. Prevent overlapping imports before replacing it.",409);
    const updated=await tx.$queryRawUnsafe(
      `UPDATE "consolidated_statutory_import_batches"
          SET "status"='VERIFIED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2 AND "status"='PENDING_RECONCILIATION'
        RETURNING "id"`,organizationId,batchId);
    if(updated.length!==1) throw error("BATCH_CONFLICT","Historical batch changed during review.",409);
    await tx.organizationAudit.create({data:{organizationId,actorUserId,entityType:"ConsolidatedStatutoryImport",
      entityId:batchId,action:"HISTORICAL_BATCH_VERIFIED",
      newValue:{reportYear:summary.reportYear,matchedRows:summary.reviewed},reason:"All historical records manually reconciled; reporting only"}});
  });
  return {batchId,status:"VERIFIED",reviewed:summary.reviewed,postedToPayroll:false};
}
async function verifiedHistoricalRecords({organizationId,year,prismaClient}) {
  const db=prismaClient||prisma();
  const batches=await db.$queryRawUnsafe(
    `SELECT "id","payload" FROM "consolidated_statutory_import_batches"
     WHERE "organizationId"=$1 AND "reportYear"=$2 AND "status"='VERIFIED'`,
    organizationId,year);
  const records=[];
  for(const batch of batches) {
    const matches=await db.$queryRawUnsafe(
      `SELECT m."sourceId",m."employeeId",m."identityDisposition",l."name" AS "locationName",l."code" AS "locationCode"
         FROM "consolidated_statutory_import_matches" m
         LEFT JOIN "organization_locations" l ON l."id"=m."locationId" AND l."organizationId"=m."organizationId"
        WHERE m."organizationId"=$1 AND m."batchId"=$2`, organizationId,batch.id);
    const bySource=new Map(matches.map(m=>[m.sourceId,m]));
    const payload=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
    for(const record of payload) {
      const m=bySource.get(record.sourceId);
      if(!m) throw error("VERIFIED_BATCH_INCOMPLETE","Verified historical batch has unresolved source records.",409);
      records.push({...record,employeeId:m.employeeId||null,branch:branchName(m.locationName)||branchName(m.locationCode)||null,
        historicalReviewStatus:"VERIFIED",employmentStatus:m.identityDisposition==="EXITED_HISTORICAL"?"EXITED":null,
        identityDisposition:m.identityDisposition||"MATCHED_EMPLOYEE"});
    }
  }
  return records;
}
module.exports={reviewSummary,approveSourceMatch,recordExitedHistorical,recordExitedHistoricalBulk,verifyHistoricalBatch,verifiedHistoricalRecords,branchName};
