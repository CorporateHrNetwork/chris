const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/chris_test";

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("payroll approval classifies missing statutory details without blocking approval", async () => {
  const { validateNigeriaPayrollApproval } = require("../src/services/payrollApprovalComplianceService");
  const fake = {
    $queryRawUnsafe: async () => [
      {
        employeeId: "emp-1",
        employeeNumber: "ZLL000001",
        details: {
          statutory: {
            payeTax: 12500,
            employeePension: 18000,
          },
        },
      },
    ],
    employeeOnboarding: {
      findMany: async () => [{
        employeeId: "emp-1",
        updatedAt: new Date("2026-09-20"),
        createdAt: new Date("2026-09-01"),
        sectionData: {
          "statutory-details": {
            taxIdentificationNumber: "",
            payeState: "FCT",
            pensionPfa: "Example PFA",
            pensionPin: "",
          },
        },
      }],
    },
  };

  const result = await validateNigeriaPayrollApproval({
    organizationId: "org-1",
    runId: "run-1",
    prismaClient: fake,
  });

  assert.equal(result.valid, true);
  assert.equal(result.approvalBlocked, false);
  assert.equal(result.policy, "PAYROLL_APPROVABLE_WITH_STATUTORY_REMITTANCE_WITHHOLDING");
  assert.equal(result.missingTaxCount, 1);
  assert.equal(result.missingPensionCount, 1);
  assert.equal(result.withheldCount, 1);
  assert.deepEqual(result.withheldEmployeeIdsByType.PAYE, ["emp-1"]);
  assert.deepEqual(result.withheldEmployeeIdsByType.PENSION, ["emp-1"]);
});

test("withheld statutory obligations, approved payslip email and live preview controls are wired", () => {
  const approval = read("backend/src/services/payrollApprovalComplianceService.js");
  const obligations = read("backend/src/services/statutoryObligationService.js");
  const remittance = read("backend/src/services/statutoryRemittanceService.js");
  const complianceRoutes = read("backend/src/routes/complianceRoutes.js");
  const payrollRoutes = read("backend/src/routes/payrollIntegrationRoutes.js");
  const emailService = read("backend/src/services/payrollPayslipEmailService.js");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const remittanceUi = read("src/pages/statutories/RemittanceWorkspace.jsx");

  for (const expected of [
    "approvalBlocked: false",
    "PAYROLL_APPROVABLE_WITH_STATUTORY_REMITTANCE_WITHHOLDING",
    "withheldEmployeeIdsByType",
  ]) assert.ok(approval.includes(expected), `non-blocking statutory approval control missing: ${expected}`);

  for (const expected of [
    "WITHHELD_MISSING_STATUTORY_DETAILS",
    "OBLIGATIONS_CONFIRMED_WITH_WITHHELD_POOL",
    "PAYROLL_APPROVED_NO_STATUTORY_LIABILITY",
    "Missing employee statutory identifiers never block payroll approval",
  ]) assert.ok(obligations.includes(expected), `statutory hold lifecycle missing: ${expected}`);

  for (const expected of [
    "listWithheldObligations",
    "releaseReadyWithheldObligations",
    "OBLIGATION_WITHHELD_MISSING_STATUTORY_DETAILS",
  ]) assert.ok(remittance.includes(expected), `withheld remittance service missing: ${expected}`);

  for (const expected of [
    'router.get("/withheld-obligations"',
    'router.get("/withheld-obligations.xlsx"',
    'router.post("/withheld-obligations/release-ready"',
    "CHRiS_Withheld_Statutory_Remittances.xlsx",
  ]) assert.ok(complianceRoutes.includes(expected), `withheld remittance API/export missing: ${expected}`);

  for (const expected of [
    'router.post("/payslips/:id/email"',
    'router.post("/payslips/email-batch"',
    '"employeeEmail"',
  ]) assert.ok(payrollRoutes.includes(expected), `payslip email API missing: ${expected}`);

  for (const expected of [
    "PAYSLIP_EMAIL_REQUIRES_APPROVED_PAYROLL",
    "EMPLOYEE_EMAIL_REQUIRED",
    "RESEND_API_KEY",
    "PENDING_CONFIGURATION",
    "PayrollPayslipEmail",
  ]) assert.ok(emailService.includes(expected), `approved payslip email safeguard missing: ${expected}`);

  for (const expected of [
    "View Preview",
    "Preview only — this payroll has not yet been approved by Head HR.",
    "Email Selected Payslips",
    "Email Payslip",
    "Draft payslips are preview-only",
  ]) assert.ok(payrollUi.includes(expected), `payslip UI control missing: ${expected}`);

  for (const expected of [
    "Withheld Statutory Remittance Pool",
    "Export Withheld Pool (Excel)",
    "Release Completed Details",
    "/api/compliance/withheld-obligations",
  ]) assert.ok(remittanceUi.includes(expected), `withheld pool UI missing: ${expected}`);
});

test("approved payslip email body is generated from the approved payroll calculation", () => {
  const { buildPayslipEmail } = require("../src/services/payrollPayslipEmailService");
  const result = buildPayslipEmail({
    id: "line-1",
    runId: "run-1",
    employeeId: "emp-1",
    employeeNumber: "ZLL000001",
    employeeName: "Synthetic Employee",
    employeeEmail: "employee@example.test",
    currency: "NGN",
    baseSalary: 200000,
    grossPay: 250000,
    netPreview: 190000,
    advanceRecovery: 10000,
    loanRecovery: 5000,
    periodCode: "2026-09",
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

  assert.match(result.subject, /Zermatt Liquor Limited Payslip/);
  assert.match(result.html, /EMPLOYEE PAYSLIP/);
  assert.match(result.html, /Net Pay/);
  assert.match(result.html, /Salary Advance Recovery/);
  assert.match(result.html, /Loan Recovery/);
  assert.match(result.plainText, /Generated from an approved CHRiS payroll run/);
});
