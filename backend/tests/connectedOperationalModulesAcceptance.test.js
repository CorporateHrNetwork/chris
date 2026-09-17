const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

describe("connected operational modules", () => {
  test("sidebar no longer marks requested module children as planned", () => {
    const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");
    const requiredPaths = [
      "/assets/register", "/assets/categories", "/assets/assignment", "/assets/transfers", "/assets/returns", "/assets/maintenance", "/assets/reports",
      "/reports/recruitment", "/reports/compensation", "/reports/benefits", "/reports/custom",
      "/workflows/approval-inbox", "/workflows/my-requests", "/workflows/templates", "/workflows/approval-chains", "/workflows/delegations", "/workflows/history",
      "/employment-types", "/employment-types/permanent", "/employment-types/contract", "/employment-types/temporary", "/employment-types/probation", "/employment-types/intern-trainee", "/employment-types/expatriate", "/employment-types/custom",
      "/training/programs", "/training/calendar", "/training/employee-training", "/training/learning-records", "/training/assessments", "/training/certifications", "/training/reports",
      "/billing", "/billing/current-plan", "/billing/subscription", "/billing/usage", "/billing/details", "/billing/history", "/billing/invoices",
      "/compensation", "/compensation/salary-structure", "/compensation/grades-levels", "/compensation/salary-bands", "/compensation/reviews", "/compensation/adjustments", "/compensation/promotions", "/compensation/bonuses-incentives", "/compensation/total-rewards",
    ];
    for (const route of requiredPaths) expect(sidebar).toContain(`path:\"${route}\"`);
  });

  test("legacy child routes are intercepted by live workspaces", () => {
    const workspace = read("src/pages/shared/PlannedWorkspace.jsx");
    expect(workspace).toContain('module="ASSETS"');
    expect(workspace).toContain('module="WORKFLOWS"');
    expect(workspace).toContain('module="TRAINING"');
    expect(workspace).toContain('module="REPORTS"');
    expect(workspace).toContain('module="COMPENSATION"');
    expect(workspace).toContain('module="BILLING"');
    expect(workspace).toContain("SalaryReviewManagement");
    expect(workspace).toContain("EmploymentTypeManagement");
  });

  test("operational backend supports connected modules", () => {
    const routes = read("backend/src/routes/operationalControlRoutes.js");
    for (const moduleName of ["ASSETS", "WORKFLOWS", "TRAINING", "REPORTS", "COMPENSATION", "BILLING"]) {
      expect(routes).toContain(`${moduleName}: new Set`);
    }
  });

  test("compensation reviews preserve the dedicated salary review control", () => {
    const workspace = read("src/pages/shared/PlannedWorkspace.jsx");
    expect(workspace).toContain('pathname==="/compensation/reviews"');
    expect(workspace).toContain("<SalaryReviewManagement/>");
  });
});
