const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/chris_test";

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("payslip payload exposes designation and loan balance without bank account data", () => {
  const routes = read("backend/src/routes/payrollIntegrationRoutes.js");
  for (const expected of [
    'd."name" AS "designation"',
    '"loanOutstandingBalance"',
    'FROM "payroll_loans" l',
    'l."status" IN (\'ACTIVE\',\'PAUSED\')',
    "runningLoanBalance",
  ]) assert.ok(routes.includes(expected), `Missing payslip payload control: ${expected}`);
  for (const forbidden of ['pay."bankName"', 'pay."accountName"', 'pay."accountNumber"', 'FROM "employee_onboardings" eo']) {
    assert.equal(routes.includes(forbidden), false, `Payslip payload must not expose bank-account data: ${forbidden}`);
  }
});

test("screen and print payslips retain CHRiS identity fields and move running loan balance to the bottom", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  for (const expected of [
    'label="Employee Name"',
    'label="Employee Number"',
    'label="Designation"',
    'label="Running Loan Balance"',
    '["Employee Name", row.employeeName || "—"]',
    '["Employee Number", row.employeeNumber || "—"]',
    '["Designation", row.designation || "—"]',
    '["Running Loan Balance", money(row.runningLoanBalance, row.currency)]',
    ">Loan Summary<",
  ]) assert.ok(ui.includes(expected), `Missing payslip presentation field: ${expected}`);
  for (const forbidden of ['label="Bank"', 'label="Account Name"', 'label="Account Number"', '["Bank",', '["Account Name",', '["Account Number",']) {
    assert.equal(ui.includes(forbidden), false, `Bank account details must not be rendered on payslips: ${forbidden}`);
  }
  assert.ok(ui.includes('<p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)}</p>'));
  assert.ok(!ui.includes('<p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)} · ${escapeHtml(row.employeeName)}</p>'));
});

test("preview uses CHRiS global dark-green and gold visual language while print remains compact A4", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  for (const expected of [
    'background: "linear-gradient(145deg,#082F20,#031A11)"',
    'border: "1px solid rgba(212,175,55,.42)"',
    'color: "#F7FAF8"',
    'color: "#F7D66A"',
    '@page{size:A4 portrait;margin:0}',
    '.payslip{position:relative;width:210mm;height:297mm;padding:10mm 14mm 9mm;overflow:hidden}',
    'th,td{padding:5px 8px',
    '.footer{display:flex;justify-content:space-between;gap:12px;margin-top:8px;padding-top:6px',
  ]) assert.ok(ui.includes(expected), `Missing preview/one-page print control: ${expected}`);
});

test("emailed payslip includes designation and running loan balance but excludes bank account details", () => {
  const service = read("backend/src/services/payrollPayslipEmailService.js");
  assert.ok(service.includes('d."name" AS "designation"'));
  assert.ok(service.includes('"loanOutstandingBalance"'));
  for (const forbidden of ['pay."bankName"', 'pay."accountName"', 'pay."accountNumber"', 'Bank: ${row.bankName', 'Account Name: ${row.accountName', 'Account Number: ${row.accountNumber']) {
    assert.equal(service.includes(forbidden), false, `Email payslip must not expose bank-account data: ${forbidden}`);
  }

  const { buildPayslipEmail } = require("../src/services/payrollPayslipEmailService");
  const output = buildPayslipEmail({
    employeeNumber: "ZLL000001",
    employeeName: "Jane Mary Doe",
    employeeEmail: "jane@example.test",
    designation: "HR Officer",
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
  assert.match(output.html, /Running Loan Balance/);
  assert.doesNotMatch(output.html, />Bank</);
  assert.doesNotMatch(output.html, /Account Name/);
  assert.doesNotMatch(output.html, /Account Number/);
  assert.match(output.plainText, /Designation: HR Officer/);
  assert.doesNotMatch(output.plainText, /^Bank:/m);
  assert.doesNotMatch(output.plainText, /^Account Name:/m);
  assert.doesNotMatch(output.plainText, /^Account Number:/m);
});

test("loan summary follows the earnings ledger in screen and print payslips", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const screenNet = ui.indexOf('<PayslipLedgerRow label="Net Pay"');
  const screenLoan = ui.indexOf(">Loan Summary<");
  assert.ok(screenNet >= 0 && screenLoan > screenNet);
  const printNet = ui.indexOf('["Net Pay", money(row.netPreview, row.currency), true]');
  const printLoan = ui.indexOf('<section class="payment-summary">');
  assert.ok(printNet >= 0 && printLoan > printNet);
});
