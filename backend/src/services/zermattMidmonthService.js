const crypto=require('crypto');
const domain=require('./zermattMidmonthDomain');
const {splitSalary,dateOnly}=require('./zermattSalarySplit');
const id=()=>crypto.randomUUID();
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ym=value=>dateOnly(value).slice(0,7);
function createService(prisma) {
 const q=(c,sql,...args)=>c.$queryRawUnsafe(sql,...args);
 const exec=(c,sql,...args)=>c.$executeRawUnsafe(sql,...args);
 const tx=fn=>prisma.$transaction(fn,{timeout:60000});
 async function lock(c,org) { await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',org); }
 async function roles(c,org,user) {
  const r=await q(c,'SELECT responsibility FROM public.payroll_approval_assignments WHERE "organizationId"=$1 AND "assignedUserId"=$2 AND "isActive"',org,user);
  return r.map(x=>x.responsibility);
 }
 async function requireRole(c,org,user,role) { if(!(await roles(c,org,user)).includes(role))domain.invalid(`The assigned ${role.replaceAll('_',' ')} must perform this action.`,403); }
 async function settings(c,org) { return (await q(c,'SELECT * FROM public.zermatt_payroll_split_settings WHERE "organizationId"=$1',org))[0]||null; }
 async function configuration(org,user) {
  const responsibilities=await roles(prisma,org,user);
  if(!responsibilities.length)domain.invalid('A regular payroll approval assignment is required.',403);
  return {responsibilities,settings:await settings(prisma,org)};
 }
 async function audit(c,org,user,run,action,notes) {
  await exec(c,'INSERT INTO public.zermatt_midmonth_events(id,"organizationId","runId","actorUserId",action,notes) VALUES($1,$2,$3,$4,$5,$6)',id(),org,run,user,action,notes);
 }
 async function activate(org,user,periodMonth) {
  domain.month(periodMonth);
  return tx(async c=>{
   await lock(c,org);await requireRole(c,org,user,'HEAD_HR');
   const from=`${periodMonth}-01`;
   const current=await settings(c,org);
   if(current?.enabled)domain.invalid('The initial salary batch is already activated. Use effective-dated salary reviews for subsequent changes.');
   const assignments=await q(c,'SELECT responsibility,COUNT(*)::int as count FROM public.payroll_approval_assignments WHERE "organizationId"=$1 AND "isActive" GROUP BY responsibility',org);
   if(['HEAD_HR','PAYROLL_AUDITOR','GENERAL_MANAGER','CHIEF_ACCOUNTANT'].some(role=>assignments.find(a=>a.responsibility===role)?.count!==1))domain.invalid('Configure exactly one active regular-payroll assignee for each of Head HR, Auditor, General Manager and Chief Accountant before activation.');
   const approved=await q(c,`SELECT r.id FROM public.payroll_runs r JOIN public.payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId" WHERE r."organizationId"=$1 AND r.status='APPROVED' AND p."periodEnd">=$2::date LIMIT 1`,org,from);
   if(approved.length)domain.invalid('Activation overlaps approved payroll. Choose a month after the last approved payroll.');
   const staff=await q(c,`SELECT e.id,e."employeeNumber",e."employmentType",e."hireDate",s.id as preparation,s."fullMonthlyGross",s."employmentTypeSnapshot",s."hireDateSnapshot" FROM public.employees e LEFT JOIN public.zermatt_salary_split_preparations s ON s."organizationId"=e."organizationId" AND s."employeeId"=e.id AND s."effectiveFrom"=$2::date WHERE e."organizationId"=$1 AND e.status::text IN('ACTIVE','PROBATION','LEAVE','SUSPENDED') ORDER BY e.id FOR UPDATE OF e`,org,from);
   if(!staff.length||staff.some(e=>!e.preparation))domain.invalid('Upload a full salary for every current employee in the activation month.');
   for(const e of staff)if(e.employmentType!==e.employmentTypeSnapshot||dateOnly(e.hireDate)!==dateOnly(e.hireDateSnapshot))domain.invalid('Employee records changed after import. Revalidate the affected salary before activation.');
   await exec(c,`INSERT INTO public.zermatt_payroll_split_settings("organizationId","activationFrom",enabled,"activatedByUserId") VALUES($1,$2::date,true,$3) ON CONFLICT("organizationId") DO UPDATE SET "activationFrom"=EXCLUDED."activationFrom",enabled=true,"activatedByUserId"=EXCLUDED."activatedByUserId","activatedAt"=CURRENT_TIMESTAMP`,org,from,user);
   for(const e of staff) {
    // Only unapproved future rates are replaced. Historical rates keep their rows.
    await exec(c,`UPDATE public.payroll_salary_rates SET status='RETIRED',"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "employeeId"=$2 AND status='ACTIVE' AND "effectiveFrom">=$3::date`,org,e.id,from);
    await exec(c,`UPDATE public.payroll_salary_rates SET "effectiveTo"=$3::date-1,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "employeeId"=$2 AND status='ACTIVE' AND "effectiveFrom"<$3::date AND COALESCE("effectiveTo",'9999-12-31'::date)>=$3::date`,org,e.id,from);
    const rateId=id();
    await exec(c,`INSERT INTO public.payroll_salary_rates(id,"organizationId","employeeId",amount,"fullMonthlyGross",currency,frequency,"effectiveFrom",status,reason,"createdByUserId") VALUES($1,$2,$3,$4,$4,'NGN','MONTHLY',$5::date,'ACTIVE',$6,$7)`,rateId,org,e.id,Number(e.fullMonthlyGross),from,`Full-salary activation from preparation ${e.preparation}`,user);
    await exec(c,'UPDATE public.zermatt_salary_split_preparations SET "activatedAt"=CURRENT_TIMESTAMP,"salaryRateId"=$3 WHERE "organizationId"=$1 AND id=$2',org,e.preparation,rateId);
   }
   await exec(c,`UPDATE public.payroll_runs SET "statutoryStatus"='RECALCULATION_REQUIRED',"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND status IN('DRAFT','REJECTED') AND "periodId" IN(SELECT id FROM public.payroll_periods WHERE "organizationId"=$1 AND "periodEnd">=$2::date)`,org,from);
   await c.organizationAudit.create({data:{organizationId:org,actorUserId:user,entityType:'SalarySplitActivation',entityId:org,action:'ACTIVATED',newValue:{activationFrom:from,employees:staff.length},reason:'Reviewed full salary batch activated; approved payroll preserved.'}});
   return {activationFrom:from,employees:staff.length};
  });
 }
 async function source(c,org,periodMonth) {
  const from=`${domain.month(periodMonth)}-01`,end=new Date(Date.UTC(Number(periodMonth.slice(0,4)),Number(periodMonth.slice(5,7)),0)).toISOString().slice(0,10);
  const config=await settings(c,org);
  if(!config?.enabled||dateOnly(config.activationFrom)>from)domain.invalid('Full salaries have not been activated for this month.');
  const employees=await q(c,`SELECT e.id,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",e."employmentType",e."hireDate",e.status FROM public.employees e WHERE e."organizationId"=$1 AND e."hireDate"<=$2::date AND (e.status::text IN('ACTIVE','PROBATION','LEAVE','SUSPENDED') OR EXISTS(SELECT 1 FROM public.zermatt_midmonth_balances b WHERE b."employeeId"=e.id AND b."organizationId"=e."organizationId" AND b.amount>0 AND b."dueMonth"<=$3::date)) ORDER BY e.id FOR SHARE`,org,end,from);
  const rates=await q(c,`SELECT DISTINCT ON("employeeId") id,"employeeId","fullMonthlyGross","effectiveFrom","updatedAt" FROM public.payroll_salary_rates WHERE "organizationId"=$1 AND status='ACTIVE' AND "effectiveFrom"<=$2::date AND COALESCE("effectiveTo",'9999-12-31'::date)>=$3::date ORDER BY "employeeId","effectiveFrom" DESC`,org,`${periodMonth}-15`,from);
  const balances=await q(c,`SELECT id,"employeeId",kind,amount,"dueMonth" FROM public.zermatt_midmonth_balances WHERE "organizationId"=$1 AND amount>0 AND "dueMonth"<=$2::date ORDER BY id FOR UPDATE`,org,from);
  const byEmployee=new Map(rates.map(r=>[r.employeeId,r]));
  const onboarding=await q(c,`SELECT DISTINCT ON("employeeId") "employeeId","sectionData" FROM public.employee_onboardings WHERE "organizationId"=$1 ORDER BY "employeeId","updatedAt" DESC,"createdAt" DESC`,org);
  const bankByEmployee=new Map(onboarding.map(o=>[o.employeeId,o.sectionData?.['payment-details']||o.sectionData?.paymentDetails||{}]));
  const lines=employees.map(employee=>{
   const salary=byEmployee.get(employee.id);
   if(['ACTIVE','PROBATION','LEAVE','SUSPENDED'].includes(employee.status)&&dateOnly(employee.hireDate)<=`${periodMonth}-15`&&!salary?.fullMonthlyGross)domain.invalid(`Full salary is missing for ${employee.employeeNumber}. Record it in regular Salary Rates before generating payroll.`);
   const debts=balances.filter(b=>b.employeeId===employee.id);
   const unpaid=debts.filter(b=>b.kind==='UNPAID').reduce((s,b)=>s+domain.cents(b.amount),0)/100;
   const overpaid=debts.filter(b=>b.kind==='OVERPAID').reduce((s,b)=>s+domain.cents(b.amount),0)/100;
   const bank=bankByEmployee.get(employee.id)||{};
   return {...domain.buildLine({employee,salary,periodMonth,unpaid,overpaid}),balanceIds:debts.map(b=>b.id),paymentDetails:{bankName:String(bank.bankName||''),accountName:String(bank.accountName||''),accountNumber:String(bank.accountNumber||'')}};
  }).filter(l=>l.currentEntitlement>0||l.previousUnpaid>0||l.previousOverpaid>0);
  return {lines,balances,sourceHash:hash({employees,rates,balances,paymentDetails:lines.map(l=>l.paymentDetails)})};
 }
 async function generate(org,user,periodMonth) {
  return tx(async c=>{
   await lock(c,org);await requireRole(c,org,user,'HEAD_HR');domain.month(periodMonth);
   const prior=await q(c,`SELECT id FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND "periodMonth"<$2::date AND status<>'PAID' LIMIT 1`,org,`${periodMonth}-01`);
   if(prior.length)domain.invalid('Confirm actual payment or explicit zero payment for the preceding run before generating another month.');
   const existing=(await q(c,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND "periodMonth"=$2::date FOR UPDATE',org,`${periodMonth}-01`))[0];
   if(!existing) {
    const config=await settings(c,org);
    const latest=(await q(c,'SELECT "periodMonth" FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 ORDER BY "periodMonth" DESC LIMIT 1',org))[0];
    const required=latest?domain.nextMonth(ym(latest.periodMonth)):config?ym(config.activationFrom):null;
    if(required!==periodMonth)domain.invalid(`Generate and reconcile ${required||'the activation month'} first; unpaid months cannot be skipped.`);
   }
   if(existing&&!['DRAFT','REJECTED'].includes(existing.status))domain.invalid('Submitted or approved payroll is locked.');
   const data=await source(c,org,periodMonth);if(!data.lines.length)domain.invalid('No eligible mid-month entitlement or previous balance exists.');
   const runId=existing?.id||id();
   if(existing) {
    await exec(c,'DELETE FROM public.zermatt_midmonth_lines WHERE "organizationId"=$1 AND "runId"=$2',org,runId);
    await exec(c,`UPDATE public.zermatt_midmonth_runs SET status='DRAFT',"sourceHash"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND id=$2`,org,runId,data.sourceHash);
   } else await exec(c,`INSERT INTO public.zermatt_midmonth_runs(id,"organizationId","periodMonth",status,"sourceHash","createdByUserId") VALUES($1,$2,$3::date,'DRAFT',$4,$5)`,runId,org,`${periodMonth}-01`,data.sourceHash,user);
   for(const line of data.lines)await exec(c,`INSERT INTO public.zermatt_midmonth_lines(id,"organizationId","runId","employeeId",snapshot,"netPay") VALUES($1,$2,$3,$4,$5::jsonb,$6)`,id(),org,runId,line.employeeId,JSON.stringify(line),line.netPay);
   await audit(c,org,user,runId,'GENERATED','Loan recovery, salary advance recovery and statutory deductions are zero.');
   return runId;
  });
 }
 async function detail(org,user,runId) {
  const responsibilities=await roles(prisma,org,user);if(!responsibilities.length)domain.invalid('Payroll assignment required.',403);
  const run=(await q(prisma,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND id=$2',org,runId))[0];if(!run)domain.invalid('Payroll run not found.',404);
  const lines=await q(prisma,'SELECT * FROM public.zermatt_midmonth_lines WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY snapshot->>\'employeeNumber\'',org,runId);
  const events=await q(prisma,'SELECT action,notes,"createdAt" FROM public.zermatt_midmonth_events WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY "createdAt"',org,runId);
  return {run,lines,events,responsibilities};
 }
 async function list(org,user) {
  const config=await configuration(org,user);
  return {...config,runs:await q(prisma,'SELECT r.*,COALESCE((SELECT SUM(l."netPay") FROM public.zermatt_midmonth_lines l WHERE l."organizationId"=r."organizationId" AND l."runId"=r.id),0) AS "netTotal" FROM public.zermatt_midmonth_runs r WHERE r."organizationId"=$1 ORDER BY "periodMonth" DESC',org)};
 }
 async function decide(org,user,runId,action,notes,payments) {
  return tx(async c=>{
   await lock(c,org);
   const run=(await q(c,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND id=$2 FOR UPDATE',org,runId))[0];if(!run)domain.invalid('Payroll run not found.',404);
   const next=domain.transition(run.status,action,await roles(c,org,user));
   if(!String(notes||'').trim())domain.invalid('Enter review notes or a payment-batch reference.',400);
   if(['SUBMIT','AUDIT_APPROVE','GM_APPROVE'].includes(action)) {
    const current=await source(c,org,ym(run.periodMonth));
    if(current.sourceHash!==run.sourceHash)domain.invalid('Salary, employee or carry-forward records changed. Return this run for correction and regenerate it.');
    if(action==='GM_APPROVE'&&current.lines.some(l=>l.netPay>0&&(!l.paymentDetails.bankName||!l.paymentDetails.accountName||!l.paymentDetails.accountNumber)))domain.invalid('Complete bank details before final approval. Return the run to Head HR and regenerate it after correction.');
   }
   if(action==='CONFIRM_PAYMENT') {
    const lines=await q(c,'SELECT * FROM public.zermatt_midmonth_lines WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY id FOR UPDATE',org,runId);
    if(!Array.isArray(payments)||payments.length!==lines.length)domain.invalid('Provide actual payment (including explicit zero) and reference for every payroll line.',400);
    const receipts=new Map(payments.map(p=>[p.lineId,p]));if(receipts.size!==lines.length)domain.invalid('Duplicate payment line.',400);
    for(const line of lines) {
     const receipt=receipts.get(line.id);if(!receipt||!String(receipt.reference||'').trim()||receipt.actualPaid===''||receipt.actualPaid==null)domain.invalid('Every payroll line needs an actual payment and reference or reason for nonpayment.',400);
     const settlement=domain.settleLine(line.snapshot,receipt.actualPaid);
     const balances=await q(c,`SELECT * FROM public.zermatt_midmonth_balances WHERE "organizationId"=$1 AND "employeeId"=$2 AND amount>0 AND "dueMonth"<=$3::date ORDER BY "dueMonth",id FOR UPDATE`,org,line.employeeId,run.periodMonth);
     const expectedUnpaid=balances.filter(b=>b.kind==='UNPAID').reduce((s,b)=>s+domain.cents(b.amount),0);
     const expectedOverpaid=balances.filter(b=>b.kind==='OVERPAID').reduce((s,b)=>s+domain.cents(b.amount),0);
     if(expectedUnpaid!==domain.cents(line.snapshot.previousUnpaid)||expectedOverpaid!==domain.cents(line.snapshot.previousOverpaid))domain.invalid('Approved carry-forward balances changed; reconciliation is blocked.');
     let recover=domain.cents(line.snapshot.overpaidDeduction);
     for(const balance of balances) {
      const remaining=balance.kind==='UNPAID'?0:Math.max(0,domain.cents(balance.amount)-recover);
      if(balance.kind==='OVERPAID')recover=Math.max(0,recover-domain.cents(balance.amount));
      await exec(c,'UPDATE public.zermatt_midmonth_balances SET amount=$3 WHERE "organizationId"=$1 AND id=$2',org,balance.id,remaining/100);
     }
     await exec(c,'UPDATE public.zermatt_midmonth_lines SET "actualPaid"=$3,"paymentReference"=$4 WHERE "organizationId"=$1 AND id=$2',org,line.id,settlement.actualPaid,String(receipt.reference).trim());
     for(const [kind,amount] of [['UNPAID',settlement.newUnpaid],['OVERPAID',settlement.newOverpaid]])if(amount>0)await exec(c,`INSERT INTO public.zermatt_midmonth_balances(id,"organizationId","employeeId",kind,"dueMonth",amount,"sourceLineId") VALUES($1,$2,$3,$4,$5::date,$6,$7)`,id(),org,line.employeeId,kind,`${domain.nextMonth(ym(run.periodMonth))}-01`,amount,line.id);
    }
   }
   await exec(c,'UPDATE public.zermatt_midmonth_runs SET status=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND id=$2',org,runId,next);
   await audit(c,org,user,runId,action,String(notes).trim());return {runId,status:next};
  });
 }
 return {activate,generate,list,detail,decide,configuration};
}
module.exports={createService};
