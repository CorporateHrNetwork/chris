require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");
const employmentLevelService = require("../src/services/employeeEmploymentLevelAssignmentService");
const {
  synchronizeZermattEmployeeLevelLive,
} = require("../src/services/zermattEmployeeLevelLiveService");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const ADMIN_EMAIL = "corporatehr.crn@gmail.com";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const ROLLBACK_SENTINEL = "CHRIS_ROLLBACK_LIVE_LEVEL_ACCEPTANCE";

function normalizedEmploymentType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function annualEligible(value) {
  const normalized = normalizedEmploymentType(value);
  return normalized === "fulltime" || normalized === "expatriate";
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT must remain ACTIVE.");

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      email: ADMIN_EMAIL,
      isActive: true,
    },
    select: { id: true, email: true },
  });
  assert.ok(actor, "Active ZERMATT CHRIS Administrator account was not found.");

  const levels = await prisma.organizationEmploymentLevel.findMany({
    where: {
      organizationId: organization.id,
      levelNumber: { in: [101, 102, 103, 104, 105, 106, 107] },
      isActive: true,
    },
    orderBy: { displayOrder: "asc" },
  });
  assert.equal(levels.length, 7, "All seven ZERMATT V2 Employment Levels must be active for this verifier.");

  const annualType = await prisma.leaveType.findFirst({
    where: { organizationId: organization.id, code: "ANNUAL", isActive: true },
    select: { id: true },
  });
  assert.ok(annualType, "ZERMATT Annual Leave type was not found.");

  const candidates = await prisma.employee.findMany({
    where: {
      organizationId: organization.id,
      status: { in: CURRENT_STATUSES },
      exitDate: null,
      employmentLevelAssignments: { none: { effectiveTo: null } },
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      employmentType: true,
      designation: {
        select: {
          id: true,
          code: true,
          name: true,
          careerLevel: true,
          employmentLevel: true,
        },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  let candidate = null;
  let originalBalance = null;
  for (const employee of candidates) {
    if (!annualEligible(employee.employmentType)) continue;
    if (!employee.designation?.employmentLevel?.isActive) continue;
    if (![101, 102, 103, 104, 105, 106, 107].includes(Number(employee.designation.careerLevel))) continue;
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId: organization.id,
          employeeId: employee.id,
          leaveTypeId: annualType.id,
          leaveYear: new Date().getFullYear(),
        },
      },
    });
    if (!balance || Number(balance.used || 0) !== 0) continue;
    candidate = employee;
    originalBalance = balance;
    break;
  }
  assert.ok(candidate, "No safe zero-used Annual Leave employee was found for rollback-only verification.");

  const originalState = await employmentLevelService.getEmploymentLevelState(prisma, {
    organizationId: organization.id,
    employeeNumber: candidate.employeeNumber,
  });
  const originalLevelNumber = Number(originalState.effective.levelNumber);
  const targetLevel = levels.find((level) => Number(level.levelNumber) !== originalLevelNumber);
  assert.ok(targetLevel, "A different active ZERMATT V2 Employment Level was not available.");

  const auditCountBefore = await prisma.organizationAudit.count({
    where: {
      organizationId: organization.id,
      entityType: "Employee",
      entityId: candidate.id,
      action: "ZERMATT_EMPLOYEE_EMPLOYMENT_LEVEL_LIVE_ACTIVATED",
    },
  });
  const overrideCountBefore = await prisma.employeeEmploymentLevelAssignment.count({
    where: { organizationId: organization.id, employeeId: candidate.id },
  });

  let transactionEvidence = null;
  try {
    await prisma.$transaction(async (tx) => {
      const state = await employmentLevelService.applyEmploymentLevelOverride(tx, {
        organizationId: organization.id,
        employeeNumber: candidate.employeeNumber,
        levelNumber: targetLevel.levelNumber,
        effectiveFrom: new Date(),
        reason: "Rollback-only CHRiS live Employment Level acceptance verification",
        notes: "This transaction is intentionally rolled back and must not persist.",
        performedByUserId: actor.id,
      });
      assert.equal(
        Number(state.effective.levelNumber),
        Number(targetLevel.levelNumber),
        "Employee override did not become effective inside the transaction."
      );
      assert.equal(state.effective.source, "EMPLOYEE_OVERRIDE", "Employee override source was not live.");

      const live = await synchronizeZermattEmployeeLevelLive(tx, {
        organizationId: organization.id,
        employeeNumber: candidate.employeeNumber,
        actorUserId: actor.id,
        leaveYear: new Date().getFullYear(),
        previousEffective: {
          source: originalState.effective.source,
          levelNumber: originalState.effective.levelNumber,
          code: originalState.effective.code,
          name: originalState.effective.name,
        },
        reason: "Rollback-only CHRiS live Employment Level acceptance verification",
      });
      assert.equal(live.applied, true, "ZERMATT live synchronizer did not activate.");
      assert.equal(Number(live.employmentLevel.levelNumber), Number(targetLevel.levelNumber));
      assert.equal(live.annualLeave?.eligible, true, "Selected acceptance employee should be Annual Leave eligible.");

      const insideBalance = await tx.leaveBalance.findUnique({
        where: {
          organizationId_employeeId_leaveTypeId_leaveYear: {
            organizationId: organization.id,
            employeeId: candidate.id,
            leaveTypeId: annualType.id,
            leaveYear: new Date().getFullYear(),
          },
        },
      });
      assert.equal(
        Number(insideBalance.openingBalance),
        Number(live.annualLeave.openingBalance),
        "Annual Leave balance did not change with the live Employment Level."
      );

      transactionEvidence = {
        employeeNumber: candidate.employeeNumber,
        employeeName: [candidate.firstName, candidate.middleName, candidate.lastName]
          .filter(Boolean)
          .join(" "),
        originalLevel: originalState.effective.code,
        testLevel: targetLevel.code,
        originalAnnualLeave: Number(originalBalance.openingBalance),
        testAnnualLeave: Number(live.annualLeave.openingBalance),
        liveSource: live.employmentLevel.source,
      };

      throw new Error(ROLLBACK_SENTINEL);
    });
  } catch (error) {
    if (error.message !== ROLLBACK_SENTINEL) throw error;
  }

  const [stateAfter, balanceAfter, auditCountAfter, overrideCountAfter] = await Promise.all([
    employmentLevelService.getEmploymentLevelState(prisma, {
      organizationId: organization.id,
      employeeNumber: candidate.employeeNumber,
    }),
    prisma.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId: organization.id,
          employeeId: candidate.id,
          leaveTypeId: annualType.id,
          leaveYear: new Date().getFullYear(),
        },
      },
    }),
    prisma.organizationAudit.count({
      where: {
        organizationId: organization.id,
        entityType: "Employee",
        entityId: candidate.id,
        action: "ZERMATT_EMPLOYEE_EMPLOYMENT_LEVEL_LIVE_ACTIVATED",
      },
    }),
    prisma.employeeEmploymentLevelAssignment.count({
      where: { organizationId: organization.id, employeeId: candidate.id },
    }),
  ]);

  assert.equal(Number(stateAfter.effective.levelNumber), originalLevelNumber, "Rollback did not restore original effective Employment Level.");
  assert.equal(Number(balanceAfter.openingBalance), Number(originalBalance.openingBalance), "Rollback did not restore original Annual Leave balance.");
  assert.equal(auditCountAfter, auditCountBefore, "Rollback-only verifier persisted an audit record.");
  assert.equal(overrideCountAfter, overrideCountBefore, "Rollback-only verifier persisted an Employment Level assignment.");

  console.log("\n============================================================");
  console.log("ZERMATT EMPLOYMENT LEVEL — LIVE ACTIVATION VERIFICATION");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "TRANSACTIONAL_ROLLBACK_ACCEPTANCE",
    organization: organization.name,
    actor: actor.email,
    evidence: transactionEvidence,
    rollbackVerified: true,
    databaseWritesPersisted: 0,
  }, null, 2));
  console.log("PASS: ZERMATT employee Employment Level live activation works and rollback left the database unchanged.");
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
