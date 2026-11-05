function leaveDayBounds(now = new Date(), timezone = "Africa/Lagos") {
  const key = new Intl.DateTimeFormat("en-CA", {timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  const today = new Date(key + "T00:00:00.000Z");
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return {today,tomorrow};
}

function summarizeOperationalLeave(leaveRequests, { today, tomorrow }) {
  const open = leaveRequests.filter(request => request.cancelledAt == null && request.returnedAt == null);
  const eligible = request => !request.employee?.status || ["ACTIVE","PROBATION","LEAVE"].includes(request.employee.status);
  const approved = open.filter(request => request.status === "APPROVED" && new Date(request.endDate) >= today && eligible(request));
  const activeApproved = approved.filter(request => new Date(request.startDate) < tomorrow);
  // A commenced absence stays active until HR records the return, even overdue.
  const commenced = open.filter(request => request.status === "ACTIVE" && eligible(request));
  const active = [...activeApproved, ...commenced];
  return {
    activeApprovedRequests: activeApproved.length,
    activeLeaveRequests: active.length,
    commencedLeaveRequests: commenced.length,
    commencedEmployeeIds: new Set(commenced.map(request => request.employeeId)),
    activeEmployeeIds: new Set(active.map(request => request.employeeId)),
    approvedCurrentOrUpcoming: approved.length,
    approvedUpcoming: approved.filter(request => new Date(request.startDate) >= tomorrow).length,
    pendingRequests: open.filter(request => request.status === "PENDING").length,
  };
}

function projectLeaveStatuses(employees, activeEmployeeIds) {
  return employees.map(employee => activeEmployeeIds.has(employee.id) && ["ACTIVE","PROBATION","LEAVE"].includes(employee.status)
    ? {...employee,status:"LEAVE"} : employee);
}

function reconcileLeaveStatus(employees, activeEmployeeIds) {
  const statusLeaveIds = new Set(
    employees.filter((employee) => employee.status === "LEAVE").map((employee) => employee.id)
  );
  return {
    onLeaveWithoutActiveApprovedRequest: [...statusLeaveIds]
      .filter((employeeId) => !activeEmployeeIds.has(employeeId)).length,
    activeApprovedRequestWithoutOnLeaveStatus: [...activeEmployeeIds]
      .filter((employeeId) => !statusLeaveIds.has(employeeId)).length,
  };
}

module.exports = {
  leaveDayBounds,
  projectLeaveStatuses,
  summarizeOperationalLeave,
  reconcileLeaveStatus,
};

