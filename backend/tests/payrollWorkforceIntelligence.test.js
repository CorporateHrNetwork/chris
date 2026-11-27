const test = require("node:test");
const assert = require("node:assert/strict");
const {comparePayrollWorkforce} = require("../src/services/payrollWorkforceIntelligence");
const row=(employeeId,locationName,grossPay=100)=>({employeeId,grossPay,details:{organizationSnapshot:{locationName,departmentName:"Operations"}}});
test("reconciles hires, exits, transfers and gross variance",()=>{
 const {movements,summaries}=comparePayrollWorkforce([row("a","Abuja"),row("b","Lagos")],[row("b","Abuja",150),row("c","Lagos",200)]);
 assert.equal(movements.find(x=>x.employeeId==="a").classification,"Exit/deactivated candidate");
 assert.equal(movements.find(x=>x.employeeId==="b").classification,"Transfer candidate");
 assert.equal(movements.find(x=>x.employeeId==="c").classification,"Hire candidate");
 assert.equal(summaries[0].grossVariance,150);
 assert.equal(summaries[0].payrollRemovalRate,0.5);
 assert.equal(summaries[0].labourTurnoverRate,null);
 assert.equal(summaries[0].absenteeismRate,null);
});
test("zero denominator is unavailable and duplicates rejected",()=>{
 assert.equal(comparePayrollWorkforce([],[]).summaries[0].payrollRemovalRate,null);
 assert.throws(()=>comparePayrollWorkforce([row("a","Lagos"),row("a","Lagos")],[]),/duplicate/);
});
