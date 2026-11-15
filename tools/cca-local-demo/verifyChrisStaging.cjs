"use strict";

const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const backendRequire = createRequire(resolve(__dirname, "../../backend/package.json"));

async function verify() {
  const adminUrl = new URL(process.env.CCA_PILOT_ADMIN_URL);
  const appUrl = new URL(process.env.DATABASE_URL);
  for (const [url, user] of [[adminUrl, "cca_pilot_admin"], [appUrl, "chris_staging_app"]]) {
    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "55432");
    assert.equal(url.pathname, "/chris_staging");
    assert.equal(url.username, user);
    assert.equal(url.search, "");
    assert.match(url.password, /^[a-f0-9]{48}$/);
  }
  const { PrismaClient } = backendRequire("@prisma/client");
  const { PrismaPg } = backendRequire("@prisma/adapter-pg");
  const bcrypt = backendRequire("bcryptjs");
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("hex");
  const organizationSlug = "cca-fictional-chris-staging";
  const email = "operator@example.invalid";
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl.href }) });
  try {
    const organization = await admin.organization.create({
      data: { name: "Fictional CHRiS Staging", slug: organizationSlug },
    });
    await admin.user.create({
      data: { organizationId: organization.id, email, passwordHash: await bcrypt.hash(password, 10) },
    });
  } finally {
    await admin.$disconnect();
  }

  const app = backendRequire("./src/app");
  const prisma = backendRequire("./src/config/prisma");
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const url = "http://127.0.0.1:" + server.address().port + "/api/auth/login";
    const login = (slug) => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, organizationSlug: slug }),
    });
    const response = await login(organizationSlug);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.organization.slug, organizationSlug);
    assert.equal(data.user.email, email);
    assert.ok(data.token);
    const wrongOrganization = await login("cca-other-fictional-tenant");
    assert.equal(wrongOrganization.status, 401);
    await wrongOrganization.body.cancel();
    console.log("PASS: CHRiS authentication uses its dedicated database after Cedar suspension");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
}

verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
