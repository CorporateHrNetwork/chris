const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  POLICY_MODE,
  SALARY_BASIS,
  PAYMENT_TIMING,
  eligibilityForPeriod,
} = require("../src/services/zermattLeaveAllowanceService");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Zermatt Leave Allowance retains its formula using reference December salary", () => {
  assert.equal(POLICY_MODE, "REFERENCE_SALARY_FORMULA");
  assert.equal(SALARY_BASIS, "LAST_DECEMBER_GROSS");
  assert.equal(PAYMENT_TIMING, "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE");
  const result = eligibilityForPeriod({
    hireDate: "2026-09-18",
    employmentType: "Full-Time",
    periodStart: "2027-09-01",
    periodEnd: "2027-09-30",
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "FULL_TIME_ANNUAL_ENTRY_MONTH_AFTER_FIRST_SERVICE_YEAR");
});

test("Employment Type and salary review use individual audited branch-scoped controls", () => {
  const employmentTypeRoutes = read("backend/src/routes/employeeEmploymentTypeRoutes.js");
  const salaryReviewRoutes = read("backend/src/routes/zermattSalaryReviewRoutes.js");
  assert.ok(employmentTypeRoutes.includes("EMPLOYMENT_TYPE_CHANGE_REASON_REQUIRED"));
  assert.ok(employmentTypeRoutes.includes("activeLocationId"));
  assert.ok(employmentTypeRoutes.includes("assignEmployee"));
  assert.ok(salaryReviewRoutes.includes("SALARY_REVIEW_REASON_REQUIRED"));
  assert.ok(salaryReviewRoutes.includes("assertEmployeeNumberAccess"));
  assert.ok(salaryReviewRoutes.includes("INDIVIDUAL_SALARY_REVIEW_APPLIED"));
  assert.ok(salaryReviewRoutes.includes("markDraftRunsRecalculationRequired"));
  assert.ok(salaryReviewRoutes.includes("SALARY_REVIEW_EFFECTIVE_DATE_CONFLICT"));
});

test("Documents, Statutories and Performance child routes no longer use the planned dead end", () => {
  const planned = read("src/pages/shared/PlannedWorkspace.jsx");
  const moduleDashboard = read("src/components/dashboard/ModuleDashboard.jsx");
  const performance = read("src/pages/Performance.jsx");
  const documents = read("src/pages/documents/DocumentsWorkspace.jsx");
  const documentRoutes = read("src/utils/documentWorkspaceRoute.js");
  const operational = read("backend/src/routes/operationalControlRoutes.js");
  const compactPlanned = planned.replace(/\s+/g, "");

  assert.ok(planned.includes('pathname.startsWith("/documents/")'));
  assert.ok(planned.includes('module="STATUTORIES"'));
  assert.ok(planned.includes('module="PERFORMANCE"'));
  assert.ok(compactPlanned.includes('pathname==="/compensation/reviews"'));
  assert.ok(moduleDashboard.includes('moduleKey === "statutories"'));
  assert.ok(performance.includes('module="PERFORMANCE"'));
  for (const label of ["Employee Documents", "HR Documents", "Company Policies", "Templates", "Document Categories", "Expiry Tracking", "Document Requests"]) {
    assert.ok(documents.includes(label), `Missing Documents child: ${label}`);
  }
  for (const path of ["/documents/employee", "/documents/hr", "/documents/policies", "/documents/templates", "/documents/categories", "/documents/expiry-tracking", "/documents/requests"]) {
    assert.ok(documentRoutes.includes(path), `Missing Documents route mapping: ${path}`);
  }
  for (const area of ["PAYE_TAX", "PENSION_COMPLIANCE", "NHIA", "NSITF", "ITF", "REMITTANCES", "REPORTS", "GOALS_KPIS", "CYCLES", "REVIEWS", "APPRAISALS", "IMPROVEMENT_PLANS"]) {
    assert.ok(operational.includes(area), `Missing operational area: ${area}`);
  }
});

test("Leave Allowance UI and settings disclose the reference salary and retained formula", () => {
  const register = read("src/pages/benefits/ZermattLeaveAllowance.jsx");
  const settings = read("src/pages/benefits/ZermattLeaveAllowanceSettings.jsx");
  const service = read("backend/src/services/zermattLeaveAllowanceRegisterService.js");
  assert.ok(register.includes("Reference Import"));
  assert.ok(register.includes("Last December gross salary"));
  assert.ok(register.includes("Leave Allowance Reference Import"));
  assert.ok(service.includes('"REFERENCE_SALARY_FORMULA"'));
  assert.ok(service.includes('"LAST_DECEMBER_GROSS"'));
  assert.ok(service.includes('"EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE"'));
  assert.ok(settings.includes("Leave Allowance"));
});

console.log("PASS: Zermatt workforce controls and connected module acceptance gate passed.");
