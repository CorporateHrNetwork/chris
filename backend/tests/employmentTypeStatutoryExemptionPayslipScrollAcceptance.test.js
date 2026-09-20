const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/chris_test";

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("CHRiS employment-type exemption normalizes Part-Time, Expatriate and Internship variants", () => {
  const { statutoryEmploymentTypeExemption } = require("../src/services/nigeriaPayrollComplianceService");

  for (const employmentType of [
    "Part-Time",
    "Part Time",
    "PARTTIME",
    "Expatriate",
    "Expatriates",
    "Expatriate Staff",
    "NYSC / Internship",
    "Internship / NYSC",
    "Internship",
    "Internship Trainee",
    "Intern",
    "Intern / Trainee",
    "Part-Time Employee",
    "Part Time Staff",
  ]) {
    const result = statutoryEmploymentTypeExemption(employmentType);
    assert.equal(result.exempt, true, employmentType);
    assert.equal(result.payeExempt, true, employmentType);
    assert.equal(result.pensionExempt, true, employmentType);
    assert.equal(result.source, "CHRIS_EMPLOYMENT_TYPE_EXEMPTION_RULE");
    assert.ok(result.matchedCategory);
  }

  for (const employmentType of ["Full-Time", "Permanent", "Contract", "Temporary"]) {
    const result = statutoryEmploymentTypeExemption(employmentType);
    assert.equal(result.exempt, false, employmentType);
    assert.equal(result.payeExempt, false, employmentType);
    assert.equal(result.pensionExempt, false, employmentType);
  }
});

test("Nigeria payroll applies zero PAYE and zero pension contribution for exempt employment types", () => {
  const payroll = read("backend/src/services/nigeriaPayrollComplianceService.js");

  for (const expected of [
    "employmentTypeExemption = statutoryEmploymentTypeExemption(employee.employmentType)",
    "const employeePension = employmentTypeExemption.pensionExempt",
    "const employerPension = employmentTypeExemption.pensionExempt",
    "const recurringAnnualTax = employmentTypeExemption.payeExempt || minimumWageExempt",
    "const totalAnnualTax = employmentTypeExemption.payeExempt || minimumWageExempt",
    "const payeTax = employmentTypeExemption.payeExempt",
    "employmentTypeExemption,",
    "CHRIS_EMPLOYMENT_TYPE_EXEMPTION_RULE",
  ]) {
    assert.ok(payroll.includes(expected), `Missing exemption control: ${expected}`);
  }
});

test("payslip preview scrolls into the current viewport when opened", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");

  for (const expected of [
    "useRef",
    "payslipPreviewRef.current?.scrollIntoView({ behavior: \"smooth\", block: \"start\" })",
    "approvedPayslipRef.current?.scrollIntoView({ behavior: \"smooth\", block: \"start\" })",
    "ref={payslipPreviewRef}",
    "ref={approvedPayslipRef}",
    "scrollMarginTop: 84",
  ]) {
    assert.ok(ui.includes(expected), `Missing payslip scroll/focus control: ${expected}`);
  }
});
