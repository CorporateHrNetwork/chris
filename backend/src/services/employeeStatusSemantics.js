const CURRENT_WORKFORCE_STATUSES = Object.freeze([
  "ACTIVE",
  "PROBATION",
  "LEAVE",
  "SUSPENDED",
]);

// These are the terminal/non-current values that actually exist in EmployeeStatus.
const EXITED_EMPLOYEE_STATUSES = Object.freeze([
  "RESIGNED",
  "TERMINATED",
  "RETIRED",
  "INACTIVE",
]);

function isCurrentWorkforceStatus(status) {
  return CURRENT_WORKFORCE_STATUSES.includes(String(status || "").toUpperCase());
}

function isExitedEmployeeStatus(status) {
  return EXITED_EMPLOYEE_STATUSES.includes(String(status || "").toUpperCase());
}

function summarizeEmployeeStatuses(employees = []) {
  const byStatus = Object.fromEntries(
    [...CURRENT_WORKFORCE_STATUSES, ...EXITED_EMPLOYEE_STATUSES].map((status) => [status, 0])
  );
  for (const employee of employees) {
    const status = String(employee?.status || "").toUpperCase();
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return {
    historicalIdentities: employees.length,
    current: employees.filter((employee) => isCurrentWorkforceStatus(employee.status)).length,
    exited: employees.filter((employee) => isExitedEmployeeStatus(employee.status)).length,
    byStatus,
  };
}

module.exports = {
  CURRENT_WORKFORCE_STATUSES,
  EXITED_EMPLOYEE_STATUSES,
  isCurrentWorkforceStatus,
  isExitedEmployeeStatus,
  summarizeEmployeeStatuses,
};
