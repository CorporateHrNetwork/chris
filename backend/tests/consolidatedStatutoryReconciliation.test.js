"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {reviewSummary,approveSourceMatch,verifyHistoricalBatch,verifiedHistoricalRecords}=require("../src/services/consolidatedStatutoryReconciliationService");
function client(){
  const batch={id:"batch1",organizationId:"org1",reportYear:2026,status:"PENDING_RECONCILIATION",
    payload:[{sourceType:"HISTORICAL_IMPORT",organizationId:"org1",year:2026,sourceId:"hash:STAFF PAYE:8",
       employeeNo:"LEGACY001",employeeName:"Example",period:"9 Months",paye:100}] ,diagnostics:{exceptions:[]}};
  let matches=[],audits=[],verified=false;
  const db={
    $queryRawUnsafe:async(query,...args)=>{
      if(query.includes('FROM "consolidated_statutory_import_batches" WHERE')) return args[0]==="org1" && args[1]==="batch1" ? [batch] : [];
      if(query.includes('FROM "consolidated_statutory_import_matches" WHERE')) return matches;
      if(query.includes('INSERT INTO "consolidated_statutory_import_matches"')) {
        matches=[{sourceId:args[3],employeeId:args[4],locationId:args[5],reviewNote:args[6]}];return [];
      }
      if(query.includes('AND "status"=\'VERIFIED\' AND "id"<>')) return [];
      if(query.includes('UPDATE "consolidated_statutory_import_batches"')) {batch.status="VERIFIED";verified=true;return [{id:"batch1"}];}
      if(query.includes('WHERE "organizationId"=$1 AND "reportYear"=$2 AND "status"=\'VERIFIED\'')) return verified ? [batch]:[];
      if(query.includes('JOIN "organization_locations" l')) return matches.map(m=>({...m,locationName:"Abuja",locationCode:"ABJ"}));
      throw new Error("Unexpected query:"+query);
    },
    employee:{findFirst:async ({where})=>where.organizationId==="org1" && where.id==="e1" ?
      {id:"e1",employeeNumber:"ZLL001",firstName:"Example",lastName:"Person"}:null},
    organizationLocation:{findFirst:async ({where})=>where.organizationId==="org1" && where.id==="loc1" ?
      {id:"loc1",name:"Abuja",code:"ABJ"}:null},
    organizationAudit:{create:async input=>{audits.push(input.data);return {};} },
    $transaction:async cb=>cb(db),
  };
  return {db,batch,getMatches:()=>matches,getAudits:()=>audits};
}
test("review requires deliberate alias justification, valid tenant employee and branch",async()=>{
  const {db}=client();
  const base={organizationId:"org1",batchId:"batch1",sourceId:"hash:STAFF PAYE:8",
    employeeId:"e1",locationId:"loc1",actorUserId:"hr"};
  await assert.rejects(()=>approveSourceMatch({...base,reviewNote:"Confirmed by HR register",prismaClient:db}),e=>e.code==="EMPLOYEE_NUMBER_MISMATCH");
  await assert.rejects(()=>approveSourceMatch({...base,employeeId:"otherTenant",reviewNote:"Legacy number manually matched",prismaClient:db}),e=>e.code==="TENANT_EMPLOYEE_OR_LOCATION_INVALID");
  const applied=await approveSourceMatch({...base,reviewNote:"Legacy number checked against personnel files",prismaClient:db});
  assert.equal(applied.branch,"Abuja");
  assert.equal(applied.status,"REVIEWED");
});
test("verified report excludes unmatched batches until every source row is reviewed",async()=>{
  const {db,getAudits}=client();
  let summary=await reviewSummary({organizationId:"org1",batchId:"batch1",prismaClient:db});
  assert.equal(summary.canVerify,false);
  await assert.rejects(()=>verifyHistoricalBatch({organizationId:"org1",batchId:"batch1",actorUserId:"hr",prismaClient:db}),e=>e.code==="RECONCILIATION_INCOMPLETE");
  await approveSourceMatch({organizationId:"org1",batchId:"batch1",sourceId:summary.unresolved[0].sourceId,
    employeeId:"e1",locationId:"loc1",reviewNote:"Legacy number checked against personnel files",actorUserId:"hr",prismaClient:db});
  summary=await reviewSummary({organizationId:"org1",batchId:"batch1",prismaClient:db});
  assert.equal(summary.canVerify,true);
  const verified=await verifyHistoricalBatch({organizationId:"org1",batchId:"batch1",actorUserId:"hr",prismaClient:db});
  assert.equal(verified.status,"VERIFIED");
  const rows=await verifiedHistoricalRecords({organizationId:"org1",year:2026,prismaClient:db});
  assert.equal(rows[0].employeeId,"e1");
  assert.equal(rows[0].branch,"Abuja");
  assert.equal(rows[0].historicalReviewStatus,"VERIFIED");
  assert.equal(getAudits().length,2);
});
