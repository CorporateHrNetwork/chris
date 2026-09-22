const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT part-time employees have no employee statutory deductions", () => {
  const migration = read(
    "backend/prisma/migrations/20260905000500_zermatt_part_time_statutory_exemption/migration.sql"
  );
  const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");

  requireText(
    migration,
    [
      "ZERMATT Nigeria Payroll Policy — Part-time Statutory Exemption",
      "'ZLL-NG-PAYROLL'",
      '"Full-Time":26',
      '"Part-time":16',
      '"statutoryDeductionExemptEmploymentTypes":["Part-time"]',
      '"pensionParticipationExemptEmploymentTypes":["Part-time"]',
      "'employeePension'",
      "'nhfEmployee'",
      "'payeTax'",
      "'employerPension'",
      "ZERMATT_PART_TIME_EMPLOYMENT_POLICY",
      "employeeDeductionsApplied",
      "employerOnlyNsitfItfRemainSeparate",
      "trg_payroll_line_statutory_employment_exemption",
      "trg_payroll_run_refresh_persisted_totals",
      'SUM("deductions" + "advanceRecovery")',
    ],
    "Part-time payroll policy migration"
  );

  assert.ok(
    migration.includes("NEW.\"deductions\" := GREATEST(0"),
    "Part-time exemption must remove only employee statutory deductions from persisted deductions."
  );
  assert.ok(
    migration.includes("'employeePension', CASE WHEN v_exempt THEN 0"),
    "Employee pension must be zero for an exempt Part-time employee."
  );
  assert.ok(
    migration.includes("'nhfEmployee', CASE WHEN v_exempt THEN 0"),
    "NHF employee deduction must be zero for an exempt Part-time employee."
  );
  assert.ok(
    migration.includes("'payeTax', CASE WHEN v_exempt THEN 0"),
    "PAYE must be zero for an exempt Part-time employee."
  );
  assert.ok(
    migration.includes("'employerPension', CASE WHEN v_pension_exempt THEN 0"),
    "Employer pension participation must also be zero for ZERMATT Part-time employees."
  );

  const payrollStart = sidebar.search(/id:\s*"payroll"/);
  const payrollEnd = sidebar.indexOf("COMPENSATION & REWARDS", payrollStart);
  assert.ok(payrollStart >= 0 && payrollEnd > payrollStart, "Payroll sidebar block must exist.");
  const payrollBlock = sidebar.slice(payrollStart, payrollEnd);

  requireText(
    payrollBlock,
    [
      '"/payroll?workspace=execute"',
      '"/payroll?workspace=periods"',
      '"/payroll?workspace=rates"',
      '"/payroll?workspace=allowances"',
      '"/payroll?workspace=deductions"',
      '"/payroll?workspace=payslips"',
      '"/payroll?workspace=salary-advances"',
      '"/payroll?workspace=paid-leave"',
      '"/payroll?workspace=approvals"',
    ],
    "Activated Payroll sidebar"
  );
  assert.equal(
    payrollBlock.includes("planned:"),
    false,
    "Activated Payroll items must not render as planned."
  );

  console.log("PASS: ZERMATT Part-time payroll statutory exemption gate passed.");
});
