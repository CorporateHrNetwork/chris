const assert = require("assert");
const { getWorkforceAnalytics } = require("../src/services/workforceAnalyticsService");
const now = new Date("2026-08-21T10:00:00.000Z");
const calls = [];
const current = [
  { id: "e1", status: "ACTIVE", gender: "MALE", departmentId: "d1", designationId: "j1", locationId: "l1" },
  { id: "e2", status: "PROBATION", gender: "FEMALE", departmentId: "d1", designationId: null, locationId: "l1" },
  { id: "e3", status: "LEAVE", gender: "UNSPECIFIED", departmentId: null, designationId: "j1", locationId: null },
];
const all = [{ id: "e1", status: "ACTIVE" }, { id: "e2", status: "PROBATION" }, { id: "e3", status: "LEAVE" }, { id: "e4", status: "RESIGNED" }, { id: "e5", status: "TERMINATED" }];
const model = (name, result) => ({ findMany: async (query) => { calls.push({ name, query }); return result; } });
const prisma = {
  employee: { findMany: async (query) => { calls.push({ name: "employee", query }); return typeof query.where.status === "object" ? current : all; } },
  department: model("department", [{ id: "d1", name: "People" }, { id: "d0", name: "Empty" }]),
  organizationLocation: model("location", [{ id: "l1", name: "Lagos" }]),
  designation: model("designation", [{ id: "j1", name: "Analyst" }]),
  employeeEmploymentEpisode: model("episodes", [{ sequenceNumber: 1, startDate: new Date("2026-08-01") }, { sequenceNumber: 2, startDate: new Date("2026-08-10") }]),
  employeeExitProcess: model("exits", [{ targetStatus: "RESIGNED", lastWorkingDay: new Date("2026-08-15") }]),
  employeeLineManagerAssignment: model("managers", [{ employeeId: "e1", managerEmployeeId: "e2", manager: { firstName: "Ada", lastName: "Okafor" } }]),
  employeeOnboarding: model("onboarding", [{ status: "IN_PROGRESS", completionPercent: 50 }, { status: "COMPLETED", completionPercent: 100 }]),
  leaveRequest: model("leave", [{ employeeId: "e3", status: "APPROVED", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-22"), cancelledAt: null }, { employeeId: "e2", status: "PENDING", startDate: new Date("2026-09-01"), endDate: new Date("2026-09-02"), cancelledAt: null }]),
  attendanceRecord: model("attendance", [{ status: "PRESENT" }, { status: "LATE" }]),
};

(async () => {
  const data = await getWorkforceAnalytics(prisma, { organizationId: "org-a", now });
  assert.equal(data.headcount.current, 3); assert.equal(data.headcount.historicalIdentities, 5); assert.equal(data.headcount.exited, 2);
  assert.deepEqual(data.demographics.gender.map((row) => row.count), [1, 1, 0, 1]);
  assert.equal(data.organization.departments.find((row) => row.label === "People").count, 2);
  assert.equal(data.organization.departments.find((row) => row.label === "Empty").count, 0);
  assert.equal(data.organization.locations.find((row) => row.label === "Lagos").count, 2);
  assert.equal(data.movements.hiringActivity.thisYear, 2); assert.equal(data.movements.hiringActivity.rehiresThisYear, 1);
  assert.equal(data.movements.exits.thisYear, 1); assert.equal(data.managers.assigned, 1); assert.equal(data.managers.unassigned, 2);
  assert.equal(data.onboarding.averageCompletion, 75); assert.equal(data.leave.employeesOnLeaveToday, 1); assert.equal(data.attendance.lateToday, 1);
  assert.equal(data.leave.activeApprovedRequests, 1); assert.equal(data.leave.approvedCurrentOrUpcoming, 1);
  assert.deepEqual(data.leave.statusRequestConsistency, { onLeaveWithoutActiveApprovedRequest: 0, activeApprovedRequestWithoutOnLeaveStatus: 0 });
  assert.ok(calls.every((call) => call.query.where.organizationId === "org-a"), "all queries are tenant scoped");
  const leaveQuery = calls.find((call) => call.name === "leave").query;
  assert.equal(leaveQuery.where.organizationId, "org-a", "leave analytics must remain tenant scoped");
  assert.deepEqual(leaveQuery.where.status.in, ["PENDING", "APPROVED"]);
  assert.equal(leaveQuery.where.cancelledAt, null);
  assert.equal(leaveQuery.where.endDate.gte.toISOString(), "2026-08-20T23:00:00.000Z");
  assert.equal(leaveQuery.select.cancelledAt, true);
  const exitWhere = calls.find((call) => call.name === "exits").query.where;
  assert.equal(exitWhere.status, "COMPLETED"); assert.equal(exitWhere.cancelledAt, null);
  const emptyModel = { findMany: async () => [] };
  const emptyPrisma = { employee: emptyModel, department: emptyModel, organizationLocation: emptyModel, designation: emptyModel, employeeEmploymentEpisode: emptyModel, employeeExitProcess: emptyModel, employeeLineManagerAssignment: emptyModel, employeeOnboarding: emptyModel, leaveRequest: emptyModel, attendanceRecord: emptyModel };
  const empty = await getWorkforceAnalytics(emptyPrisma, { organizationId: "org-empty", now });
  assert.equal(empty.headcount.current, 0); assert.equal(empty.demographics.gender[0].percentage, 0); assert.equal(empty.managers.averageDirectReports, 0);
  console.log("PASS: CHRIS workforce analytics tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
