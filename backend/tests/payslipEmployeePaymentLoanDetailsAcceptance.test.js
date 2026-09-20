const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/chris_test";

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("payslip payloads expose designation, bank details and authoritative running loan balance", () => {
  const routes = read("backend/src/routes/payrollIntegrationRoutes.js");
  for (const expected of [
    'd."name" AS "designation"',
    'pay."bankName"',
    'pay."accountName"',
    'pay."accountNumber"',
    '"loanOutstandingBalance"',
    'FROM "employee_onboardings" eo',
    'FROM "payroll_loans" l',
    'l."status" IN (\'ACTIVE\',\'PAUSED\')',
    "runningLoanBalance",
  ]) assert.ok(routes.includes(expected), `Missing payslip payload control: ${expected}`);
});

test("screen and print payslips show the requested employee/payment fields and do not repeat the name in the print reference", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  for (const expected of [
    'label="Employee Name"',
    'label="Employee Number"',
    'label="Designation"',
    'label="Bank"',
    'label="Account Name"',
    'label="Account Number"',
    'label="Running Loan Balance"',
    '["Employee Name", row.employeeName || "—"]',
    '["Employee Number", row.employeeNumber || "—"]',
    '["Designation", row.designation || "—"]',
    '["Bank", row.bankName || "—"]',
    '["Account Name", row.accountName || "—"]',
    '["Account Number", row.accountNumber || "—"]',
    '["Running Loan Balance", money(row.runningLoanBalance, row.currency)]',
  ]) assert.ok(ui.includes(expected), `Missing payslip presentation field: ${expected}`);
  assert.ok(ui.includes('<p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)}</p>'));
  assert.ok(!ui.includes('<p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)} · ${escapeHtml(row.employeeName)}</p>'));
  assert.ok(ui.includes('<Panel title={`Payslip · ${row.periodCode} · ${row.employeeNumber}`}>'));
});

test("emailed approved payslips carry the same designation, account and loan-balance details", () => {
  const service = read("backend/src/services/payrollPayslipEmailService.js");
  for (const expected of [
    'd."name" AS "designation"',
    'pay."bankName"',
    'pay."accountName"',
    'pay."accountNumber"',
    '"loanOutstandingBalance"',
    "Running Loan Balance",
    "Designation:",
    "Account Name:",
    "Account Number:",
  ]) assert.ok(service.includes(expected), `Missing emailed payslip detail: ${expected}`);

  const { buildPayslipEmail } = require("../src/services/payrollPayslipEmailService");
  const output = buildPayslipEmail({
    employeeNumber: "ZLL000001",
    employeeName: "Jane Mary Doe",
    employeeEmail: "jane@example.test",
    designation: "HR Officer",
    bankName: "Zenith Bank",
    accountName: "Jane Mary Doe",
    accountNumber: "0123456789",
    runningLoanBalance: 125000,
    currency: "NGN",
    baseSalary: 200000,
    grossPay: 250000,
    netPreview: 190000,
    advanceRecovery: 10000,
    loanRecovery: 5000,
    periodCode: "SEP-2026",
    periodName: "September 2026",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    payDate: "2026-09-30",
    organizationName: "Zermatt Liquor Limited",
    organizationLegalName: "Zermatt Liquor Limited",
    organizationLogoUrl: "",
    details: {
      salaryStructure: { basic: 200000, housing: 50000 },
      customAllowances: [],
      customDeductions: [],
      statutory: { payeTax: 25000, employeePension: 20000 },
      attendance: { payableDays: 26, standardDays: 26 },
    },
  });
  assert.match(output.html, /HR Officer/);
  assert.match(output.html, /Zenith Bank/);
  assert.match(output.html, /0123456789/);
  assert.match(output.html, /Running Loan Balance/);
  assert.match(output.plainText, /Designation: HR Officer/);
  assert.match(output.plainText, /Account Number: 0123456789/);
});
