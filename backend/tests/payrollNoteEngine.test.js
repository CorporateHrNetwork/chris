const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('real Nigeria engine recalculates statutory amounts for a note salary override and does not carry it to another month',async()=>{
 let saved, activePeriod='p';
 const client={
  complianceRule:{findFirst:async()=>null},organization:{findUnique:async()=>({id:'z',slug:'zermatt-liquor-limited',currency:'NGN'})},
  employee:{findMany:async()=>[{id:'e',employeeNumber:'001',firstName:'Synthetic',lastName:'Employee',employmentType:'Full-Time',costCentreId:'cc'}]},
  attendancePayrollInput:{findMany:async()=>[]},statutoryObligation:{deleteMany:async()=>{}},organizationAudit:{create:async()=>{}},
  $transaction:async fn=>fn(client),
  $queryRawUnsafe:async(sql,...args)=>{
   if(sql.includes('FROM "payroll_periods"'))return[{id:activePeriod,code:activePeriod==='p'?'2026-10':'2026-11',periodStart:activePeriod==='p'?'2026-10-01':'2026-11-01',periodEnd:activePeriod==='p'?'2026-10-31':'2026-11-30',status:'OPEN'}];
   if(sql.includes('FROM "payroll_policy_versions"'))return[{id:'policy',code:'NG',versionNumber:1,jurisdiction:'NG',salaryStructure:{basic:50,housing:30,transport:20},standardDays:{'Full-Time':26},pensionableComponents:['basic','housing','transport'],pensionEmployeeRate:8,pensionEmployerRate:10,payeRules:{bands:[{limit:null,rate:10}]},employerStatutoryRules:{}}];
   if(sql.includes('FROM "payroll_salary_rates"'))return[{employeeId:'e',amount:200000,currency:'NGN'}];
   if(sql.includes('FROM "chris_payroll_note_salary_overrides"')){assert.deepEqual(args,['z',activePeriod]);return activePeriod==='p'?[{employeeId:'e',monthlyGross:260000,noteId:'note'}]:[];}
   if(sql.includes('FROM "payroll_loan_recoveries"'))return[{count:0,amount:0}];
   if(sql.includes('FROM "payroll_components"') || sql.includes('FROM "payroll_salary_advances"') || sql.includes('FROM "payroll_tax_reliefs"'))return[];
   if(sql.includes('FROM "payroll_run_lines"'))return[saved];
   if(sql.includes('SELECT pr.'))return[{id:'run',periodId:activePeriod,periodStart:'2026-10-01',periodEnd:'2026-10-31',status:'DRAFT'}];
   if(sql.includes('FROM "payroll_runs"'))return[{id:'run',status:'DRAFT'}];
   throw Error(sql);
  },
  $executeRawUnsafe:async(sql,...a)=>{
   if(sql.includes('INSERT INTO "payroll_run_lines"'))saved={id:a[0],employeeId:a[3],employeeNumber:a[4],employeeName:a[5],currency:a[6],baseSalary:a[7],allowances:a[8],deductions:a[9],advanceRecovery:a[10],grossPay:a[11],netPreview:a[12],details:JSON.parse(a[13])};
  }
 };
 const deps={'../config/prisma':client,'./statutoryObligationService':{replaceDraftObligations:async()=>{}},'./zermattLeaveAllowanceService':{applyZermattLeaveAllowanceToDraft:async()=>null},'./zermattVariablePayrollService':{loadPeriodVariableItems:async()=>new Map([['e',{allowances:activePeriod==='p'?[{inputId:'bonus',manualAmount:20000,calculationType:'ENTERED_AMOUNT',taxable:true}]:[],deductions:[]}]]),calculateVariableValue:item=>item.manualAmount}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/nigeriaPayrollComplianceService.js'),'utf8'),{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Date,Map,Set,console});
 await module.exports.executeNigeriaDraftPayroll({organizationId:'z',actorUserId:'hr',periodId:'p',prismaClient:client});
 assert.equal(saved.baseSalary,130000);assert.equal(saved.grossPay,280000);assert.equal(saved.details.statutory.employeePension,20800);assert.equal(saved.details.statutory.payeTax,25920);assert.equal(saved.netPreview,233280);assert.equal(saved.details.payrollNoteSalaryOverride.noteId,'note');
 activePeriod='next';await module.exports.executeNigeriaDraftPayroll({organizationId:'z',actorUserId:'hr',periodId:'next',prismaClient:client});
 assert.equal(saved.grossPay,200000);assert.equal(saved.details.scheduledMonthlyGross,200000);assert.equal(saved.details.payrollNoteSalaryOverride,null);assert.equal(saved.details.statutory.employeePension,16000);assert.equal(saved.netPreview,165600);
});
