const test = require("node:test");
const assert = require("node:assert/strict");
const { updateLoan } = require("../src/services/payrollLiabilityEditService");

function fakeContext({ overrides = {}, postedRecoveryCount = 0 } = {}) {
  const existing = {
    id: "loan-001",
    organizationId: "org-zermatt",
    employeeId: "employee-001",
    employeeNumber: "ZLL000123",
    employeeName: "Synthetic Test Employee",
    loanNumber: "LN-TEST",
    organizationSlug: "zermatt-liquor-limited",
    status: "ACTIVE",
    principalAmount: 120000,
    outstandingAmount: postedRecoveryCount ? 90000 : 120000,
    installmentAmount: 20000,
    applicationDate: new Date("2026-09-10T00:00:00Z"),
    approvedDate: new Date("2026-09-10T00:00:00Z"),
    disbursedDate: new Date("2026-09-12T00:00:00Z"),
    recoveryStartDate: new Date("2026-10-01T00:00:00Z"),
    purpose: "Employee Loan",
    notes: "Original loan",
    ...overrides,
  };
  const auditRows = [];
  const updatedParameters = [];
  const tx = {
    $queryRawUnsafe: async (sql, ...params) => {
      if (sql.includes('SELECT l.*')) return [existing];
      if (sql.includes('postedRecoveryCount')) return [{ postedRecoveryCount, postedRecoveryAmount: postedRecoveryCount ? 30000 : 0 }];
      if (sql.includes('UPDATE "payroll_loans"')) {
        updatedParameters.push(params);
        return [{
          ...existing,
          principalAmount: params[3],
          outstandingAmount: params[4],
          installmentAmount: params[5],
          applicationDate: params[6],
          recoveryStartDate: params[7],
          purpose: params[8],
          notes: params[9],
          status: params[10],
          approvedDate: params[11] ? null : params[12],
          disbursedDate: params[13],
        }];
      }
      throw new Error("Unexpected SQL in synthetic loan edit test");
    },
    organizationAudit: { create: async ({ data }) => { auditRows.push(data); } },
  };
  return {
    existing,
    auditRows,
    updatedParameters,
    prismaClient: { $transaction: (fn) => fn(tx) },
  };
}
function execute(ctx, input) {
  return updateLoan({
    organizationId: "org-zermatt",
    actorUserId: "synthetic-hr-admin",
    loanId: "loan-001",
    input,
    prismaClient: ctx.prismaClient,
  });
}

test("authorized Zermatt loan edits can correct approval and payment dates with audit reason", async () => {
  const ctx = fakeContext();
  const result = await execute(ctx, {
    employeeNumber: "ZLL000123",
    principalAmount: 120000,
    installmentAmount: 20000,
    gmApprovalDate: "2026-09-08",
    disbursedDate: "2026-09-11",
    recoveryStartDate: "2026-10-01",
    purpose: "Employee Loan",
    notes: "Corrected against paperwork",
    correctionReason: "Original approval and payment dates transcribed incorrectly",
  });
  assert.equal(result.approvedDate, "2026-09-08");
  assert.equal(result.disbursedDate, "2026-09-11");
  assert.equal(result.applicationDate, "2026-09-08");
  assert.equal(ctx.auditRows.length, 1);
  assert.equal(ctx.auditRows[0].action, "LOAN_UPDATED");
  assert.equal(ctx.auditRows[0].reason, "Original approval and payment dates transcribed incorrectly");
  assert.equal(ctx.auditRows[0].previousValue.approvedDate, "2026-09-10");
  assert.equal(ctx.auditRows[0].newValue.approvedDate, "2026-09-08");
});

test("date correction cannot proceed without recorded justification", async () => {
  const ctx = fakeContext();
  await assert.rejects(execute(ctx, { gmApprovalDate: "2026-09-08", correctionReason: "typo" }),
    (err) => err.code === "LOAN_DATE_CORRECTION_REASON_REQUIRED");
  assert.equal(ctx.updatedParameters.length, 0);
});

test("GM approval must precede external Accounts payment", async () => {
  const ctx = fakeContext();
  await assert.rejects(execute(ctx, { gmApprovalDate: "2026-09-20", correctionReason: "Corrected GM approval date from signed document" }),
    (err) => err.code === "INVALID_EXTERNAL_APPROVAL_SEQUENCE");
});

test("recovery month cannot precede corrected external payment month", async () => {
  const ctx = fakeContext();
  await assert.rejects(execute(ctx, {
    disbursedDate: "2026-11-01",
    correctionReason: "Accounts payment voucher carried later date",
  }), (err) => err.code === "INVALID_RECOVERY_START");
});

test("date correction is not available to non-Zermatt tenants", async () => {
  const ctx = fakeContext({ overrides: { organizationSlug: "other-organization" } });
  await assert.rejects(execute(ctx, {
    gmApprovalDate: "2026-09-08",
    correctionReason: "Verification of external approval receipt",
  }), (err) => err.code === "LOAN_DATE_CORRECTION_ZERMATT_ONLY");
});

test("posted payroll principal remains locked even when an approval date is corrected", async () => {
  const ctx = fakeContext({ postedRecoveryCount: 1 });
  await assert.rejects(execute(ctx, {
    principalAmount: 130000,
    gmApprovalDate: "2026-09-08",
    correctionReason: "Corrected signed GM approval date",
  }), (err) => err.code === "LOAN_FINANCIAL_HISTORY_LOCKED");
  assert.equal(ctx.updatedParameters.length, 0);
});

test("a posted payroll recovery does not prevent an audit-only date correction", async () => {
  const ctx = fakeContext({ postedRecoveryCount: 1 });
  const result = await execute(ctx, {
    gmApprovalDate: "2026-09-08",
    disbursedDate: "2026-09-11",
    correctionReason: "Confirmed against original external payment voucher",
  });
  assert.equal(result.outstandingAmount, 90000);
  assert.equal(result.postedRecoveryCount, 1);
  assert.equal(ctx.updatedParameters[0][4], 90000);
});

test("completed loans reject financial/date corrections and preserve history", async () => {
  const ctx = fakeContext({ overrides: { status: "COMPLETED" } });
  await assert.rejects(execute(ctx, { gmApprovalDate: "2026-09-08" }),
    (err) => err.code === "LOAN_CLOSED_RECORD_LOCKED");
  assert.equal(ctx.updatedParameters.length, 0);
});
