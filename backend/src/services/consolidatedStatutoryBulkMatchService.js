"use strict";
/**
 * Read-only candidate assessment for entire staged historical import.
 * No inferred matches are written, and no historical branch is assumed.
 * Safe to use for triaging a 300+ row import before manual HR review.
 */
const { extractCandidates } = require("./consolidatedStatutoryMatchCandidatesService");
const prisma = () => require("../config/prisma");

function classify(source, candidates) {
  const strong = candidates.filter(x => x.matchReason === "EXACT_NUMBER_AND_NAME");
  const number = candidates.filter(x => x.matchReason === "EXACT_EMPLOYEE_NUMBER");
  const names = candidates.filter(x => x.matchReason === "EXACT_NAME_TOKENS");
  if (strong.length === 1 && candidates.length === 1) return "EXACT_NUMBER_AND_NAME";
  if (strong.length > 0 || (number.length && names.length)) return "CONFLICT_REVIEW";
  if (number.length === 1 && candidates.length === 1) return "NUMBER_ONLY_REVIEW";
  if (names.length === 1 && candidates.length === 1) return "NAME_ONLY_REVIEW";
  if (candidates.length > 1) return "AMBIGUOUS_REVIEW";
  return "UNMATCHED";
}
function assessSources(rows, employees, reviewedSourceIds = []) {
  const reviewed = new Set(reviewedSourceIds);
  const summary = { reviewed: 0, exactNumberAndName: 0, numberOnly: 0, nameOnly: 0,
    conflict: 0, ambiguous: 0, unmatched: 0, total: rows.length };
  const assessments = rows.map(source => {
    if(reviewed.has(source.sourceId)) {
      summary.reviewed++;
      return {sourceId:source.sourceId,employeeNo:source.employeeNo,employeeName:source.employeeName,
        period:source.period,sourceSheet:source.sourceId.split(":").at(-2),
        classification:"ALREADY_REVIEWED",candidates:[]};
    }
    const candidates=extractCandidates(source,employees);
    const classification=classify(source,candidates);
    const lookup={EXACT_NUMBER_AND_NAME:"exactNumberAndName",NUMBER_ONLY_REVIEW:"numberOnly",
      NAME_ONLY_REVIEW:"nameOnly",CONFLICT_REVIEW:"conflict",AMBIGUOUS_REVIEW:"ambiguous",UNMATCHED:"unmatched"};
    summary[lookup[classification]]++;
    return {sourceId:source.sourceId,employeeNo:source.employeeNo,employeeName:source.employeeName,
      period:source.period,sourceSheet:source.sourceId.split(":").at(-2),
      classification,candidates:candidates.map(c=>({
        employeeId:c.employeeId,employeeNo:c.employeeNo,employeeName:c.employeeName,matchReason:c.matchReason
      }))};
  });
  return {summary,assessments,requiresHumanReview:true,
    note:"Classification is an identity suggestion, never a verified employee or historical branch assignment."};
}
async function assessHistoricalBatch({organizationId,batchId,prismaClient=null}) {
  if(!organizationId||!batchId) throw Object.assign(new Error("Organization and batch required."),{statusCode:400,code:"BATCH_REQUIRED"});
  const db=prismaClient||prisma();
  const batch=await db.$queryRawUnsafe(
    'SELECT "payload","status" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',
    String(organizationId),String(batchId));
  if(!batch.length) throw Object.assign(new Error("Historical batch not found."),{statusCode:404,code:"BATCH_NOT_FOUND"});
  const [employees,decisions]=await Promise.all([
    db.employee.findMany({where:{organizationId},select:{
      id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,locationId:true
    }}),
    db.$queryRawUnsafe('SELECT "sourceId" FROM "consolidated_statutory_import_matches" WHERE "organizationId"=$1 AND "batchId"=$2',
      String(organizationId),String(batchId))
  ]);
  const payload=Array.isArray(batch[0].payload)?batch[0].payload:JSON.parse(batch[0].payload||"[]");
  return {batchId,status:batch[0].status,
    ...assessSources(payload,employees,decisions.map(x=>x.sourceId))};
}
module.exports={classify,assessSources,assessHistoricalBatch};
