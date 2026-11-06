const crypto=require('node:crypto');
const {prepareSalaryRows}=require('./zermattSalarySplit');
const digestRows=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function invalid(message){throw Object.assign(new Error(message),{statusCode:409});}
async function savePreparedSalaryRows(prisma,{organizationId,actorUserId,source,previewToken,loadEmployees}) {
 return prisma.$transaction(async tx=>{
  // executeRaw avoids decoding PostgreSQL's void advisory-lock result.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',organizationId);
  await tx.$queryRawUnsafe('SELECT id FROM public.employees WHERE "organizationId"=$1 ORDER BY id FOR UPDATE',organizationId);
  const rows=prepareSalaryRows(source,await loadEmployees(tx,organizationId));
  if(rows.some(row=>!row.valid))invalid('Resolve every validation error before importing. No rows were imported.');
  if(previewToken!==digestRows(rows))invalid('The workbook or employee records changed. Preview the upload again.');
  const payload=rows.map(row=>({id:crypto.randomUUID(),employeeId:row.employeeId,amount:row.amount,effectiveFrom:row.effectiveFrom,reason:row.reason,employmentType:row.employmentType,hireDate:row.hireDate,allocation:row.allocation}));
  const changed=await tx.$executeRawUnsafe(`INSERT INTO public.zermatt_salary_split_preparations
   (id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId")
   SELECT p.id,$2,p."employeeId",p.amount,'NGN',p."effectiveFrom"::date,p.reason,p."employmentType",p."hireDate"::date,p.allocation,$3
   FROM jsonb_to_recordset($1::jsonb) AS p(id text,"employeeId" text,amount numeric,"effectiveFrom" text,reason text,"employmentType" text,"hireDate" text,allocation jsonb)
   ON CONFLICT("organizationId","employeeId","effectiveFrom") DO UPDATE SET
   "fullMonthlyGross"=EXCLUDED."fullMonthlyGross",reason=EXCLUDED.reason,"employmentTypeSnapshot"=EXCLUDED."employmentTypeSnapshot",
   "hireDateSnapshot"=EXCLUDED."hireDateSnapshot","allocationPreview"=EXCLUDED."allocationPreview",
   "createdByUserId"=EXCLUDED."createdByUserId","createdAt"=CURRENT_TIMESTAMP
   WHERE zermatt_salary_split_preparations."activatedAt" IS NULL`,JSON.stringify(payload),organizationId,actorUserId);
  if(changed!==rows.length)invalid('An activated record cannot be overwritten. No changes were saved. Use a new effective month for the benefit basis.');
  await tx.organizationAudit.create({data:{organizationId,actorUserId,entityType:'SalarySplitPreparation',entityId:crypto.randomUUID(),action:'IMPORTED_FOR_REVIEW',newValue:{count:rows.length,status:'PENDING_ACTIVATION'},reason:'Transport benefit bases prepared; regular payroll and loan balances unchanged.'}});
  return rows.length;
 },{timeout:60000,maxWait:10000});
}
module.exports={savePreparedSalaryRows,digestRows};
