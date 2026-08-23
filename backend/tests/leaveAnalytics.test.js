const assert = require("assert");
const {
  summarizeOperationalLeave,
  reconcileLeaveStatus,
} = require("../src/services/leaveAnalyticsService");

const today = new Date("2026-08-21T00:00:00.000Z");
const tomorrow = new Date("2026-08-22T00:00:00.000Z");
const requests = [
  { employeeId: "e-active", status: "APPROVED", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-22"), cancelledAt: null },
  { employeeId: "e-future", status: "APPROVED", startDate: new Date("2026-08-24"), endDate: new Date("2026-08-25"), cancelledAt: null },
  { employeeId: "e-cancelled", status: "APPROVED", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-22"), cancelledAt: new Date("2026-08-20") },
  { employeeId: "e-cancelled-status", status: "CANCELLED", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-22"), cancelledAt: new Date("2026-08-20") },
  { employeeId: "e-rejected", status: "REJECTED", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-22"), cancelledAt: null },
  { employeeId: "e-expired", status: "APPROVED", startDate: new Date("2026-08-18"), endDate: new Date("2026-08-20"), cancelledAt: null },
  { employeeId: "e-pending", status: "PENDING", startDate: new Date("2026-08-24"), endDate: new Date("2026-08-25"), cancelledAt: null },
];

const summary = summarizeOperationalLeave(requests, { today, tomorrow });
assert.equal(summary.activeApprovedRequests, 1, "only an approved request active today counts as active");
assert.deepEqual([...summary.activeEmployeeIds], ["e-active"]);
assert.equal(summary.approvedCurrentOrUpcoming, 2, "active and future approved requests count as current or upcoming");
assert.equal(summary.pendingRequests, 1);
assert.equal(summary.activeEmployeeIds.has("e-cancelled"), false, "cancelled leave must not remain active");
assert.equal(summary.activeEmployeeIds.has("e-rejected"), false, "rejected leave must not become active");
assert.equal(summary.activeEmployeeIds.has("e-expired"), false, "expired leave must not remain active");

assert.deepEqual(reconcileLeaveStatus([
  { id: "e-active", status: "LEAVE" },
  { id: "e-orphan", status: "LEAVE" },
  { id: "e-reverse", status: "ACTIVE" },
], new Set(["e-active", "e-reverse"])), {
  onLeaveWithoutActiveApprovedRequest: 1,
  activeApprovedRequestWithoutOnLeaveStatus: 1,
});

console.log("PASS: CHRIS operational leave analytics tests passed.");
