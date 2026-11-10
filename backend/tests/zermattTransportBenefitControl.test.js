const test=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const c=require('../src/services/zermattTransportBenefitControl');
const d=require('../src/services/zermattMidmonthDomain');
const employee={id:'e',employeeNumber:'Z1',employeeName:'Fixture Employee',employmentType:'Full-Time',hireDate:'2020-01-01',status:'ACTIVE'};
const base=()=>d.buildLine({employee,salary:{fullMonthlyGross:200000},periodMonth:'2026-11',unpaid:10000,overpaid:5000});
test('Head HR approves benefits for external workflow without altering regular payroll approval stages',()=>{
 assert.equal(c.benefitTransition('DRAFT','HEAD_HR_APPROVE',['HEAD_HR']),'APPROVED');
 assert.equal(c.benefitTransition('REJECTED','HEAD_HR_APPROVE',['HEAD_HR']),'APPROVED');
 assert.throws(()=>c.benefitTransition('DRAFT','HEAD_HR_APPROVE',['PAYROLL_AUDITOR']),/assigned HEAD HR/);
 assert.throws(()=>c.benefitTransition('DRAFT','AUDIT_APPROVE',['PAYROLL_AUDITOR']),/external benefit/);
 assert.throws(()=>c.benefitTransition('PAID','HEAD_HR_APPROVE',['HEAD_HR']));
 assert.equal(c.benefitTransition('AUDIT_REVIEW','RETURN_TO_DRAFT',['HEAD_HR']),'DRAFT');
 assert.equal(c.benefitTransition('APPROVED','CONFIRM_PAYMENT',['CHIEF_ACCOUNTANT']),'PAID');
 assert.throws(()=>c.benefitTransition('APPROVED','CONFIRM_PAYMENT',['HEAD_HR']),/CHIEF ACCOUNTANT/);
 assert.equal(d.transition('DRAFT','SUBMIT',['HEAD_HR']),'AUDIT_REVIEW');
 assert.throws(()=>d.transition('DRAFT','HEAD_HR_APPROVE',['HEAD_HR']));
});
test('benefit inputs add approved amounts once and preserve capped overpayment recovery',()=>{
 const result=c.applyInputs(base(),{extraDays:2,phDays:1,bonus:1000,overtimePhPay:2000});
 assert.equal(result.netPay,58000);
 const capped=c.applyInputs({...base(),previousOverpaid:80000},{extraDays:2,phDays:1,bonus:1000,overtimePhPay:2000});
 assert.equal(capped.overpaidDeduction,63000);
 assert.equal(capped.overpaidRemaining,17000);
 assert.equal(capped.netPay,0);
 const counts=c.applyInputs(base(),{extraDays:2,phDays:1});
 assert.equal(counts.netPay,base().netPay,'Reference day counts do not create guessed pay');
 for(const input of [{bonus:-1},{overtimePhPay:1.001},{extraDays:-1},{phDays:Infinity}])assert.throws(()=>c.normalizeInputs(input));
});
test('authoritative export has all 20 columns in order and keeps AccountNO as text',()=>{
 assert.deepEqual(c.HEADERS,['S/No','Location','EmployeeNO','FullName','Position','Department','EmploymentType','Gross Salary','End of the Month','Mid-Month','No Of Extra Day(S)','No Of Ph Day(S)','Bonus','Overtime Pay','Public Holiday Pay','Previous Month Short Payment','Previous Month Overpayment','Net','AccountNO','Remark/Notes']);
 const s=c.applyInputs({...base(),location:'Fixture Branch',position:'Fixture Position',department:'Fixture Department',paymentDetails:{accountNumber:'0012345678'}},{extraDays:2,phDays:1,bonus:1000,overtimePhPay:2000});
 const r=c.buildRegister([{snapshot:s,netPay:s.netPay}]);
 assert.deepEqual(r.rows[0],[1,'Fixture Branch','Z1','Fixture Employee','Fixture Position','Fixture Department','Full-Time',200000,150000,50000,2,1,1000,'','',10000,5000,58000,'0012345678','Previously recorded combined overtime/PH pay: NGN 2000.00']);
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([r.headers,...r.rows]),'Register');
 const loaded=XLSX.read(XLSX.write(w,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.equal(loaded.Sheets.Register.S2.v,'0012345678');assert.equal(loaded.Sheets.Register.S2.t,'s');
});


test('prior-month corrections replace ledger totals, reset to ledger, and apply once on repeated recalculation',()=>{
 const input={previousShortPayment:20000,previousOverpayment:90000,bonus:1000,overtimePhPay:2000};
 const corrected=c.applyInputs(base(),input);
 assert.equal(corrected.netPay,0);assert.equal(corrected.overpaidRemaining,17000);
 assert.equal(corrected.ledgerPreviousUnpaid,10000);assert.equal(corrected.ledgerPreviousOverpaid,5000);
 assert.deepEqual(c.applyInputs(corrected,input),corrected);
 const reset=c.applyInputs(corrected,{previousShortPayment:'',previousOverpayment:''});
 assert.equal(reset.previousUnpaid,10000);assert.equal(reset.previousOverpaid,5000);assert.equal(reset.netPay,55000);
 const zero=c.applyInputs(corrected,{previousShortPayment:0,previousOverpayment:0});
 assert.equal(zero.netPay,50000);assert.equal(zero.previousUnpaid,0);assert.equal(zero.previousOverpaid,0);
 assert.throws(()=>c.normalizeInputs({previousOverpayment:-1}));
 assert.throws(()=>c.normalizeInputs({previousShortPayment:2.001}));
 const row=c.buildRegister([{snapshot:corrected,netPay:corrected.netPay}]).rows[0];
 assert.equal(row[15],20000);assert.equal(row[16],90000);assert.equal(row[17],0);
});

test('worked days use end-month gross and round each amount before adding to net',()=>{
 const input={calculateFromDays:true,extraDays:2,phDays:1,bonus:1000,previousShortPayment:2000,previousOverpayment:3000};
 const result=c.applyInputs(base(),input);
 assert.equal(result.overtimePay,17307.69);
 assert.equal(result.publicHolidayPay,11538.46);
 assert.equal(result.netPay,78846.15);
 assert.deepEqual(c.applyInputs(base(),result.benefitInputs),result);
 assert.deepEqual(c.buildRegister([{snapshot:result,netPay:result.netPay}]).rows[0].slice(13,15),[17307.69,11538.46]);
});
