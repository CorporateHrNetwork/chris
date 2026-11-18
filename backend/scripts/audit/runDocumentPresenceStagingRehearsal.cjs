'use strict';
// OFFLINE, FICTIONAL-ONLY staging rehearsal for PR #306. NEVER a production runner.
// No HTTP route, credentials, network requests or real database connections.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runDocumentPresenceDiagnostic} = require('./documentPresenceIntegrationPrototype.cjs');

const AUTH = Object.freeze({
  userId:'fictional-platform-engineer',
  organizationId:'fictional-platform',
  organization:{slug:'corporatehr-network'},
  roles:['Engineering'],
  permissions:['support.engineering.document_presence_audit']
});

function gate(argv=process.argv.slice(2), env=process.env) {
  if (argv.length!==1 || argv[0]!=='--fictional-only' ||
      env.CHRIS_CCA_STAGING_REHEARSAL!=='true' ||
      env.NODE_ENV==='production' ||
      env.RENDER==='true' || env.RENDER_SERVICE_ID ||
      env.DATABASE_URL || env.DIRECT_URL || env.SUPABASE_URL ||
      env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED==='true') {
    const err = new Error('CCA_FICTIONAL_REHEARSAL_DISABLED');
    err.code='CCA_FICTIONAL_REHEARSAL_DISABLED';
    throw err;
  }
}

async function run(argv=process.argv.slice(2),env=process.env) {
  gate(argv,env); // Fail closed BEFORE creating fixtures or invoking the diagnostic.
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cca-document-rehearsal-'));
  const previous=process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED;
  try {
    fs.mkdirSync(path.join(root,'fictional'));
    const present=path.join(root,'fictional','placeholder.txt');
    const missing=path.join(root,'fictional','not-created.txt');
    fs.writeFileSync(present,'FICTIONAL TEST BYTES');
    const calls=[];
    const prisma={
      organization:{findUnique:async opts=>{
        calls.push(opts);
        return {id:'fictional-tenant',slug:'zermatt-liquor-limited'};
      }},
      employeeDocument:{findMany:async opts=>{
        calls.push(opts);
        return [
          {organizationId:'fictional-tenant',storagePath:present},
          {organizationId:'fictional-tenant',storagePath:missing}
        ];
      }}
    };
    // Enabled solely inside the CLI process. Never modifies service configuration.
    process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED='true';
    const result=await runDocumentPresenceDiagnostic({
      auth:AUTH,prisma,enabled:true,trustedRoot:root
    });
    if (calls.length!==2 ||
        calls[0].where.slug!=='zermatt-liquor-limited' ||
        calls[1].where.organizationId!=='fictional-tenant' ||
        result.total!==2 || result.present!==1 || result.missing!==1 ||
        result.invalidPath!==0 || result.errors!==0) {
      throw new Error('CCA_FICTIONAL_REHEARSAL_FAILED');
    }
    // Aggregate-only result; no paths, document IDs, employee records or secrets.
    return Object.freeze({
      status:'PASS',
      environment:'ISOLATED_FICTIONAL_STAGING',
      productionTouched:false,
      result
    });
  } finally {
    if(previous===undefined) delete process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED;
    else process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED=previous;
    fs.rmSync(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  run().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(err=>{
    // Deliberately do not disclose paths, environment variables or credentials.
    process.stderr.write('CCA_FICTIONAL_REHEARSAL_DENIED_OR_FAILED\n');
    process.exitCode=1;
  });
}
module.exports={gate,run};
