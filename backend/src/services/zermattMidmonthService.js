const crypto=require('crypto');
const domain=require('./zermattMidmonthDomain');
const benefit=require('./zermattTransportBenefitControl');
const {splitSalary,dateOnly}=require('./zermattSalarySplit');
const id=()=>crypto.randomUUID();
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ym=value=>dateOnly(value).slice(0,7);
function createService(prisma, { benefitsOnly = false } = {}) {
 const q=(c,sql,...args)=>c.$queryRawUnsafe(sql,...args);
 const exec=(c,sql,...args)=>c.$executeRawUnsafe(sql,...args);
 const tx=fn=>prisma.$transaction(fn,{timeout:60000});
 async function lock(c,org) { await exec(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',org); }
 async function roles(c,org,user) {
  const r=await q(c,'SELECT responsibility FROM public.payroll_approval_assignments WHERE "organizationId"=$1 AND "assignedUserId"=$2 AND "isActive"',org,user);
  return r.map(x=>x.responsibility);
 }
 async function requireRole(c,org,user,role) { if(!(await roles(c,org,user)).includes(role))domain.invalid(`The assigned ${role.replaceAll('_',' ')} must perform this action.`,403); }
 async function settings(c,org) {
  if (benefitsOnly) {
   const event=await c.organizationAudit.findFirst({where:{organizationId:org,entityType:'TransportBenefitConfiguration',entityId:org,action:'ENABLED'},orderBy:{createdAt:'desc'}});
   if(event?.newValue?.enabled)return event.newValue;
  }
  return (await q(c,'SELECT * FROM public.zermatt_payroll_split_settings WHERE "organizationId"=$1',org))[0]||null;
 }
 async function configuration(org,user) {
  const responsibilities=await roles(prisma,org,user);
  if(!responsibilities.length)domain.invalid('A regular payroll approval assignment is required.',403);
  return {responsibilities,settings:await settings(prisma,org),workflow:benefitsOnly?'HEAD_HR_EXTERNAL':'INTERNAL_PAYROLL'};
 }
 async function audit(c,org,user,run,action,notes) {
  await exec(c,'INSERT INTO public.zermatt_midmonth_events(id,"organizationId","runId","actorUserId",action,notes) VALUES($1,$2,$3,$4,$5,$6)',id(),org,run,user,action,notes);
 }

 async function preparationReadiness(c,org,periodMonth) {
  domain.month(periodMonth);
  const from=`${periodMonth}-01`,mid=`${periodMonth}-15`;
  const staff=await q(c,`SELECT e.id,e."employeeNumber",e."employmentType",e."hireDate",e.status,
   b."fullMonthlyGross",b."basisSource",b."employmentTypeSnapshot",b."hireDateSnapshot"
   FROM public.employees e
   LEFT JOIN LATERAL (
    SELECT * FROM (
     SELECT p."fullMonthlyGross",'PREPARATION'::text AS "basisSource",p."employmentTypeSnapshot",p."hireDateSnapshot",p."effectiveFrom",2 AS priority
     FROM public.zermatt_salary_split_preparations p
     WHERE p."organizationId"=e."organizationId" AND p."employeeId"=e.id AND p."effectiveFrom"<=$3::date
     UNION ALL
     SELECT r."fullMonthlyGross",'SALARY_REFERENCE'::text,e."employmentType",e."hireDate",r."effectiveFrom",1 AS priority
     FROM public.payroll_salary_rates r WHERE r."organizationId"=e."organizationId" AND r."employeeId"=e.id AND r.status='ACTIVE'
     AND r."fullMonthlyGross">0 AND r."effectiveFrom"<=$3::date AND COALESCE(r."effectiveTo",'9999-12-31'::date)>=$2::date
    ) refs ORDER BY "effectiveFrom" DESC,priority DESC LIMIT 1
   ) b ON true
   WHERE e."organizationId"=$1 AND e.status::text IN('ACTIVE','PROBATION','LEAVE','SUSPENDED')
   AND NOT EXISTS(SELECT 1 FROM public.employee_lifecycle_events l WHERE l."organizationId"=e."organizationId" AND l."employeeId"=e.id
    AND l."eventType"::text='DEACTIVATED' AND l."effectiveDate">=$2::date AND l."effectiveDate"<$2::date+interval '1 month')
   ORDER BY e.id FOR SHARE OF e`,org,from,mid);
  return domain.preparationCoverage(staff,periodMonth);
 }
 async function getPreparationReadiness(org,user,periodMonth) {
  await requireRole(prisma,org,user,'HEAD_HR');
  return preparationReadiness(prisma,org,periodMonth);
 }

 async function activate(org,user,periodMonth) {
  domain.month(periodMonth);
  return tx(async c=>{
   await lock(c,org);await requireRole(c,org,user,'HEAD_HR');
   const from=`${periodMonth}-01`;
   const current=await settings(c,org);
   if(current?.enabled)domain.invalid('The initial salary batch is already activated. Use effective-dated salary reviews for subsequent changes.');
   const assignments=await q(c,'SELECT responsibility,COUNT(*)::int as count FROM public.payroll_approval_assignments WHERE "organizationId"=$1 AND "isActive" GROUP BY responsibility',org);
   if((benefitsOnly?['HEAD_HR']:['HEAD_HR','PAYROLL_AUDITOR','GENERAL_MANAGER','CHIEF_ACCOUNTANT']).some(role=>assignments.find(a=>a.responsibility===role)?.count!==1))domain.invalid('Configure exactly one active regular-payroll assignee for each of Head HR, Auditor, General Manager and Chief Accountant before activation.');
   if(benefitsOnly) {
    const coverage=await preparationReadiness(c,org,periodMonth);
    if(!coverage.canActivate) {
     const message=!coverage.eligibleEmployees?'No employees are eligible for current Transport Support in this month.'
      :coverage.missingEmployeeNumbers.length?`Missing benefit bases for ${coverage.missingEmployeeNumbers.length} eligible employee(s): ${coverage.missingEmployeeNumbers.slice(0,20).join(', ')}. Review the preparation register for ${periodMonth}.`
      :`Employee details changed for ${coverage.staleEmployeeNumbers.length} eligible employee(s): ${coverage.staleEmployeeNumbers.slice(0,20).join(', ')}. Re-preview and save their bases.`;
     throw Object.assign(new Error(message),{statusCode:409,code:'BENEFIT_BASIS_INCOMPLETE',details:coverage});
    }
    const config={enabled:true,activationFrom:from,module:'BENEFITS',payrollWrites:false};
    await c.organizationAudit.create({data:{organizationId:org,actorUserId:user,entityType:'TransportBenefitConfiguration',entityId:org,action:'ENABLED',newValue:config,reason:'Transport Support enabled as a separate benefit. Salary authorities, regular payroll and split settings unchanged.'}});
    return {...config,employees:coverage.eligibleEmployees};
   }
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
  const employees=await q(c,`SELECT e.id,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",e."employmentType",e."hireDate",e.status FROM public.employees e WHERE e."organizationId"=$1 AND e."hireDate"<=$2::date AND e.status::text<>'INACTIVE' AND NOT EXISTS(SELECT 1 FROM public.employee_lifecycle_events d WHERE d."organizationId"=e."organizationId" AND d."employeeId"=e.id AND d."eventType"::text='DEACTIVATED' AND d."effectiveDate">=$3::date AND d."effectiveDate"<$3::date+interval '1 month') AND (e.status::text IN('ACTIVE','PROBATION','LEAVE','SUSPENDED') OR EXISTS(SELECT 1 FROM public.zermatt_midmonth_balances b WHERE b."employeeId"=e.id AND b."organizationId"=e."organizationId" AND b.amount>0 AND b."dueMonth"<=$3::date)) ORDER BY e.id FOR SHARE`,org,end,from);
  const rates=benefitsOnly ? await q(c,`SELECT DISTINCT ON("employeeId") id,"employeeId","fullMonthlyGross","effectiveFrom","updatedAt" FROM (
   SELECT id,"employeeId","fullMonthlyGross","effectiveFrom","createdAt" AS "updatedAt",2 AS priority FROM public.zermatt_salary_split_preparations WHERE "organizationId"=$1 AND "effectiveFrom"<=$2::date
   UNION ALL
   SELECT id,"employeeId","fullMonthlyGross","effectiveFrom","updatedAt",1 AS priority FROM public.payroll_salary_rates WHERE "organizationId"=$1 AND status='ACTIVE' AND "fullMonthlyGross">0 AND "effectiveFrom"<=$2::date AND COALESCE("effectiveTo",'9999-12-31'::date)>=$3::date
  ) bases ORDER BY "employeeId","effectiveFrom" DESC,priority DESC`,org,`${periodMonth}-15`,from) : await q(c,`SELECT DISTINCT ON("employeeId") id,"employeeId","fullMonthlyGross","effectiveFrom","updatedAt" FROM public.payroll_salary_rates WHERE "organizationId"=$1 AND status='ACTIVE' AND "effectiveFrom"<=$2::date AND COALESCE("effectiveTo",'9999-12-31'::date)>=$3::date ORDER BY "employeeId","effectiveFrom" DESC`,org,`${periodMonth}-15`,from);
  const balances=await q(c,`SELECT id,"employeeId",kind,amount,"dueMonth" FROM public.zermatt_midmonth_balances WHERE "organizationId"=$1 AND amount>0 AND "dueMonth"<=$2::date ORDER BY id FOR UPDATE`,org,from);
  const byEmployee=new Map(rates.map(r=>[r.employeeId,r]));
  const onboarding=await q(c,`SELECT DISTINCT ON("employeeId") "employeeId","sectionData" FROM public.employee_onboardings WHERE "organizationId"=$1 ORDER BY "employeeId","updatedAt" DESC,"createdAt" DESC`,org);
  const bankByEmployee=new Map(onboarding.map(o=>[o.employeeId,o.sectionData?.['payment-details']||o.sectionData?.paymentDetails||{}]));
  const metadata=benefitsOnly?await c.employee.findMany({where:{organizationId:org,id:{in:employees.map(e=>e.id)}},orderBy:{id:'asc'},select:{id:true,location:{select:{name:true}},designation:{select:{name:true}},department:{select:{name:true}}}}):[];
  const metadataMap=new Map(metadata.map(e=>[e.id,e]));
  const adjustments=benefitsOnly?await q(c,`SELECT l."employeeId",l.snapshot->'benefitInputs' AS inputs FROM public.zermatt_midmonth_lines l JOIN public.zermatt_midmonth_runs r ON r.id=l."runId" AND r."organizationId"=l."organizationId" WHERE l."organizationId"=$1 AND r."periodMonth"=$2::date`,org,from):[];
  const adjustmentMap=new Map(adjustments.map(a=>[a.employeeId,a.inputs||{}]));
  const lines=employees.map(employee=>{
   const salary=byEmployee.get(employee.id);
   if((benefitsOnly?domain.eligibleForCurrentSupport(employee,periodMonth):['ACTIVE','PROBATION','LEAVE','SUSPENDED'].includes(employee.status)&&dateOnly(employee.hireDate)<=`${periodMonth}-15`)&&!salary?.fullMonthlyGross)domain.invalid(`Full salary is missing for ${employee.employeeNumber}. Prepare its reviewed full-salary benefit basis in Benefits before generating Transport Support.`);
   const debts=balances.filter(b=>b.employeeId===employee.id);
   const unpaid=debts.filter(b=>b.kind==='UNPAID').reduce((s,b)=>s+domain.cents(b.amount),0)/100;
   const overpaid=debts.filter(b=>b.kind==='OVERPAID').reduce((s,b)=>s+domain.cents(b.amount),0)/100;
   const bank=bankByEmployee.get(employee.id)||{};
   const line={...domain.buildLine({employee,salary,periodMonth,unpaid,overpaid}),balanceIds:debts.map(b=>b.id),paymentDetails:{bankName:String(bank.bankName||''),accountName:String(bank.accountName||''),accountNumber:String(bank.accountNumber||'')}};
   const meta=metadataMap.get(employee.id);
   return benefitsOnly?benefit.applyInputs({...line,location:meta?.location?.name||'',position:meta?.designation?.name||'',department:meta?.department?.name||''},adjustmentMap.get(employee.id)):line;
  }).filter(l=>l.currentEntitlement>0||l.previousUnpaid>0||l.previousOverpaid>0||(benefitsOnly&&(l.benefitInputs.bonus>0||l.benefitInputs.overtimePhPay>0||l.benefitInputs.previousShortPayment!==null||l.benefitInputs.previousOverpayment!==null)));
  const baseSource={employees,rates,balances,paymentDetails:lines.map(l=>l.paymentDetails),...(benefitsOnly?{metadata}:{})};
  return {lines,balances,baseHash:hash(baseSource),sourceHash:hash({...baseSource,...(benefitsOnly?{benefitInputs:lines.map(l=>({employeeId:l.employeeId,inputs:l.benefitInputs}))}:{})})};
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
  let lines=await q(prisma,'SELECT * FROM public.zermatt_midmonth_lines WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY snapshot->>\'employeeNumber\'',org,runId);
  if(benefitsOnly)lines.sort((a,b)=>require('./payrollRegisterExport').compareBranches(a.snapshot.location,b.snapshot.location)||String(a.snapshot.employeeNumber).localeCompare(String(b.snapshot.employeeNumber),undefined,{numeric:true}));
  const events=await q(prisma,'SELECT action,notes,"actorUserId","createdAt" FROM public.zermatt_midmonth_events WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY "createdAt"',org,runId);
  return {run,lines,events,responsibilities,...(benefitsOnly?{register:benefit.buildRegister(lines),workflow:"HEAD_HR_EXTERNAL"}:{})};
 }
 async function list(org,user) {
  const config=await configuration(org,user);
  return {...config,runs:await q(prisma,'SELECT r.*,COALESCE((SELECT SUM(l."netPay") FROM public.zermatt_midmonth_lines l WHERE l."organizationId"=r."organizationId" AND l."runId"=r.id),0) AS "netTotal" FROM public.zermatt_midmonth_runs r WHERE r."organizationId"=$1 ORDER BY "periodMonth" DESC',org)};
 }
 async function decide(org,user,runId,action,notes,payments) {
  return tx(async c=>{
   await lock(c,org);
   const run=(await q(c,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND id=$2 FOR UPDATE',org,runId))[0];if(!run)domain.invalid('Payroll run not found.',404);
   const next=(benefitsOnly?benefit.benefitTransition:domain.transition)(run.status,action,await roles(c,org,user));
   if(!String(notes||'').trim())domain.invalid('Enter review notes or a payment-batch reference.',400);
   if(['SUBMIT','AUDIT_APPROVE','GM_APPROVE','HEAD_HR_APPROVE'].includes(action)) {
    const current=await source(c,org,ym(run.periodMonth));
    if(current.sourceHash!==run.sourceHash)domain.invalid('Salary, employee or carry-forward records changed. Return this run for correction and regenerate it.');
    if(['GM_APPROVE','HEAD_HR_APPROVE'].includes(action)&&current.lines.some(l=>l.netPay>0&&(!l.paymentDetails.bankName||!l.paymentDetails.accountName||!l.paymentDetails.accountNumber)))domain.invalid('Complete bank details before final approval. Return the run to Head HR and regenerate it after correction.');
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
     if(expectedUnpaid!==domain.cents(line.snapshot.ledgerPreviousUnpaid??line.snapshot.previousUnpaid)||expectedOverpaid!==domain.cents(line.snapshot.ledgerPreviousOverpaid??line.snapshot.previousOverpaid))domain.invalid('Approved carry-forward balances changed; reconciliation is blocked.');
     let recover=domain.cents(line.snapshot.overpaidDeduction);
     for(const balance of balances) {
      const remaining=benefitsOnly||balance.kind==='UNPAID'?0:Math.max(0,domain.cents(balance.amount)-recover);
      if(balance.kind==='OVERPAID')recover=Math.max(0,recover-domain.cents(balance.amount));
      await exec(c,'UPDATE public.zermatt_midmonth_balances SET amount=$3 WHERE "organizationId"=$1 AND id=$2',org,balance.id,remaining/100);
     }
     await exec(c,'UPDATE public.zermatt_midmonth_lines SET "actualPaid"=$3,"paymentReference"=$4 WHERE "organizationId"=$1 AND id=$2',org,line.id,settlement.actualPaid,String(receipt.reference).trim());
     for(const [kind,amount] of [['UNPAID',settlement.newUnpaid],['OVERPAID',(domain.cents(settlement.newOverpaid)+(benefitsOnly?domain.cents(line.snapshot.overpaidRemaining):0))/100]])if(amount>0)await exec(c,`INSERT INTO public.zermatt_midmonth_balances(id,"organizationId","employeeId",kind,"dueMonth",amount,"sourceLineId") VALUES($1,$2,$3,$4,$5::date,$6,$7)`,id(),org,line.employeeId,kind,`${domain.nextMonth(ym(run.periodMonth))}-01`,amount,line.id);
    }
   }
   await exec(c,'UPDATE public.zermatt_midmonth_runs SET status=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND id=$2',org,runId,next);
   await audit(c,org,user,runId,action,String(notes).trim());return {runId,status:next};
  });
 }

 async function saveBenefitInputs(org,user,runId,lineId,input,notes) {
  if(!benefitsOnly)domain.invalid('Benefit inputs are unavailable in regular payroll.');
  if(!String(notes||'').trim())domain.invalid('Enter a reason for the benefit inputs.',400);
  return tx(async c=>{
   await lock(c,org);await requireRole(c,org,user,'HEAD_HR');
   const run=(await q(c,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND id=$2 FOR UPDATE',org,runId))[0];
   if(!run||!['DRAFT','REJECTED'].includes(run.status))domain.invalid('Only draft or rejected benefit runs can be edited.');
   const current=await source(c,org,ym(run.periodMonth));
   if(current.sourceHash!==run.sourceHash)domain.invalid('Source records changed. Regenerate the draft before editing benefit inputs.');
   const line=(await q(c,'SELECT * FROM public.zermatt_midmonth_lines WHERE "organizationId"=$1 AND "runId"=$2 AND id=$3 FOR UPDATE',org,runId,lineId))[0];
   if(!line)domain.invalid('Benefit line not found.',404);
   const snapshot=benefit.applyInputs(line.snapshot,input);
   await exec(c,'UPDATE public.zermatt_midmonth_lines SET snapshot=$3::jsonb,"netPay"=$4 WHERE "organizationId"=$1 AND id=$2',org,lineId,JSON.stringify(snapshot),snapshot.netPay);
   const refreshed=await source(c,org,ym(run.periodMonth));
   if(refreshed.baseHash!==current.baseHash)domain.invalid('Source records changed while saving. No inputs were saved; regenerate the draft.');
   await exec(c,'UPDATE public.zermatt_midmonth_runs SET "sourceHash"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND id=$2',org,runId,refreshed.sourceHash);
   await c.organizationAudit.create({data:{organizationId:org,actorUserId:user,entityType:'TransportBenefitLine',entityId:lineId,action:'BENEFIT_INPUTS_UPDATED',previousValue:{inputs:line.snapshot.benefitInputs||{},netPay:Number(line.netPay)},newValue:{inputs:snapshot.benefitInputs,netPay:snapshot.netPay},reason:String(notes).trim()}});
   await audit(c,org,user,runId,'BENEFIT_INPUTS_UPDATED',String(notes).trim());
   return {runId,lineId,netPay:snapshot.netPay};
  });
 }
 async function recordExternalExport(org,user,runId,stage) {
  return tx(async c=>{
   await lock(c,org);await requireRole(c,org,user,'HEAD_HR');
   const run=(await q(c,'SELECT * FROM public.zermatt_midmonth_runs WHERE "organizationId"=$1 AND id=$2 FOR SHARE',org,runId))[0];
   if(!run)domain.invalid('Benefit run not found.',404);
   if(stage!=='review'&&!['APPROVED','PAID'].includes(run.status))domain.invalid('Head HR must approve this benefit run before external-workflow export.');
   await audit(c,org,user,runId,'EXPORTED_FOR_EXTERNAL_APPROVAL',stage==='review'?'Draft review register generated by Head HR.':'Head HR-approved register exported for external Auditor → GM → Chief Accountant workflow. This does not confirm external approval or payment.');
  });
 }
 return {activate,generate,list,detail,decide,configuration,saveBenefitInputs,recordExternalExport,getPreparationReadiness};
}
module.exports={createService};

