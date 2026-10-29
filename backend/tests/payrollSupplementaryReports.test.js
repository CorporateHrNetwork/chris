const test=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const reports=require('../src/services/payrollSupplementaryReportService');
const row=(id,branch,meta={})=>({branch,meta,line:{employeeId:id,employeeNumber:id,employeeName:`Synthetic ${id}`,grossPay:100000,details:{statutory:{payeTax:5000,employeePension:6240,employerPension:7800,rentReliefAnnual:123200},leaveAllowance:{amount:10000}}}});
test('every branch and employee appears exactly once in each statutory split, including missing identifiers and zero charges',()=>{
 const wb=XLSX.utils.book_new();const rows=[row('A','Abuja',{pensionPfa:'PFA',pensionPin:'PEN001',taxIdentificationNumber:'TIN001',payeState:'FCT'}),row('B','Lagos',{pensionPfa:'Pending',pensionPin:'PEN002',taxIdentificationNumber:'N/A',payeState:'Lagos'}),row('C','Port Harcourt')];
 rows[2].line.details.statutory={payeTax:0,employeePension:0,employerPension:0,employmentTypeExemption:{payeExempt:true,pensionExempt:true}};
 reports.appendSheets(wb,{run:{status:'DRAFT',periodCode:'2026-10'},rows,loans:[{employeeNumber:'A',loanNumber:'LN1',status:'COMPLETED',principalAmount:100000,outstandingAmount:0},{employeeNumber:'B',loanNumber:'LN2',status:'ACTIVE',principalAmount:200000,outstandingAmount:50000}]});
 const read=name=>XLSX.utils.sheet_to_json(wb.Sheets[name]);assert.equal(read('PAYE - Details Present').length,1);assert.equal(read('PAYE - Missing Details').length,2);assert.equal(read('Pension - Details Present').length,1);assert.equal(read('Pension - Missing Details').length,2);
 assert.equal(read('Branch Statutory Summary').length,3);assert.equal(read('Branch Statutory Summary').reduce((s,r)=>s+r['Total PAYE Charge'],0),10000);assert.equal(read('Branch Statutory Summary').reduce((s,r)=>s+r['Leave Allowance'],0),30000);
 assert.equal(wb.SheetNames.filter(n=>/^PAYE \d/.test(n)).length,6);assert.equal(read('Completed Loans')[0]['Loan No'],'LN1');assert.equal(read('Active Loans')[0]['Loan No'],'LN2');assert.match(read('Draft Payroll Notes')[1].Notes,/DRAFT/);
 const saved=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});assert.equal(saved.SheetNames.length,wb.SheetNames.length);assert.equal(saved.Sheets['PAYE - Missing Details'].D2.t,'s');
});
test('loan and review evidence retrieval bind tenant and permitted branch IDs',async()=>{
 const calls=[];const db={$queryRawUnsafe:async(...args)=>(calls.push(args),[])};
 await reports.loadLoans(db,'tenant',['branch','branch']);await reports.loadDecisions(db,'tenant','run');assert.deepEqual(calls[0].slice(1),['tenant',['branch']]);assert.match(calls[0][0],/e\."locationId"=ANY/);assert.deepEqual(calls[1].slice(1),['tenant','run']);assert.match(calls[1][0],/reviewRunId/);
});
