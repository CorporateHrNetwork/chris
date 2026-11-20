const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { splitSalary } = require("../src/services/zermattSalarySplit");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

test("full monthly gross maps into non-overlapping main and TSP authorities", () => {
 for (const gross of [84000,90000,99999,100000,150000,450000]) {
   const result = splitSalary({fullMonthlyGross:gross, employmentType:"Full-Time",hireDate:"2026-11-01",periodMonth:"2026-11"});
   assert.equal(Math.round((result.endMonthGross + result.normalMidMonth)*100),Math.round(gross*100));
   assert.equal(result.midMonthPercentage,gross>=100000?25:16);
   assert.equal(Math.round(Object.values(result.components).reduce((a,b)=>a+b,0)*100),Math.round(result.endMonthGross*100));
 }
});
test("noneligible employment type receives no mid-month TSP benefit", () => {
 const result=splitSalary({fullMonthlyGross:150000,employmentType:"Part-Time",hireDate:"2026-11-01",periodMonth:"2026-11"});
 assert.equal(result.normalMidMonth,0);
 assert.equal(result.endMonthGross,150000);
});
test("salary correction uses same audited transaction for main payroll, TSP basis and draft flags", () => {
 const src=read("backend/src/services/zermattSalaryRateControlService.js");
 assert.ok(src.includes('SET "amount"=$3, "fullMonthlyGross"=$4'));
 assert.ok(src.includes('zermatt_salary_split_preparations'));
 assert.ok(src.includes('TSP_APPROVED_OR_SUBMITTED_HISTORY_LOCKED'));
 assert.ok(src.includes('TSP_SALARY_BASIS_UPDATED_REGENERATE_DRAFT'));
 assert.ok(src.includes('SALARY_RATE_APPROVED_PAYROLL_HISTORY_LOCKED'));
 assert.ok(src.includes('SALARY_RATE_CORRECTED_BY_HR'));
 assert.ok(src.includes('markDraftRunsRecalculationRequired'));
});
test("TSP selects latest corrected full-gross basis for equal effective date", () => {
 const src=read("backend/src/services/zermattMidmonthService.js");
 assert.ok(src.includes('ORDER BY "employeeId","effectiveFrom" DESC,"updatedAt" DESC,priority DESC'));
});
test("Branch/Head HR preview and update are separate, branch-restricted actions", () => {
 const routes=read("backend/src/routes/zermattHrPayrollInputRoutes.js");
 const ui=read("src/components/employees/OnboardingSalaryCorrection.jsx");
 assert.ok(routes.includes('"/onboarding/salary-allocation-preview"'));
 assert.ok(routes.includes('requireEmployeeFinancialInputEditor'));
 assert.ok(routes.includes('assertSalaryRateAccess({ req, rateId })'));
 assert.ok(routes.includes('assertSalaryRateAccess({ req, rateId: req.params.id })'));
 assert.ok(ui.includes('Calculate and preview allocations'));
 assert.ok(ui.includes('Save and map salary allocations'));
 assert.ok(ui.includes('Main Payroll — End of Month'));
 assert.ok(ui.includes('Benefits — Transport Support (TSP)'));
 assert.ok(ui.includes('disabled={saving || !preview}'));
});
