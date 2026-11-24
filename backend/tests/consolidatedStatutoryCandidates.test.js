"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {extractCandidates,proposeCandidates}=require("../src/services/consolidatedStatutoryMatchCandidatesService");
const employees=[
  {id:"e1",employeeNumber:"ZLL000001",firstName:"Ada",middleName:"Grace",lastName:"Okafor",locationId:"loc1"},
  {id:"e2",employeeNumber:"ZLL000002",firstName:"Ada",middleName:"Grace",lastName:"Okafor",locationId:"loc2"},
  {id:"e3",employeeNumber:"ZLL000003",firstName:"Uche",middleName:null,lastName:"Okafor",locationId:"loc3"},
];
test("candidate matching tolerates token order, never includes unrelated name",()=>{
  const result=extractCandidates({employeeName:"OKAFOR, GRACE ADA"},employees);
  assert.deepEqual(result.map(x=>x.employeeId),["e1","e2"]);
  assert.ok(result.every(x=>x.matchReason==="EXACT_NAME_TOKENS"));
});
test("employee number match is a suggestion, not an automatic verification",()=>{
  const result=extractCandidates({employeeName:"Someone Else",employeeNo:"ZLL000003"},employees);
  assert.equal(result.length,1);
  assert.equal(result[0].employeeId,"e3");
  assert.equal(result[0].matchReason,"EXACT_EMPLOYEE_NUMBER");
});
test("candidate endpoint strictly scopes organization and source row and marks ambiguous",async()=>{
  const calls=[];
  const db={
    $queryRawUnsafe:async (query,...args)=>{
      calls.push(args);
      return args[0]==="tenant1"&&args[1]==="batch1"?
        [{payload:[{sourceId:"src1",employeeName:"Ada Grace Okafor",employeeNo:""}]}]:[];
    },
    employee:{findMany:async ({where})=>{assert.equal(where.organizationId,"tenant1");return employees;}},
  };
  const result=await proposeCandidates({organizationId:"tenant1",batchId:"batch1",sourceId:"src1",prismaClient:db});
  assert.equal(result.ambiguous,true);
  assert.equal(result.requiresHumanReview,true);
  assert.equal(result.candidates.length,2);
  await assert.rejects(()=>proposeCandidates({organizationId:"tenant1",batchId:"batch1",sourceId:"other",prismaClient:db}),e=>e.code==="SOURCE_ROW_NOT_FOUND");
  await assert.rejects(()=>proposeCandidates({organizationId:"tenant2",batchId:"batch1",sourceId:"src1",prismaClient:db}),e=>e.code==="IMPORT_BATCH_NOT_FOUND");
});
