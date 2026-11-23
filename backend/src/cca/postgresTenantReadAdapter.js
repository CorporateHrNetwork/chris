"use strict";

// Pure CCA PostgreSQL read adapter. Not mounted into a live API or staging app.
// Caller MUST supply a pool using a DB role with tenant RLS and no BYPASSRLS.
// An independent deployment migration must create/grant the target relation
// and tenant RLS policy; this adapter does not grant database privileges.
const { canAccessTenantCase, PERMISSIONS } = require("./controlPlanePolicy");

function validateTenantContext(context, tenantId) {
  return typeof tenantId === "string" && tenantId.length > 0 &&
    tenantId.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(tenantId) &&
    canAccessTenantCase(context, PERMISSIONS.TICKETS_READ, tenantId);
}

function createCcaPostgresTenantReader(pool) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("CCA_DATABASE_POOL_REQUIRED");
  return Object.freeze({
    async listServiceRequests({ context, tenantId, limit = 100 } = {}) {
      if (!validateTenantContext(context, tenantId)) {
        const err = new Error("CCA_TENANT_DATABASE_READ_DENIED");
        err.code = "CCA_TENANT_DATABASE_READ_DENIED";
        throw err;
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        const err = new Error("CCA_INVALID_READ_LIMIT");
        err.code = "CCA_INVALID_READ_LIMIT";
        throw err;
      }
      const client = await pool.connect();
      let began = false;
      try {
        await client.query("BEGIN READ ONLY");
        began = true;
        // Enforce least privilege on the actual checked-out connection.
        // A privileged pool can bypass row-level security; refuse it even if
        // an application WHERE clause appears tenant-scoped.
        const role = await client.query(
          "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        );
        if (!Array.isArray(role?.rows) || role.rows.length !== 1 ||
            role.rows[0].rolsuper !== false ||
            role.rows[0].rolbypassrls !== false) {
          const error = new Error("CCA_DATABASE_PRIVILEGED_ROLE_DENIED");
          error.code = "CCA_DATABASE_PRIVILEGED_ROLE_DENIED";
          throw error;
        }
        // SET LOCAL is deliberately invoked through the parameterized
        // set_config function; it remains transaction-scoped.
        await client.query("SELECT set_config('cca.tenant_id', $1, true)", [tenantId]);
        const result = await client.query(
          "SELECT id, tenant_id, service_code, status FROM cca_service_requests WHERE tenant_id = $1 ORDER BY id LIMIT $2",
          [tenantId, limit]
        );
        if (!Array.isArray(result?.rows) ||
            result.rows.some(row => row.tenant_id !== tenantId)) {
          throw new Error("CCA_DATABASE_TENANT_SCOPE_VIOLATION");
        }
        await client.query("COMMIT");
        return Object.freeze(result.rows.map(row => Object.freeze({
          id: row.id,
          serviceCode: row.service_code,
          status: row.status,
        })));
      } catch (error) {
        if (began) {
          try { await client.query("ROLLBACK"); }
          catch { /* original failure stays authoritative */ }
        }
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

module.exports = { createCcaPostgresTenantReader };
