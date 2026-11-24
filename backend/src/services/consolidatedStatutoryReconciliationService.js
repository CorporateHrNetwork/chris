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
    'SELECT "sourceId","employeeId","locationId","reviewNote","reviewedAt" FROM "consolidated_statutory_import_matches" WHERE "organizationId"=$1 AND "batchId"=$2',
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
    await tx.$queryRawUnsafe(
      `INSERT INTO "consolidated_statutory_import_matches"
        ("id","organizationId","batchId","sourceId","employeeId","locationId","reviewNote","reviewedByUserId")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("organizationId","batchId","sourceId")
        DO UPDATE SET "employeeId"=EXCLUDED."employeeId","locationId"=EXCLUDED."locationId",
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
async function verifyHistoricalBatch({organizationId,batchId,actorUserId,prismaClient}) {
  const db=prismaClient||prisma();
  if(!actorUserId) throw error("REVIEWER_REQUIRED","A signed-in reviewer is required.",403);
  const summary=await reviewSummary({organizationId,batchId,prismaClient:db});
  if(summary.status!=="PENDING_RECONCILIATION") throw error("BATCH_NOT_PENDING","Historical batch is not pending reconciliation.",409);
  if(!summary.canVerify) throw error("RECONCILIATION_INCOMPLETE","Resolve all employee mappings and critical source differences before verification.",409);
  await db.$transaction(async tx=>{
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
      `SELECT m."sourceId",m."employeeId",l."name" AS "locationName",l."code" AS "locationCode"
         FROM "consolidated_statutory_import_matches" m
         JOIN "organization_locations" l ON l."id"=m."locationId" AND l."organizationId"=m."organizationId"
        WHERE m."organizationId"=$1 AND m."batchId"=$2`, organizationId,batch.id);
    const bySource=new Map(matches.map(m=>[m.sourceId,m]));
    const payload=Array.isArray(batch.payload)?batch.payload:JSON.parse(batch.payload||"[]");
    for(const record of payload) {
      const m=bySource.get(record.sourceId);
      if(!m) throw error("VERIFIED_BATCH_INCOMPLETE","Verified historical batch has unresolved source records.",409);
      records.push({...record,employeeId:m.employeeId,branch:branchName(m.locationName)||branchName(m.locationCode),historicalReviewStatus:"VERIFIED"});
    }
  }
  return records;
}
module.exports={reviewSummary,approveSourceMatch,verifyHistoricalBatch,verifiedHistoricalRecords,branchName};
