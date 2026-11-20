'use strict';
// CHRiS DR: isolated document-metadata diagnostic, NOT an API endpoint.
// No DB queries, authorization claims, file content reads, writes, or logging.
// A future server integration MUST independently establish caller identity,
// platform role, tenant scope and a disabled-by-default feature flag.
const fs = require('node:fs');
const path = require('node:path');

function auditDocumentPresence(records, trustedRoot) {
  if (!Array.isArray(records) || records.length > 10000 ||
      typeof trustedRoot !== 'string' || !path.isAbsolute(trustedRoot)) {
    throw new TypeError('Expected up to 10000 records and an absolute trusted root');
  }
  const root = path.resolve(trustedRoot);
  // A missing or symlinked audit root is an infrastructure failure, NOT proof of missing documents.
  let rootStat;
  try { rootStat = fs.lstatSync(root); }
  catch { throw new Error('DOCUMENT_AUDIT_ROOT_UNAVAILABLE'); }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('DOCUMENT_AUDIT_ROOT_INVALID');
  }
  const counts = {total: 0, present: 0, missing: 0, invalidPath: 0, errors: 0};
  for (const record of records) {
    counts.total++;
    const input = record && record.storagePath;
    if (typeof input !== 'string' || !path.isAbsolute(input)) {
      counts.invalidPath++;
      continue;
    }
    const target = path.resolve(input);
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative)) {
      counts.invalidPath++;
      continue;
    }
    try {
      // lstat each child component; do not follow symlinks in the upload tree.
      // Trusted root itself must be configured from a server-owned constant,
      // never accepted from a client or a database document record.
      if (!fs.lstatSync(root).isDirectory()) {counts.invalidPath++; continue;}
      let current = root;
      let invalid = false;
      const parts = relative.split(path.sep);
      for (const [i, part] of parts.entries()) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() ||
            (i < parts.length - 1 && !stat.isDirectory()) ||
            (i === parts.length - 1 && !stat.isFile())) {
          invalid = true;
          break;
        }
      }
      if (invalid) counts.invalidPath++;
      else counts.present++;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') counts.missing++;
      else counts.errors++;
    }
  }
  return counts;
}

// Defense-in-depth for tenant-filtered input; NOT user authorization.
// Requires verified tenant-scoped records supplied by an authorized server caller.
function auditTenantScopedRecords(records, organizationId, trustedRoot) {
  if (typeof organizationId !== 'string' || !organizationId.trim() ||
      !Array.isArray(records) || records.some(
        r => !r || r.organizationId !== organizationId
      )) {
    const error = new Error('Document audit tenant scope mismatch');
    error.code = 'DOCUMENT_AUDIT_SCOPE_MISMATCH';
    throw error;
  }
  return auditDocumentPresence(records, trustedRoot);
}

module.exports = {auditDocumentPresence, auditTenantScopedRecords};
