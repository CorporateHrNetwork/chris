const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/services/exitSettlementService.js"), "utf8");
const sandbox = { module: { exports: {} }, require: () => ({}), console, Date };
vm.runInNewContext(source, sandbox, { filename: "exitSettlementService.js" });
const service = sandbox.module.exports;
const org = "organization-a";
const exitId = "exit-a";
const actor = "head-hr";
const original = () => ({
  id: "settlement-a", organizationId: org, exitProcessId: exitId, status: "PAYMENT_PENDING",
  amountPaid: 0, paidAt: null, paidByUserId: null, approvedByUserId: actor,
  approvedAt: new Date("2026-11-01T09:00:00Z"),
  calculationSnapshot: { totals: { netSettlement: 12345 }, hrInputs: { bonusGift: 500 } },
});
function fixture(record = original(), options = {}) {
  const writes = [], audits = [], reads = [];
  let current = record;
  const tx = {
    user: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, org);
      return options.inactive ? null : { id: actor };
    } },
    exitSettlement: {
      findFirst: async ({ where }) => {
        reads.push(where);
        assert.equal(where.organizationId, org);
        assert.equal(where.exitProcessId, exitId);
        return current;
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, "settlement-a");
        writes.push(data);
        current = { ...current, ...data };
        return current;
      },
    },
    employeeDocument: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, org);
      assert.equal(where.exitProcessId, exitId);
      assert.equal(where.category, "EXIT_SETTLEMENT_PAYMENT_PROOF");
      return options.proof ? { id: "proof" } : null;
    } },
    employeeExitProcess: { update: async ({ where, data }) => {
      assert.equal(where.id, exitId); writes.push(data); return data;
    } },
    organizationAudit: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const prismaClient = { $transaction: async (fn, config) => {
    assert.equal(config.isolationLevel, "Serializable");
    return fn(tx);
  } };
  return { prismaClient, writes, audits, reads };
}
const input = (f, extra = {}) => ({
  organizationId: org, actorUserId: actor, exitProcessId: exitId,
  reason: "Correct uniform charge", confirmedUnpaid: true, prismaClient: f.prismaClient, ...extra,
});

for (const status of ["APPROVED", "PAYMENT_PENDING"]) {
  test("reopens " + status + " with saved inputs, withdrawn approval and audit history", async () => {
    const record = { ...original(), status };
    const f = fixture(record);
    const result = await service.reopenSettlement(input(f));
    assert.equal(result.status, "DRAFT");
    assert.equal(result.approvedByUserId, null);
    assert.equal(result.approvedAt, null);
    assert.deepEqual(result.calculationSnapshot, record.calculationSnapshot);
    assert.equal(f.audits.length, 1);
    assert.equal(f.audits[0].oldValue.status, status);
    assert.deepEqual(f.audits[0].oldValue.calculationSnapshot, record.calculationSnapshot);
    assert.equal(f.audits[0].actorUserId, actor);
    assert.equal(f.audits[0].reason, "Correct uniform charge");
    assert.equal(f.writes[1].financialStatus, "PENDING");
    assert.equal(f.writes[1].finalClosureAt, null);
    await assert.rejects(service.submitSettlement(input(f)), { code: "SETTLEMENT_NOT_CALCULATED" });
    await assert.rejects(service.approveSettlement(input(f)), { code: "SETTLEMENT_NOT_PENDING_APPROVAL" });
    await assert.rejects(service.recordSettlementPayment(input(f, { amount: 1 })), { code: "SETTLEMENT_NOT_PAYABLE" });
  });
}
for (const patch of [
  { status: "PAID" }, { status: "PARTIALLY_PAID" }, { status: "WAIVED" },
  { status: "CALCULATED" }, { amountPaid: 1 }, { paidAt: new Date() }, { paidByUserId: "accounts" },
]) {
  test("rejects paid, closed or otherwise ineligible record " + JSON.stringify(patch), async () => {
    const f = fixture({ ...original(), ...patch });
    await assert.rejects(service.reopenSettlement(input(f)), { code: "SETTLEMENT_NOT_REOPENABLE" });
    assert.equal(f.writes.length, 0);
  });
}
test("requires reason and explicit unpaid confirmation", async () => {
  const f = fixture();
  await assert.rejects(service.reopenSettlement(input(f, { reason: " " })), { code: "SETTLEMENT_CORRECTION_REASON_REQUIRED" });
  for (const confirmedUnpaid of [false, undefined, "true"]) {
    await assert.rejects(service.reopenSettlement(input(f, { confirmedUnpaid })), { code: "SETTLEMENT_UNPAID_CONFIRMATION_REQUIRED" });
  }
  assert.equal(f.writes.length, 0);
});
test("blocks attached payout evidence", async () => {
  const f = fixture(original(), { proof: true });
  await assert.rejects(service.reopenSettlement(input(f)), { code: "SETTLEMENT_PAYMENT_PROOF_EXISTS" });
  assert.equal(f.writes.length, 0);
});
test("requires active tenant actor and a tenant-scoped settlement", async () => {
  const inactive = fixture(original(), { inactive: true });
  await assert.rejects(service.reopenSettlement(input(inactive)), { code: "INVALID_SETTLEMENT_ACTOR" });
  const missing = fixture(null);
  await assert.rejects(service.reopenSettlement(input(missing)), { code: "EXIT_SETTLEMENT_NOT_FOUND" });
  assert.equal(inactive.writes.length + missing.writes.length, 0);
});
test("reopen endpoint requires employee update and payroll management permissions", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/exitRoutes.js"), "utf8");
  assert.match(routes, /settlement\/reopen", requirePermission\("employees.update"\), requirePermission\("payroll.manage"\)/);
});
