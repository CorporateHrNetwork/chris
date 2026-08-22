const assert = require("assert");
const {
  CURRENT_WORKFORCE_STATUSES,
  EXITED_EMPLOYEE_STATUSES,
  summarizeEmployeeStatuses,
} = require("../src/services/employeeStatusSemantics");
const { getExitRegister } = require("../src/services/exitRegisterService");

const dashboardEmployees = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, status: "ACTIVE" })),
  ...Array.from({ length: 2 }, (_, index) => ({ id: `p${index}`, status: "PROBATION" })),
  { id: "t1", status: "TERMINATED" },
];
const summary = summarizeEmployeeStatuses(dashboardEmployees);
assert.deepEqual(CURRENT_WORKFORCE_STATUSES, ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"]);
assert.deepEqual(EXITED_EMPLOYEE_STATUSES, ["RESIGNED", "TERMINATED", "RETIRED", "INACTIVE"]);
assert.equal(summary.historicalIdentities, 9);
assert.equal(summary.current, 8);
assert.equal(summary.exited, 1);
assert.equal(summary.byStatus.ACTIVE, 6);
assert.equal(summary.byStatus.PROBATION, 2);
assert.equal(summary.byStatus.TERMINATED, 1);
const currentDatasetSummary = summarizeEmployeeStatuses([
  ...Array.from({ length: 7 }, (_, index) => ({ id: `current-a${index}`, status: "ACTIVE" })),
  { id: "current-l1", status: "LEAVE" },
  { id: "current-t1", status: "TERMINATED" },
]);
assert.equal(currentDatasetSummary.historicalIdentities, 9);
assert.equal(currentDatasetSummary.byStatus.ACTIVE, 7);
assert.equal(currentDatasetSummary.byStatus.PROBATION, 0);
assert.equal(currentDatasetSummary.byStatus.LEAVE, 1);
assert.equal(currentDatasetSummary.byStatus.SUSPENDED, 0);
assert.equal(currentDatasetSummary.exited, 1);
for (const status of CURRENT_WORKFORCE_STATUSES) {
  assert.equal(summarizeEmployeeStatuses([{ status }]).current, 1, `${status} is current workforce`);
}
for (const status of EXITED_EMPLOYEE_STATUSES) {
  assert.equal(summarizeEmployeeStatuses([{ status }]).exited, 1, `${status} is exited/non-current`);
}

const completedProcess = {
  id: "xp1", status: "COMPLETED", exitType: "TERMINATION", reason: "Role ended",
  lastWorkingDay: new Date("2026-08-01"), completedAt: new Date("2026-08-02"),
};
const terminalEmployees = [
  { id: "e1", employeeNumber: "CHR1", firstName: "Ada", middleName: null, lastName: "A", status: "TERMINATED", exitDate: new Date("2026-08-01"), department: { id: "d1", name: "People" }, designation: { id: "j1", name: "Lead" }, location: { id: "l1", name: "Lagos" }, exitProcesses: [completedProcess] },
  { id: "e2", employeeNumber: "CHR2", firstName: "Ben", middleName: null, lastName: "B", status: "RESIGNED", exitDate: null, department: null, designation: null, location: null, exitProcesses: [] },
];
let capturedQuery;
const prisma = { employee: { findMany: async (query) => { capturedQuery = query; return terminalEmployees; } } };

(async () => {
  const register = await getExitRegister(prisma, "org-a");
  assert.equal(register.length, 2, "terminal employees are deduplicated by the employee query");
  assert.equal(register[0].exitProcess.id, "xp1", "completed metadata is included");
  assert.equal(register[1].exitProcess, null, "a missing workflow remains null");
  assert.equal(capturedQuery.where.organizationId, "org-a", "register is tenant scoped");
  assert.deepEqual(capturedQuery.where.status.in, EXITED_EMPLOYEE_STATUSES);
  assert.equal(capturedQuery.select.exitProcesses.where.status, "COMPLETED");
  assert.equal(capturedQuery.select.exitProcesses.where.cancelledAt, null, "cancelled workflow metadata is excluded");
  assert.equal(capturedQuery.select.exitProcesses.take, 1, "one latest completed workflow prevents duplicates");
  const empty = await getExitRegister({ employee: { findMany: async () => [] } }, "org-empty");
  assert.deepEqual(empty, []);
  console.log("PASS: CHRIS current-state exit register tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
