const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const P=require('../src/services/newHirePayrollProrationService');
function period(month){const mm=String(month).padStart(2,'0');return {periodStart:`2026-${mm}-01`,periodEnd:new Date(Date.UTC(2026,month,0)).toISOString().slice(0,10)};}
test('all twelve months automatically calculate full-time new hires with one off day per complete seven eligible days',()=>{for(let month=1;month<=12;month++){const dates=period(month);const hireDate=dates.periodStart.slice(0,8)+'13';const result=P.resolvePayableDays({...dates,hireDate,employmentType:'Full-Time',standardDays:26});const calendar=new Date(dates.periodEnd).getUTCDate()-12;assert.equal(result.weeklyOffDays,Math.floor(calendar/7));assert.equal(result.payableDays,Math.min(26,calendar-Math.floor(calendar/7)));assert.equal(result.automatic,true);assert.equal(result.source,'NEW_HIRE_AUTOMATIC_SIX_DAY_WEEK');assert.match(result.notes,/weekly off days/);}});
test('employment window excludes pre-hire days; zero remains explicit; next month resets to normal basis',()=>{
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-10-13',standardDays:26,attendanceInput:{workedDays:26}}).invalidDays,true);
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-10-31',standardDays:26,attendanceInput:{workedDays:1}}).payableDays,1);
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-10-13',standardDays:26,attendanceInput:{workedDays:0}}).payableDays,0);
 assert.equal(P.resolvePayableDays({...period(11),hireDate:'2026-10-13',standardDays:26}).payableDays,26);
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-10-01',standardDays:26}).payableDays,26);
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-11-01',standardDays:26}).payableDays,0);
 assert.equal(P.resolvePayableDays({...period(10),hireDate:'2026-10-13',standardDays:16,attendanceInput:{workedDays:8}}).payableDays,8);
});
function engineFixture({split=false,days,month=10}={}) {
 const state={saved:[],writes:0,month,days,employees:[{id:'new',employeeNumber:'NEW',firstName:'Synthetic',lastName:'New',employmentType:'Full-Time',costCentreId:'cc',hireDate:'2026-10-13'},{id:'old',employeeNumber:'OLD',firstName:'Synthetic',lastName:'Existing',employmentType:'Full-Time',costCentreId:'cc',hireDate:'2020-01-01'}]};
 const client={complianceRule:{findFirst:async()=>null},organization:{findUnique:async()=>({id:'org',slug:'zermatt-liquor-limited',currency:'NGN'})},employee:{findMany:async options=>{assert.equal(options.select.hireDate,true);assert.ok(options.where.OR);return state.employees;}},attendancePayrollInput:{findMany:async()=>state.days==null?[]:[{employeeId:'new',workedDays:state.days,notes:'Verified after employment start'}]},statutoryObligation:{deleteMany:async()=>{}},organizationAudit:{create:async()=>{}},$transaction:async f=>f(client),$queryRawUnsafe:async(sql)=>{
  if(sql.includes('FROM "payroll_periods"'))return [{id:'period',code:`2026-${String(state.month).padStart(2,'0')}`,status:'OPEN',...period(state.month)}];
  if(sql.includes('FROM "payroll_policy_versions"'))return [{id:'policy',code:'NG',versionNumber:1,jurisdiction:'NG',salaryStructure:{basic:50,housing:30,transport:20},standardDays:{'Full-Time':26},pensionableComponents:['basic','housing','transport'],pensionEmployeeRate:8,pensionEmployerRate:10,payeRules:{bands:[{limit:null,rate:10}]},employerStatutoryRules:{}}];
  if(sql.includes('FROM "payroll_salary_rates"'))return state.employees.map(e=>({employeeId:e.id,amount:split?195000:260000,fullMonthlyGross:split?260000:null,currency:'NGN'}));
  if(sql.includes('FROM "chris_payroll_note_salary_overrides"')||sql.includes('FROM "payroll_components"')||sql.includes('FROM "payroll_salary_advances"')||sql.includes('FROM "payroll_tax_reliefs"'))return [];
  if(sql.includes('FROM "payroll_loan_recoveries"'))return [{count:0,amount:0}];
  if(sql.includes('FROM "payroll_run_lines"'))return state.saved;
  if(sql.includes('SELECT pr.'))return [{id:'run',periodId:'period',status:'DRAFT',...period(state.month)}];
  if(sql.includes('FROM "payroll_runs"'))return [{id:'run',status:'DRAFT'}];throw Error(sql);
 },$executeRawUnsafe:async(sql,...a)=>{state.writes++;if(sql.includes('INSERT INTO "payroll_run_lines"')){const stride=14;for(let i=0;i<a.length;i+=stride)state.saved.push({id:a[i],employeeId:a[i+3],employeeNumber:a[i+4],baseSalary:a[i+7],allowances:a[i+8],deductions:a[i+9],advanceRecovery:a[i+10],grossPay:a[i+11],netPreview:a[i+12],details:JSON.parse(a[i+13])});}}};
 const deps={'./newHirePayrollProrationService':P,'./zermattSalarySplit':require('../src/services/zermattSalarySplit'),'../config/prisma':client,'./statutoryObligationService':{replaceDraftObligations:async()=>{}},'./zermattLeaveAllowanceService':{applyZermattLeaveAllowanceToDraft:async()=>null},'./zermattVariablePayrollService':{loadPeriodVariableItems:async()=>new Map(),calculateVariableValue:()=>0}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/nigeriaPayrollComplianceService.js'),'utf8'),{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Date,Map,Set,console});
 return {state,run:()=>module.exports.executeNigeriaDraftPayroll({organizationId:'org',actorUserId:'hr',periodId:'period',prismaClient:client})};
}
test('real engine blocks impossible new-hire days before touching existing payroll',async()=>{for(const days of [26]){const f=engineFixture({days});await assert.rejects(f.run(),e=>e.code==='NEW_HIRE_WORKED_DAYS_REQUIRED' && e.details.employees[0].employeeNumber==='NEW');assert.equal(f.state.writes,0);}});
for(const split of [false,true])test('real engine prorates gross and statutory amounts, preserves existing employee and records reason '+(split?'split':'legacy'),async()=>{
 const f=engineFixture({split,days:13});await f.run();const n=f.state.saved.find(x=>x.employeeId==='new'),old=f.state.saved.find(x=>x.employeeId==='old');assert.equal(n.grossPay,split?97500:130000);assert.equal(old.grossPay,split?195000:260000);assert.ok(n.deductions<old.deductions);assert.equal(n.details.attendance.payableDays,13);assert.equal(n.details.attendance.employmentProration.employmentEffectiveDate,'2026-10-13');assert.match(n.details.attendance.notes,/HR-confirmed/);
 f.state.month=11;f.state.days=undefined;f.state.saved=[];await f.run();assert.equal(f.state.saved.find(x=>x.employeeId==='new').grossPay,split?195000:260000);
});

test('real engine calculates new-hire gross automatically with no attendance entry and retains normal salary next month',async()=>{
 const f=engineFixture();await f.run();const n=f.state.saved.find(x=>x.employeeId==='new');assert.equal(n.details.attendance.payableDays,17);assert.equal(n.grossPay,170000);assert.equal(n.details.attendance.employmentProration.weeklyOffDays,2);assert.equal(n.details.attendance.employmentProration.automatic,true);assert.match(n.details.attendance.notes,/19 calendar days less 2 weekly off days/);
 f.state.month=11;f.state.saved=[];await f.run();assert.equal(f.state.saved.find(x=>x.employeeId==='new').grossPay,260000);
});
test('October start dates follow agreed rolling weekly off-day convention; manual zero/exception wins and part-time basis stays configured',()=>{
 for(const [day,expected] of [[2,26],[6,23],[8,21],[13,17],[25,6],[26,6],[31,1]]){
  const r=P.resolvePayableDays({...period(10),hireDate:`2026-10-${String(day).padStart(2,'0')}`,employmentType:'FULL TIME',standardDays:26});assert.equal(r.payableDays,expected);
 }
 const input={...period(10),hireDate:'2026-10-13',employmentType:'Full-Time',standardDays:26};assert.equal(P.resolvePayableDays({...input,attendanceInput:{workedDays:0,notes:'Authorized unpaid absence'}}).payableDays,0);assert.equal(P.resolvePayableDays({...input,attendanceInput:{workedDays:12}}).payableDays,12);
 const pt=P.resolvePayableDays({...input,employmentType:'Part-Time',standardDays:16});assert.equal(pt.payableDays,16);assert.equal(pt.automatic,false);assert.equal(pt.source,'STANDARD_DAYS_DEFAULT');
});
