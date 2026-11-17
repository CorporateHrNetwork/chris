'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditDocumentPresence, auditAuthorizedDocumentPresence } = require('./documentPresenceDiagnostic.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chris-document-fixture-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'sub'));
  const present = path.join(root, 'sub', 'fictional.pdf');
  fs.writeFileSync(present, 'FAKE TEST DOCUMENT');
  return { root, present, missing: path.join(root, 'sub', 'missing.pdf') };
}

test('aggregate-only presence on fictional files', t => {
  const { root, present, missing } = fixture(t);
  const result = auditDocumentPresence([
    { storagePath: present }, { storagePath: missing },
    { storagePath: path.resolve(root, '..', 'outside') },
    { storagePath: 'relative.pdf' }, { storagePath: root }
  ], root);
  assert.deepEqual(result, {total:5,present:1,missing:1,invalidPath:3,errors:0});
  assert.ok(!JSON.stringify(result).includes('fictional.pdf'));
});
test('diagnostic is disabled unless explicitly enabled', t => {
  const { root, present } = fixture(t);
  const options = {enabled:false, actor:{isPlatformEngineer:true,authorizedOrganizationId:'fictional-tenant'}, organizationId:'fictional-tenant', records:[{organizationId:'fictional-tenant',storagePath:present}], trustedRoot:root};
  assert.throws(() => auditAuthorizedDocumentPresence(options), {code:'DOCUMENT_AUDIT_FORBIDDEN'});
});
test('non-engineer and wrong tenant are denied', t => {
  const { root, present } = fixture(t);
  const base = {enabled:true, organizationId:'fictional-tenant', records:[{organizationId:'fictional-tenant',storagePath:present}], trustedRoot:root};
  assert.throws(() => auditAuthorizedDocumentPresence({...base, actor:{isPlatformEngineer:false,authorizedOrganizationId:'fictional-tenant'}}), {code:'DOCUMENT_AUDIT_FORBIDDEN'});
  assert.throws(() => auditAuthorizedDocumentPresence({...base, actor:{isPlatformEngineer:true,authorizedOrganizationId:'other-tenant'}}), {code:'DOCUMENT_AUDIT_FORBIDDEN'});
});
test('rejects tenant-mixed metadata', t => {
  const { root, present } = fixture(t);
  assert.throws(() => auditAuthorizedDocumentPresence({
    enabled:true, actor:{isPlatformEngineer:true,authorizedOrganizationId:'fictional-tenant'},
    organizationId:'fictional-tenant', records:[{organizationId:'other-tenant',storagePath:present}], trustedRoot:root
  }), {code:'DOCUMENT_AUDIT_SCOPE_MISMATCH'});
});
test('authorized fictional records return counts only', t => {
  const { root, present, missing } = fixture(t);
  const result = auditAuthorizedDocumentPresence({
    enabled:true, actor:{isPlatformEngineer:true,authorizedOrganizationId:'fictional-tenant'},
    organizationId:'fictional-tenant',
    records:[{organizationId:'fictional-tenant',storagePath:present},{organizationId:'fictional-tenant',storagePath:missing}],
    trustedRoot:root
  });
  assert.deepEqual(result,{total:2,present:1,missing:1,invalidPath:0,errors:0});
});
test('rejects symlink directory when supported', t => {
  const {root} = fixture(t);
  const link = path.join(root,'link');
  try { fs.symlinkSync(os.tmpdir(), link,'junction'); } catch (e) { t.skip('Symlink permission unavailable'); return; }
  assert.equal(auditDocumentPresence([{storagePath:path.join(link,'fictional.pdf')}], root).invalidPath,1);
});
