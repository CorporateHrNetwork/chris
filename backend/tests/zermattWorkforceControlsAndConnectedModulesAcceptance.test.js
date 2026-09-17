const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ELIGIBLE_EMPLOYMENT_TYPE,
  eligibilityForPeriod,
} = require("../src/services/zermattLeaveAllowanceService");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Zermatt Leave Allowance is restricted to Full-Time employees", () => {
  assert.equal(ELIGIBLE_EMPLOYMENT_TYPE, "Full-Time");
  const period = { periodStart: "2027-09-01", periodEnd: "2027-09-30" };
  assert.equal(eligibilityForPeriod({ hireDate: "2026-09-18", employmentType: "Full-Time", ...period }).eligible, true);
  for (const employmentType of ["Part-time", "Expatriate", "NYSC/Internship"]) {
    const result = eligibilityForPeriod({ hireDate: "2026-09-18", employmentType, ...period });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "EMPLOYMENT_TYPE_NOT_ELIGIBLE");
  }
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
  const operational = read("backend/src/routes/operationalControlRoutes.js");

  assert.ok(planned.includes('pathname.startsWith("/documents/")'));
  assert.ok(planned.includes('module="STATUTORIES"'));
  assert.ok(planned.includes('module="PERFORMANCE"'));
  assert.ok(planned.includes('pathname === "/compensation/reviews"'));
  assert.ok(moduleDashboard.includes('moduleKey === "statutories"'));
  assert.ok(performance.includes('module="PERFORMANCE"'));
  for (const label of ["Employee Documents", "HR Documents", "Company Policies", "Templates", "Document Categories", "Expiry Tracking", "Document Requests"]) {
    assert.ok(documents.includes(label), `Missing Documents child: ${label}`);
  }
  for (const area of ["PAYE_TAX", "PENSION_COMPLIANCE", "NHIA", "NSITF", "ITF", "REMITTANCES", "REPORTS", "GOALS_KPIS", "CYCLES", "REVIEWS", "APPRAISALS", "IMPROVEMENT_PLANS"]) {
    assert.ok(operational.includes(area), `Missing operational area: ${area}`);
  }
});

test("Leave Allowance UI and settings disclose Full-Time-only eligibility", () => {
  const register = read("src/pages/benefits/ZermattLeaveAllowance.jsx");
  const settings = read("src/pages/benefits/ZermattLeaveAllowanceSettings.jsx");
  const service = read("backend/src/services/zermattLeaveAllowanceRegisterService.js");
  assert.ok(register.includes("Full-Time only"));
  assert.ok(register.includes("Not Eligible"));
  assert.ok(settings.includes('value="Full-Time only"'));
  assert.ok(service.includes("NOT_ELIGIBLE_EMPLOYMENT_TYPE"));
});

console.log("PASS: Zermatt workforce controls and connected module acceptance gate passed.");
