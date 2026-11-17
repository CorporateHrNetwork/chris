'use strict';
// NOT MOUNTED. Integration prototype for internal-only recovery diagnostics.
// No HTTP route, no startup invocation, no production access.
// Caller MUST supply req.auth created by CHRiS requireAuth, never from request body.
// Only intended for approved, one-off recovery inspection.
const path = require('node:path');
const {auditTenantScopedRecords} = require('./documentPresenceDiagnostic.cjs');
const PLATFORM = 'corporatehr-network';
const TARGET = 'zermatt-liquor-limited';
const PERMISSION = 'support.engineering.document_presence_audit';
const LIMIT = 10000;

function refuse() {
  const error = new Error('Document diagnostic is unavailable');
  error.code = 'DOCUMENT_DIAGNOSTIC_DISABLED';
  throw error;
}

function authorize(auth, enabled) {
  // Two independent gates: an approved server-owned environment flag and explicit invocation.
  if (process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED !== 'true' ||
      enabled !== true || !auth ||
      auth.organization?.slug !== PLATFORM ||
      !Array.isArray(auth.permissions) ||
      !auth.permissions.includes(PERMISSION) ||
      !auth.userId || !auth.organizationId ||
      !auth.roles || !Array.isArray(auth.roles)) refuse();
}

async function runDocumentPresenceDiagnostic({auth, prisma, enabled = false, trustedRoot}) {
  authorize(auth, enabled);
  if (!prisma?.organization?.findUnique || !prisma?.employeeDocument?.findMany ||
      typeof trustedRoot !== 'string' || !path.isAbsolute(trustedRoot)) refuse();
  // Organization is resolved server side; never trust a tenant supplied by the request.
  const tenant = await prisma.organization.findUnique({
    where: {slug: TARGET}, select: {id: true, slug: true}
  });
  if (!tenant || tenant.slug !== TARGET || !tenant.id) refuse();

  // Read metadata only. Bound the work to avoid unbounded request costs.
  const rows = await prisma.employeeDocument.findMany({
    where: {organizationId: tenant.id},
    select: {organizationId: true, storagePath: true},
    orderBy: {id: 'asc'},
    take: LIMIT + 1
  });
  if (rows.length > LIMIT) refuse();
  const counts = auditTenantScopedRecords(rows, tenant.id, trustedRoot);
  return Object.freeze({...counts, scope: 'zermatt-onboarding-documents', mode: 'METADATA_ONLY'});
}
module.exports = {runDocumentPresenceDiagnostic};
