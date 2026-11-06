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

test('benefit activation coverage follows current support eligibility and names only missing eligible bases',()=>{
 const rows=[
  {...employee,id:'ready',employeeNumber:'READY',fullMonthlyGross:200000,basisSource:'PREPARATION',employmentTypeSnapshot:'Full-Time',hireDateSnapshot:'2020-01-01'},
  {...employee,id:'missing',employeeNumber:'MISSING'},
  {...employee,id:'exempt',employeeNumber:'EXEMPT',employmentType:'Part-Time'},
  {...employee,id:'expat',employeeNumber:'EXPAT',employmentType:'Expatriate'},
  {...employee,id:'future',employeeNumber:'FUTURE',hireDate:'2026-11-16'},
 ];
 const result=d.preparationCoverage(rows,'2026-11');
 assert.equal(result.eligibleEmployees,2);
 assert.equal(result.completeEmployees,1);
 assert.equal(result.excludedEmployees,3);
 assert.deepEqual(result.missingEmployeeNumbers,['MISSING']);
 assert.equal(result.canActivate,false);
 assert.equal(d.preparationCoverage(rows.filter(e=>e.employeeNumber!=='MISSING'),'2026-11').canActivate,true);
 assert.equal(d.eligibleForCurrentSupport({...employee,hireDate:'2026-11-15'},'2026-11'),true);
 assert.equal(d.eligibleForCurrentSupport({...employee,hireDate:'2026-11-16'},'2026-11'),false);
});
test('prepared references with changed employee details remain blocked while authoritative full-gross references are accepted',()=>{
 const changed={...employee,fullMonthlyGross:200000,basisSource:'PREPARATION',employmentTypeSnapshot:'Part-Time',hireDateSnapshot:'2020-01-01'};
 assert.deepEqual(d.preparationCoverage([changed],'2026-11').staleEmployeeNumbers,['A']);
 assert.equal(d.preparationCoverage([{...changed,basisSource:'SALARY_REFERENCE'}],'2026-11').canActivate,true);
});
