const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routes = fs.readFileSync(path.join(__dirname, "../src/routes/payrollRoutes.js"), "utf8");

test("Zermatt approval endpoints enforce designated roles and tenant", () => {
  assert.ok(routes.includes('router.post("/runs/:id/approval-workflow/start"'));
  assert.ok(routes.includes('router.post("/runs/:id/approval-workflow/action"'));
  assert.ok(routes.includes("isZermatt(req) && roleCheck(req)"));
  assert.ok(routes.includes("!isZermatt(req) || !roles[action] || !roles[action](req)"));
  for (const role of ["REQUEST_AUDIT: isHeadHr", "AUDIT_APPROVE: isPayrollAuditor", "GM_OPEN: isGeneralManager", "GM_DISAPPROVE: isGeneralManager"]) {
    assert.ok(routes.includes(role), role);
  }
  assert.equal(routes.includes("GM_APPROVE: isGeneralManager"), false);
  assert.equal(routes.includes("PAYOUT_EXPORTED: isChiefAccountant"), false);
});

test("legacy payroll approval and payout cannot bypass an active Zermatt workflow", () => {
  const decision = routes.slice(routes.indexOf('router.post("/runs/:id/decision"'));
  const payout = routes.slice(routes.indexOf('router.get("/runs/:id/approved-payout.xlsx"'));
  assert.ok(decision.indexOf("ZERMATT_SEQUENTIAL_APPROVAL_REQUIRED") >= 0);
  assert.ok(decision.indexOf("ZERMATT_SEQUENTIAL_APPROVAL_REQUIRED") < decision.indexOf("payroll.decidePayrollRun("));
  assert.ok(payout.indexOf("ZERMATT_SEQUENTIAL_PAYOUT_EXPORT_NOT_READY") >= 0);
  assert.ok(payout.indexOf("ZERMATT_SEQUENTIAL_PAYOUT_EXPORT_NOT_READY") < payout.indexOf("payrollExternalWorkbook("));
});
