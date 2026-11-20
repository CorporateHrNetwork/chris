"use strict";

// Independent CCA hosted Postgres bootstrap. No live provider access or
// credential discovery. Caller supplies secrets through a dedicated environment.
const { createCcaPostgresTenantReader } = require("./postgresTenantReadAdapter");

function ccaConfigError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function buildCcaHostedPostgresOptions(env = process.env) {
  if (env.CCA_HOSTED_DATABASE_MODE !== "isolated-hosted" ||
      env.CCA_HOSTED_DATABASE_SCOPE !== "CCA_ONLY") {
    throw ccaConfigError("CCA_HOSTED_DATABASE_NOT_ENABLED");
  }
  const host = env.CCA_PG_HOST;
  const name = env.CCA_PG_DATABASE;
  const user = env.CCA_PG_READER;
  const password = env.CCA_PG_PASSWORD;
  const port = Number(env.CCA_PG_PORT);
  const ca = env.CCA_PG_CA_PEM;
  if (typeof host !== "string" || host.length > 253 ||
      !/^[a-z0-9.-]+$/i.test(host) ||
      host === "localhost" || host.startsWith("127.") ||
      host.endsWith(".local") || !host.includes(".")) {
    throw ccaConfigError("CCA_HOSTED_DATABASE_HOST_INVALID");
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      typeof name !== "string" || !/^cca_[a-z0-9_]{3,55}$/.test(name) ||
      user !== "cca_hosted_reader" ||
      typeof password !== "string" || password.length < 24 ||
      typeof ca !== "string" ||
      !ca.includes("-----BEGIN CERTIFICATE-----") ||
      !ca.includes("-----END CERTIFICATE-----")) {
    throw ccaConfigError("CCA_HOSTED_DATABASE_SETTINGS_INVALID");
  }
  if (env.DATABASE_URL || env.SUPABASE_URL ||
      env.CCA_PG_SSL_REJECT_UNAUTHORIZED === "false" ||
      /(?:supabase|zermatt)/i.test(host + " " + name + " " + user)) {
    throw ccaConfigError("CCA_HOSTED_DATABASE_ISOLATION_REQUIRED");
  }
  return Object.freeze({
    host, port, database: name, user, password,
    ssl: Object.freeze({ rejectUnauthorized: true, ca }),
    max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 15000, statement_timeout: 5000,
    application_name: "crnetwork_cca_hosted_reader"
  });
}

function createCcaHostedPostgres({ env = process.env, Pool } = {}) {
  if (typeof Pool !== "function") throw ccaConfigError("CCA_HOSTED_PG_POOL_REQUIRED");
  const options = buildCcaHostedPostgresOptions(env);
  const pool = new Pool(options);
  if (!pool || typeof pool.connect !== "function" || typeof pool.end !== "function") {
    throw ccaConfigError("CCA_HOSTED_PG_POOL_INVALID");
  }
  return Object.freeze({
    reader: createCcaPostgresTenantReader(pool),
    async verify() {
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT current_user AS role, current_database() AS database, " +
          "rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        );
        if (!Array.isArray(result?.rows) || result.rows.length !== 1 ||
            result.rows[0].role !== options.user ||
            result.rows[0].database !== options.database ||
            result.rows[0].rolsuper !== false ||
            result.rows[0].rolbypassrls !== false) {
          throw ccaConfigError("CCA_HOSTED_DATABASE_ROLE_INVALID");
        }
        return true;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  });
}

module.exports = { buildCcaHostedPostgresOptions, createCcaHostedPostgres };
