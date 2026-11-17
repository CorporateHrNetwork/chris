'use strict';
// Offline, read-only document presence audit. Not mounted as an API route.
// A future caller MUST independently authorize platform engineering access and tenant scope.
// This module does not connect to PostgreSQL or read document file contents.
const fs = require('node:fs');
const path = require('node:path');

function auditDocumentPresence(records, trustedRoot) {
  if (!Array.isArray(records) || typeof trustedRoot !== 'string' || !path.isAbsolute(trustedRoot))
    throw new TypeError('Expected a records array and absolute trusted root');
  const root = path.resolve(trustedRoot);
  const counts = { total: 0, present: 0, missing: 0, invalidPath: 0, errors: 0 };
  for (const record of records) {
    counts.total++;
    const input = record && record.storagePath;
    if (typeof input !== 'string' || !path.isAbsolute(input)) {
      counts.invalidPath++;
      continue;
    }
    const target = path.resolve(input);
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      counts.invalidPath++;
      continue;
    }
    try {
      let current = root;
      if (fs.lstatSync(root).isSymbolicLink()) { counts.invalidPath++; continue; }
      let bad = false;
      const components = relative.split(path.sep);
      for (const [index, part] of components.entries()) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() ||
          (index < components.length - 1 && !stat.isDirectory()) ||
          (index === components.length - 1 && !stat.isFile())) { bad = true; break; }
      }
      if (bad) counts.invalidPath++;
      else counts.present++;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') counts.missing++;
      else counts.errors++;
    }
  }
  return counts;
}

// Defense in depth for future integration. This check is NOT a replacement for requireAuth
// or permission middleware. Caller must supply already authenticated and verified values.
function auditAuthorizedDocumentPresence({ enabled, actor, organizationId, records, trustedRoot }) {
  if (enabled !== true || actor?.isPlatformEngineer !== true ||
      typeof organizationId !== 'string' || !organizationId ||
      actor?.authorizedOrganizationId !== organizationId) {
    const err = new Error('Document audit unavailable');
    err.code = 'DOCUMENT_AUDIT_FORBIDDEN';
    throw err;
  }
  if (!Array.isArray(records) || records.some(
    record => !record || record.organizationId !== organizationId
  )) {
    const err = new Error('Document audit scope mismatch');
    err.code = 'DOCUMENT_AUDIT_SCOPE_MISMATCH';
    throw err;
  }
  return auditDocumentPresence(records, trustedRoot);
}

module.exports = { auditDocumentPresence, auditAuthorizedDocumentPresence };
