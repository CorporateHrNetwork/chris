"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const { join, resolve } = require("node:path");

const backend = resolve(__dirname, "../../backend");
const backendRequire = createRequire(join(backend, "package.json"));
const slug = "cca-fictional-chris-staging";
const otherSlug = "cca-fictional-other";
const email = "operator@example.invalid";
const employeeNumbers = ["CCA-101", "CCA-102", "CCA-103"];

function stagingCredentials() {
  assert.equal(process.platform, "win32");
  const root = join(process.env.LOCALAPPDATA, "CRNETWORK-CCA-Database-Staging");
  assert.ok(fs.existsSync(join(root, "pilot.ready")));
  const entries = fs.readFileSync(join(root, "pgpass.conf"), "utf8").trim().split(/\r?\n/);
  const connection = (database, user) => {
    const prefix = "127.0.0.1:55434:" + database + ":" + user + ":";
    const password = entries.find(line => line.startsWith(prefix))?.slice(prefix.length);
    assert.match(password || "", /^[a-f0-9]{64}$/);
    return "postgresql://" + user + ":" + password + "@127.0.0.1:55434/chris_staging";
  };
  return {
    root,
    adminUrl: connection("*", "cca_staging_admin"),
    appUrl: connection("chris_staging", "chris_staging_app"),
  };
}

function prismaCommand(command, databaseUrl) {
  const cli = join(backend, "node_modules/prisma/build/index.js");
  const args = command === "generate" ? ["generate"] : ["migrate", "deploy"];
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: backend, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Prisma " + command + " failed");
}

async function prepareSchema(adminUrl) {
  const { Client } = backendRequire("pg");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rows: [server] } = await admin.query("SELECT current_database() AS name, inet_server_port() AS port");
    assert.deepEqual(server, { name: "chris_staging", port: 55434 });
    const { rows: [schema] } = await admin.query("SELECT to_regclass('public._prisma_migrations') AS migrations");
    if (!schema.migrations) {
      // Prisma requires an empty public schema on first deployment.
      await admin.query("CREATE SCHEMA IF NOT EXISTS cca_pilot; ALTER TABLE IF EXISTS public.pilot_record SET SCHEMA cca_pilot");
    }
    try {
      prismaCommand("deploy", adminUrl);
    } finally {
      await admin.query("ALTER TABLE IF EXISTS cca_pilot.pilot_record SET SCHEMA public; DROP SCHEMA IF EXISTS cca_pilot");
    }
    prismaCommand("generate", adminUrl);
    await admin.query(`GRANT SELECT ON organizations, users, user_roles, roles, permissions, role_permissions,
      user_locations, organization_locations, employees, departments, designations,
      organization_employment_levels, employee_line_manager_assignments, employee_employment_level_assignments TO chris_staging_app`);
  } finally {
    await admin.end();
  }
}

async function seed(adminUrl, password) {
  const { PrismaClient } = backendRequire("@prisma/client");
  const { PrismaPg } = backendRequire("@prisma/adapter-pg");
  const bcrypt = backendRequire("bcryptjs");
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    await admin.$transaction(async tx => {
      for (const [tenantSlug, name] of [[slug, "Fictional CHRiS Staging"], [otherSlug, "Fictional Second Tenant"]]) {
        const organization = await tx.organization.upsert({
          where: { slug: tenantSlug }, update: {}, create: { slug: tenantSlug, name },
        });
        const primary = tenantSlug === slug;
        const locations = primary ? ["Cedar Gate", "North Wharf"] : ["Harbour Annex"];
        for (const [index, locationName] of locations.entries()) {
          const id = tenantSlug + "-branch-" + index;
          await tx.organizationLocation.upsert({
            where: { id }, update: {}, create: { id, name: locationName, organizationId: organization.id },
          });
        }
        const departmentId = tenantSlug + "-operations";
        await tx.department.upsert({
          where: { id: departmentId }, update: {},
          create: { id: departmentId, name: "Fictional Operations", organizationId: organization.id },
        });
        const numbers = primary ? employeeNumbers : ["CCA-201"];
        for (const [index, employeeNumber] of numbers.entries()) {
          const data = {
            organizationId: organization.id, employeeNumber, firstName: "Demo", lastName: employeeNumber,
            locationId: tenantSlug + "-branch-" + (index % locations.length), departmentId,
          };
          await tx.employee.upsert({
            where: { organizationId_employeeNumber: { organizationId: organization.id, employeeNumber } },
            update: {}, create: data,
          });
        }
        if (!primary) continue;
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await tx.user.upsert({
          where: { organizationId_email: { organizationId: organization.id, email } },
          update: { passwordHash }, create: { organizationId: organization.id, email, passwordHash },
        });
        const role = await tx.role.upsert({
          where: { organizationId_name: { organizationId: organization.id, name: "Pilot Employee Viewer" } },
          update: {}, create: { organizationId: organization.id, name: "Pilot Employee Viewer" },
        });
        const permission = await tx.permission.upsert({
          where: { key: "employees.view" }, update: {}, create: { key: "employees.view", name: "View employees" },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {}, create: { userId: user.id, roleId: role.id },
        });
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {}, create: { roleId: role.id, permissionId: permission.id },
        });
      }
    });
  } finally {
    await admin.$disconnect();
  }
}

