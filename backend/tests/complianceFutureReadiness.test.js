const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { hashPayload } = require("../src/services/complianceRulesEngine");
const { rowsFromLine } = require("../src/services/statutoryObligationService");
const { assessTerminationReadiness, PERFORMANCE_STEPS } = require("../src/services/terminationGovernanceService");
const { calculate } = require("../src/services/exitSettlementService");
const { createBatch, approveBatch } = require("../src/services/statutoryRemittanceService");

test("compliance payload hashing is canonical", () => {
  assert.equal(hashPayload({ b: 2, a: { d: 4, c: 3 } }), hashPayload({ a: { c: 3, d: 4 }, b: 2 }));
});

test("payroll statutory values become balanced idempotency-keyed obligation rows", () => {
  const rows = rowsFromLine({
    runLineId: "line-1", currency: "NGN", grossPay: 500000,
    employee: { id: "emp-1", employeeNumber: "ZLL1" },
    details: { policy: { id: "policy-1" }, statutory: {
      annualChargeableIncomeIncludingOneTime: 4000000, payeTax: 20000,
      pensionableBase: 300000, employeePension: 24000, employerPension: 30000,
      nhfEmployee: 0, nsitfEmployer: 5000, itfEmployerAccrual: 5000,
    } },
  }, { organizationId: "org-1", payrollRunId: "run-1", periodEnd: "2026-09-30" });
  assert.deepEqual(rows.map((row) => row.obligationType), ["PAYE", "PENSION", "NSITF_ECS", "ITF"]);
  for (const row of rows) {
    assert.equal(row.totalLiability, row.employeeAmount + row.employerAmount);
    assert.equal(row.payrollRunLineId, "line-1");
    assert.equal(row.status, "DRAFT_CALCULATED");
  }
});

test("performance termination requires every structured due-process step", async () => {
  const completeEvents = PERFORMANCE_STEPS.map((types, index) => ({ eventType: types[0], occurredAt: new Date(`2026-0${index + 1}-01`) }));
  const prisma = {
    employee: { findFirst: async () => ({ id: "emp-1", employeeNumber: "ZLL1", status: "ACTIVE", hireDate: new Date("2024-01-01") }) },
    user: { findFirst: async () => ({ id: "authority-1" }) },
    disciplinaryCase: { findFirst: async () => ({
      id: "case-1", status: "CLOSED", outcome: "TERMINATION_RECOMMENDED", decidedAt: new Date("2026-08-01"),
      processEvents: completeEvents, evidenceVersions: [{ finalizedAt: new Date("2026-08-01") }],
    }) },
  };
  const result = await assessTerminationReadiness(prisma, {
    organizationId: "org-1", employeeId: "emp-1", reasonClass: "PERFORMANCE",
    authorityUserId: "authority-1", disciplinaryCaseId: "case-1", effectiveDate: "2026-09-01",
  });
  assert.equal(result.ready, true);
  prisma.disciplinaryCase.findFirst = async () => ({
    id: "case-1", status: "CLOSED", outcome: "TERMINATION_RECOMMENDED", decidedAt: new Date("2026-08-01"),
    processEvents: completeEvents.filter((event) => event.eventType !== "PIP_STARTED"), evidenceVersions: [{ finalizedAt: new Date() }],
  });
  const blocked = await assessTerminationReadiness(prisma, {
    organizationId: "org-1", employeeId: "emp-1", reasonClass: "PERFORMANCE",
    authorityUserId: "authority-1", disciplinaryCaseId: "case-1", effectiveDate: "2026-09-01",
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.some((item) => item.includes("PIP_STARTED")));
});

test("exit settlement totals remain deterministic", () => {
  assert.deepEqual(calculate({
    finalSalary: 100000, allowancePayable: 10000, leavePayable: 5000, noticePay: 0, gratuitySeverance: 20000,
    taxAdjustment: 5000, pensionAdjustment: 0, loanRecovery: 10000, salaryAdvanceRecovery: 5000, otherRecovery: 0,
  }), {
    finalSalary: 100000, allowancePayable: 10000, leavePayable: 5000, noticePay: 0, gratuitySeverance: 20000,
    taxAdjustment: 5000, pensionAdjustment: 0, loanRecovery: 10000, salaryAdvanceRecovery: 5000, otherRecovery: 0,
    grossPayable: 135000, totalRecovery: 20000, netSettlement: 115000,
  });
});

test("remittance workflow enforces maker-checker approval", async () => {
  const state = { batch: null, events: [] };
  const tx = {
    user: { findFirst: async ({ where }) => ({ id: where.id }) },
    statutoryRemittanceBatch: {
      create: async ({ data }) => (state.batch = { id: "batch-1", status: "DRAFT", ...data }),
      findFirst: async () => state.batch,
      update: async ({ data }) => (state.batch = { ...state.batch, ...data }),
    },
    statutoryLifecycleEvent: { create: async ({ data }) => state.events.push(data) },
  };
  const client = { $transaction: async (callback) => callback(tx) };
  await createBatch({
    organizationId: "org-1", actorUserId: "maker-1", prismaClient: client,
    input: { reference: "PAYE-2026-09", obligationType: "PAYE", authorityName: "LIRS", periodYear: 2026, periodMonth: 9, declaredAmount: 1000 },
  });
  state.batch.status = "SUBMITTED";
  await assert.rejects(
    approveBatch({ organizationId: "org-1", actorUserId: "maker-1", batchId: "batch-1", prismaClient: client }),
    (error) => error.code === "REMITTANCE_MAKER_CHECKER_REQUIRED"
  );
  await approveBatch({ organizationId: "org-1", actorUserId: "checker-1", batchId: "batch-1", prismaClient: client });
  assert.equal(state.batch.status, "APPROVED");
  assert.equal(state.batch.approvedByUserId, "checker-1");
});

test("production paths wire obligations, remittance, governance and settlement controls", () => {
  const root = path.resolve(__dirname, "..");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const payroll = read("src/services/nigeriaPayrollComplianceService.js");
  const approval = read("src/services/payrollOperationsService.js");
  const reopen = read("src/services/payrollReopenService.js");
  const exits = read("src/routes/exitRoutes.js");
  const legacy = read("src/routes/employeeRoutes.js");
  const app = read("src/app.js");
  assert.match(payroll, /replaceDraftObligations/);
  assert.match(approval, /confirmPayrollObligations/);
  assert.match(reopen, /reversePayrollObligations/);
  assert.match(exits, /assertTerminationReady/);
  assert.match(exits, /settlement\/calculate/);
  assert.match(legacy, /CONTROLLED_EXIT_WORKFLOW_REQUIRED/);
  assert.match(app, /\/api\/compliance/);
});
