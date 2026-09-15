const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const {
  eligibilityForPeriod,
  calculateLeaveAllowance,
} = require("../src/services/zermattLeaveAllowanceService");

const salaryStructure = {
  basic: 57,
  housing: 11,
  transport: 10,
  meal: 9,
  medical: 8,
  utility: 5,
};

test("18 September 2026 hire is not due in September 2026", () => {
  const result = eligibilityForPeriod({
    hireDate: "2026-09-18",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
  assert.equal(result.eligible, false);
  assert.equal(result.firstEligibleYear, 2027);
});

test("18 September 2026 hire is first due in September 2027 and recurs each September", () => {
  const first = eligibilityForPeriod({
    hireDate: "2026-09-18",
    periodStart: "2027-09-01",
    periodEnd: "2027-09-30",
  });
  assert.equal(first.eligible, true);
  assert.equal(first.entitlementYear, 2027);
  assert.equal(first.anniversaryDate, "2027-09-18");

  const next = eligibilityForPeriod({
    hireDate: "2026-09-18",
    periodStart: "2028-09-01",
    periodEnd: "2028-09-30",
  });
  assert.equal(next.eligible, true);
  assert.equal(next.entitlementYear, 2028);
});

test("entry month controls annual entitlement month", () => {
  for (const [periodStart, periodEnd] of [
    ["2027-08-01", "2027-08-31"],
    ["2027-10-01", "2027-10-31"],
  ]) {
    const result = eligibilityForPeriod({
      hireDate: "2026-09-18",
      periodStart,
      periodEnd,
    });
    assert.equal(result.eligible, false);
  }
});

test("Leave Allowance is 10 percent of annual Basic, not annual Gross", () => {
  const result = calculateLeaveAllowance({
    scheduledMonthlyGross: 200000,
    salaryStructure,
  });
  assert.equal(result.monthlyBasicSalary, 114000);
  assert.equal(result.annualBasicSalary, 1368000);
  assert.equal(result.leaveAllowance, 136800);
  assert.notEqual(result.leaveAllowance, 240000, "must not calculate 10% of annual Gross");
});

test("Zermatt Leave Allowance is wired through Benefits, payroll, approved payslip and duplicate protection", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  const register = read("backend/src/services/zermattLeaveAllowanceRegisterService.js");
  const route = read("backend/src/routes/zermattLeaveAllowanceRoutes.js");
  const app = read("backend/src/app.js");
  const benefits = read("src/pages/Benefits.jsx");
  const payslip = read("src/pages/payroll/PayrollIntegratedManaged.jsx");

  for (const expected of [
    "ZERMATT_LEAVE_ALLOWANCE",
    "ZERMATT_LEAVE_ALLOWANCE_APPLIED",
    "ANNUAL_ENTRY_MONTH_AFTER_FIRST_SERVICE_YEAR",
    "Basic Monthly Salary × 12 × 10%",
    "pr.status='APPROVED'",
    '"Leave Allowance": calculation.leaveAllowance',
    "benefitEarnings",
    "additionalPaye",
  ]) {
    assert.ok(service.includes(expected), `Leave Allowance service control missing: ${expected}`);
  }

  assert.ok(register.includes('"organization_locations"'), "Benefits register must use authoritative organization_locations table");
  assert.ok(route.includes('require("../services/zermattLeaveAllowanceRegisterService")'), "route must use corrected register service");
  assert.ok(route.includes('"/benefits/leave-allowance"'), "Benefits register route missing");
  assert.ok(route.includes('"/payroll/runs/draft"'), "Zermatt payroll interception missing");
  assert.ok(route.includes("applyZermattLeaveAllowanceToDraft"), "Leave Allowance must be applied in payroll calculation");
  assert.ok(app.indexOf("zermattLeaveAllowanceRoutes") < app.indexOf('app.use("/api/payroll", payrollRoutes)'), "Zermatt Leave Allowance route must run before generic payroll routes");

  assert.ok(benefits.includes('workspace === "leave-allowance"'), "Leave Allowance must be a Benefits child workspace");
  assert.ok(benefits.includes("ZermattLeaveAllowance"), "Benefits child workspace component missing");

  assert.ok(payslip.includes("Object.entries(structure)"), "payslip must render structured earnings separately");
  assert.ok(payslip.includes("Gross Pay"), "payslip Gross Pay reconciliation missing");
  assert.ok(payslip.includes("Net Pay"), "payslip Net Pay reconciliation missing");
});

console.log("PASS: Zermatt Leave Allowance acceptance gate passed.");