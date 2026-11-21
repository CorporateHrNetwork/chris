'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {gate}=require('./runDocumentPresenceStagingRehearsal.cjs');
const entry=path.join(__dirname,'runDocumentPresenceStagingRehearsal.cjs');

function subprocess(args,overrides={}){
  const env={
    PATH:process.env.PATH,
    Path:process.env.Path,
    SystemRoot:process.env.SystemRoot,
    TEMP:process.env.TEMP,
    TMP:process.env.TMP,
    CHRIS_CCA_STAGING_REHEARSAL:'true',
    ...overrides
  };
  return spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env,timeout:10000});
}
test('one-shot isolated fictional staging rehearsal passes with aggregate-only counts',()=>{
  const res=subprocess(['--fictional-only']);
  assert.equal(res.status,0,res.stderr);
  const output=JSON.parse(res.stdout.trim());
  assert.deepEqual(output,{
    status:'PASS',environment:'ISOLATED_FICTIONAL_STAGING',
    productionTouched:false,
    result:{total:2,present:1,missing:1,invalidPath:0,errors:0,
      scope:'zermatt-onboarding-documents',mode:'METADATA_ONLY'}
  });
  assert.ok(!/placeholder|not-created|employeeName|storagePath|fictional-platform-engineer/.test(res.stdout));
});
test('rehearsal is disabled by default, without execution flag and with unexpected flags',()=>{
  assert.notEqual(subprocess(['--fictional-only'],{CHRIS_CCA_STAGING_REHEARSAL:'false'}).status,0);
  assert.notEqual(subprocess([]).status,0);
  assert.notEqual(subprocess(['--fictional-only','--production']).status,0);
});
test('any live database credentials or production hosting context blocks rehearsal',()=>{
  for(const env of [
    {DATABASE_URL:'postgresql://dummy:dummy@localhost:5432/test'},
    {DIRECT_URL:'postgresql://dummy@localhost/test'},
    {SUPABASE_URL:'https://fictional.supabase.co'},
    {NODE_ENV:'production'},
    {RENDER_SERVICE_ID:'srv-fictional'},
    {RENDER:'true'},
    {CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED:'true'}
  ]){
    const r=subprocess(['--fictional-only'],env);
    assert.notEqual(r.status,0);
    assert.equal(r.stdout,'');
    assert.match(r.stderr,/CCA_FICTIONAL_REHEARSAL_DENIED_OR_FAILED/);
  }
});
test('gate rejects malformed requests before any fixture creation',()=>{
  assert.throws(()=>gate([],{}),{code:'CCA_FICTIONAL_REHEARSAL_DISABLED'});
  assert.throws(()=>gate(['--fictional-only'],{CHRIS_CCA_STAGING_REHEARSAL:'true',NODE_ENV:'production'}),
    {code:'CCA_FICTIONAL_REHEARSAL_DISABLED'});
});
