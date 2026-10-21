const crypto=require('node:crypto');
const {prepareSalaryRows,dateOnly}=require('./zermattSalarySplit');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid(message,statusCode=409){const error=new Error(message);error.statusCode=statusCode;throw error;}
function createService(prisma,loadEmployees){
 async function preview(client,org,user,input){
  const assigned=await client.$queryRawUnsafe('SELECT id FROM public.payroll_approval_assignments WHERE "organizationId"=$1 AND "assignedUserId"=$2 AND responsibility=\'HEAD_HR\' AND "isActive"',org,user);
  if(!assigned.length)invalid('The assigned Head HR must review individual salary corrections.',403);
  const settings=await client.$queryRawUnsafe('SELECT enabled FROM public.zermatt_payroll_split_settings WHERE "organizationId"=$1',org);
  if(settings[0]?.enabled)invalid('Full salaries are already activated. Use Salary Rates for an effective-dated salary review.');
  const [row]=prepareSalaryRows([{'Employee No':input.employeeNumber,'Full Monthly Gross Salary':input.amount,Currency:'NGN','Effective From':input.effectiveFrom,Reason:input.reason}],await loadEmployees(client,org));
  if(!row.valid)invalid(row.errors.join('; '),400);
  const current=(await client.$queryRawUnsafe('SELECT * FROM public.zermatt_salary_split_preparations WHERE "organizationId"=$1 AND "employeeId"=$2 AND "effectiveFrom"=$3::date',org,row.employeeId,row.effectiveFrom))[0]||null;
  if(input.preparationId && current?.id!==input.preparationId)invalid('This salary record changed or belongs to a different payroll month. Refresh the register.');
  if(current?.activatedAt)invalid('An activated salary cannot be overwritten. Use Salary Rates for an effective-dated salary review.');
  return {row,current,previewToken:digest({row,current})};
 }
 return {
  preview:async(org,user,input)=>{const result=await preview(prisma,org,user,input);return {row:result.row,previewToken:result.previewToken};},
  save:async(org,user,input)=>prisma.$transaction(async client=>{
   await client.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',org);
   await client.$queryRawUnsafe('SELECT id FROM public.employees WHERE "organizationId"=$1 AND "employeeNumber"=$2 FOR UPDATE',org,String(input.employeeNumber||'').trim().toUpperCase());
   const result=await preview(client,org,user,input);
   if(input.previewToken!==result.previewToken)invalid('The salary or employee record changed. Preview this correction again before saving.');
   const {row,current}=result;
   const recordId=current?.id||crypto.randomUUID();
   const changed=await client.$executeRawUnsafe(`INSERT INTO public.zermatt_salary_split_preparations
    (id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId")
    VALUES($1,$2,$3,$4,'NGN',$5::date,$6,$7,$8::date,$9::jsonb,$10)
    ON CONFLICT("organizationId","employeeId","effectiveFrom") DO UPDATE SET "fullMonthlyGross"=EXCLUDED."fullMonthlyGross",reason=EXCLUDED.reason,"employmentTypeSnapshot"=EXCLUDED."employmentTypeSnapshot","hireDateSnapshot"=EXCLUDED."hireDateSnapshot","allocationPreview"=EXCLUDED."allocationPreview","createdByUserId"=EXCLUDED."createdByUserId","createdAt"=CURRENT_TIMESTAMP WHERE zermatt_salary_split_preparations."activatedAt" IS NULL`,recordId,org,row.employeeId,row.amount,dateOnly(row.effectiveFrom),row.reason,row.employmentType,row.hireDate,JSON.stringify(row.allocation),user);
   if(changed!==1)invalid('This salary is already activated and cannot be overwritten.');
   await client.organizationAudit.create({data:{organizationId:org,actorUserId:user,entityType:'SalarySplitPreparation',entityId:recordId,action:current?'INDIVIDUAL_CORRECTION':'INDIVIDUAL_PREPARATION',newValue:{employeeId:row.employeeId,previousFullMonthlyGross:current?Number(current.fullMonthlyGross):null,fullMonthlyGross:row.amount,effectiveFrom:row.effectiveFrom,allocation:row.allocation},reason:row.reason}});
   return {id:recordId,row};
  },{timeout:30000}),
 };
}
module.exports={createService};
