const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../src/services/zermattMidmonthDomain');
const employee={id:'a',employeeNumber:'A',employeeName:'Employee A',employmentType:'Full-Time',hireDate:'2020-01-01',status:'ACTIVE'};
const line=(extra={})=>d.buildLine({employee,salary:{fullMonthlyGross:200000},periodMonth:'2026-11',...extra});
test('unpaid and overpaid remain separate and offset only the scheduled cash payment',()=>{
 const r=line({unpaid:10000,overpaid:5000});assert.equal(r.currentEntitlement,50000);assert.equal(r.netPay,55000);assert.equal(r.loanRecovery,0);
});
test('overpaid deduction is capped at available support; balance is retained',()=>{
 const r=line({overpaid:80000});assert.equal(r.netPay,0);assert.equal(r.overpaidDeduction,50000);assert.equal(r.overpaidRemaining,30000);
});
test('explicit zero payment creates unpaid cash entitlement; an overpayment creates only the excess',()=>{
 const r=line({unpaid:10000,overpaid:5000});assert.deepEqual(d.settleLine(r,0),{actualPaid:0,newUnpaid:55000,newOverpaid:0});
 assert.deepEqual(d.settleLine(r,60000),{actualPaid:60000,newUnpaid:0,newOverpaid:5000});
});
test('inactive employees receive no new support but can receive prior earned unpaid support',()=>{
 const r=line({employee:{...employee,status:'EXITED'},unpaid:12000});assert.equal(r.currentEntitlement,0);assert.equal(r.netPay,12000);
});
test('pre-employment days never become an unpaid carry-forward',()=>{
 const r=line({employee:{...employee,hireDate:'2026-11-06'}});assert.equal(r.currentEntitlement,33333.33);assert.equal(r.previousUnpaid,0);
});
test('regular approval roles cannot skip or repeat approval stages',()=>{
 assert.equal(d.transition('DRAFT','SUBMIT',['HEAD_HR']),'AUDIT_REVIEW');
 assert.equal(d.transition('AUDIT_REVIEW','AUDIT_APPROVE',['PAYROLL_AUDITOR']),'GM_APPROVAL');
 assert.equal(d.transition('GM_APPROVAL','GM_APPROVE',['GENERAL_MANAGER']),'APPROVED');
 assert.equal(d.transition('APPROVED','CONFIRM_PAYMENT',['CHIEF_ACCOUNTANT']),'PAID');
 assert.throws(()=>d.transition('DRAFT','GM_APPROVE',['GENERAL_MANAGER']));
 assert.throws(()=>d.transition('PAID','CONFIRM_PAYMENT',['CHIEF_ACCOUNTANT']));
 assert.throws(()=>d.transition('AUDIT_REVIEW','AUDIT_APPROVE',['HEAD_HR']));
});
test('rollover is the next calendar month and invalid payment amounts fail closed',()=>{
 assert.equal(d.nextMonth('2026-12'),'2027-01');assert.equal(d.nextMonth('2026-02'),'2026-03');
 for(const n of [-1,Infinity,NaN,1.001])assert.throws(()=>d.settleLine(line(),n));
 assert.throws(()=>d.month('2026-13'));
});
