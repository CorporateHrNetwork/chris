const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "src/routes/employeeDataOperationsRoutes.js"), "utf8");
const workbook = fs.readFileSync(path.join(root, "src/services/employeeDataOperationsService.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "prisma/migrations/20260930173000_zermatt_department_cost_centre_reconciliation/migration.sql"), "utf8");

test("Zermatt download includes the three explicitly approved Takeaway departments", () => {
  for (const name of ["BB Takeaway","BB Takeaway (WSE)","BB Takeaway (GWP)"]) {
    assert.ok(route.includes(JSON.stringify(name)), `Missing approved ${name}`);
    assert.ok(migration.includes(`'${name}'`), `Missing migration entry for ${name}`);
  }
});

test("three Takeaway department codes reuse matched Cost Centre codes", () => {
  for (const entry of [
    ["BB Takeaway","BBT","BBT-GEN"],
    ["BB Takeaway (WSE)","BBT-WSE","BBT-WSE"],
    ["BB Takeaway (GWP)","BBT-GWP","BBT-GWP"],
  ]) {
    assert.ok(migration.includes(`('${entry[0]}','${entry[1]}','${entry[2]}'`));
  }
  assert.ok(migration.includes("ON CONFLICT (\"organizationId\",code) DO NOTHING"));
  assert.ok(migration.includes("Existing live Cost Centre mapping preserved"));
  assert.ok(migration.includes("v_existing_mapping IS NULL"));
  assert.ok(migration.includes("IF NOT v_is_takeaway THEN"));
  assert.ok(migration.includes("organization_audits"));
  assert.ok(!migration.includes('UPDATE employees'), "Existing employee Cost Centre links must not be silently reassigned.");
});

test("download exposes actual stored codes and Cost Centre mapping evidence", () => {
  for (const token of ["costCentreName","costCentreCode","costCentreStatus"]) {
    assert.ok(route.includes(token), `Tenant inventory missing ${token}`);
    assert.ok(workbook.includes(token), `Workbook missing ${token}`);
  }
  assert.ok(workbook.includes('"Complete Department Inventory"'));
});
