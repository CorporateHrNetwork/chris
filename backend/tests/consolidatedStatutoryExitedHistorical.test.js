"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {recordExitedHistorical,verifiedHistoricalRecords}=require("../src/services/consolidatedStatutoryReconciliationService");

function dbStub(){
 const row={sourceId:"source:STAFF PENSION:3",employeeName:"Former Employee",employeeNo:"",
  organizationId:"org1",sourceType:"HISTORICAL_IMPORT",year:2026,period:"9 Months",pensionEmployee:50};
 const batch={id:"b1",organizationId:"org1",reportYear:2026,status:"PENDING_RECONCILIATION",payload:[row],diagnostics:{exceptions:[]}};
 const calls=[],audits=[];
 const db={
  $queryRawUnsafe:async(sql,...args)=>{
   calls.push({sql,args});
   if(sql.includes('SELECT "id","organizationId","reportYear","status","payload"'))return [batch];
   if(sql.includes('SELECT "status" FROM'))return [{status:batch.status}];
   if(sql.includes('INSERT INTO "consolidated_statutory_import_matches"'))return [];
   if(sql.includes('SELECT "id","payload" FROM'))return [{id:"b1",payload:batch.payload}];
   if(sql.includes('LEFT JOIN "organization_locations"'))return [{sourceId:row.sourceId,employeeId:null,identityDisposition:"EXITED_HISTORICAL",locationName:null,locationCode:null}];
   throw Error("Unexpected SQL: "+sql);
  },
  organizationAudit:{create:async({data})=>{audits.push(data);}},
  $transaction:async cb=>cb(db),
 };
 return {db,row,batch,calls,audits};
}
test("exited staff can be reviewed without employee number, employee ID or historical branch",async()=>{
 const {db,row,calls,audits,batch}=dbStub();
 const result=await recordExitedHistorical({organizationId:"org1",batchId:"b1",sourceId:row.sourceId,
  reviewNote:"HR confirmed former employee from historical staffing record",
  actorUserId:"head-hr",prismaClient:db});
 assert.equal(result.employeeNo,null);
 assert.equal(result.employeeId,null);
 assert.equal(result.branch,null);
 assert.equal(result.status,"EXITED_HISTORICAL");
 assert.equal(audits[0].action,"EXITED_HISTORICAL_SOURCE_REVIEWED");
 assert.ok(calls.some(x=>x.sql.includes("'EXITED_HISTORICAL'")&&x.args[4]===null));
 batch.status="VERIFIED";
 const records=await verifiedHistoricalRecords({organizationId:"org1",year:2026,prismaClient:db});
 assert.equal(records.length,1);
 assert.equal(records[0].employeeNo,"");
 assert.equal(records[0].employeeId,null);
 assert.equal(records[0].branch,null);
 assert.equal(records[0].employmentStatus,"EXITED");
});
test("exited review requires source row and written confirmation",async()=>{
 const {db,row}=dbStub();
 await assert.rejects(()=>recordExitedHistorical({organizationId:"org1",batchId:"b1",sourceId:row.sourceId,
  reviewNote:"none",actorUserId:"hr",prismaClient:db}),e=>e.code==="EXITED_EVIDENCE_REQUIRED");
 await assert.rejects(()=>recordExitedHistorical({organizationId:"org1",batchId:"b1",sourceId:"invalid",
  reviewNote:"HR confirmed exited historical employment",actorUserId:"hr",prismaClient:db}),e=>e.code==="SOURCE_ROW_NOT_FOUND");
});
