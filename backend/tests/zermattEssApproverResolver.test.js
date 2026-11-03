"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {resolveLeaveApprovers,resolveLoanApprovers,resolveAuditObservers,reportingChain}=require("../src/services/zermattEssApproverResolver");
const user=(id,role,employeeId,locationScope="ALL_LOCATIONS")=>({id,employeeId,isActive:true,locationScope,userRoles:[{role:{name:role}}],userLocations:[{locationId:"branch-a"}]});
const users=[user("employee-login","Employee","employee"),user("leader-login","Team Leader","leader"),user("branch-login","Branch Operations Manager","manager"),user("hr-login","Head of HR & Admin",null),user("gm-login","General Manager",null),user("chief-login","Chief Accountant",null),user("audit-login","Head of Audit & Internal Controls",null)];
function db({slug="zermatt-liquor-limited",links={employee:"leader",leader:"manager"},staff=users}={}){
 return {organization:{findUnique:async()=>({slug})},employee:{findFirst:async()=>({id:"employee",locationId:"branch-a",status:"ACTIVE"})},user:{findMany:async()=>staff},employeeLineManagerAssignment:{findMany:async({where})=>links[where.employeeId]?[{managerEmployeeId:links[where.employeeId],manager:{id:links[where.employeeId],locationId:"branch-a",designation:{name:links[where.employeeId]==="manager"?"Branch Operations Manager":"Team Leader"}}}]:[]}};
}
test("effective dated reporting chain and branch final approver are resolved",async()=>{
 const stages=await resolveLeaveApprovers(db(),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"});
 assert.deepEqual(stages.map(s=>s.userId),["hr-login","leader-login","branch-login","hr-login"]);
});
test("loan stage owners are distinct and audit stays observer",async()=>{
 const stages=await resolveLoanApprovers(db(),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"});
 assert.deepEqual(stages.map(s=>s.userId),["branch-login","hr-login","gm-login","chief-login"]);
 assert.deepEqual(await resolveAuditObservers(db(),"org"),["audit-login"]);
});
test("tenant boundary, reporting line cycle, missing manager login and ambiguity fail closed",async()=>{
 await assert.rejects(()=>resolveLeaveApprovers(db({slug:"other"}),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"}),/ZERMATT_WORKFLOW_ONLY/);
 await assert.rejects(()=>resolveLeaveApprovers(db({links:{employee:"leader",leader:"employee"}}),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"}),/REPORTING_LINE_CYCLE/);
 await assert.rejects(()=>resolveLeaveApprovers(db({staff:users.filter(x=>x.id!=="leader-login")}),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"}),/LINE_MANAGER_LOGIN_MISSING/);
 await assert.rejects(()=>resolveLoanApprovers(db({staff:[...users,user("branch-login2","Branch Operations Manager","another")]}),{organizationId:"org",employeeId:"employee",requesterUserId:"employee-login"}),/BRANCH_MANAGER_AMBIGUOUS/);
});
