function preparationEnabled(env=process.env) {
 return env.CHRIS_ZERMATT_BENEFIT_PREPARATION_ENABLED==='true'||env.CHRIS_ZERMATT_SALARY_PREPARATION_ENABLED==='true';
}
async function storageReady(client) {
 try {
  await client.$queryRawUnsafe('SELECT id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId","createdAt",status,"activatedAt","salaryRateId" FROM public.zermatt_salary_split_preparations LIMIT 0');
  const rows=await client.$queryRawUnsafe(`SELECT EXISTS(
   SELECT 1 FROM pg_index i
   WHERE i.indrelid='public.zermatt_salary_split_preparations'::regclass AND i.indisunique
   AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)
    =ARRAY['organizationId','employeeId','effectiveFrom']::text[]
  ) AS ready`);
  return rows[0]?.ready===true;
 } catch { return false; }
}
async function assertPreparationReady(client) {
 if(!preparationEnabled())throw Object.assign(new Error('Transport benefit imports are awaiting deployment verification.'),{statusCode:409});
 if(!await storageReady(client))throw Object.assign(new Error('Transport benefit storage is not ready. Contact support; no records were imported.'),{statusCode:409});
}
module.exports={preparationEnabled,storageReady,assertPreparationReady};
