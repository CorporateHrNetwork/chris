require("dotenv").config();
const prisma = require("../src/config/prisma");
const {
  ZERMATT_EMPLOYMENT_LEVELS_V3,
  ZERMATT_V3_DESIGNATION_LEVELS,
  resolveZermattV3DesignationLevel,
  resolveZermattV3Level,
} = require("../src/config/zermattEmploymentLevelsV3");
const {
  POLICY_DEFINITIONS,
  configureZermattLeavePolicies,
  provisionAllCurrentFullTimeEmployees,
} = require("../src/services/zermattLeaveEntitlementService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const V2_MIN = 101;
const V2_MAX = 107;
const V3_MIN = 201;
const V3_MAX = 207;

function parseArgs() {
  const leaveYearArg = process.argv.find((arg) => arg.startsWith("--leave-year="));
  return {
    apply: process.argv.includes("--apply"),
    leaveYear: leaveYearArg ? Number(leaveYearArg.split("=")[1]) : 2026,
  };
}

async function resolveOrganizationAndActor({ requireActor = false } = {}) {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const requestedActorEmail = String(process.env.ZERMATT_V3_ACTOR_EMAIL || "")
    .trim()
    .toLowerCase();

  if (!requireActor) {
    return { organization, actor: null };
  }

  if (!requestedActorEmail) {
    throw new Error("ZERMATT_V3_ACTOR_EMAIL_REQUIRED");
  }

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      isActive: true,
      email: requestedActorEmail,
    },
    select: { id: true, email: true },
  });

  if (!actor) {
    throw new Error("ZERMATT_V3_ACTOR_NOT_FOUND");
  }

  return { organization, actor };
}

function hierarchySummary() {
  return ZERMATT_EMPLOYMENT_LEVELS_V3.map((level) => ({
    level: level.code,
    employmentLevel: level.name,
    roles: level.roleScope,
    annualLeave: `${level.annualLeaveDays} working days`,
  }));
}

async function inspectState(organizationId) {
  const [levels, designations, activeOverrides, currentEmployees] = await Promise.all([
    prisma.organizationEmploymentLevel.findMany({
      where: { organizationId },
      orderBy: { levelNumber: "asc" },
    }),
    prisma.designation.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true, careerLevel: true },
      orderBy: { code: "asc" },
    }),
    prisma.employeeEmploymentLevelAssignment.findMany({
      where: { organizationId, effectiveTo: null },
      select: { id: true, employeeId: true, levelNumber: true, effectiveFrom: true },
    }),
    prisma.employee.count({
      where: {
        organizationId,
        status: { in: ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"] },
      },
    }),
  ]);

  return {
    levels,
    designations,
    activeOverrides,
    currentEmployees,
    v2Levels: levels.filter((level) => level.levelNumber >= V2_MIN && level.levelNumber <= V2_MAX),
    v3Levels: levels.filter((level) => level.levelNumber >= V3_MIN && level.levelNumber <= V3_MAX),
  };
}

function assertDesignationCoverage(designations) {
  const missing = designations.filter(
    (designation) => !resolveZermattV3DesignationLevel(designation)
  );
  if (missing.length) {
    const error = new Error("ZERMATT_V3_DESIGNATION_MAPPING_REQUIRED");
    error.details = missing.map((item) => ({
      code: item.code,
      name: item.name,
      careerLevel: item.careerLevel,
    }));
    throw error;
  }
}

