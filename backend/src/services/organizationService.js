const prisma = require("../config/prisma");

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const PROFILE_FIELDS = ["name", "legalName", "code", "registrationNumber", "taxNumber", "industry", "organizationType", "website", "logoUrl", "email", "phone", "country", "timezone", "currency"];

const text = (value) => String(value ?? "").trim() || null;
const snapshot = (value) => JSON.parse(JSON.stringify(value));
function date(value, required = false) {
  if (!value && !required) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_EFFECTIVE_DATE");
  return parsed;
}
function assertInterval(from, to) {
  if (to && to < from) throw new Error("INVALID_EFFECTIVE_INTERVAL");
}
async function audit(tx, { organizationId, actorUserId, entityType, entityId, action, previousValue, newValue, reason }) {
  return tx.organizationAudit.create({ data: { organizationId, actorUserId: actorUserId || null, entityType, entityId, action, previousValue, newValue, reason: text(reason) } });
}

async function getOrganizationProfile({ organizationId, tx = prisma }) {
  const organization = await tx.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const headOffice = await tx.organizationLocation.findFirst({
    where: { organizationId, type: "HEAD_OFFICE" },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return { organization, headOffice };
}

async function updateOrganizationProfile({ organizationId, actorUserId, input }) {
  return prisma.$transaction(async (tx) => {
    const before = await getOrganizationProfile({ organizationId, tx });
    const data = {};
    for (const field of PROFILE_FIELDS) if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = text(input[field]);
    if (!data.name) data.name = before.organization.name;
    if (!data.timezone) data.timezone = before.organization.timezone;
    if (!data.currency) data.currency = before.organization.currency;
    const organization = await tx.organization.update({ where: { id: organizationId }, data });
    const address = input.headOffice || {};
    let headOffice = before.headOffice;
    if (Object.keys(address).length) {
      const locationData = {
        name: text(address.name) || `${organization.name} Head Office`, code: text(address.code) || "HEAD-OFFICE",
        type: "HEAD_OFFICE", addressLine1: text(address.addressLine1), addressLine2: text(address.addressLine2),
        city: text(address.city), state: text(address.state), country: text(address.country) || organization.country,
        phone: text(address.phone) || organization.phone, email: text(address.email) || organization.email, isActive: true,
      };
      headOffice = headOffice
        ? await tx.organizationLocation.update({ where: { id: headOffice.id }, data: locationData })
        : await tx.organizationLocation.create({ data: { organizationId, ...locationData } });
    }
    await audit(tx, {
      organizationId, actorUserId, entityType: "ORGANIZATION", entityId: organizationId,
      action: "PROFILE_UPDATED", previousValue: snapshot(before), newValue: snapshot({ organization, headOffice }), reason: input.reason,
    });
    return { organization, headOffice };
  });
}

async function getOrganizationChart({ organizationId }) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId }, select: { id: true, name: true, legalName: true, code: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const departments = await prisma.department.findMany({
    where: { organizationId, isActive: true },
    include: {
      designations: {
        where: { isActive: true },
        include: {
          employmentLevel: true, reportsToDesignation: { select: { id: true, name: true } },
          employees: { where: { status: { in: CURRENT_EMPLOYEE_STATUSES } }, include: { location: true, lineManagerAssignments: { where: { effectiveTo: null }, take: 1, include: { manager: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true } } } } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] },
        },
        orderBy: [{ careerLevel: "desc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
  const unassignedEmployees = await prisma.employee.findMany({
    where: { organizationId, status: { in: CURRENT_EMPLOYEE_STATUSES }, OR: [{ departmentId: null }, { designationId: null }] },
    include: { department: true, designation: { include: { employmentLevel: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  return { organization, departments, unassignedEmployees };
}

async function getReportingLines({ organizationId }) {
  const employees = await prisma.employee.findMany({
    where: { organizationId, status: { in: CURRENT_EMPLOYEE_STATUSES } },
    include: { department: true, designation: { include: { employmentLevel: true } }, location: true },
    orderBy: { employeeNumber: "asc" },
  });
  const assignments = await prisma.employeeLineManagerAssignment.findMany({
    where: { organizationId, effectiveTo: null },
    include: {
      manager: { include: { department: true, designation: { include: { employmentLevel: true } } } },
      employee: { select: { id: true, employeeNumber: true } },
    },
  });
  const managerByEmployee = new Map(assignments.map((assignment) => [assignment.employeeId, assignment]));
  return employees.map((employee) => ({ ...employee, currentManagerAssignment: managerByEmployee.get(employee.id) || null }));
}

async function listCostCentres({ organizationId }) {
  return prisma.costCentre.findMany({
    where: { organizationId }, include: { departments: { orderBy: { name: "asc" } }, employees: { include: { department: true, designation: true }, orderBy: { employeeNumber: "asc" } } },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
}

async function getCostCentreAssignmentOptions({ organizationId }) {
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, code: true, costCentreId: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { organizationId, status: { in: CURRENT_EMPLOYEE_STATUSES } }, select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, costCentreId: true, department: { select: { id: true, name: true, costCentreId: true } }, designation: { select: { id: true, name: true } } }, orderBy: { employeeNumber: "asc" } }),
  ]);
  return { departments, employees };
}

async function saveCostCentre({ organizationId, actorUserId, costCentreId, input }) {
  const code = String(input.code || "").trim().toUpperCase();
  const name = text(input.name);
  if (!code || !name) throw new Error("COST_CENTRE_CODE_AND_NAME_REQUIRED");
  const effectiveFrom = date(input.effectiveFrom, true);
  const effectiveTo = date(input.effectiveTo);
  assertInterval(effectiveFrom, effectiveTo);
  if (!['ACTIVE', 'INACTIVE'].includes(input.status || 'ACTIVE')) throw new Error("INVALID_COST_CENTRE_STATUS");
  return prisma.$transaction(async (tx) => {
    const before = costCentreId ? await tx.costCentre.findFirst({ where: { id: costCentreId, organizationId }, include: { departments: true, employees: true } }) : null;
    if (costCentreId && !before) throw new Error("COST_CENTRE_NOT_FOUND");
    const duplicate = await tx.costCentre.findFirst({ where: { organizationId, code, ...(costCentreId ? { id: { not: costCentreId } } : {}) } });
    if (duplicate) throw new Error("COST_CENTRE_CODE_EXISTS");
    if ((input.status || "ACTIVE") === "INACTIVE") {
      const oldDepartments = new Set((before?.departments || []).map((item) => item.id));
      const oldEmployees = new Set((before?.employees || []).map((item) => item.id));
      if ((input.departmentIds || []).some((id) => !oldDepartments.has(id)) || (input.employeeIds || []).some((id) => !oldEmployees.has(id))) throw new Error("INACTIVE_COST_CENTRE_CANNOT_RECEIVE_ASSIGNMENTS");
    }
    const data = { organizationId, code, name, description: text(input.description), status: input.status || "ACTIVE", effectiveFrom, effectiveTo };
    const costCentre = before
      ? await tx.costCentre.update({ where: { id: before.id }, data })
      : await tx.costCentre.create({ data });
    if (Array.isArray(input.departmentIds)) {
      await tx.department.updateMany({ where: { organizationId, costCentreId: costCentre.id, id: { notIn: input.departmentIds } }, data: { costCentreId: null } });
      if (input.departmentIds.length) await tx.department.updateMany({ where: { organizationId, id: { in: input.departmentIds } }, data: { costCentreId: costCentre.id } });
    }
    if (Array.isArray(input.employeeIds)) {
      await tx.employee.updateMany({ where: { organizationId, costCentreId: costCentre.id, id: { notIn: input.employeeIds } }, data: { costCentreId: null } });
      if (input.employeeIds.length) await tx.employee.updateMany({ where: { organizationId, id: { in: input.employeeIds } }, data: { costCentreId: costCentre.id } });
    }
    const after = await tx.costCentre.findUnique({ where: { id: costCentre.id }, include: { departments: true, employees: true } });
    await audit(tx, {
      organizationId, actorUserId, entityType: "COST_CENTRE", entityId: costCentre.id,
      action: before ? "UPDATED" : "CREATED", previousValue: before ? snapshot(before) : null,
      newValue: snapshot(after), reason: input.reason,
    });
    return after;
  });
}

async function listOrganizationAudits({ organizationId, entityType, entityId }) {
  return prisma.organizationAudit.findMany({
    where: { organizationId, ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
    include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" }, take: 200,
  });
}

module.exports = { getOrganizationProfile, updateOrganizationProfile, getOrganizationChart, getReportingLines, listCostCentres, getCostCentreAssignmentOptions, saveCostCentre, listOrganizationAudits };
