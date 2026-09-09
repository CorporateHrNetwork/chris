const prisma = require("../config/prisma");
const {
  CURRENT_WORKFORCE_STATUSES,
  EXITED_EMPLOYEE_STATUSES,
} = require("./employeeStatusSemantics");

const CURRENT_STATUS_SET = new Set(CURRENT_WORKFORCE_STATUSES);
const EXITED_STATUS_SET = new Set(EXITED_EMPLOYEE_STATUSES);

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function label(value, fallback = "Unassigned") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function increment(map, key) {
  const normalized = label(key);
  map[normalized] = (map[normalized] || 0) + 1;
}

function sortedBreakdown(map) {
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function mapEmployee(employee) {
  return {
    employeeNumber: employee.employeeNumber,
    employeeName: employeeName(employee),
    status: employee.status,
    gender: employee.gender,
    employmentType: employee.employmentType || null,
    hireDate: isoDate(employee.hireDate),
    department: employee.department?.name || null,
    designation: employee.designation?.name || null,
    branch: employee.location?.name || null,
    branchCode: employee.location?.code || null,
  };
}

function buildHeadcount(currentEmployees) {
  const byStatus = {};
  const byDepartment = {};
  const byDesignation = {};
  const byEmploymentType = {};
  const byGender = {};

  for (const employee of currentEmployees) {
    increment(byStatus, employee.status, "Unknown");
    increment(byDepartment, employee.department?.name);
    increment(byDesignation, employee.designation?.name);
    increment(byEmploymentType, employee.employmentType);
    increment(byGender, employee.gender, "UNSPECIFIED");
  }

  return {
    total: currentEmployees.length,
    byStatus: sortedBreakdown(byStatus),
    byDepartment: sortedBreakdown(byDepartment),
    byDesignation: sortedBreakdown(byDesignation),
    byEmploymentType: sortedBreakdown(byEmploymentType),
    byGender: sortedBreakdown(byGender),
  };
}

function statusCount(employees, status) {
  return employees.filter((employee) => employee.status === status).length;
}

async function resolveScope(prismaClient, organizationId, locationId) {
  if (!locationId) {
    return {
      mode: "HEAD_OFFICE_CONSOLIDATED",
      locationId: null,
      locationName: "HEAD OFFICE",
      locationCode: "HO",
    };
  }

  const location = await prismaClient.organizationLocation.findFirst({
    where: { id: locationId, organizationId, isActive: true },
    select: { id: true, name: true, code: true, type: true },
  });
  if (!location) {
    const error = new Error("The active report branch is unavailable.");
    error.code = "REPORT_LOCATION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  return {
    mode: "BRANCH",
    locationId: location.id,
    locationName: location.name,
    locationCode: location.code,
  };
}

async function getReportsRelease1({
  organizationId,
  locationId = null,
  prismaClient = prisma,
  now = new Date(),
}) {
  if (!organizationId) throw new Error("organizationId is required");

  const scope = await resolveScope(prismaClient, organizationId, locationId);
  const employeeWhere = {
    organizationId,
    ...(scope.locationId ? { locationId: scope.locationId } : {}),
  };

  const [employees, activeBranches] = await Promise.all([
    prismaClient.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        status: true,
        gender: true,
        employmentType: true,
        hireDate: true,
        exitDate: true,
        locationId: true,
        department: { select: { name: true, code: true } },
        designation: { select: { name: true, code: true } },
        location: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: [{ employeeNumber: "asc" }],
    }),
    prismaClient.organizationLocation.findMany({
      where: {
        organizationId,
        isActive: true,
        type: "BRANCH",
        ...(scope.locationId ? { id: scope.locationId } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const currentEmployees = employees.filter((employee) =>
    CURRENT_STATUS_SET.has(String(employee.status || "").toUpperCase())
  );
  const exitedEmployees = employees.filter((employee) =>
    EXITED_STATUS_SET.has(String(employee.status || "").toUpperCase())
  );

  const byLocationId = new Map();
  for (const employee of currentEmployees) {
    const key = employee.locationId || "UNASSIGNED";
    const rows = byLocationId.get(key) || [];
    rows.push(employee);
    byLocationId.set(key, rows);
  }

  const branches = activeBranches.map((branch) => {
    const rows = byLocationId.get(branch.id) || [];
    return {
      locationId: branch.id,
      branch: branch.name,
      code: branch.code,
      currentWorkforce: rows.length,
      active: statusCount(rows, "ACTIVE"),
      probation: statusCount(rows, "PROBATION"),
      onLeave: statusCount(rows, "LEAVE"),
      suspended: statusCount(rows, "SUSPENDED"),
      male: rows.filter((employee) => employee.gender === "MALE").length,
      female: rows.filter((employee) => employee.gender === "FEMALE").length,
    };
  });

  const genderPending = currentEmployees.filter(
    (employee) => !employee.gender || employee.gender === "UNSPECIFIED"
  ).length;

  const summary = {
    currentWorkforce: currentEmployees.length,
    employeeRecords: employees.length,
    active: statusCount(currentEmployees, "ACTIVE"),
    probation: statusCount(currentEmployees, "PROBATION"),
    onLeave: statusCount(currentEmployees, "LEAVE"),
    suspended: statusCount(currentEmployees, "SUSPENDED"),
    exited: exitedEmployees.length,
    male: currentEmployees.filter((employee) => employee.gender === "MALE").length,
    female: currentEmployees.filter((employee) => employee.gender === "FEMALE").length,
    genderPending,
    unassignedLocation: currentEmployees.filter((employee) => !employee.locationId).length,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    scope,
    summary,
    headcount: buildHeadcount(currentEmployees),
    branches,
    employees: currentEmployees.map(mapEmployee),
    controls: {
      branchScoped: Boolean(scope.locationId),
      employeeRows: currentEmployees.length,
      exportContainsCurrentWorkforceOnly: true,
      financialDataIncluded: false,
    },
  };
}

module.exports = {
  getReportsRelease1,
  buildHeadcount,
  mapEmployee,
};
