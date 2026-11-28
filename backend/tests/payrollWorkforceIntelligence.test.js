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

test("worked-day shortfalls use only covered lines and do not offset absences with extra days",()=>{
 const a=row("a","Abuja"),b=row("b","Abuja"),c=row("c","Lagos");
 a.details.attendance={standardDays:26,payableDays:24};
 b.details.attendance={standardDays:26,payableDays:28};
 const result=comparePayrollWorkforce([], [a,b,c]).attendanceShortfalls;
 assert.equal(result.covered,2);
 assert.equal(result.total,3);
 assert.equal(result.expected,52);
 assert.equal(result.shortfall,2);
 assert.equal(result.rate,2/52);
 assert.equal(result.records[2].shortfall,null);
});
test("missing or zero expected days do not produce a fabricated rate",()=>{
 const a=row("a","Abuja");
 a.details.attendance={standardDays:0,payableDays:0};
 assert.equal(comparePayrollWorkforce([], [a]).attendanceShortfalls.rate,null);
});

test("labour turnover excludes internal transfers at branch and company levels",()=>{
 const result=comparePayrollWorkforce([row("a","Abuja"),row("b","Abuja"),row("c","Lagos")],[row("a","Lagos"),row("c","Lagos"),row("d","Abuja")]);
 const all=result.summaries.find(x=>x.label==="Consolidated");
 const abj=result.summaries.find(x=>x.label==="locationName: Abuja");
 assert.equal(all.exits,1);
 assert.equal(all.payrollTurnoverRate,1/3);
 assert.equal(abj.exits,1);
 assert.equal(abj.transfersOut,1);
 assert.equal(abj.hires,1);
 assert.equal(abj.payrollTurnoverRate,1/1.5);
});
test("attendance classification separates authorized, unexplained and recorded deficits",()=>{
 const a=row("a","Abuja"),b=row("b","Abuja"),c=row("c","Lagos");
 a.details.attendance={standardDays:26,payableDays:20,employmentProration:{automatic:true}};
 b.details.attendance={standardDays:26,payableDays:24};
 c.details.attendance={standardDays:26,payableDays:23,leaveReturn:{appliedDeficit:3,pending:false}};
 const result=comparePayrollWorkforce([], [a,b,c]).attendanceShortfalls;
 assert.equal(result.excluded,6);
 assert.equal(result.unclassified,2);
 assert.equal(result.confirmed,3);
 assert.equal(result.absenceProxy,3/78);
});
