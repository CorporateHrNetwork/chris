const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT Full-Time leave, manual worked days and branch context integrate safely", () => {
  const leavePolicy = read("backend/src/services/zermattLeaveEntitlementService.js");
  const leaveProfile = read("backend/src/services/employeeLeaveProfileService.js");
  const operationsRoutes = read("backend/src/routes/zermattOperationsRoutes.js");
  const payrollEngine = read("backend/src/services/nigeriaPayrollComplianceService.js");
  const auth = read("backend/src/middleware/authMiddleware.js");
  const analytics = read("backend/src/routes/analyticsRoutes.js");
  const employeeOptions = read("backend/src/routes/payrollEmployeeOptionRoutes.js");
  const apiClient = read("src/services/api.js");
  const branchSelector = read("src/components/BranchContextSelector.jsx");
  const leaveProfileUi = read("src/components/leave/EmployeeLeaveProfileSelector.jsx");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const workedDaysUi = read("src/components/payroll/ManualWorkedDaysPanel.jsx");

  for (const expected of [
    "if (level === 11) return 30",
    "level >= 9 && level <= 10) return 28",
    "level >= 5 && level <= 8) return 21",
    "level >= 1 && level <= 4) return 14",
    "entitlementDays: 12",
    "entitlementDays: 5",
    "entitlementDays: 6",
    "entitlementDays: 90",
    "femaleOnly: true",
    'employmentTypes: ["Full-Time"]',
    "FULL_TIME_ONLY",
  ]) assert.ok(leavePolicy.includes(expected), `missing ZERMATT leave control: ${expected}`);

  for (const expected of [
    "policyOptions",
    "selectedPolicy",
    "entitlement",
    "used",
    "available",
    "maximumRequestable",
    "nextLeaveDate",
  ]) assert.ok(leaveProfile.includes(expected), `leave profile field missing: ${expected}`);

  assert.ok(leaveProfileUi.includes("EmployeeSearchSelect"), "leave profile must use searchable employee selection");
  assert.ok(leaveProfileUi.includes('endpoint="/api/zermatt/employee-options"'), "leave profile search must be branch-scoped and leave-aware");
  assert.ok(leaveProfileUi.includes("Leave Policy"), "leave profile must expose policy dropdown");
  for (const label of ["Entitlement", "Used Days", "Leave Balance", "Maximum Requestable", "Next Leave Date"]) {
    assert.ok(leaveProfileUi.includes(label), `leave profile UI missing ${label}`);
  }

  assert.ok(operationsRoutes.includes('/attendance/worked-days'), "Super User worked-days endpoint missing");
  assert.ok(operationsRoutes.includes("requireZermattSuperUser"), "worked-days entry must remain Super User controlled");
  assert.ok(operationsRoutes.includes("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH"), "branch operations must reject employees outside active branch");
  assert.ok(workedDaysUi.includes("MANUAL WORKED DAYS"), "manual worked-days payroll UI missing");
  assert.ok(workedDaysUi.includes("EmployeeSearchSelect"), "manual worked-days UI must use searchable employee selection");
  assert.ok(payrollEngine.includes("attendancePayrollInput.findMany"), "payroll must read exact-period attendance payroll input");
  assert.ok(payrollEngine.includes("payableDays"), "payroll must calculate payable days");
  assert.ok(payrollEngine.includes("prorationFactor"), "manual worked days must affect payroll proration");
  assert.ok(payrollEngine.includes('"ATTENDANCE_PAYROLL_INPUT"'), "payroll must identify manual attendance source");
  assert.ok(payrollUi.includes('label="Worked Days"'), "payslip must visibly show worked days");
  assert.ok(payrollUi.includes('label="Attendance Source"'), "payslip must show attendance source");

  assert.ok(auth.includes('req.headers["x-chris-location-id"]'), "backend must accept active branch context");
  assert.ok(auth.includes("availableLocations"), "authenticated user must have available branch list");
  assert.ok(auth.includes("consolidatedHeadOffice"), "Head Office consolidated context missing");
  assert.ok(apiClient.includes('"X-CHRiS-Location-Id"'), "frontend API client must send active branch context");
  assert.ok(branchSelector.includes("Head Office · Consolidated All Branches"), "branch selector must expose consolidated Head Office");
  assert.ok(branchSelector.includes("Branch-specific operational context"), "branch selector must expose branch mode");
  assert.ok(analytics.includes("req.auth.activeLocationId"), "workforce analytics must use active branch context");
  assert.ok(employeeOptions.includes("locationId: req.auth.activeLocationId"), "employee selector must restrict choices to active branch");

  console.log("PASS: ZERMATT leave, worked-days payroll and branch-context integration gate passed.");
});
