"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {recordExitedHistoricalBulk}=require("../src/services/consolidatedStatutoryReconciliationService");
function fixture(){
 const batch={id:"batch",organizationId:"org1",status:"PENDING_RECONCILIATION",
   payload:[{sourceId:"src-a"},{sourceId:"src-b"},{sourceId:"src-c"}]};
 const decisions=[],audit=[];
 const db={
  $queryRawUnsafe:async(sql,...args)=>{
   if(sql.includes('SELECT "id","organizationId","reportYear","status","payload"'))return [batch];
   if(sql.includes('SELECT "status" FROM "consolidated_statutory_import_batches"'))return [{status:batch.status}];
   if(sql.includes('SELECT "sourceId","identityDisposition" FROM'))return decisions.filter(x=>args[2].includes(x.sourceId));
   if(sql.includes('INSERT INTO "consolidated_statutory_import_matches"')){
     decisions.push({sourceId:args[3],identityDisposition:"EXITED_HISTORICAL",employeeId:null});
     return [];
   }
   throw Error("Unexpected SQL: "+sql);
  },
  $transaction:async cb=>cb(db),
  organizationAudit:{create:async({data})=>audit.push(data)}
 };
 return {db,decisions,audit};
}
const base={organizationId:"org1",batchId:"batch",sourceIds:["src-a","src-b"],
 reviewNote:"Head HR confirms historical exited staff without CHRiS employee numbers",
 actorUserId:"hr"};
test("bulk exit confirmation changes only explicitly selected rows and makes one audit entry",async()=>{
 const {db,decisions,audit}=fixture();
 const r=await recordExitedHistoricalBulk({...base,prismaClient:db});
 assert.equal(r.recorded,2);
 assert.equal(r.verifiedBatch,false);
 assert.equal(r.employeeNumbersAssigned,0);
 assert.deepEqual(decisions.map(x=>x.sourceId),["src-a","src-b"]);
 assert.equal(audit.length,1);
 assert.equal(audit[0].action,"BULK_EXITED_HISTORICAL_REVIEW");
});
test("bulk confirmation rejects duplicate, out of batch and over-limit selections",async()=>{
 const {db}=fixture();
 await assert.rejects(()=>recordExitedHistoricalBulk({...base,sourceIds:["src-a","src-a"],prismaClient:db}),
   e=>e.code==="INVALID_SOURCE_SELECTION");
 await assert.rejects(()=>recordExitedHistoricalBulk({...base,sourceIds:["from-other-batch"],prismaClient:db}),
   e=>e.code==="SOURCE_ROW_NOT_FOUND");
 await assert.rejects(()=>recordExitedHistoricalBulk({...base,sourceIds:Array.from({length:101},(_,i)=>"x"+i),prismaClient:db}),
   e=>e.code==="INVALID_SOURCE_SELECTION");
});
test("bulk confirmation refuses to overwrite an already reviewed employee match",async()=>{
 const {db,decisions}=fixture();
 decisions.push({sourceId:"src-a",identityDisposition:"MATCHED_EMPLOYEE",employeeId:"e1"});
 await assert.rejects(()=>recordExitedHistoricalBulk({...base,prismaClient:db}),
   e=>e.code==="ALREADY_MATCHED_EMPLOYEE");
 assert.equal(decisions.length,1);
});
