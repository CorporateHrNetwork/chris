"use strict";
// Metadata-only platform dependency inventory. No employee rows or credential values.
// Deliberately separate from public-table reconciliation: Supabase-managed services
// are not automatically migrated by a pg_dump --schema=public backup.
const SCHEMAS=["auth","storage","realtime","vault","extensions","public"];
async function capturePlatformDependencies(client) {
 await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 try{
  const [schemas,extensions,rls,policies,platform]=await Promise.all([
   client.query(`SELECT n.nspname AS name, COUNT(*) FILTER(WHERE c.relkind IN ('r','p'))::int AS tables,
       COUNT(*) FILTER(WHERE c.relkind IN ('v','m'))::int AS views
       FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace=n.oid
       WHERE n.nspname=ANY($1::text[]) GROUP BY n.nspname ORDER BY n.nspname`,[SCHEMAS]),
   client.query("SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname"),
   client.query(`SELECT COUNT(*)::int AS tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity`),
   client.query("SELECT COUNT(*)::int AS policies FROM pg_policies WHERE schemaname='public'"),
   client.query(`SELECT (SELECT COUNT(*)::int FROM auth.users) AS auth_users,
       (SELECT COUNT(*)::int FROM storage.objects) AS storage_objects,
       (SELECT COUNT(*)::int FROM storage.buckets) AS storage_buckets`)
  ]);
  const result={schemaVersion:1,schemas:schemas.rows.map(x=>({name:x.name,tables:Number(x.tables),views:Number(x.views)})),
   extensions:extensions.rows.map(x=>({name:x.name,version:x.version})),
   publicRlsTables:Number(rls.rows[0].tables),publicPolicies:Number(policies.rows[0].policies),
   authUsers:Number(platform.rows[0].auth_users),storageObjects:Number(platform.rows[0].storage_objects),
   storageBuckets:Number(platform.rows[0].storage_buckets)};
  await client.query("COMMIT");return result;
 }catch(err){try{await client.query("ROLLBACK")}catch{};throw err}
}
function evaluatePlatformDependencyGate(source,controls={}) {
 if(!source || source.schemaVersion!==1 || !Array.isArray(source.schemas) ||
   !Array.isArray(source.extensions))throw Error("PLATFORM_DEPENDENCY_INVENTORY_REQUIRED");
 const blockers=[];
 const set=new Set(source.schemas.map(x=>x.name));
 if(!set.has("public"))blockers.push("PUBLIC_SCHEMA_NOT_INVENTORIED");
 const systemSchemas=source.schemas.filter(x=>x.name!=="public" && (x.tables>0||x.views>0));
 if(systemSchemas.length && controls.managedSchemaStrategyApproved!==true)
  blockers.push("SUPABASE_MANAGED_SCHEMAS_NOT_MAPPED");
 if(source.extensions.length && controls.extensionCompatibilityVerified!==true)
  blockers.push("DATABASE_EXTENSIONS_NOT_VERIFIED");
 if(source.publicRlsTables>0 && controls.authorizationAndRlsVerified!==true)
  blockers.push("APPLICATION_AUTHORIZATION_RLS_NOT_VERIFIED");
 if(controls.authenticationAccepted!==true)
  blockers.push("APPLICATION_LOGIN_ACCEPTANCE_REQUIRED");
 if(controls.documentsAccepted!==true)
  blockers.push("DOCUMENT_STORAGE_ACCEPTANCE_REQUIRED");
 if(controls.payrollAndTspAccepted!==true)
  blockers.push("PAYROLL_TSP_ACCEPTANCE_REQUIRED");
 if(controls.rollbackTested!==true)blockers.push("ROLLBACK_TEST_REQUIRED");
 return {status:blockers.length?"BLOCKED":"PLATFORM_DEPENDENCIES_ACCEPTED",blockers,
  productionSwitchAuthorized:false,
  note:"Never infer full disaster recovery from public-schema-only row counts or empty auth/storage tables."};
}
module.exports={capturePlatformDependencies,evaluatePlatformDependencyGate};
