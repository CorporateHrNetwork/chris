const XLSX = require('xlsx');
const HEADERS=['Payroll Period','Run ID','Employee No','Employee Name','Branch','Category','Source / Reference','Payroll Treatment','Expected Days','Worked Days','Days Difference','Amount / Gross Effect','Quantity','Reason / Incident','Reviewed Instruction','Recorded By','Submitted At','Reviewed At','Implemented At'];
const number=value=>value==null || value==='' || !Number.isFinite(Number(value)) ? null : Number(value);
const round=value=>Math.round(value*100)/100;
const text=value=>String(value ?? '');
function object(value) {if(typeof value==='string'){try{return JSON.parse(value);}catch{return {};}}return value || {};}
function lineIncidents(line,run={},meta={}) {
 const d=object(line.details);const attendance=d.attendance || {};const expected=number(attendance.standardDays),worked=number(attendance.payableDays);
 const difference=expected!==null && worked!==null?round(worked-expected):null;
 const common={period:run.periodCode || '',runId:run.id || line.runId || '',employeeId:line.employeeId,employeeNumber:line.employeeNumber,employeeName:line.employeeName,branch:d.organizationSnapshot?.locationName || meta.branch || '',treatment:'IN CALCULATED RUN',expectedDays:expected,workedDays:worked,difference};
 const result=[];const add=entry=>result.push({...common,...entry});
 if(difference || attendance.notes || attendance.source==='ATTENDANCE_PAYROLL_INPUT') {
  const grossEffect=number(d.structuredGross)!==null && number(d.scheduledMonthlyGross)!==null?round(Number(d.structuredGross)-Number(d.scheduledMonthlyGross)):null;
  add({category:difference<0?'FEWER WORKED DAYS':difference>0?'MORE WORKED DAYS':'MANUAL WORKED DAYS',source:attendance.source || 'RUN ATTENDANCE SNAPSHOT',amount:grossEffect,reason:attendance.notes || 'No attendance reason was recorded; HR verification required.'});
 }
 for(const [kind,items] of [['ALLOWANCE',d.allowanceItems || d.customAllowances || []],['DEDUCTION',d.deductionItems || d.customDeductions || []]]) for(const item of items) {
  add({category:kind,source:[item.source,item.code,item.inputId || item.id || item.installmentId,item.reference].filter(Boolean).join(' | '),amount:number(item.value ?? item.amount),quantity:number(item.quantity),reason:[item.name,item.remarks,item.frequency==='RECURRING_INSTALLMENT'?`Installment ${item.installmentNumber} of ${item.installmentCount}`:''].filter(Boolean).join(' — ')});
 }
 if(Number(line.loanRecovery ?? d.loanRecoveryTotal)>0) add({category:'LOAN RECOVERY',source:'RUN LOAN RECOVERY',amount:Number(line.loanRecovery ?? d.loanRecoveryTotal),reason:'Scheduled loan recovery included in this payroll.'});
 if(Number(line.advanceRecovery)>0) add({category:'SALARY ADVANCE RECOVERY',source:(d.salaryAdvanceRecoveries || []).map(a=>a.id).join(', ') || 'RUN SALARY ADVANCE',amount:Number(line.advanceRecovery),reason:'Scheduled salary advance recovery included in this payroll.'});
 if(Number(d.leaveAllowance?.amount)>0) add({category:'LEAVE ALLOWANCE',source:d.leaveAllowance.policyCode || 'RUN LEAVE ALLOWANCE',amount:Number(d.leaveAllowance.amount),reason:d.leaveAllowance.reason || 'Leave allowance included in this payroll.'});
 if(d.payrollNoteSalaryOverride) add({category:'MONTHLY SALARY OVERRIDE',source:d.payrollNoteSalaryOverride.noteId,amount:number(d.payrollNoteSalaryOverride.monthlyGross),reason:'Payroll-note salary override for this period only; amount is the monthly gross basis, not an additional payment.'});
 if(d.statutory?.employmentTypeExemption?.exempt || d.statutory?.employmentTypeExemption?.payeExempt) add({category:'STATUTORY EXEMPTION',source:'RUN STATUTORY RULE',reason:`Employment-type statutory exemption: ${attendance.employmentType || d.organizationSnapshot?.employmentType || ''}.`});
 return result;
}
async function loadSources(db,organizationId,run,lines) {
 if(!lines.length || !run?.periodId) return {notes:[],attendance:[]};
 const ids=[...new Set(lines.map(l=>l.employeeId).filter(Boolean))];
 const notes=await db.$queryRawUnsafe(`SELECT n."id",n."employeeId",n."category",n."originalNote",n."reviewedNote",n."status",n."implementation",n."submittedAt",n."reviewedAt",n."implementedAt",u."email" AS "recordedBy" FROM "chris_payroll_notes" n LEFT JOIN "users" u ON u."id"=n."submittedByUserId" AND u."organizationId"=n."organizationId" WHERE n."organizationId"=$1 AND n."payrollPeriodId"=$2 AND n."employeeId"=ANY($3::text[]) ORDER BY n."submittedAt",n."id"`,organizationId,run.periodId,ids);
 const attendance=await db.$queryRawUnsafe(`SELECT a."employeeId",a."workedDays",a."notes",a."updatedAt",u."email" AS "recordedBy" FROM "attendance_payroll_inputs" a JOIN "payroll_periods" p ON p."organizationId"=a."organizationId" AND p."id"=$2 LEFT JOIN "users" u ON u."id"=a."recordedByUserId" AND u."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a."employeeId"=ANY($3::text[]) AND a."periodStart"=p."periodStart" AND a."periodEnd"=p."periodEnd" ORDER BY a."employeeId"`,organizationId,run.periodId,ids);
 return {notes,attendance};
}
function buildIncidents({run={},lines=[],employeeMeta=new Map(),sources={}}) {
 const byId=new Map(lines.map(l=>[l.employeeId,l]));
 const result=lines.flatMap(line=>lineIncidents(line,run,employeeMeta.get(line.employeeId)));
 for(const note of sources.notes || []) {
  const line=byId.get(note.employeeId);if(!line)continue;
  const implementation=object(note.implementation);const inRun=note.status==='IMPLEMENTED' && implementation.runId===run.id;
  result.push({period:run.periodCode,runId:run.id,employeeId:line.employeeId,employeeNumber:line.employeeNumber,employeeName:line.employeeName,branch:object(line.details).organizationSnapshot?.locationName || employeeMeta.get(line.employeeId)?.branch || '',category:note.category || 'PAYROLL NOTE',source:note.id,treatment:inRun?'IMPLEMENTED FOR THIS RUN':`${note.status || 'RECORDED'} — NOT CONFIRMED IN THIS RUN`,reason:note.originalNote,instruction:note.reviewedNote,recordedBy:note.recordedBy,submittedAt:note.submittedAt,reviewedAt:note.reviewedAt,implementedAt:note.implementedAt});
 }
 for(const input of sources.attendance || []) {
  const line=byId.get(input.employeeId);if(!line)continue;
  const attendance=object(line.details).attendance || {};const expected=number(attendance.standardDays),current=number(input.workedDays);
  if(current===null || (current===number(attendance.payableDays) && text(input.notes)===text(attendance.notes)))continue;
  result.push({period:run.periodCode,runId:run.id,employeeId:line.employeeId,employeeNumber:line.employeeNumber,employeeName:line.employeeName,branch:object(line.details).organizationSnapshot?.locationName || employeeMeta.get(line.employeeId)?.branch || '',category:'WORKED DAYS INPUT CHANGED',source:'LATEST MANUAL ATTENDANCE INPUT',treatment:'NOT IN RUN SNAPSHOT — RECALCULATION REQUIRED',expectedDays:expected,workedDays:current,difference:expected!==null?round(current-expected):null,reason:input.notes || 'No reason recorded; HR verification required.',recordedBy:input.recordedBy,submittedAt:input.updatedAt});
 }
 return result;
}
function summaryFor(incidents,employeeId) {const value=incidents.filter(i=>i.employeeId===employeeId).map(i=>`${i.category}: ${i.reason || i.instruction || i.source || ''} [${i.treatment}]`).join('\n');return value.length>30000?value.slice(0,29900)+'\nSee Payroll Notes & Incidents for the complete record.':value;}
function appendIncidentSheets(workbook,incidents=[]) {
 const rows=incidents.map(i=>[i.period,i.runId,i.employeeNumber,i.employeeName,i.branch,i.category,i.source,i.treatment,i.expectedDays??'',i.workedDays??'',i.difference??'',i.amount??'',i.quantity??'',i.reason || '',i.instruction || '',i.recordedBy || '',...['submittedAt','reviewedAt','implementedAt'].map(k=>i[k] instanceof Date?i[k].toISOString():text(i[k]))]);
 function append(name,values){const ws=XLSX.utils.aoa_to_sheet([HEADERS,...values]);ws['!cols']=HEADERS.map((h,c)=>({wch:[13,14].includes(c)?70:[5,6,7].includes(c)?34:22}));ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:values.length,c:HEADERS.length-1}})};XLSX.utils.book_append_sheet(workbook,ws,name);}
 append('Payroll Notes & Incidents',rows);
 append('Worked Days Exceptions',rows.filter((_,index)=>['FEWER WORKED DAYS','MORE WORKED DAYS','MANUAL WORKED DAYS','WORKED DAYS INPUT CHANGED'].includes(incidents[index].category)));
 const ws=XLSX.utils.aoa_to_sheet([
  ['Payroll Incident Report Controls'],
  ['Run amounts and worked days come from the calculated payroll snapshot. Later inputs are labelled RECALCULATION REQUIRED and do not change exported pay.'],
  ['Submitted, reviewed, rejected or unconfirmed notes are disclosed with their current status; disclosure does not mean they have been implemented or paid.'],
  ['Amounts are contextual: allowance, deduction, recovery, gross variance or salary basis as labelled. Do not sum this sheet as a second payroll ledger.'],
  ['Scope: the selected payroll run, organization and employees permitted in this export. Only recorded incidents can be reported.'],
 ]);ws['!cols']=[{wch:140}];XLSX.utils.book_append_sheet(workbook,ws,'Incident Report Controls');
}
module.exports={HEADERS,lineIncidents,loadSources,buildIncidents,summaryFor,appendIncidentSheets};
