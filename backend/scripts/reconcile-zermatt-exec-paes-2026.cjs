process.env.DOTENV_CONFIG_QUIET = "true";
require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");
const { buildProvisioningPreview } = require("../src/services/leaveEntitlementProvisioningService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const EMPLOYEE_NUMBER = "ZLL000087";
const DESIGNATION_CODE = "EXEC-PAES";
const POLICY_CODE = "ZLL-ANNUAL-FT";
const LEAVE_YEAR = 2026;
const EXPECTED_LEVEL = 7;
const EXPECTED_FROM_ENTITLEMENT = 30;
const EXPECTED_TO_ENTITLEMENT = 21;
const ACTOR_EMAIL = "corporatehr.crn@gmail.com";
const ACTOR_ROLE = "Head of HR & Admin";

function number(value) {
  return Number(value || 0);
}

function normalizeEmploymentType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function stableRequests(requests) {
  return requests.map((request) => ({
    id: request.id,
    status: request.status,
    requestedUnits: number(request.requestedUnits),
    startDate: request.startDate?.toISOString?.() || request.startDate || null,
    endDate: request.endDate?.toISOString?.() || request.endDate || null,
    updatedAt: request.updatedAt?.toISOString?.() || request.updatedAt || null,
  }));
}

function assertEqual(actual, expected, code, details = {}) {
  if (actual !== expected) {
    const error = new Error(code);
    error.details = { expected, actual, ...details };
    throw error;
  }
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      email: ACTOR_EMAIL,
      isActive: true,
      userRoles: {
        some: {
          role: {
            name: ACTOR_ROLE,
          },
        },
      },
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!actor) throw new Error("ZERMATT_CHRIS_ADMINISTRATOR_REQUIRED");

  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { organizationId: organization.id, employeeNumber: EMPLOYEE_NUMBER },
      include: { designation: true },
    });
    if (!employee) throw new Error("ZERMATT_EXEC_PAES_EMPLOYEE_NOT_FOUND");
    assertEqual(employee.designation?.code, DESIGNATION_CODE, "ZERMATT_EXEC_PAES_DESIGNATION_REQUIRED");
    assertEqual(number(employee.designation?.careerLevel), EXPECTED_LEVEL, "ZERMATT_EXEC_PAES_LEVEL_REQUIRED");
    assertEqual(normalizeEmploymentType(employee.employmentType), "fulltime", "ZERMATT_EXEC_PAES_FULL_TIME_REQUIRED");

    const preview = await buildProvisioningPreview({
      organizationId: organization.id,
      leaveYear: LEAVE_YEAR,
      baselineOnly: false,
      rebaseExisting: true,
      tx,
    });
    const row = preview.rows.find((candidate) =>
      candidate.employeeNumber === EMPLOYEE_NUMBER && candidate.policyCode === POLICY_CODE
    );
    if (!row) throw new Error("ZERMATT_EXEC_PAES_ANNUAL_PREVIEW_ROW_REQUIRED");
    assertEqual(row.status, "REBASE_READY", "ZERMATT_EXEC_PAES_REBASE_READY_REQUIRED");
    assertEqual(number(row.proposedOpeningBalance), EXPECTED_TO_ENTITLEMENT, "ZERMATT_EXEC_PAES_TARGET_ENTITLEMENT_REQUIRED");
    assertEqual(number(row.retainedUsed), 0, "ZERMATT_EXEC_PAES_USED_LEAVE_REVIEW_REQUIRED");
    assertEqual(number(row.retainedPending), 0, "ZERMATT_EXEC_PAES_PENDING_LEAVE_REVIEW_REQUIRED");
    if ((row.exceptionCodes || []).length) {
      const error = new Error("ZERMATT_EXEC_PAES_PREVIEW_EXCEPTIONS_PRESENT");
      error.details = { exceptionCodes: row.exceptionCodes };
      throw error;
    }

    const policy = await tx.leavePolicy.findUnique({
      where: { organizationId_id: { organizationId: organization.id, id: row.policyId } },
      include: { leaveType: true },
    });
    if (!policy || policy.code !== POLICY_CODE) throw new Error("ZERMATT_EXEC_PAES_ANNUAL_POLICY_REQUIRED");

    const matrixRule = await tx.leaveEntitlementMatrixRule.findFirst({
      where: {
        organizationId: organization.id,
        leavePolicyId: policy.id,
        levelNumber: EXPECTED_LEVEL,
        isActive: true,
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!matrixRule) throw new Error("ZERMATT_EXEC_PAES_L7_MATRIX_RULE_REQUIRED");
    assertEqual(number(matrixRule.defaultEntitlement), EXPECTED_TO_ENTITLEMENT, "ZERMATT_EXEC_PAES_L7_MATRIX_ENTITLEMENT_REQUIRED");

    const balance = await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId: organization.id,
          employeeId: employee.id,
          leaveTypeId: policy.leaveTypeId,
          leaveYear: LEAVE_YEAR,
        },
      },
    });
    if (!balance) throw new Error("ZERMATT_EXEC_PAES_2026_ANNUAL_BALANCE_REQUIRED");

    const latestAllocation = await tx.leaveEntitlementAllocation.findFirst({
      where: {
        organizationId: organization.id,
        employeeId: employee.id,
        leavePolicyId: policy.id,
        leaveYear: LEAVE_YEAR,
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    });
    if (!latestAllocation) throw new Error("ZERMATT_EXEC_PAES_EXISTING_ALLOCATION_REQUIRED");

    const requestsBefore = stableRequests(await tx.leaveRequest.findMany({
      where: {
        organizationId: organization.id,
        employeeId: employee.id,
        leavePolicyId: policy.id,
      },
      select: {
        id: true,
        status: true,
        requestedUnits: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }));

    const currentState = {
      openingBalance: number(balance.openingBalance),
      accrued: number(balance.accrued),
      carriedForward: number(balance.carriedForward),
      used: number(balance.used),
      adjusted: number(balance.adjusted),
      allocationLevel: number(latestAllocation.levelNumber),
      allocationBase: number(latestAllocation.baseEntitlement),
      allocatedEntitlement: number(latestAllocation.allocatedEntitlement),
    };

    const alreadyApplied =
      currentState.openingBalance === EXPECTED_TO_ENTITLEMENT &&
      currentState.allocationLevel === EXPECTED_LEVEL &&
      currentState.allocationBase === EXPECTED_TO_ENTITLEMENT &&
      currentState.allocatedEntitlement === EXPECTED_TO_ENTITLEMENT;

    if (alreadyApplied) {
      return {
        mode: "ALREADY_APPLIED",
        employeeNumber: EMPLOYEE_NUMBER,
        careerLevel: EXPECTED_LEVEL,
        annualEntitlement: EXPECTED_TO_ENTITLEMENT,
        balanceId: balance.id,
        allocationId: latestAllocation.id,
        requestsPreserved: true,
      };
    }

    assertEqual(currentState.openingBalance, EXPECTED_FROM_ENTITLEMENT, "ZERMATT_EXEC_PAES_SOURCE_ENTITLEMENT_REQUIRED", currentState);
    assertEqual(currentState.accrued, 0, "ZERMATT_EXEC_PAES_ACCRUAL_REVIEW_REQUIRED", currentState);
    assertEqual(currentState.carriedForward, 0, "ZERMATT_EXEC_PAES_CARRYOVER_REVIEW_REQUIRED", currentState);
    assertEqual(currentState.used, 0, "ZERMATT_EXEC_PAES_USED_BALANCE_REVIEW_REQUIRED", currentState);
    assertEqual(currentState.adjusted, 0, "ZERMATT_EXEC_PAES_ADJUSTMENT_REVIEW_REQUIRED", currentState);
    assertEqual(currentState.allocationLevel, 11, "ZERMATT_EXEC_PAES_SOURCE_ALLOCATION_LEVEL_REQUIRED", currentState);
    assertEqual(currentState.allocationBase, EXPECTED_FROM_ENTITLEMENT, "ZERMATT_EXEC_PAES_SOURCE_ALLOCATION_BASE_REQUIRED", currentState);
    assertEqual(currentState.allocatedEntitlement, EXPECTED_FROM_ENTITLEMENT, "ZERMATT_EXEC_PAES_SOURCE_ALLOCATION_REQUIRED", currentState);

    const updatedBalance = await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { openingBalance: EXPECTED_TO_ENTITLEMENT },
    });

    const allocation = await tx.leaveEntitlementAllocation.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        leaveBalanceId: balance.id,
        leavePolicyId: policy.id,
        leaveTypeId: policy.leaveTypeId,
        levelNumber: EXPECTED_LEVEL,
        leaveYear: LEAVE_YEAR,
        baseEntitlement: EXPECTED_TO_ENTITLEMENT,
        allocatedEntitlement: EXPECTED_TO_ENTITLEMENT,
        method: "BASELINE_REPROVISION",
        effectiveDate: new Date(),
        reason: "ZERMATT 2026 annual entitlement rebase after EXEC-PAES employment-level correction from L11 to L7; historical allocation preserved.",
        createdByUserId: actor.id,
      },
    });

    await tx.organizationAudit.create({
      data: {
        organizationId: organization.id,
        actorUserId: actor.id,
        entityType: "LeaveBalance",
        entityId: balance.id,
        action: "ZERMATT_EXEC_PAES_2026_ANNUAL_ENTITLEMENT_REBASED",
        previousValue: {
          employeeNumber: EMPLOYEE_NUMBER,
          designationCode: DESIGNATION_CODE,
          careerLevel: 11,
          openingBalance: EXPECTED_FROM_ENTITLEMENT,
          allocationId: latestAllocation.id,
        },
        newValue: {
          employeeNumber: EMPLOYEE_NUMBER,
          designationCode: DESIGNATION_CODE,
          careerLevel: EXPECTED_LEVEL,
          openingBalance: EXPECTED_TO_ENTITLEMENT,
          allocationId: allocation.id,
        },
        reason: "Correct 2026 ZERMATT annual leave entitlement after authoritative designation reorganization; no used or pending leave and historical allocation retained.",
      },
    });

    assertEqual(number(updatedBalance.openingBalance), EXPECTED_TO_ENTITLEMENT, "ZERMATT_EXEC_PAES_POST_BALANCE_FAILED");
    assertEqual(number(updatedBalance.accrued), currentState.accrued, "ZERMATT_EXEC_PAES_POST_ACCRUAL_CHANGED");
    assertEqual(number(updatedBalance.carriedForward), currentState.carriedForward, "ZERMATT_EXEC_PAES_POST_CARRYOVER_CHANGED");
    assertEqual(number(updatedBalance.used), currentState.used, "ZERMATT_EXEC_PAES_POST_USED_CHANGED");
    assertEqual(number(updatedBalance.adjusted), currentState.adjusted, "ZERMATT_EXEC_PAES_POST_ADJUSTED_CHANGED");

    const employeeAfter = await tx.employee.findUnique({
      where: { id: employee.id },
      include: { designation: true },
    });
    assertEqual(employeeAfter?.designationId, employee.designationId, "ZERMATT_EXEC_PAES_EMPLOYEE_DESIGNATION_CHANGED");
    assertEqual(number(employeeAfter?.designation?.careerLevel), EXPECTED_LEVEL, "ZERMATT_EXEC_PAES_POST_LEVEL_CHANGED");

    const requestsAfter = stableRequests(await tx.leaveRequest.findMany({
      where: {
        organizationId: organization.id,
        employeeId: employee.id,
        leavePolicyId: policy.id,
      },
      select: {
        id: true,
        status: true,
        requestedUnits: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }));
    assertEqual(JSON.stringify(requestsAfter), JSON.stringify(requestsBefore), "ZERMATT_EXEC_PAES_LEAVE_REQUESTS_CHANGED");

    return {
      mode: "APPLIED",
      employeeNumber: EMPLOYEE_NUMBER,
      employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
      designation: employee.designation?.name,
      designationCode: employee.designation?.code,
      careerLevel: EXPECTED_LEVEL,
      annualPolicy: policy.code,
      leaveYear: LEAVE_YEAR,
      beforeOpeningBalance: EXPECTED_FROM_ENTITLEMENT,
      afterOpeningBalance: EXPECTED_TO_ENTITLEMENT,
      usedPreserved: currentState.used,
      pendingPreserved: number(row.retainedPending),
      previousAllocationId: latestAllocation.id,
      newAllocationId: allocation.id,
      newAllocationMethod: allocation.method,
      employeeDesignationRelationshipPreserved: true,
      leaveRequestsPreserved: true,
    };
  }, {
    isolationLevel: "Serializable",
    maxWait: 10000,
    timeout: 30000,
  });

  console.log(JSON.stringify({
    organization: organization.name,
    actor: {
      id: actor.id,
      email: actor.email,
      role: ACTOR_ROLE,
    },
    ...result,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    if (error?.details) console.error("Details:", JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  }).finally(async () => prisma.$disconnect());
}

module.exports = { main };
