"use strict";
/**
 * Read-only, exact-identity candidate suggestions for a reviewed import.
 * No edit, no match persistence, no inferred historical location.
 */
const prisma = () => require("../config/prisma");
function normalizedName(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function tokenKey(value) { return normalizedName(value).split(" ").filter(Boolean).sort().join(" "); }
function extractCandidates(source, employees) {
  const no = String(source.employeeNo || "").trim().toUpperCase();
  const key = tokenKey(source.employeeName);
  const hits = [];
  for (const employee of employees) {
    const name = [employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(" ");
    const numberMatch = Boolean(no && employee.employeeNumber?.trim().toUpperCase() === no);
    const nameMatch = Boolean(key && tokenKey(name)===key);
    if(numberMatch || nameMatch) hits.push({
      employeeId:employee.id, employeeNo:employee.employeeNumber, employeeName:name,
      currentLocationId:employee.locationId || null,
      matchReason:numberMatch && nameMatch ? "EXACT_NUMBER_AND_NAME" :
        numberMatch ? "EXACT_EMPLOYEE_NUMBER" : "EXACT_NAME_TOKENS",
    });
  }
  // A source employee number that conflicts with an exact name candidate
  // is a blocker for manual HR review, not proof of identity.
  return hits.sort((a,b)=>a.matchReason.localeCompare(b.matchReason)).slice(0,20);
}
async function proposeCandidates({organizationId,batchId,sourceId,prismaClient=null}) {
  if(!organizationId||!batchId||!sourceId)
    throw Object.assign(new Error("Organization, batch and source required."),{code:"MATCH_SOURCE_REQUIRED",statusCode:400});
  const db=prismaClient||prisma();
  const batches=await db.$queryRawUnsafe(
    'SELECT "payload" FROM "consolidated_statutory_import_batches" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',
    organizationId,batchId);
  if(!batches.length) throw Object.assign(new Error("Import batch not found."),{code:"IMPORT_BATCH_NOT_FOUND",statusCode:404});
  const payload=Array.isArray(batches[0].payload)?batches[0].payload:JSON.parse(batches[0].payload||"[]");
  const source=payload.find(row=>row.sourceId===sourceId);
  if(!source) throw Object.assign(new Error("Source row not found."),{code:"SOURCE_ROW_NOT_FOUND",statusCode:404});
  const employees=await db.employee.findMany({where:{organizationId},
    select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,locationId:true}});
  const candidates=extractCandidates(source,employees);
  return {sourceId,sourceEmployeeNo:source.employeeNo||null,sourceEmployeeName:source.employeeName,
    candidates,ambiguous:candidates.length!==1,requiresHumanReview:true,
    note:"Suggestions do not verify identity, historical branch, or support automatic acceptance."};
}
module.exports={normalizedName,extractCandidates,proposeCandidates};
