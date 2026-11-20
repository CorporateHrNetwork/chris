const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

test("Zermatt onboarding page exposes salary corrections to existing employees", () => {
 const wizard = read("src/pages/FullOnboardingWizard.jsx");
 const component = read("src/components/employees/OnboardingSalaryCorrection.jsx");
 assert.ok(wizard.includes('zermattTenant && <OnboardingSalaryCorrection />'));
 assert.ok(component.includes("Correct an existing employee's onboarding salary"));
 assert.ok(component.includes("/api/onboarding/salary-corrections?name="));
 assert.ok(component.includes("/api/payroll/salary-rates/"));
 assert.ok(component.includes('method:"PATCH"'));
 assert.ok(component.includes("reason.trim().length < 8"));
 assert.ok(component.includes("window.confirm"));
});
test("Branch HR / Head HR salary correction is branch-scoped on both read and write", () => {
 const routes = read("backend/src/routes/zermattHrPayrollInputRoutes.js");
 assert.ok(routes.includes('"/onboarding/salary-corrections"'));
 assert.ok(routes.includes('requireEmployeeFinancialInputEditor'));
 assert.ok(routes.includes('listScopedSalaryRates(req)'));
 assert.ok(routes.includes('assertSalaryRateAccess({ req, rateId: req.params.id })'));
});
test("Full monthly gross and end month salary recompute within same audited transaction", () => {
 const service = read("backend/src/services/zermattSalaryRateControlService.js");
 assert.ok(service.includes('const { splitSalary } = require("./zermattSalarySplit")'));
 assert.ok(service.includes('const split = changedGross'));
 assert.ok(service.includes('split.endMonthGross'));
 assert.ok(service.includes('split.fullMonthlyGross'));
 assert.ok(service.includes('SET "amount"=$3, "fullMonthlyGross"=$4'));
 assert.ok(service.includes('approvedPayrollUse('));
 assert.ok(service.includes('SALARY_RATE_APPROVED_PAYROLL_HISTORY_LOCKED'));
 assert.ok(service.includes('SALARY_RATE_CORRECTED_BY_HR'));
 assert.ok(service.includes('markDraftRunsRecalculationRequired('));
});