async function createV3PolicyVersions({ organizationId, actorUserId, activationDate, tx }) {
  const changes = [];
  for (const definition of POLICY_DEFINITIONS) {
    const latest = await tx.leavePolicy.findFirst({
      where: { organizationId, code: definition.policyCode },
      orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
    });
    if (!latest) throw new Error(`ZERMATT_POLICY_REQUIRED:${definition.policyCode}`);

    if (latest.entitlementRules?.hierarchyVersion === "V3") {
      changes.push({
        policyCode: definition.policyCode,
        mode: "ALREADY_V3",
        policyId: latest.id,
        versionNumber: latest.versionNumber,
      });
      continue;
    }

    const previousEffectiveTo = new Date(activationDate.getTime() - 1);
    await tx.leavePolicy.update({
      where: { id: latest.id },
      data: {
        status: "RETIRED",
        isActive: false,
        effectiveTo: previousEffectiveTo,
        changeReason: "Superseded by approved ZERMATT Employment Level Hierarchy V3.",
      },
    });

    const { id, createdAt, updatedAt, ...clone } = latest;
    const created = await tx.leavePolicy.create({
      data: {
        ...clone,
        versionGroupId: latest.versionGroupId || latest.id,
        versionNumber: Number(latest.versionNumber || 0) + 1,
        changeReason: "Approved ZERMATT Employment Level Hierarchy V3 activation.",
        eligibilityRules:
          definition.key === "ANNUAL"
            ? {
                ...(latest.eligibilityRules || {}),
                requiredForAll: false,
                employmentTypes: ["Full-Time", "Expatriate"],
              }
            : latest.eligibilityRules,
        entitlementRules: {
          ...(latest.entitlementRules || {}),
          unit: "WORKING_DAYS",
          allocationBasis: "EMPLOYMENT_LEVEL",
          hierarchyVersion: "V3",
        },
        status: "ACTIVE",
        isActive: true,
        effectiveFrom: activationDate,
        effectiveTo: null,
        createdByUserId: actorUserId,
        approvedByUserId: actorUserId,
        approvedAt: activationDate,
      },
    });

    changes.push({
      policyCode: definition.policyCode,
      mode: "VERSION_CREATED",
      previousPolicyId: latest.id,
      previousVersionNumber: latest.versionNumber,
      policyId: created.id,
      versionNumber: created.versionNumber,
    });
  }
  return changes;
}

