const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const service = fs.readFileSync(
  path.join(root, "backend/src/services/exitSettlementService.js"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(root, "backend/src/routes/exitRoutes.js"),
  "utf8"
);
const frontend = fs.readFileSync(
  path.join(root, "src/pages/EmployeeExits.jsx"),
  "utf8"
);

test("Employee Exit Settlement Account contains the approved credit rules", () => {
  for (const expected of [
    "Gratuity / EoSB",
    "Full / Prorated Annual Leave Allowance",
    "Full / Prorated Outstanding Salary",
    "Public Holiday Days",
    "Extra Day Work Overtime",
    "Extra Hours Work Overtime",
    "Bonus / Gift",
    "In Lieu of Notice Pay",
    "Previous Salary Short Paid",
  ]) {
    assert.ok(
      service.includes(expected) || frontend.includes(expected),
      `Missing exit settlement credit: ${expected}`
    );
  }
});

test("Employee Exit Settlement Account contains the approved debit rules only", () => {
  for (const expected of [
    "Loan Balance",
    "Salary Advance",
    "In Lieu of Notice Deduction",
    "Unreturned Uniform",
    "Previous Salary Overpaid",
  ]) {
    assert.ok(
      service.includes(expected) || frontend.includes(expected),
      `Missing exit settlement debit: ${expected}`
    );
  }

  assert.equal(
    service.includes("scheduledDeductionRecovery"),
    false,
    "Generic scheduled deduction balances must not be swept into the approved exit settlement account."
  );
});

test("system settlement items use authoritative CHRiS source accounts and existing Zermatt formulas", () => {
  for (const expected of [
    "getEosbStatement",
    "calculateLeaveAllowance",
    '"payroll_salary_rates"',
    '"payroll_loans"',
    '"payroll_salary_advances"',
    '"ALW-PH"',
    '"ALW-EDOT"',
    '"ALW-EHOT"',
    "Gross ÷ 26 × Public Holiday Days × 2",
    "Gross ÷ 26 × Extra Days × 1.5",
    "Gross ÷ 208 × Extra Hours × 1.25",
  ]) {
    assert.ok(service.includes(expected), `Missing authoritative settlement source/formula: ${expected}`);
  }
});

test("notice days given and deficiency are calculated automatically from notice dates and HR entitlement", () => {
  assert.ok(service.includes("noticeDaysBetween"));
  assert.ok(service.includes("resolveNoticePosition"));
  assert.ok(service.includes("entitledNoticeDays"));
  assert.ok(service.includes("noticeDaysGiven"));
  assert.ok(service.includes("noticeDeficiencyDays"));
  assert.ok(service.includes("system.salary.dayRate * noticePosition.noticeDeficiencyDays"));
  assert.ok(frontend.includes("Entitled Notice Period"));
  assert.ok(frontend.includes("Notice Days Given"));
  assert.ok(frontend.includes("Notice Deficiency"));
  assert.equal(frontend.includes('setSettlementField("noticeDeductionDays"'), false);
});

test("staff details, exit type and exit reason are captured in the settlement account", () => {
  for (const expected of [
    "employeeNumber",
    "employeeName",
    "employmentType",
    "department",
    "designation",
    "costCentre",
    "branch",
    "exitType",
    "reason",
    "lastWorkingDay",
  ]) {
    assert.ok(service.includes(expected), `Missing exit account profile field: ${expected}`);
  }
  assert.ok(frontend.includes("Exit Type"));
  assert.ok(frontend.includes("Exit Reason"));
  assert.ok(frontend.includes("Settlement Salary Basis"));
});

test("settlement exposes a live preview and uses Head HR prepare-and-approve workflow", () => {
  assert.ok(routes.includes('"/:id/settlement/preview"'));
  assert.ok(frontend.includes("/settlement/preview?"));
  const approveStart = service.indexOf("async function approveSettlement");
  const paymentStart = service.indexOf("async function recordSettlementPayment", approveStart);
  const approveBlock = service.slice(approveStart, paymentStart);
  assert.ok(approveStart >= 0 && paymentStart > approveStart);
  assert.equal(
    approveBlock.includes("SETTLEMENT_MAKER_CHECKER_REQUIRED"),
    false,
    "Head HR approval must not require a second internal approver."
  );
  assert.ok(frontend.includes("Approve & Prepare for Print"));
  assert.ok(service.includes("Head HR prepare-and-approve control"));
  assert.ok(service.includes("EXIT_SETTLEMENT_ACCOUNT_CALCULATED"));
  assert.ok(service.includes('version: "EXIT_SETTLEMENT_ACCOUNT_V2"'));
});

test("printable settlement carries the external signatory workflow outside CHRiS", () => {
  for (const expected of [
    "External Signatory Workflow",
    "Auditor Review",
    "GM Payout Approval",
    "Accounts Team Payout Processing",
    "Auditor Name",
    "General Manager Name",
    "Payment Reference / Voucher No.",
    "Prepared & Approved By",
    "Head, Human Resources",
    "Print Settlement Account",
  ]) {
    assert.ok(frontend.includes(expected), `Missing printable settlement control: ${expected}`);
  }
  assert.ok(frontend.includes("completed externally on the printed settlement document"));
});


test("Employee Exits exposes a dedicated Exit Settlement Account workspace", () => {
  for (const expected of [
    "Exit Settlement Account",
    'section=settlements',
    "Employee Exit Settlement Accounts",
    "Open Settlement Account",
    "FINANCIAL CLOSURE",
    "Head HR prepares and approves in CHRiS",
  ]) {
    assert.ok(frontend.includes(expected), `Missing settlement workspace navigation: ${expected}`);
  }
});
