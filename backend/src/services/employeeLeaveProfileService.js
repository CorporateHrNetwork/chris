const prisma = require("../config/prisma");
const { getEntitlementRegister } = require("./leaveOperationalService");
const { listEntitlementAdjustments } = require("./leaveEntitlementAdjustmentService");
const { provisionZermattEmployeeLeaveProfile, ZERMATT_SLUG } = require("./zermattLeaveEntitlementService");

async function getEmployeeLeaveProfile({ organizationId, employeeNumber, asOfDate = new Date(), selectedPolicyId = null, actorUserId = null }) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");

  // ZERMATT requirement: selecting a current employee for Leave Profile is an
  // entitlement-safe provisioning point. Full-Time employees receive the
  // configured policy/year entitlements automatically; non-Full-Time employees
  // still receive a Leave Profile but are not granted Full-Time entitlements.
  if (organization.slug === ZERMATT_SLUG) {
    await provisionZermattEmployeeLeaveProfile({
      organizationId,
      employeeNumber,
      actorUserId,
      leaveYear: new Date(asOfDate).getFullYear(),
    });
  }

  const employee = await prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      gender: true,
      employmentType: true,
      status: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true, careerLevel: true } },
      location: { select: { id: true, name: true, code: true } },
    },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  const now = new Date(asOfDate);
  const [entitlementRows, requests, adjustments, activePolicies] = await Promise.all([
    getEntitlementRegister({ organizationId, asOfDate: now, employeeNumber }),
    prisma.leaveRequest.findMany({
      where: { organizationId, employeeId: employee.id },
      include: { leaveType: true, leavePolicy: true },
      orderBy: [{ startDate: "desc" }, { submittedAt: "desc" }],
    }),
    listEntitlementAdjustments({ organizationId, employeeNumber }),
    prisma.leavePolicy.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: { leaveType: true },
      orderBy: [{ leaveType: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  const activeLeave = requests.find((request) => request.status === "ACTIVE") || null;
  const nextUpcomingApprovedLeave = requests
    .filter((request) => request.status === "APPROVED" && new Date(request.startDate) >= now)
    .sort((left, right) => new Date(left.startDate) - new Date(right.startDate))[0] || null;
  const warnings = [];
  if (employee.status === "LEAVE" && !activeLeave) warnings.push("Leave data requires review: Employee is marked On Leave but no active commenced leave request exists.");
  if (employee.status !== "LEAVE" && activeLeave) warnings.push("An ACTIVE leave request exists while employee status is not Leave.");
  entitlementRows.forEach((row) => {
    if (Number(row.available) < 0) warnings.push(`${row.policyName} has a negative authoritative available balance.`);
  });

  const policyOptions = activePolicies.map((policy) => {
    const entitlement = entitlementRows.find((row) => row.policyId === policy.id) || null;
    const femaleOnly = Array.isArray(policy.eligibilityRules?.genders) && policy.eligibilityRules.genders.includes("FEMALE");
    const employmentTypes = Array.isArray(policy.eligibilityRules?.employmentTypes) ? policy.eligibilityRules.employmentTypes : [];
    const eligibleByGender = !femaleOnly || employee.gender === "FEMALE";
    const eligibleByEmploymentType = !employmentTypes.length || employmentTypes.includes(employee.employmentType);
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      leaveType: policy.leaveType?.name,
      unit: policy.entitlementRules?.unit || policy.leaveType?.unit || "DAYS",
      eligible: eligibleByGender && eligibleByEmploymentType,
      entitlement: entitlement?.entitlement ?? null,
      used: entitlement?.used ?? 0,
      committed: entitlement?.committed ?? 0,
      available: entitlement?.available ?? null,
      maximumRequestable: entitlement?.maximumRequestable ?? null,
      nextLeaveDate: nextUpcomingApprovedLeave?.leavePolicyId === policy.id
        ? nextUpcomingApprovedLeave.startDate
        : null,
    };
  });

  const selectedPolicy = selectedPolicyId
    ? policyOptions.find((policy) => policy.id === selectedPolicyId) || null
    : policyOptions.find((policy) => policy.entitlement !== null) || policyOptions[0] || null;

  return {
    employee,
    policyOptions,
    selectedPolicy,
    assignedPolicies: entitlementRows.map((row) => ({
      id: row.policyId,
      name: row.policyName,
      versionNumber: row.policyVersion,
      leaveType: row.leaveType,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    })),
    entitlements: entitlementRows,
    balances: entitlementRows.map((row) => ({
      policyId: row.policyId,
      policyName: row.policyName,
      leaveYear: row.leaveYear,
      entitlement: row.entitlement,
      carryover: row.carryover,
      used: row.used,
      committed: row.committed,
      available: row.available,
      maximumRequestable: row.maximumRequestable,
      adjustment: row.adjustments,
      unit: row.unit,
      nextLeaveDate: nextUpcomingApprovedLeave?.leavePolicyId === row.policyId ? nextUpcomingApprovedLeave.startDate : null,
    })),
    utilizationHistory: requests,
    adjustmentHistory: adjustments,
    activeLeave,
    nextUpcomingApprovedLeave,
    exceptionWarnings: warnings,
    balanceDefinitions: {
      entitlement: "Policy/year entitlement.",
      used: "Already consumed through approved lifecycle semantics.",
      committed: "Pending requests only.",
      available: "Authoritative available balance less committed pending requests.",
      maximumRequestable: "Maximum units currently requestable under balance and policy controls.",
      nextLeaveDate: "Next approved future leave start date for the selected policy, when one exists.",
      adjustment: "Signed audited entitlement/balance adjustment.",
    },
  };
}

module.exports = { getEmployeeLeaveProfile };
