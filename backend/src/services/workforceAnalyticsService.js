const {
  CURRENT_WORKFORCE_STATUSES: CURRENT_STATUSES,
  EXITED_EMPLOYEE_STATUSES: EXIT_STATUSES,
} = require("./employeeStatusSemantics");
const GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"];
const ONBOARDING_STATUSES = ["DRAFT", "IN_PROGRESS", "AWAITING_EMPLOYEE", "AWAITING_HR", "READY_FOR_ACTIVATION", "COMPLETED", "BLOCKED"];

const pct = (count, total) => total ? Math.round(count / total * 1000) / 10 : 0;
const dayStart = (value) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
const plusDays = (value, days) => { const date = new Date(value); date.setDate(date.getDate() + days); return date; };

function distribution(items, keys, getKey, total) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const item of items) { const key = getKey(item); counts[key] = (counts[key] || 0) + 1; }
  return Object.entries(counts).map(([key, count]) => ({ key, count, percentage: pct(count, total) }));
}

function monthTrend(items, getDate, year) {
  const rows = Array.from({ length: 12 }, (_, month) => ({ month: new Date(year, month, 1).toLocaleString("en", { month: "short" }), count: 0 }));
  for (const item of items) { const date = new Date(getDate(item)); if (date.getFullYear() === year) rows[date.getMonth()].count += 1; }
  return rows;
}

function normalizeFilters(filters = {}, now = new Date()) {
  const clean = (value) => String(value || "").trim();
  const status = clean(filters.status).toUpperCase(); const gender = clean(filters.gender).toUpperCase(); const year = Number(filters.year);
  return { departmentId: clean(filters.departmentId) || null, locationId: clean(filters.locationId) || null, status: CURRENT_STATUSES.includes(status) ? status : null, gender: GENDERS.includes(gender) ? gender : null, year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date(now).getFullYear() };
}

