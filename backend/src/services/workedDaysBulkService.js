const { employmentWindow } = require("./newHirePayrollProrationService");
const XLSX = require('xlsx');
const { createHash } = require('node:crypto');
const { employeeTemplateScope, employeeName, normalizeName } = require('./payrollVariableInputTemplateService');
const { markDraftRunsRecalculationRequired } = require('./payrollDraftFreshnessService');
const HEADERS = ['Employee No', 'Employee Name', 'Branch', 'Payroll Period', 'Worked Days', 'Reason / Notes'];
function fail(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; throw error; }
function date(value) { return value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10); }
async function context(db, auth, periodId, { lock = false, requireEditable = true } = {}) {
  const period = (await db.$queryRawUnsafe(`SELECT * FROM "payroll_periods" WHERE "organizationId"=$1 AND "id"=$2${lock ? ' FOR UPDATE' : ''}`, auth.organizationId, String(periodId || '')))[0];
  if (!period || period.status !== 'OPEN') fail('Select an open payroll period.', 409);
  const canonical = (await db.$queryRawUnsafe(`SELECT "id" FROM "payroll_periods" WHERE "organizationId"=$1 AND date_trunc('month',"periodStart")=date_trunc('month',$2::date) ORDER BY CASE WHEN "code"=to_char("periodStart",'YYYY-MM') THEN 0 ELSE 1 END,"updatedAt" DESC,"createdAt" DESC LIMIT 1`, auth.organizationId, period.periodStart))[0];
  if (canonical?.id !== period.id) fail('Select the current calendar-month payroll period, rather than a legacy duplicate.',409);
  // Downloading a scoped roster never mutates payroll and must remain available during review.
  if (requireEditable) {
    const runs = await db.$queryRawUnsafe(`SELECT r."id",r."status" FROM "payroll_runs" r JOIN "payroll_periods" p ON p."organizationId"=r."organizationId" AND p."id"=r."periodId" WHERE r."organizationId"=$1 AND date_trunc('month',p."periodStart")=date_trunc('month',$2::date)${lock ? ' FOR UPDATE OF r' : ''}`,auth.organizationId,period.periodStart);
    if (runs.some(r => !['DRAFT','REJECTED'].includes(r.status))) fail('Payroll is submitted or finalized. Return it to HR correction before importing worked days.',409);
    const workflows = await db.$queryRawUnsafe(`SELECT w."stage" FROM "payroll_approval_workflows" w JOIN "payroll_runs" r ON r."organizationId"=w."organizationId" AND r."id"=w."runId" JOIN "payroll_periods" p ON p."organizationId"=r."organizationId" AND p."id"=r."periodId" WHERE r."organizationId"=$1 AND date_trunc('month',p."periodStart")=date_trunc('month',$2::date)${lock ? ' FOR UPDATE OF w' : ''}`,auth.organizationId,period.periodStart);
    if (workflows.some(w => !['DRAFT','AUDIT_DISAPPROVED'].includes(w.stage))) fail('Payroll is under review. Return it to HR correction before importing.',409);
  }
  const employees = await db.employee.findMany({where:employeeTemplateScope(auth), include:{location:{select:{name:true}}},orderBy:{employeeNumber:'asc'}});
  return {period, employees};
}
async function template(db, auth, periodId) {
  const {period, employees} = await context(db,auth,periodId,{requireEditable:false});
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS,...employees.map(e=>[String(e.employeeNumber),employeeName(e),e.location?.name || '',period.code,'',''])]);
  ws['!cols']=[20,34,26,22,18,65].map(wch=>({wch}));
  ws['!autofilter']={ref:`A1:F${employees.length+1}`};
  for(let r=2;r<=employees.length+1;r++) if(ws[`A${r}`]) ws[`A${r}`].z='@';
  XLSX.utils.book_append_sheet(wb,ws,'Worked Days');
  const instructions = [
    ['Authorized HR — Manual Worked Days'],
    [`Period: ${period.code} (${date(period.periodStart)} to ${date(period.periodEnd)})`],
    ['Keep employee numbers and names together. Fill Worked Days and Reason / Notes only for the employees to update. Blank days are skipped; zero is an explicit entry.'],
    ['Enter days between 0 and 31, within the number of calendar days in the period. Use overtime/allowance workflows for additional pay.'],
    ['Download does not default days to 26. Enter the verified payable days. Existing worked hours remain unchanged.'],
    ['Validate / Preview shows existing and proposed days. Confirm Import saves all valid rows together; any error blocks the entire file.'],
    ['Existing values for this employee and period are replaced. No carry-forward to another month. Head HR must recalculate draft payroll before submission.'],
  ];
  const help=XLSX.utils.aoa_to_sheet(instructions);help['!cols']=[{wch:140}];XLSX.utils.book_append_sheet(wb,help,'Instructions');
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
}
function parseWorkbook(buffer) {
  if (!buffer?.length || buffer.length > 5*1024*1024) fail('Upload an Excel workbook of up to 5 MB.');
  let wb;try { wb=XLSX.read(buffer,{type:'buffer',sheetRows:2002}); } catch { fail('The Excel workbook could not be read.'); }
  const ws=wb.Sheets['Worked Days']; if(!ws) fail('Use the Worked Days template and keep its sheet name.');
  if (XLSX.utils.decode_range(ws['!fullref'] || ws['!ref'] || 'A1').e.r > 2000) fail('Upload at most 2,000 employee rows.');
  const headings=XLSX.utils.sheet_to_json(ws,{header:1,range:0})[0] || [];
  if(HEADERS.some((h,i)=>headings[i]!==h)) fail('Use the original Worked Days template column headings.');
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
  for(const row of rows) {
    const r=row.__rowNum__;
    if (HEADERS.some((_,c)=>ws[XLSX.utils.encode_cell({r,c})]?.f)) fail(`Row ${r+1}: formulas are not allowed. Enter verified values.`);
  }
  return rows;
}
async function prepare(db,auth,periodId,buffer,lock=false) {
  const {period,employees}=await context(db,auth,periodId,{lock});
  const rows=parseWorkbook(buffer);
  const roster=new Map(employees.map(e=>[e.employeeNumber.toUpperCase(),e]));
  const existing=await db.attendancePayrollInput.findMany({where:{organizationId:auth.organizationId,employeeId:{in:employees.map(e=>e.id)},periodStart:new Date(date(period.periodStart)),periodEnd:new Date(date(period.periodEnd))}});
  const byEmployee=new Map(existing.map(r=>[r.employeeId,r]));
  const seen=new Set(); const preview=[]; const inputs=[]; let skippedRows=0;
  const maxDays=Math.min(31, Math.round((new Date(date(period.periodEnd))-new Date(date(period.periodStart)))/86400000)+1);
  for (const row of rows) {
    if(String(row['Worked Days']).trim()==='') { skippedRows++; continue; }
    const number=String(row['Employee No']).trim().toUpperCase(); const employee=roster.get(number);
    const days=Number(row['Worked Days']);const notes=String(row['Reason / Notes']).trim(); const errors=[];
    if(!employee) errors.push('Employee is not available in your permitted branch scope.');
    if(employee && normalizeName(row['Employee Name'])!==normalizeName(employeeName(employee))) errors.push('Employee name does not match Employee No.');
    if(employee && String(row.Branch).trim()!==(employee.location?.name || '')) errors.push('Employee branch has changed. Download a fresh template.');
    if(String(row['Payroll Period']).trim()!==period.code) errors.push('Payroll period does not match the selected period.');
    if(typeof row['Worked Days']==='boolean' || !Number.isFinite(days) || days<0 || days>maxDays) errors.push(`Worked Days must be between 0 and ${maxDays}.`);
    if(employee?.hireDate) {
      const window = employmentWindow({ hireDate: employee.hireDate, periodStart: period.periodStart, periodEnd: period.periodEnd });
      if(window.futureHire || (window.newHire && days > window.maximumCalendarDays)) errors.push(`Employment starts ${window.hireDate}; payable days cannot include days before employment. Maximum ${window.maximumCalendarDays} calendar days in this period. Enter actual verified workdays, not a full-cycle default.`);
    }
    if(!notes || notes.length>1000) errors.push('Enter a reason of 1–1,000 characters.');
    if(seen.has(number)) errors.push('Duplicate Employee No in this workbook.'); seen.add(number);
    const before=employee ? byEmployee.get(employee.id) : null;
    preview.push({rowNumber:row.__rowNum__+1,employeeNumber:number,employeeName:employee ? employeeName(employee):String(row['Employee Name']),branch:employee?.location?.name || '',previousDays:before?.workedDays ?? null,workedDays:days,notes,action:before?'UPDATE':'CREATE',errors});
    if(!errors.length) inputs.push({employee,before,workedDays:days,notes});
  }
  if(!preview.length) fail('Enter Worked Days and a reason for at least one employee. Blank days are skipped.');
  const invalidRows=preview.filter(r=>r.errors.length).length;
  const previewToken=createHash('sha256').update(JSON.stringify({organizationId:auth.organizationId,userId:auth.userId,activeLocationId:auth.activeLocationId,periodId:period.id,periodStart:date(period.periodStart),periodEnd:date(period.periodEnd),file:createHash('sha256').update(buffer).digest('hex'),inputs:inputs.map(i=>({employeeId:i.employee.id,before:i.before})),preview})).digest('hex');
  return {period,inputs,data:{rows:preview,validRows:preview.length-invalidRows,invalidRows,skippedRows,previewToken}};
}
async function importWorkbook(db,auth,periodId,buffer,previewToken) {
  if(!previewToken) fail('Validate / Preview this file before confirming import.');
  return db.$transaction(async tx=>{
    const prepared=await prepare(tx,auth,periodId,buffer,true);
    if(prepared.data.invalidRows) fail('Correct all invalid rows before import.');
    if(prepared.data.previewToken!==previewToken) fail('The file, employee details or existing inputs changed. Validate / Preview again.',409);
    for(const input of prepared.inputs) {
      const {employee,before,workedDays,notes}=input;
      const key={organizationId:auth.organizationId,employeeId:employee.id,periodStart:new Date(date(prepared.period.periodStart)),periodEnd:new Date(date(prepared.period.periodEnd))};
      const saved=await tx.attendancePayrollInput.upsert({where:{organizationId_employeeId_periodStart_periodEnd:key},create:{...key,workedDays,workedHours:null,notes,recordedByUserId:auth.userId},update:{workedDays,notes,recordedByUserId:auth.userId}});
      await tx.organizationAudit.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,entityType:'AttendancePayrollInput',entityId:saved.id,action:'BULK_WORKED_DAYS_IMPORTED',previousValue:before?{workedDays:before.workedDays,notes:before.notes}:undefined,newValue:{employeeNumber:employee.employeeNumber,periodId:prepared.period.id,workedDays,notes},reason:notes}});
    }
    const freshness=await markDraftRunsRecalculationRequired({organizationId:auth.organizationId,actorUserId:auth.userId,reason:`Authorized HR imported worked days for ${prepared.inputs.length} employees in ${prepared.period.code}.`,prismaClient:tx});
    return {importedRows:prepared.inputs.length,skippedRows:prepared.data.skippedRows,payrollDraftFreshness:freshness};
  },{isolationLevel:'Serializable',timeout:30000});
}
module.exports={HEADERS,context,template,parseWorkbook,prepare,importWorkbook};
