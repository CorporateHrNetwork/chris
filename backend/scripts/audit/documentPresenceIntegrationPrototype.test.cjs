'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runDocumentPresenceDiagnostic} = require('./documentPresenceIntegrationPrototype.cjs');
// Explicit test-only environment gate. No application service is started.
process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED = 'true';
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chris-integration-fictional-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'fictional.pdf');
  fs.writeFileSync(file,'fictional only');
  const auth={userId:'fake-engineer',organizationId:'platform-fake',
    organization:{slug:'corporatehr-network'},roles:['Engineering'],
    permissions:['support.engineering.document_presence_audit']};
  const calls=[];
  const prisma={
    organization:{findUnique:async p=>{calls.push({type:'org',p});return {id:'fake-zermatt',slug:'zermatt-liquor-limited'};}},
    employeeDocument:{findMany:async p=>{calls.push({type:'rows',p});return [
      {organizationId:'fake-zermatt',storagePath:file},
      {organizationId:'fake-zermatt',storagePath:path.join(root,'missing.pdf')}
    ];}}
  };
  return {root,auth,prisma,calls};
}
test('disabled by default without querying the database', async t=>{
  const x=setup(t);
  await assert.rejects(runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,trustedRoot:x.root}),
    {code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
  assert.equal(x.calls.length,0);
});
test('rejects tenant user or missing permission before data query',async t=>{
  const x=setup(t);
  await assert.rejects(runDocumentPresenceDiagnostic({auth:{...x.auth,organization:{slug:'zermatt-liquor-limited'}},
    enabled:true,prisma:x.prisma,trustedRoot:x.root}),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
  await assert.rejects(runDocumentPresenceDiagnostic({auth:{...x.auth,permissions:[]},
    enabled:true,prisma:x.prisma,trustedRoot:x.root}),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
  assert.equal(x.calls.length,0);
});
test('fictional platform authorization yields aggregate counts only and tenant filter',async t=>{
  const x=setup(t);
  const out=await runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,enabled:true,trustedRoot:x.root});
  assert.deepEqual(out,{total:2,present:1,missing:1,invalidPath:0,errors:0,
    scope:'zermatt-onboarding-documents',mode:'METADATA_ONLY'});
  assert.deepEqual(x.calls[0].p.where,{slug:'zermatt-liquor-limited'});
  assert.deepEqual(x.calls[1].p.where,{organizationId:'fake-zermatt'});
  assert.deepEqual(x.calls[1].p.select,{organizationId:true,storagePath:true});
  assert.equal(x.calls[1].p.take,10001);
  assert.ok(!JSON.stringify(out).includes('fictional.pdf'));
});
test('rejects cross-tenant contamination',async t=>{
  const x=setup(t);
  x.prisma.employeeDocument.findMany=async()=>[{organizationId:'other',storagePath:path.join(x.root,'fictional.pdf')}];
  await assert.rejects(runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,
    enabled:true,trustedRoot:x.root}),{code:'DOCUMENT_AUDIT_SCOPE_MISMATCH'});
});
test('rejects missing target tenant',async t=>{
  const x=setup(t);
  x.prisma.organization.findUnique=async()=>null;
  await assert.rejects(runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,
    enabled:true,trustedRoot:x.root}),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
});
test('rejects oversized metadata result',async t=>{
  const x=setup(t);
  x.prisma.employeeDocument.findMany=async()=>Array(10001).fill({organizationId:'fake-zermatt',storagePath:path.join(x.root,'missing.pdf')});
  await assert.rejects(runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,
    enabled:true,trustedRoot:x.root}),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
});

test('existing engineering escalation permission is insufficient for document audit',async t=>{
  const x=setup(t);
  const escalationOnly={...x.auth,permissions:['support.engineering.escalate']};
  await assert.rejects(runDocumentPresenceDiagnostic({
    auth:escalationOnly,prisma:x.prisma,enabled:true,trustedRoot:x.root
  }),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
  assert.equal(x.calls.length,0);
});
test('untrusted origin cannot supply a relative upload root',async t=>{
  const x=setup(t);
  await assert.rejects(runDocumentPresenceDiagnostic({
    auth:x.auth,prisma:x.prisma,enabled:true,trustedRoot:'uploads/onboarding-documents'
  }),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
  assert.equal(x.calls.length,0);
});

test('server-owned environment gate denies enabled invocation when OFF',async t=>{
 const x=setup(t);
 const old=process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED;
 try {
   process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED='false';
   await assert.rejects(runDocumentPresenceDiagnostic({auth:x.auth,prisma:x.prisma,enabled:true,trustedRoot:x.root}),{code:'DOCUMENT_DIAGNOSTIC_DISABLED'});
   assert.equal(x.calls.length,0);
 } finally { process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED=old; }
});
