const XLSX = require('xlsx');
const text = value => String(value ?? '').trim();
const money = value => Math.round(Number(value || 0) * 100) / 100;
function missing(value) { return !text(value) || /^(n\/?a|none|null|unknown|pending|not available|not provided|-+)$/i.test(text(value)); }
function sheet(workbook, name, headers, rows) {
 const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
 ws['!cols'] = headers.map(h => ({ wch: /Name|Details|Reason|Notes|Reference/.test(h) ? 38 : 22 }));
 ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: {r:0,c:0}, e: {r:rows.length,c:headers.length-1} }) };
 ws['!freeze'] = { xSplit:0, ySplit:1 };
 XLSX.utils.book_append_sheet(workbook, ws, name);
}
async function loadLoans(db, organizationId, locationIds) {
 return db.$queryRawUnsafe(`SELECT l.id,l."loanNumber",l.status,l."principalAmount",l."outstandingAmount",l."installmentAmount",l."historyConfirmedAt",l."historyConfirmationReference",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",loc.name AS branch FROM payroll_loans l JOIN employees e ON e.id=l."employeeId" AND e."organizationId"=l."organizationId" LEFT JOIN organization_locations loc ON loc.id=e."locationId" AND loc."organizationId"=e."organizationId" WHERE l."organizationId"=$1 AND e."locationId"=ANY($2::text[]) AND l.status IN ('ACTIVE','PAUSED','COMPLETED') ORDER BY e."employeeNumber",l."loanNumber"`, organizationId, [...new Set(locationIds || [])]);
}
async function loadDecisions(db, organizationId, runId) {
 return db.$queryRawUnsafe(`SELECT id,action,reason,"newValue","createdAt" FROM organization_audits WHERE "organizationId"=$1 AND "newValue"->>'reviewRunId'=$2 ORDER BY "createdAt",id`,organizationId,runId);
}
function appendSheets(workbook, { run, rows, loans = [], decisions = [] }) {
 const pensionHeaders=['Employee No','Employee Name','Branch','PFA','Pension PIN','Pensionable Base','Employee Pension','Employer Pension','Total Pension','Missing Details','Treatment'];
 const payeHeaders=['Employee No','Employee Name','Branch','TIN','PAYE State','Gross Salary','Annual Rent Relief','Annual Chargeable Income','PAYE Charge','Missing Details','Treatment'];
 const pension={complete:[],missing:[]},paye={complete:[],missing:[]};
 for(const row of rows) {
  const l=row.line,m=row.meta || {},s=l.details?.statutory || {};
  const pm=[missing(m.pensionPfa)?'PFA':null,missing(m.pensionPin)?'Pension PIN':null].filter(Boolean);
  const tm=[missing(m.taxIdentificationNumber)?'TIN':null,missing(m.payeState)?'PAYE State':null].filter(Boolean);
  pension[pm.length?'missing':'complete'].push([l.employeeNumber,l.employeeName,row.branch,text(m.pensionPfa),text(m.pensionPin),money(s.pensionableBase),money(s.employeePension),money(s.employerPension),money(Number(s.employeePension || 0)+Number(s.employerPension || 0)),pm.join(', '),s.employmentTypeExemption?.pensionExempt?'EMPLOYMENT TYPE EXEMPT':pm.length?'DETAILS REQUIRED BEFORE REMITTANCE':'DETAILS PRESENT — VERIFY BEFORE REMITTANCE']);
  paye[tm.length?'missing':'complete'].push([l.employeeNumber,l.employeeName,row.branch,text(m.taxIdentificationNumber),text(m.payeState),money(l.grossPay),money(s.rentReliefAnnual),money(s.annualChargeableIncomeIncludingOneTime),money(s.payeTax),tm.join(', '),s.employmentTypeExemption?.payeExempt?'EMPLOYMENT TYPE EXEMPT':tm.length?'DETAILS REQUIRED BEFORE REMITTANCE':'DETAILS PRESENT — VERIFY BEFORE REMITTANCE']);
 }
 for(const [group,headers,label] of [[pension,pensionHeaders,'Pension'],[paye,payeHeaders,'PAYE']]) {
  sheet(workbook,`${label} - Details Present`,headers,group.complete);
  sheet(workbook,`${label} - Missing Details`,headers,group.missing);
 }
 const branches=[...new Set(rows.map(r=>r.branch))].sort();
 const branchKey=(branch,i)=>text(branch).replace(/[^a-z0-9 ]/gi,'').slice(0,14)||`Branch ${i+1}`;
 branches.forEach((branch,i)=>{
  const key=branchKey(branch,i);
  // Numeric prefix guarantees distinct sheet names even for similar branch labels.
  sheet(workbook,`PAYE ${i+1} ${key} Complete`.slice(0,31),payeHeaders,paye.complete.filter(r=>r[2]===branch));
  sheet(workbook,`PAYE ${i+1} ${key} Missing`.slice(0,31),payeHeaders,paye.missing.filter(r=>r[2]===branch));
 });
 const summaryHeaders=['Branch','Employees','PAYE Details Present','PAYE Missing Details','Total PAYE Charge','Pension Details Present','Pension Missing Details','Employee Pension','Employer Pension','Leave Allowance'];
 sheet(workbook,'Branch Statutory Summary',summaryHeaders,branches.map(branch=>{
  const scoped=rows.filter(r=>r.branch===branch),sum=k=>money(scoped.reduce((a,r)=>a+Number(r.line.details?.statutory?.[k] || 0),0));
  return [branch,scoped.length,paye.complete.filter(r=>r[2]===branch).length,paye.missing.filter(r=>r[2]===branch).length,sum('payeTax'),pension.complete.filter(r=>r[2]===branch).length,pension.missing.filter(r=>r[2]===branch).length,sum('employeePension'),sum('employerPension'),money(scoped.reduce((a,r)=>a+Number(r.line.details?.leaveAllowance?.amount || 0),0))];
 }));
 const loanHeaders=['Employee No','Employee Name','Branch','Loan No','Status','Principal','Recovered to Date','Outstanding Balance','Monthly Instalment','History Confirmation'];
 for(const [name,status] of [['Active Loans',new Set(['ACTIVE','PAUSED'])],['Completed Loans',new Set(['COMPLETED'])]]) sheet(workbook,name,loanHeaders,loans.filter(l=>status.has(l.status)).map(l=>[l.employeeNumber,l.employeeName,l.branch,l.loanNumber,l.status,money(l.principalAmount),money(Number(l.principalAmount)-Number(l.outstandingAmount)),money(l.outstandingAmount),money(l.installmentAmount),l.historyConfirmedAt?l.historyConfirmationReference || 'HR confirmed':'']));
 const notes=[['Payroll period',run.periodCode || ''],['Status',run.status==='APPROVED'?'APPROVED PAYROLL NOTES':'DRAFT — NOT FOR PAYMENT'],['Salary basis','Saved salary rates are the confirmed end-month gross bases. Leave allowance is shown separately from salary.'],['Leave allowance','Monthly basic salary × 12 × 10%, for eligible full-time employment anniversaries. Included once in net payable and total employer cost.'],['PAYE and pension','Details-present and missing-details registers include all payroll employees, including zero charges and employment-type exemptions. Missing identifiers do not erase calculated liabilities.'],['Pension layout','CHRiS standard schedule. Zermatt supplied pension template still requires attachment and validation before claiming template conformity.'],['Employee incidents','See Payroll Notes & Incidents and Worked Days Exceptions for every recorded payroll-line adjustment.'],...decisions.map(d=>[d.action,`${d.reason || ''} [Audit ${d.id}]`])];
 sheet(workbook,'Draft Payroll Notes',['Subject','Notes'],notes);
}
module.exports={appendSheets,loadLoans,loadDecisions,missing};
// Shared report entry point: resolve identifiers from the same scoped employees,
// then reuse identical statutory splits and completed-loan reporting everywhere.
async function appendForLines(db, organizationId, workbook, run, lines, locationId = null) {
 const org=await db.organization.findUnique({where:{id:organizationId},select:{slug:true}});
 if(org?.slug!=='zermatt-liquor-limited') return;
 const employees=await db.employee.findMany({where:{organizationId,id:{in:lines.map(l=>l.employeeId)},...(locationId?{locationId}:{})},select:{id:true,locationId:true,location:{select:{name:true}},onboardings:{orderBy:{updatedAt:'desc'},take:1,select:{sectionData:true}}}});
 const byId=new Map(employees.map(e=>[e.id,e]));
 const rows=lines.filter(l=>byId.has(l.employeeId)).map(line=>{const e=byId.get(line.employeeId),data=e.onboardings?.[0]?.sectionData || {},meta=data['statutory-details'] || data.statutoryDetails || {};return {line,meta,branch:line.details?.organizationSnapshot?.locationName || e.location?.name || 'Unassigned'};});
 const loans=await loadLoans(db,organizationId,employees.map(e=>e.locationId).filter(Boolean));
 const decisions=await loadDecisions(db,organizationId,run.id);
 appendSheets(workbook,{run,rows,loans,decisions});
}
module.exports.appendForLines=appendForLines;