async function main() {
  const { root, adminUrl, appUrl } = stagingCredentials();
  // Ignore inherited integration settings and local backend .env files.
  for (const key of Object.keys(process.env)) {
    if (!/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES)$/i.test(key)) {
      delete process.env[key];
    }
  }
  process.chdir(root);
  process.env.DOTENV_CONFIG_PATH = join(root, "disabled-pilot-env");
  assert.equal(fs.existsSync(join(root, ".env")), false);
  assert.equal(fs.existsSync(process.env.DOTENV_CONFIG_PATH), false);
  process.env.DATABASE_URL = appUrl;
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("hex");
  await prepareSchema(adminUrl);
  await seed(adminUrl, password);
  const app = backendRequire("./src/app");
  const prisma = backendRequire("./src/config/prisma");
  const server = app.listen(55436, "127.0.0.1");
  const shutdown = async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    await prisma.$disconnect();
  };
  try {
    await new Promise((resolveListening, reject) => {
      server.once("listening", resolveListening);
      server.once("error", reject);
    });
    const origin = "http://127.0.0.1:55436";
    const login = organizationSlug => fetch(origin + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationSlug, email, password }),
    });
    const response = await login(slug);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.organization.slug, slug);
    const foreignLogin = await login(otherSlug);
    assert.equal(foreignLogin.status, 401);
    await foreignLogin.body.cancel();
    const employees = await fetch(origin + "/api/employees", { headers: { Authorization: "Bearer " + data.token } });
    assert.equal(employees.status, 200);
    const listed = (await employees.json()).data;
    assert.deepEqual(listed.map(row => row.employeeNumber).sort(), employeeNumbers);
    assert.deepEqual([...new Set(listed.map(row => row.location.name))].sort(), ["Cedar Gate", "North Wharf"]);
    const branchEmployees = await fetch(origin + "/api/employees", {
      headers: { Authorization: "Bearer " + data.token, "X-CHRiS-Location-Id": slug + "-branch-0" },
    });
    assert.equal(branchEmployees.status, 200);
    assert.deepEqual((await branchEmployees.json()).data.map(row => row.employeeNumber).sort(), ["CCA-101", "CCA-103"]);
    const foreignBranch = await fetch(origin + "/api/employees", {
      headers: { Authorization: "Bearer " + data.token, "X-CHRiS-Location-Id": otherSlug + "-branch-0" },
    });
    assert.equal(foreignBranch.status, 403);
    await foreignBranch.body.cancel();
    fs.writeFileSync(join(root, "fictional-login.json"), JSON.stringify({ organizationSlug: slug, email, password }));
    console.log("PASS: CHRiS staging login and employee API returned 3 fictional employees across 2 branches and excluded the second tenant.");
    console.log("CHRiS staging API is running on " + origin);
  } catch (error) {
    await shutdown();
    throw error;
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => shutdown().catch(() => { process.exitCode = 1; }));
  }
}

main().catch(error => {
  // Avoid printing connection strings, tokens, or credentials in the staging log.
  console.error("CHRiS staging failed:", error.code || error.name,
    error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Check prerequisites and database state.");
  process.exitCode = 1;
});
