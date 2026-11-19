const prisma = require("../config/prisma");
const { resolveEffectiveEmploymentLevel } = require("./employeeEmploymentLevelAssignmentService");
const isExpatriate = (value) => /EXPAT(RIATE)?/i.test(String(value || ""));
async function resolveZermattOfferTerms({ organizationId, employeeNumber, asOf = new Date(), prismaClient = prisma }) {
  const effective = await resolveEffectiveEmploymentLevel(prismaClient, { organizationId, employeeNumber, asOf });
  const employee = effective.employee;
  const year = new Date(asOf).getUTCFullYear();
  const annualType = await prismaClient.leaveType.findUnique({
    where: { organizationId_code: { organizationId, code: "ANNUAL" } },
    select: { id: true },
  });
  if (!annualType) throw new Error("AUTHORITATIVE_ANNUAL_LEAVE_TYPE_MISSING");
  const allocation = await prismaClient.leaveEntitlementAllocation.findFirst({
    where: { organizationId, employeeId: employee.id, leaveYear: year, leaveTypeId: annualType.id },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
  const matrix = await prismaClient.leaveEntitlementMatrixRule.findFirst({
    where: {
      organizationId, leaveTypeId: annualType.id, levelNumber: effective.levelNumber,
      isActive: true, effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const expatriate = isExpatriate(employee.employmentType);
  const leaveDays = expatriate ? 45 : allocation ? Number(allocation.baseEntitlement) : matrix ? Number(matrix.defaultEntitlement) : null;
  const leaveUnit = matrix?.unit || "CALENDAR_DAYS";
  if (leaveDays == null || !Number.isFinite(leaveDays)) throw new Error("AUTHORITATIVE_ANNUAL_LEAVE_ENTITLEMENT_MISSING");
  return {
    employeeNumber: employee.employeeNumber,
    hireDate: employee.hireDate ? new Date(employee.hireDate).toISOString().slice(0, 10) : null,
    employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
    employmentType: employee.employmentType,
    designation: employee.designation?.name || "",
    branch: employee.location?.name || "",
    employmentLevel: effective.employmentLevel?.code || "",
    annualLeaveDays: leaveDays,
    annualLeaveUnit: leaveUnit,
    annualLeaveSource: expatriate ? "EXPATRIATE_POLICY_EXCEPTION" : allocation ? "EMPLOYEE_APPROVED_ENTITLEMENT" : "EFFECTIVE_LEVEL_POLICY_MATRIX",
    yearEndBonusEligible: !expatriate,
    yearEndBonusClause: expatriate
      ? "Expatriates are not eligible for the Zermatt Year-End Bonus."
      : "If approved by management, your Year-End Bonus shall be Basic Salary plus 50% of End-of-Month Gross for a full January–December service year, prorated by eligible months worked in the calendar year.",
  };
}
module.exports = { resolveZermattOfferTerms };
