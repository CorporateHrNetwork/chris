const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const loginSource = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "src", "pages", "Login.jsx"),
  "utf8",
);

test("sales demo login is pinned to the authoritative tenant", () => {
  assert.ok(loginSource.includes('const SALES_DEMO_HOST = "chris-sales-demo.onrender.com";'));
  assert.ok(loginSource.includes('const SALES_DEMO_ORGANIZATION_SLUG = "chris-client-demo-10";'));
  assert.ok(!loginSource.includes("chris-demo-company"));

  assert.match(
    loginSource,
    /const organizationSlug = isSalesDemoHost\s*\? SALES_DEMO_ORGANIZATION_SLUG\s*: searchParams\.get\("organization"\)\?\.trim\(\)\s*\|\|\s*legacyOrganization\s*\|\|\s*"corporatehr-network";/,
  );
});
