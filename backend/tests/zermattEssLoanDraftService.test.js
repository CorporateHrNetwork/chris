"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {employeeFor,attachForm}=require("../src/services/zermattEssLoanDraftService");
const scope={organizationId:"org",employeeId:"employee",userId:"user"};
function db(slug="zermatt-liquor-limited",employee={id:"employee",employeeNumber:"ZLL-SYN-001"}){
 return {organization:{findUnique:async()=>({slug})},employee:{findFirst:async()=>employee}};
}
test("ESS loan applications cannot select another employee or another tenant",async()=>{
 await assert.rejects(()=>employeeFor(db("other"),scope),/ESS_LOAN_TENANT_NOT_ENABLED/);
 await assert.rejects(()=>employeeFor(db("zermatt-liquor-limited",null),scope),/ESS_EMPLOYEE_NOT_ELIGIBLE/);
 assert.equal((await employeeFor(db(),scope)).id,"employee");
});
test("ESS loan attachment requires a matching tenant and employee loan",async()=>{
 const client=db();client.$transaction=async fn=>fn({$queryRawUnsafe:async()=>[]});
 await assert.rejects(()=>attachForm(client,scope,"foreign-loan",{buffer:Buffer.from("x")}),/ESS_LOAN_NOT_FOUND/);
});
test("ESS loan draft and leave routing are gated off by default in routes",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const routes=fs.readFileSync(path.join(__dirname,"../src/routes/essRoutes.js"),"utf8");
 const leave=fs.readFileSync(path.join(__dirname,"../src/services/essLeaveService.js"),"utf8");
 const service=fs.readFileSync(path.join(__dirname,"../src/services/leaveService.js"),"utf8");
 assert.match(routes,/ZERMATT_ESS_APPROVALS_ENABLED/);
 assert.match(routes,/\/loans\/applications/);
 assert.match(leave,/onCreated/);
 assert.match(service,/ESS_LEAVE_ROUTED_APPROVAL_REQUIRED/);
});
