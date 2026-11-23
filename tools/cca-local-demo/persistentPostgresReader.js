"use strict";

// Explicit operator-only persistent PostgreSQL staging reader. Not a production
// bootstrap: no customer endpoints, connection-string URLs or auto-provisioning.
const fs = require("node:fs");
const path = require("node:path");
const { createCcaPostgresTenantReader } = require("../../backend/src/cca/postgresTenantReadAdapter");

function createPersistentStagingPostgres({ password, clientRoot } = {}) {
  const expected = path.join(process.env.LOCALAPPDATA || "", "CRNETWORK-CCA-ManagedPostgres-Staging");
  const expectedClient = path.join(expected, "pg-client", "node_modules");
  if (process.platform !== "win32" || !path.isAbsolute(expected) ||
      process.env.NODE_ENV === "production" || process.env.RENDER_SERVICE_ID ||
      process.env.DATABASE_URL || process.env.SUPABASE_URL ||
      typeof password !== "string" || password.length < 48 ||
      typeof clientRoot !== "string" ||
      path.resolve(clientRoot).toLowerCase() !== path.resolve(expectedClient).toLowerCase() ||
      !fs.existsSync(path.join(expected, "status.json"))) {
    throw new Error("CCA_PERSISTENT_POSTGRES_DISABLED");
  }
  const status = JSON.parse(fs.readFileSync(path.join(expected, "status.json"), "utf8"));
  if (status.scope !== "FICTIONAL_STAGING_ONLY" || status.port !== 55451 ||
      status.host !== "127.0.0.1" || status.database !== "cca_fictional_services" ||
      status.role !== "cca_staging_reader") {
    throw new Error("CCA_PERSISTENT_POSTGRES_SCOPE_INVALID");
  }
  const { Pool } = require(path.join(expectedClient, "pg"));
  const pool = new Pool({
    host: "127.0.0.1", port: 55451, user: "cca_staging_reader",
    database: "cca_fictional_services", password, ssl: false,
    max: 2, connectionTimeoutMillis: 3000, statement_timeout: 3000,
    idleTimeoutMillis: 15000, allowExitOnIdle: true,
  });
  // No service request write functionality is ever provided here.
  return Object.freeze({
    reader: createCcaPostgresTenantReader(pool),
    verify: async () => {
      const connection = await pool.connect();
      try {
        const result = await connection.query(
          "SELECT current_user AS role, current_database() AS database, " +
          "inet_server_port() AS port, r.rolsuper AS superuser, " +
          "r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user"
        );
        if (result.rows.length !== 1 ||
            result.rows[0].role !== "cca_staging_reader" ||
            result.rows[0].database !== "cca_fictional_services" ||
            result.rows[0].port !== 55451 ||
            result.rows[0].superuser !== false ||
            result.rows[0].bypass !== false) {
          throw new Error("CCA_PERSISTENT_POSTGRES_IDENTITY_INVALID");
        }
        return true;
      } finally { connection.release(); }
    },
    close: () => pool.end(),
  });
}
module.exports = { createPersistentStagingPostgres };