async function applyV3({ organization, actor, leaveYear }) {
  const activationDate = new Date();

  return prisma.$transaction(
    async (tx) => {
      const sourceLevels = await tx.organizationEmploymentLevel.findMany({
        where: {
          organizationId: organization.id,
          levelNumber: { gte: V2_MIN, lte: V2_MAX },
        },
        orderBy: { levelNumber: "asc" },
      });
      if (sourceLevels.length !== 7) {
        throw new Error(`ZERMATT_V2_LEVEL_COUNT_INVALID:${sourceLevels.length}`);
      }

      const liveDesignations = await tx.designation.findMany({
        where: { organizationId: organization.id },
        select: { id: true, code: true, name: true, careerLevel: true },
        orderBy: { code: "asc" },
      });
      assertDesignationCoverage(liveDesignations);

      const activeV3 = await tx.organizationEmploymentLevel.findMany({
        where: {
          organizationId: organization.id,
          levelNumber: { gte: V3_MIN, lte: V3_MAX },
          isActive: true,
        },
      });
      if (activeV3.length === 7) {
        return { mode: "ALREADY_APPLIED", activationDate: null };
      }

      for (const level of sourceLevels) {
        const publicNumber = level.levelNumber - 100;
        await tx.organizationEmploymentLevel.update({
          where: {
            organizationId_levelNumber: {
              organizationId: organization.id,
              levelNumber: level.levelNumber,
            },
          },
          data: {
            code: `V2_L${publicNumber}`,
            isActive: false,
            displayOrder: 2000 + publicNumber,
          },
        });
      }

      for (const level of ZERMATT_EMPLOYMENT_LEVELS_V3) {
        await tx.organizationEmploymentLevel.upsert({
          where: {
            organizationId_levelNumber: {
              organizationId: organization.id,
              levelNumber: level.levelNumber,
            },
          },
          update: {
            code: level.code,
            name: level.name,
            description: level.description,
            displayOrder: level.displayOrder,
            isActive: true,
          },
          create: {
            organizationId: organization.id,
            levelNumber: level.levelNumber,
            code: level.code,
            name: level.name,
            description: level.description,
            displayOrder: level.displayOrder,
            isActive: true,
          },
        });
      }

      const designationChanges = [];
      for (const designation of liveDesignations) {
        const mapped = resolveZermattV3DesignationLevel(designation);
        if (Number(designation.careerLevel) !== Number(mapped.levelNumber)) {
          await tx.designation.update({
            where: { id: designation.id },
            data: { careerLevel: mapped.levelNumber },
          });
          designationChanges.push({
            code: designation.code,
            name: designation.name,
            from: designation.careerLevel,
            to: mapped.levelNumber,
            publicLevel: mapped.levelCode,
            annualLeaveDays: mapped.annualLeaveDays,
          });
        }
      }

      const activeOverrides = await tx.employeeEmploymentLevelAssignment.findMany({
        where: {
          organizationId: organization.id,
          effectiveTo: null,
          levelNumber: { gte: V2_MIN, lte: V2_MAX },
        },
        orderBy: { createdAt: "asc" },
      });
      const overrideChanges = [];
      for (const assignment of activeOverrides) {
        const publicNumber = assignment.levelNumber - 100;
        const target = 200 + publicNumber;
        await tx.employeeEmploymentLevelAssignment.update({
          where: { id: assignment.id },
          data: { effectiveTo: activationDate },
        });
        const created = await tx.employeeEmploymentLevelAssignment.create({
          data: {
            organizationId: organization.id,
            employeeId: assignment.employeeId,
            levelNumber: target,
            effectiveFrom: activationDate,
            reason: "ZERMATT Employment Level V3 migration preserving active employee override level.",
            notes: assignment.notes,
            performedByUserId: actor.id,
          },
        });
        overrideChanges.push({
          employeeId: assignment.employeeId,
          from: assignment.levelNumber,
          to: target,
          newAssignmentId: created.id,
        });
      }

      const policyVersionChanges = await createV3PolicyVersions({
        organizationId: organization.id,
        actorUserId: actor.id,
        activationDate,
        tx,
      });

      const configured = await configureZermattLeavePolicies({
        organizationId: organization.id,
        actorUserId: actor.id,
        tx,
      });
      if (!configured.every((item) => item.hierarchyVersion === "V3")) {
        throw new Error("ZERMATT_V3_POLICY_CONFIGURATION_FAILED");
      }

      const leaveProvisioning = await provisionAllCurrentFullTimeEmployees({
        organizationId: organization.id,
        actorUserId: actor.id,
        leaveYear,
        tx,
      });

      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          entityType: "Organization",
          entityId: organization.id,
          action: "ZERMATT_EMPLOYMENT_LEVEL_V3_ACTIVATED",
          previousValue: {
            hierarchyVersion: "V2",
            publicLevels: 7,
          },
          newValue: {
            hierarchyVersion: "V3",
            publicLevels: 7,
            annualLeaveDaysByLevel: {
              L1: 14,
              L2: 16,
              L3: 21,
              L4: 24,
              L5: 28,
              L6: 30,
              L7: 35,
            },
            leaveYear,
          },
          reason: "Approved ZERMATT Employment Levels and Annual Leave Structure.",
        },
      });

      return {
        mode: "APPLIED",
        activationDate: activationDate.toISOString(),
        designationChanges,
        overrideChanges,
        policyVersionChanges,
        leaveProvisioning: {
          hierarchyVersion: leaveProvisioning.hierarchyVersion,
          currentEmployees: leaveProvisioning.currentEmployees,
          annualEligibleEmployees: leaveProvisioning.annualEligibleEmployees,
          fullTimeEmployees: leaveProvisioning.fullTimeEmployees,
          expatriateEmployees: leaveProvisioning.expatriateEmployees,
        },
      };
    },
    { isolationLevel: "Serializable", maxWait: 10000, timeout: 120000 }
  );
}

async function main() {
  const { apply, leaveYear } = parseArgs();
  const { organization, actor } = await resolveOrganizationAndActor({
    requireActor: apply,
  });
  const source = await inspectState(organization.id);
  assertDesignationCoverage(source.designations);

  console.log("\n============================================================");
  console.log("ZERMATT EMPLOYMENT LEVEL V3 — CONTROLLED ACTIVATION");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Actor: ${actor?.email || "Not required for preview"}`);
  console.log(`Leave Year: ${leaveYear}`);
  console.log(`Mode: ${apply ? "APPLY" : "PREVIEW_ONLY"}`);
  console.table(hierarchySummary());
  console.log(`Designations checked: ${source.designations.length}`);
  console.log(`Current employees: ${source.currentEmployees}`);
  console.log(`Active overrides: ${source.activeOverrides.length}`);
  console.log("Historical V2 rows will be retained as inactive V2_L1...V2_L7 records.");

  if (!apply) {
    console.log("Database Writes Issued: 0");
    console.log("Run with --apply only after reviewing this preview.");
    console.log("============================================================\n");
    return;
  }

  const result = await applyV3({ organization, actor, leaveYear });
  console.log(JSON.stringify(result, null, 2));
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error("\nZERMATT V3 activation failed safely.");
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
