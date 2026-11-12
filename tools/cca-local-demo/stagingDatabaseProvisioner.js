"use strict";

const { spawnSync } = require("node:child_process");
const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function createStagingDatabaseProvisioner({ root, credentialDirectory, key }) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name)));
  Object.assign(env, {
    PGHOST: "127.0.0.1", PGPORT: "55434", PGCONNECT_TIMEOUT: "5",
    PGPASSFILE: path.join(root, "pgpass.conf"),
  });
  const admin = "cca_staging_admin";

  function query(sql, database = "postgres", user = admin, password) {
    const result = spawnSync("psql.exe", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", user, "-d", database], {
      input: sql + "\n", encoding: "utf8", timeout: 12000, windowsHide: true,
      env: password ? { ...env, PGPASSWORD: password } : env,
    });
    if (result.error || result.status !== 0) throw Error("CCA_STAGING_POSTGRES_COMMAND_FAILED");
    return result.stdout.trim();
  }

  return function operate({ caseId, operation }) {
    if (!/^CCA-DEMO-[0-9]{4,12}$/.test(caseId) ||
        !["PROVISION_DATABASE", "SUSPEND_DATABASE"].includes(operation))
      throw Error("CCA_STAGING_DATABASE_ACTION_INVALID");

    const data = fs.realpathSync(path.join(root, "data"));
    const connected = query("SHOW data_directory;");
    if (path.normalize(connected).toLowerCase() !== path.normalize(data).toLowerCase())
      throw Error("CCA_STAGING_POSTGRES_CLUSTER_MISMATCH");

    const token = createHmac("sha256", key).update("identifier:" + caseId).digest("hex").slice(0, 20);
    const database = "cca_cedar_" + token;
    const login = database + "_app";
    const password = createHmac("sha256", key).update("password:" + caseId).digest("hex");

    if (operation === "PROVISION_DATABASE") {
      query(`
SELECT 'CREATE ROLE ${login} NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${login}')
\\gexec
SELECT 'CREATE DATABASE ${database} TEMPLATE template0 ALLOW_CONNECTIONS false'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')
\\gexec
REVOKE ALL ON DATABASE ${database} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${database} TO ${login};
ALTER DATABASE ${database} ALLOW_CONNECTIONS true;
`);
      query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ${login};`, database);

      // The profile's host-security directory is private to its Windows owner.
      const credential = path.join(credentialDirectory, `${caseId}.pgpass`);
      const entry = `127.0.0.1:55434:${database}:${login}:${password}\n`;
      try { fs.writeFileSync(credential, entry, { flag: "wx", mode: 0o600 }); }
      catch (error) {
        if (error.code !== "EEXIST" || fs.readFileSync(credential, "utf8") !== entry) throw error;
      }
      // Keep PostgreSQL error output and SQL containing the password out of logs.
      if (query(`SELECT has_database_privilege('${login}', 'chris_staging', 'CONNECT');`) !== "f" ||
          query(`SELECT has_database_privilege('chris_staging_app', '${database}', 'CONNECT');`) !== "f")
        throw Error("CCA_STAGING_DATABASE_ISOLATION_FAILED");
      query(`ALTER ROLE ${login} LOGIN PASSWORD '${password}';`);
      try {
        if (query("SELECT current_database();", database, login, password) !== database)
          throw Error("CCA_STAGING_DATABASE_LOGIN_CHECK_FAILED");
      } catch (error) {
        query(`ALTER ROLE ${login} NOLOGIN;`);
        throw error;
      }
    } else {
      query(`ALTER ROLE ${login} NOLOGIN;`);
      query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${login}';`);
      if (query(`SELECT NOT rolcanlogin FROM pg_roles WHERE rolname = '${login}';`) !== "t" ||
          query("SELECT label FROM pilot_record;", "chris_staging", "chris_staging_app") !== "fictional-chris-staging")
        throw Error("CCA_STAGING_DATABASE_SUSPENSION_CHECK_FAILED");
    }
    return { database, login };
  };
}

module.exports = { createStagingDatabaseProvisioner };
