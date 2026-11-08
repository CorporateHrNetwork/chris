const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { createZermattLeaveCommencementScheduler } = require("../src/services/zermattLeaveCommencementScheduler");

test("scheduler uses Lagos dates and starts only currently effective approved leave", async () => {
  const calls = [];
  const scheduler = createZermattLeaveCommencementScheduler({
    prisma: { leaveRequest: { findMany: async ({ where }) => {
      assert.equal(where.organization.slug, "zermatt-liquor-limited");
      assert.equal(where.status, "APPROVED");
      assert.equal(where.startDate.lte.toISOString(), "2026-11-09T00:00:00.000Z");
      assert.equal(where.endDate.gte.toISOString(), "2026-11-09T00:00:00.000Z");
      return [{ id: "test-leave", organizationId: "test-org", startDate: new Date("2026-11-07") }];
    } } },
    commenceLeave: async input => calls.push(input),
  });
  await scheduler.run(new Date("2026-11-08T23:01:00Z"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].effectiveDate.toISOString(), "2026-11-07T00:00:00.000Z");
  assert.equal(calls[0].actorUserId, undefined);
});

function fixture() {
  const employee = { status: "ACTIVE", employmentEpisodes: [{ id: "episode" }] };
  const leave = {
    id: "leave", employeeId: "employee", status: "APPROVED", requestedUnits: 14,
    startDate: new Date("2026-10-26"), endDate: new Date("2026-11-08"), employee,
  };
  const events = [];
  const audit = [];
  let used = 14;
  const db = {
    $queryRawUnsafe: async () => [],
    $transaction: async fn => fn(db),
    leaveRequest: {
      findFirst: async ({ where }) => where.id === leave.id ? { ...leave, employee: { ...employee } } : null,
      updateMany: async ({ data }) => { Object.assign(leave, data); return { count: 1 }; },
      findUnique: async () => ({ ...leave }),
      update: async ({ data }) => Object.assign(leave, data),
    },
    employee: { update: async ({ data }) => Object.assign(employee, data) },
    employeeLifecycleEvent: { create: async ({ data }) => events.push(data) },
    organizationAudit: { create: async ({ data }) => audit.push(data) },
    leaveBalance: {
      findUnique: async () => ({ id: "balance", used }),
      update: async ({ data }) => { used -= data.used.decrement; },
    },
  };
  const filename = require.resolve("../src/services/leaveService");
  const module = { exports: {} };
  const load = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, Date,
    require: id => {
      if (id === "../config/prisma") return db;
      if (id === "./leaveBalanceService" || id === "./serviceEligibility") return {};
      if (id === "./leaveReturnPayrollService") return { ...load(id), lagosToday: () => "2026-11-08" };
      return load(id);
    },
  });
  return { ...module.exports, leave, employee, events, audit, used: () => used };
}

const identity = { organizationId: "org", leaveRequestId: "leave", actorUserId: "hr", zermatt: true };

test("HR can record a return on the approved final day from an uncommenced record", async () => {
  const f = fixture();
  await f.returnFromLeave({ ...identity, returnDate: "2026-11-08" });
  assert.equal(f.leave.status, "COMPLETED");
  assert.equal(f.leave.commencementDate.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(f.leave.actualReturnDate.toISOString(), "2026-11-08T00:00:00.000Z");
  assert.equal(f.employee.status, "ACTIVE");
  assert.deepEqual(f.events.map(e => e.eventType), ["LEAVE_COMMENCED", "RETURNED_FROM_LEAVE"]);
  assert.equal(f.used(), 14);
});

test("cancelling automatically commenced leave restores the balance and working status once", async () => {
  const f = fixture();
  await f.commenceLeave({ ...identity, actorUserId: undefined, effectiveDate: "2026-10-26" });
  await assert.rejects(f.cancelLeaveRequest(identity), /LEAVE_CANCELLATION_REASON_REQUIRED/);
  assert.equal(f.used(), 14);
  await f.cancelLeaveRequest({ ...identity, cancellationReason: "Employee did not take leave" });
  assert.equal(f.leave.status, "CANCELLED");
  assert.equal(f.leave.cancelledByUserId, "hr");
  assert.equal(f.employee.status, "ACTIVE");
  assert.equal(f.used(), 0);
  assert.equal(f.audit[0].action, "LEAVE_CANCELLED");
  await assert.rejects(f.cancelLeaveRequest({ ...identity, cancellationReason: "Duplicate" }), /LEAVE_REQUEST_ALREADY_CANCELLED/);
});
