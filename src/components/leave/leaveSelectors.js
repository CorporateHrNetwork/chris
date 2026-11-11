export const activeLeaves = rows => (Array.isArray(rows) ? rows : []).filter(row => row.status === "ACTIVE");
export const returnQueue = activeLeaves;
export function calendarLeaves(rows, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    ["APPROVED", "ACTIVE", "COMPLETED"].includes(row.status) &&
    String(row.startDate || "").slice(0, 7) <= month &&
    String(row.endDate || "").slice(0, 7) >= month
  );
}
export function exceptionRows(data, detectedAt = new Date().toISOString()) {
  return [
    ...(data?.employeeOnLeaveWithoutActiveRequest || []).map(x => ({...x, id:`employee-${x.id}`, mismatchType:"Employee marked on leave without active request", employeeStatus:x.status, requestStatus:"None", detectedAt, recommendation:"Review employee status and leave history"})),
    ...(data?.activeRequestWithoutLeaveStatus || []).map(x => ({...x, id:`request-${x.id}`, mismatchType:"Active request while employee is not marked on leave", employeeStatus:x.employee?.status, requestStatus:x.status, detectedAt, recommendation:"Review request commencement and employee status"})),
  ];
}
