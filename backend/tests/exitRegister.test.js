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

const completedProcesses = [
  {
    id: "xp1",
    organizationId: "org-a",
    status: "COMPLETED",
    exitType: "TERMINATION",
    reason: "Role ended",
    lastWorkingDay: new Date("2026-08-01"),
    completedAt: new Date("2026-08-02"),
    cancelledAt: null,
    financialStatus: "NOT_APPLICABLE",
    finalClosureAt: null,
    settlement: null,
    employee: {
      id: "e1",
      employeeNumber: "CHR1",
      firstName: "Ada",
      middleName: null,
      lastName: "A",
      status: "TERMINATED",
      exitDate: new Date("2026-08-01"),
      department: { id: "d1", name: "People" },
      designation: { id: "j1", name: "Lead" },
      location: { id: "l1", name: "Lagos" },
    },
  },
  {
    id: "xp2",
    organizationId: "org-a",
    status: "COMPLETED",
    exitType: "RESIGNATION",
    reason: "Personal",
    lastWorkingDay: new Date("2026-07-15"),
    completedAt: new Date("2026-07-16"),
    cancelledAt: null,
    financialStatus: "NOT_APPLICABLE",
    finalClosureAt: null,
    settlement: null,
    employee: {
      id: "e2",
      employeeNumber: "CHR2",
      firstName: "Ben",
      middleName: null,
      lastName: "B",
      status: "ACTIVE",
      exitDate: null,
      department: null,
      designation: null,
      location: null,
    },
  },
];

let capturedQuery;
const prisma = {
  employeeExitProcess: {
    findMany: async (query) => {
      capturedQuery = query;
      return completedProcesses;
    },
  },
};

(async () => {
  const register = await getExitRegister(prisma, "org-a");
  assert.equal(register.length, 2, "completed exit processes are authoritative historical register rows");
  assert.equal(register[0].exitProcess.id, "xp1", "completed process metadata is included");
  assert.equal(register[1].status, "ACTIVE", "a later employee status change or rehire does not hide a completed exit");
  assert.equal(capturedQuery.where.organizationId, "org-a", "register is tenant scoped");
  assert.equal(capturedQuery.where.status, "COMPLETED");
  assert.deepEqual(capturedQuery.where.completedAt, { not: null });
  assert.equal(capturedQuery.where.cancelledAt, null, "cancelled exit processes are excluded");
  assert.equal(capturedQuery.select.employee.select.employeeNumber, true, "employee snapshot data is selected with the process");
  const empty = await getExitRegister(
    { employeeExitProcess: { findMany: async () => [] } },
    "org-empty"
  );
  assert.deepEqual(empty, []);
  console.log("PASS: CHRIS completed-process exit register tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
