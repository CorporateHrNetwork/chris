export function leaveTodayKey(now = new Date(), timezone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-CA", {timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
}
export function activeLeaves(rows, now = new Date(), timezone = "Africa/Lagos") {
  const today = leaveTodayKey(now,timezone);
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (row.cancelledAt || row.returnedAt) return false;
    if (row.employee?.status && !["ACTIVE","PROBATION","LEAVE"].includes(row.employee.status)) return false;
    if (row.status === "ACTIVE") return true;
    return row.status === "APPROVED" && String(row.startDate || "").slice(0,10) <= today && String(row.endDate || "").slice(0,10) >= today;
  });
}
// Return-to-work is a lifecycle action and remains limited to commenced leave.
export const returnQueue = rows => (Array.isArray(rows) ? rows : []).filter(row => row.status === "ACTIVE" && !row.cancelledAt && !row.returnedAt);
export function calendarLeaves(rows, month) {
  if (!month) return [];
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  return (Array.isArray(rows) ? rows : []).filter(row => !row.cancelledAt && ["APPROVED", "ACTIVE", "COMPLETED"].includes(row.status) && new Date(row.startDate) < end && new Date(row.endDate) >= start);
}
export function exceptionRows(data, detectedAt = new Date().toISOString()) {
  return [
    ...(data?.employeeOnLeaveWithoutActiveRequest || []).map(x => ({...x, id:`employee-${x.id}`, mismatchType:"Employee marked on leave without active request", employeeStatus:x.status, requestStatus:"None", detectedAt, recommendation:"Review employee status and leave history"})),
    ...(data?.activeRequestWithoutLeaveStatus || []).map(x => ({...x, id:`request-${x.id}`, mismatchType:"Active request while employee is not marked on leave", employeeStatus:x.employee?.status, requestStatus:x.status, detectedAt, recommendation:"Review request commencement and employee status"})),
  ];
}

