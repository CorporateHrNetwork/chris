"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessSources,assessHistoricalBatch}=require("../src/services/consolidatedStatutoryBulkMatchService");
const employees=[
  {id:"a",employeeNumber:"ZLL001",firstName:"Ada",middleName:"Grace",lastName:"Okafor",locationId:"l1"},
  {id:"b",employeeNumber:"ZLL002",firstName:"Bayo",middleName:null,lastName:"Femi",locationId:"l2"},
  {id:"c",employeeNumber:"ZLL003",firstName:"Ada",middleName:"Grace",lastName:"Okafor",locationId:"l2"},
];
const sourceRows=[
  {sourceId:"hash:STAFF PAYE:8",employeeNo:"ZLL001",employeeName:"Ada Grace Okafor",period:"9 Months"},
  {sourceId:"hash:STAFF PAYE:9",employeeNo:"ZLL002",employeeName:"Different Person",period:"9 Months"},
  {sourceId:"hash:STAFF PENSION:2",employeeNo:"",employeeName:"Bayo Femi",period:"5 Months"},
  {sourceId:"hash:STAFF PENSION:3",employeeNo:"",employeeName:"Ada Grace Okafor",period:"9 Months"},
  {sourceId:"hash:STAFF PENSION:4",employeeNo:"",employeeName:"Not Found",period:"9 Months"},
  {sourceId:"hash:STAFF PAYE:10",employeeNo:"ZLL002",employeeName:"Ada Grace Okafor",period:"9 Months"},
];
test("assessment never auto-approves historical matches and classifies conflicts safely",()=>{
  const p=assessSources(sourceRows,employees,[sourceRows[0].sourceId]);
  assert.deepEqual(p.summary,{reviewed:1,exactNumberAndName:0,numberOnly:1,nameOnly:1,
    conflict:1,ambiguous:1,unmatched:1,total:6});
  assert.equal(p.requiresHumanReview,true);
  assert.ok(p.assessments.every(row=>!Object.hasOwn(row,"historicalBranch")));
  assert.equal(p.assessments[5].classification,"CONFLICT_REVIEW");
});
test("whole batch assessment is read-only and tenant-bound",async()=>{
  let queries=0;
  const db={
    $queryRawUnsafe:async(q,...args)=>{
      assert.equal(args[0],"org1");assert.equal(args[1],"batch1");queries++;
      return q.includes('SELECT "payload"')?[{payload:sourceRows,status:"PENDING_RECONCILIATION"}]:
        [{sourceId:sourceRows[0].sourceId}];
    },
    employee:{findMany:async({where})=>{
      assert.equal(where.organizationId,"org1");return employees;
    }},
  };
  const x=await assessHistoricalBatch({organizationId:"org1",batchId:"batch1",prismaClient:db});
  assert.equal(queries,2);
  assert.equal(x.summary.total,6);
  assert.equal(x.summary.reviewed,1);
  assert.equal(x.status,"PENDING_RECONCILIATION");
});
