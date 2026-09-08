const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT EXEC-PAES 2026 annual rebase is narrow, guarded and auditable", () => {
  const script = read("backend/scripts/reconcile-zermatt-exec-paes-2026.cjs");

  assert.match(script, /EMPLOYEE_NUMBER = "ZLL000087"/);
  assert.match(script, /DESIGNATION_CODE = "EXEC-PAES"/);
  assert.match(script, /POLICY_CODE = "ZLL-ANNUAL-FT"/);
  assert.match(script, /LEAVE_YEAR = 2026/);
  assert.match(script, /EXPECTED_LEVEL = 7/);
  assert.match(script, /EXPECTED_FROM_ENTITLEMENT = 30/);
  assert.match(script, /EXPECTED_TO_ENTITLEMENT = 21/);
  assert.match(script, /row\.status, "REBASE_READY"/);
  assert.match(script, /row\.retainedUsed\), 0/);
  assert.match(script, /row\.retainedPending\), 0/);
  assert.match(script, /method: "BASELINE_REPROVISION"/);
  assert.match(script, /organizationAudit\.create/);
  assert.match(script, /ZERMATT_EXEC_PAES_2026_ANNUAL_ENTITLEMENT_REBASED/);
  assert.match(script, /isolationLevel: "Serializable"/);
  assert.match(script, /mode: "ALREADY_APPLIED"/);
  assert.match(script, /leaveEntitlementAllocation\.create/);
  assert.match(script, /leaveBalance\.update/);
  assert.doesNotMatch(script, /leaveBalance\.updateMany/);
  assert.doesNotMatch(script, /leaveEntitlementAllocation\.(update|updateMany|delete|deleteMany)/);
  assert.doesNotMatch(script, /employee\.(update|updateMany|delete|deleteMany|create)/);
  assert.doesNotMatch(script, /leaveRequest\.(update|updateMany|delete|deleteMany|create)/);

  console.log("PASS: ZERMATT EXEC-PAES 2026 annual entitlement rebase gate passed.");
});