async function getWorkforceAnalytics(prisma, { organizationId, filters = {}, now = new Date() }) {
  if (!organizationId) throw new Error("organizationId is required");
  const f = normalizeFilters(filters, now); const today = dayStart(now); const tomorrow = plusDays(today, 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1); const yearStart = new Date(f.year, 0, 1); const yearEnd = new Date(f.year + 1, 0, 1);
  const currentWhere = { organizationId, status: f.status || { in: CURRENT_STATUSES }, ...(f.departmentId && { departmentId: f.departmentId }), ...(f.locationId && { locationId: f.locationId }), ...(f.gender && { gender: f.gender }) };
  const [current, allEmployees, departments, locations, designations, episodes, exits, assignments, onboardings, leaveRequests, attendance] = await Promise.all([
    prisma.employee.findMany({ where: currentWhere, select: { id: true, status: true, gender: true, departmentId: true, designationId: true, locationId: true } }),
    prisma.employee.findMany({ where: { organizationId }, select: { status: true } }),
    prisma.department.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationLocation.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.designation.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeEmploymentEpisode.findMany({ where: { organizationId, startDate: { gte: yearStart, lt: yearEnd } }, select: { sequenceNumber: true, startDate: true } }),
    prisma.employeeExitProcess.findMany({ where: { organizationId, status: "COMPLETED", completedAt: { not: null }, cancelledAt: null, lastWorkingDay: { gte: yearStart, lt: yearEnd } }, select: { targetStatus: true, lastWorkingDay: true } }),
    prisma.employeeLineManagerAssignment.findMany({ where: { organizationId, effectiveTo: null, employee: { status: { in: CURRENT_STATUSES } }, manager: { status: { in: CURRENT_STATUSES } } }, select: { employeeId: true, managerEmployeeId: true, manager: { select: { firstName: true, lastName: true } } } }),
    prisma.employeeOnboarding.findMany({ where: { organizationId }, select: { status: true, completionPercent: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: { in: ["PENDING", "APPROVED"] }, endDate: { gte: today } }, select: { employeeId: true, status: true, startDate: true, endDate: true } }),
    prisma.attendanceRecord.findMany({ where: { organizationId, attendanceDate: { gte: today, lt: tomorrow } }, select: { status: true } }),
  ]);
  const status = distribution(allEmployees, [...CURRENT_STATUSES, ...EXIT_STATUSES], (row) => row.status, allEmployees.length);
  const byCatalog = (catalog, field) => [...catalog.map((item) => ({ key: item.id, label: item.name, count: current.filter((employee) => employee[field] === item.id).length })), { key: "UNASSIGNED", label: "Unassigned", count: current.filter((employee) => !employee[field]).length }].map((row) => ({ ...row, percentage: pct(row.count, current.length) }));
  const teams = new Map(); const teamNames = new Map(); for (const row of assignments) { teams.set(row.managerEmployeeId, (teams.get(row.managerEmployeeId) || 0) + 1); teamNames.set(row.managerEmployeeId, `${row.manager.firstName} ${row.manager.lastName}`.trim()); }
  const assigned = new Set(assignments.map((row) => row.employeeId));
  const currentLeave = new Set(leaveRequests.filter((row) => row.status === "APPROVED" && row.startDate < tomorrow && row.endDate >= today).map((row) => row.employeeId));
  const attendanceCounts = {}; for (const row of attendance) attendanceCounts[row.status] = (attendanceCounts[row.status] || 0) + 1;
  return {
    meta: { generatedAt: new Date(now).toISOString(), year: f.year, filters: f, currentStatuses: CURRENT_STATUSES },
    headcount: { current: current.length, historicalIdentities: allEmployees.length, exited: status.filter((row) => EXIT_STATUSES.includes(row.key)).reduce((sum, row) => sum + row.count, 0), byStatus: status },
    demographics: { denominator: current.length, gender: distribution(current, GENDERS, (row) => row.gender || "UNSPECIFIED", current.length) },
    organization: { departments: byCatalog(departments, "departmentId"), locations: byCatalog(locations, "locationId"), designations: byCatalog(designations, "designationId").sort((a, b) => b.count - a.count) },
    movements: { hiringActivity: { thisMonth: episodes.filter((row) => row.startDate >= monthStart && row.startDate < tomorrow).length, thisYear: episodes.length, rehiresThisYear: episodes.filter((row) => row.sequenceNumber > 1).length, trend: monthTrend(episodes, (row) => row.startDate, f.year) }, exits: { thisMonth: exits.filter((row) => row.lastWorkingDay >= monthStart && row.lastWorkingDay < tomorrow).length, thisYear: exits.length, byStatus: distribution(exits, EXIT_STATUSES, (row) => row.targetStatus, exits.length), trend: monthTrend(exits, (row) => row.lastWorkingDay, f.year) } },
    managers: { assigned: current.filter((row) => assigned.has(row.id)).length, unassigned: current.filter((row) => !assigned.has(row.id)).length, managersWithReports: teams.size, averageDirectReports: teams.size ? Math.round(assignments.length / teams.size * 10) / 10 : 0, largestTeams: Array.from(teams, ([managerEmployeeId, count]) => ({ managerEmployeeId, managerName: teamNames.get(managerEmployeeId), count })).sort((a, b) => b.count - a.count).slice(0, 5) },
    onboarding: { total: onboardings.length, averageCompletion: onboardings.length ? Math.round(onboardings.reduce((sum, row) => sum + row.completionPercent, 0) / onboardings.length) : 0, byStatus: distribution(onboardings, ONBOARDING_STATUSES, (row) => row.status, onboardings.length) },
    leave: { employeesOnLeaveToday: currentLeave.size, pendingRequests: leaveRequests.filter((row) => row.status === "PENDING").length, approvedCurrentOrUpcoming: leaveRequests.filter((row) => row.status === "APPROVED").length },
    attendance: { recordsToday: attendance.length, presentToday: attendanceCounts.PRESENT || 0, absentToday: attendanceCounts.ABSENT || 0, lateToday: attendanceCounts.LATE || 0, onLeaveToday: attendanceCounts.ON_LEAVE || 0 },
  };
}

module.exports = { CURRENT_STATUSES, EXIT_STATUSES, normalizeFilters, distribution, monthTrend, getWorkforceAnalytics };
