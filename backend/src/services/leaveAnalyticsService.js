function summarizeOperationalLeave(leaveRequests, { today, tomorrow }) {
  const currentOrUpcoming = leaveRequests.filter((request) =>
    request.cancelledAt == null &&
    request.endDate >= today
  );
  const approved = currentOrUpcoming.filter((request) => request.status === "APPROVED");
  const activeApproved = approved.filter((request) =>
    request.startDate < tomorrow &&
    request.endDate >= today
  );

  return {
    activeApprovedRequests: activeApproved.length,
    activeEmployeeIds: new Set(activeApproved.map((request) => request.employeeId)),
    approvedCurrentOrUpcoming: approved.length,
    pendingRequests: currentOrUpcoming.filter((request) => request.status === "PENDING").length,
  };
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
  summarizeOperationalLeave,
  reconcileLeaveStatus,
};
