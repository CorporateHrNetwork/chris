'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {auditDocumentPresence, auditTenantScopedRecords} = require('./documentPresenceDiagnostic.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chris-document-fixture-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'sub'));
  const present = path.join(root,'sub','fictional.pdf');
  fs.writeFileSync(present,'FICTIONAL TEST BYTES ONLY');
  return {root,present,missing:path.join(root,'sub','missing.pdf')};
}
test('fictional file counts disclose no names or paths',t=>{
  const {root,present,missing}=fixture(t);
  const report=auditDocumentPresence([{storagePath:present},{storagePath:missing},
    {storagePath:path.join(root,'..','outside.txt')},{storagePath:'relative.pdf'},{storagePath:root}],root);
  assert.deepEqual(report,{total:5,present:1,missing:1,invalidPath:3,errors:0});
  assert.ok(!JSON.stringify(report).includes('fictional.pdf'));
});
test('tenant-scoped fictional documents produce aggregate counts',t=>{
  const {root,present,missing}=fixture(t);
  assert.deepEqual(auditTenantScopedRecords([{organizationId:'fictional-a',storagePath:present},
    {organizationId:'fictional-a',storagePath:missing}],'fictional-a',root),
    {total:2,present:1,missing:1,invalidPath:0,errors:0});
});
test('tenant-mixed records are rejected before access',t=>{
  const {root,present}=fixture(t);
  assert.throws(()=>auditTenantScopedRecords([{organizationId:'fictional-b',storagePath:present}],
    'fictional-a',root),{code:'DOCUMENT_AUDIT_SCOPE_MISMATCH'});
});
test('missing scope and malformed inputs are rejected',t=>{
  const {root}=fixture(t);
  assert.throws(()=>auditTenantScopedRecords([], '', root),{code:'DOCUMENT_AUDIT_SCOPE_MISMATCH'});
  assert.throws(()=>auditDocumentPresence({},root),TypeError);
  assert.throws(()=>auditDocumentPresence([], 'relative'),TypeError);
});
test('limits audit size to 10000 records',t=>{
  const {root}=fixture(t);
  assert.throws(()=>auditDocumentPresence(Array(10001).fill({storagePath:'not-a-path'}),root),TypeError);
});
test('nonfile filesystem entries are invalid',t=>{
  const {root}=fixture(t);
  assert.equal(auditDocumentPresence([{storagePath:path.join(root,'sub')}],root).invalidPath,1);
});
test('symlink paths rejected when available',t=>{
  const {root}=fixture(t);
  const link=path.join(root,'link');
  try{fs.symlinkSync(os.tmpdir(),link,'junction')}catch(e){t.skip('Symlink privilege unavailable');return;}
  assert.equal(auditDocumentPresence([{storagePath:path.join(link,'fictional.pdf')}],root).invalidPath,1);
});
