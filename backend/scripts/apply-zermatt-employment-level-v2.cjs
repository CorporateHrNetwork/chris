require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");
const {
  ZERMATT_EMPLOYMENT_LEVELS,
  ZERMATT_DESIGNATION_LEVELS,
} = require("../src/config/zermattEmploymentLevels");
const {
  ZERMATT_EMPLOYMENT_LEVELS_V2,
  ZERMATT_V2_DESIGNATION_LEVELS,
  resolveZermattV2DesignationLevel,
  resolveZermattV2Level,
  isZermattV2InternalLevel,
} = require("../src/config/zermattEmploymentLevelsV2");
const {
  POLICY_DEFINITIONS,
  configureZermattLeavePolicies,
  isAnnualEligibleEmploymentType,
} = require("../src/services/zermattLeaveEntitlementService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const ACTOR_EMAIL = "corporatehr.crn@gmail.com";
const ACTOR_ROLE = "Head of HR & Admin";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const ANNUAL_POLICY_CODE = "ZLL-ANNUAL-FT";
const DEFAULT_LEAVE_YEAR = 2026;
const NWI_GWE_EMPLOYEE_NUMBER = "ZLL000119";
const NWI_GWE_SOURCE_DESIGNATION = "AIC-IA";
const NWI_GWE_TARGET_DESIGNATION = "AIC-HOD";
const ESTHER_EMPLOYEE_NUMBER = "ZLL000087";
const ESTHER_DESIGNATION_CODE = "EXEC-PAES";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const leaveYearIndex = process.argv.indexOf("--leave-year");
  const leaveYear =
    leaveYearIndex >= 0 ? Number(process.argv[leaveYearIndex + 1]) : DEFAULT_LEAVE_YEAR;
  if (!Number.isInteger(leaveYear) || leaveYear < 2000 || leaveYear > 2100) {
    throw new Error("INVALID_LEAVE_YEAR");
  }
  return { apply, leaveYear };
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function numeric(value) {
  if (value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function designationFingerprint(rows) {
  return JSON.stringify(
    rows
      .map((row) => ({
        id: row.id,
        employeeNumber: row.employeeNumber,
        designationId: row.designationId || null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

function fingerprintIgnoringEmployee(rows, employeeNumber) {
  return designationFingerprint(
    rows.filter((row) => row.employeeNumber !== employeeNumber)
  );
}

function hierarchySummary() {
  return ZERMATT_EMPLOYMENT_LEVELS_V2.map((level) => ({
    Level: level.code,
    Name: level.name,
    AnnualLeaveDays: level.annualLeaveDays,
    InternalLevelNumber: level.levelNumber,
    Designations: ZERMATT_V2_DESIGNATION_LEVELS.filter(
      (designation) => designation.levelNumber === level.levelNumber
    ).length,
  }));
}

async function resolveOrganizationAndActor() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      email: ACTOR_EMAIL,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      userRoles: {
        select: { role: { select: { name: true } } },
      },
    },
  });
  if (!actor) throw new Error("ZERMATT_CHRIS_ADMINISTRATOR_REQUIRED");
  const roleNames = actor.userRoles.map(({ role }) => role.name);
  if (!roleNames.includes(ACTOR_ROLE)) {
    const error = new Error("ZERMATT_HEAD_HR_ADMIN_ROLE_REQUIRED");
    error.details = { actor: actor.email, roleNames };
    throw error;
  }

  return { organization, actor, roleNames };
}

async function inspectLiveSourceState(organizationId) {
  const [designations, employees, levels] = await Promise.all([
    prisma.designation.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        code: true,
        careerLevel: true,
        careerTrack: true,
        isActive: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId },
      select: { id: true, employeeNumber: true, designationId: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.organizationEmploymentLevel.findMany({
      where: { organizationId },
      orderBy: { levelNumber: "asc" },
    }),
  ]);

  if (designations.length !== 120) {
    throw new Error(`ZERMATT_LIVE_DESIGNATION_COUNT_CHANGED:${designations.length}`);
  }

  const liveByCode = new Map(
    designations.map((designation) => [normalizeCode(designation.code), designation])
  );
  const missing = ZERMATT_DESIGNATION_LEVELS.filter(
    (reference) => !liveByCode.has(normalizeCode(reference.code))
  );
  const extras = designations.filter(
    (designation) =>
      !ZERMATT_DESIGNATION_LEVELS.some(
        (reference) => normalizeCode(reference.code) === normalizeCode(designation.code)
      )
  );
  if (missing.length || extras.length) {
    const error = new Error("ZERMATT_DESIGNATION_CATALOGUE_CHANGED");
    error.details = {
      missing: missing.map((item) => item.code),
      extras: extras.map((item) => item.code),
    };
    throw error;
  }

  const v2Sentinel = levels.find((level) => level.levelNumber === 101) || null;
  return { designations, employees, levels, liveByCode, v2Sentinel };
}

function assertV1SourceState(source) {
  const mismatches = [];
  for (const reference of ZERMATT_DESIGNATION_LEVELS) {
    const live = source.liveByCode.get(normalizeCode(reference.code));
    if (!live) continue;
    if (Number(live.careerLevel) !== Number(reference.levelNumber)) {
      mismatches.push({
        code: reference.code,
        designation: reference.name,
        expectedV1Level: reference.levelNumber,
        liveCareerLevel: live.careerLevel,
      });
    }
  }
  if (mismatches.length) {
    const error = new Error("ZERMATT_V1_SOURCE_STATE_CHANGED_AFTER_PREVIEW");
    error.details = { mismatches };
    throw error;
  }
}

async function verifyAppliedState({ organizationId, leaveYear, tx = prisma }) {
  const [levels, designations, nwigwe, esther, annualPolicy, annualType] =
    await Promise.all([
      tx.organizationEmploymentLevel.findMany({
        where: { organizationId },
        orderBy: [{ displayOrder: "asc" }, { levelNumber: "asc" }],
      }),
      tx.designation.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true, careerLevel: true },
      }),
      tx.employee.findFirst({
        where: { organizationId, employeeNumber: NWI_GWE_EMPLOYEE_NUMBER },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employmentType: true,
          designation: { select: { code: true, name: true, careerLevel: true } },
        },
      }),
      tx.employee.findFirst({
        where: { organizationId, employeeNumber: ESTHER_EMPLOYEE_NUMBER },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employmentType: true,
          designation: { select: { code: true, name: true, careerLevel: true } },
        },
      }),
      tx.leavePolicy.findFirst({
        where: { organizationId, code: ANNUAL_POLICY_CODE, isActive: true },
        orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
      }),
      tx.leaveType.findFirst({
        where: { organizationId, code: "ANNUAL" },
        select: { id: true, code: true, name: true },
      }),
    ]);

  const activeV2 = levels.filter(
    (level) => level.isActive && isZermattV2InternalLevel(level.levelNumber)
  );
  if (activeV2.length !== 7) {
    throw new Error(`ZERMATT_V2_ACTIVE_LEVEL_COUNT_INVALID:${activeV2.length}`);
  }
  const activeLegacy = levels.filter(
    (level) => level.isActive && level.levelNumber >= 1 && level.levelNumber <= 11
  );
  if (activeLegacy.length) {
    throw new Error("ZERMATT_V1_LEVELS_STILL_ACTIVE");
  }

  const designationByCode = new Map(
    designations.map((designation) => [normalizeCode(designation.code), designation])
  );
  const invalidDesignations = ZERMATT_V2_DESIGNATION_LEVELS.filter((reference) => {
    const live = designationByCode.get(normalizeCode(reference.code));
    return !live || Number(live.careerLevel) !== Number(reference.levelNumber);
  });
  if (invalidDesignations.length) {
    const error = new Error("ZERMATT_V2_DESIGNATION_MAPPING_POSTCONDITION_FAILED");
    error.details = invalidDesignations.map((item) => item.code);
    throw error;
  }

  if (normalizeCode(nwigwe?.designation?.code) !== NWI_GWE_TARGET_DESIGNATION) {
    throw new Error("ZLL000119_AUDIT_HEAD_DESIGNATION_NOT_APPLIED");
  }
  if (Number(nwigwe?.designation?.careerLevel) !== 106) {
    throw new Error("ZLL000119_HEAD_LEVEL_NOT_L6");
  }
  if (normalizeCode(esther?.designation?.code) !== ESTHER_DESIGNATION_CODE) {
    throw new Error("ZLL000087_DESIGNATION_CHANGED_UNEXPECTEDLY");
  }
  if (Number(esther?.designation?.careerLevel) !== 103) {
    throw new Error("ZLL000087_EXECUTIVE_SECRETARY_LEVEL_NOT_L3");
  }

  const annualEligibility = annualPolicy?.eligibilityRules?.employmentTypes || [];
  if (
    !annualPolicy ||
    annualPolicy.entitlementRules?.hierarchyVersion !== "V2" ||
    !annualEligibility.includes("Full-Time") ||
    !annualEligibility.includes("Expatriate")
  ) {
    throw new Error("ZERMATT_V2_ANNUAL_POLICY_ELIGIBILITY_NOT_APPLIED");
  }
  if (!annualType) throw new Error("ZERMATT_ANNUAL_LEAVE_TYPE_NOT_FOUND");

  const currentEmployees = await tx.employee.findMany({
    where: { organizationId, status: { in: CURRENT_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      employmentType: true,
      designation: { select: { code: true, name: true, careerLevel: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });
  const annualEligible = currentEmployees.filter((employee) =>
    isAnnualEligibleEmploymentType(employee.employmentType, "V2")
  );

  const balanceRows = await tx.leaveBalance.findMany({
    where: {
      organizationId,
      employeeId: { in: annualEligible.map((employee) => employee.id) },
      leaveTypeId: annualType.id,
      leaveYear,
    },
    select: {
      employeeId: true,
      openingBalance: true,
      accrued: true,
      carriedForward: true,
      adjusted: true,
      used: true,
    },
  });
  const balanceByEmployee = new Map(
    balanceRows.map((balance) => [balance.employeeId, balance])
  );

  const allocationRows = await tx.leaveEntitlementAllocation.findMany({
    where: {
      organizationId,
      employeeId: { in: annualEligible.map((employee) => employee.id) },
      leavePolicyId: annualPolicy.id,
      leaveYear,
    },
    select: {
      employeeId: true,
      levelNumber: true,
      allocatedEntitlement: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const latestAllocationByEmployee = new Map();
  for (const allocation of allocationRows) {
    if (!latestAllocationByEmployee.has(allocation.employeeId)) {
      latestAllocationByEmployee.set(allocation.employeeId, allocation);
    }
  }

  const invalidAnnual = [];
  for (const employee of annualEligible) {
    const level = resolveZermattV2Level(employee.designation?.careerLevel);
    const balance = balanceByEmployee.get(employee.id);
    const allocation = latestAllocationByEmployee.get(employee.id);
    if (
      !level ||
      !balance ||
      Number(balance.openingBalance) !== Number(level.annualLeaveDays) ||
      !allocation ||
      Number(allocation.levelNumber) !== Number(level.levelNumber) ||
      Number(allocation.allocatedEntitlement) !== Number(level.annualLeaveDays)
    ) {
      invalidAnnual.push({
        employeeNumber: employee.employeeNumber,
        designation: employee.designation?.code || null,
        level: level?.code || null,
        expectedAnnual: level?.annualLeaveDays ?? null,
        openingBalance: balance ? Number(balance.openingBalance) : null,
        latestAllocationLevel: allocation?.levelNumber ?? null,
        latestAllocatedEntitlement: allocation
          ? Number(allocation.allocatedEntitlement)
          : null,
      });
    }
  }
  if (invalidAnnual.length) {
    const error = new Error("ZERMATT_V2_ANNUAL_REBASE_POSTCONDITION_FAILED");
    error.details = invalidAnnual;
    throw error;
  }

  return {
    activeV2Levels: activeV2.length,
    inactiveV1Levels: levels.filter(
      (level) => !level.isActive && level.levelNumber >= 1 && level.levelNumber <= 11
    ).length,
    designationsChecked: designations.length,
    annualPolicyId: annualPolicy.id,
    annualPolicyVersion: annualPolicy.versionNumber,
    annualEligibleEmployees: annualEligible.length,
    fullTimeEmployees: annualEligible.filter((employee) =>
      String(employee.employmentType || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "") === "fulltime"
    ).length,
    expatriateEmployees: annualEligible.filter((employee) =>
      String(employee.employmentType || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "") === "expatriate"
    ).length,
    nwigwe: {
      employeeNumber: nwigwe.employeeNumber,
      employeeName: employeeName(nwigwe),
      designation: nwigwe.designation.name,
      designationCode: nwigwe.designation.code,
      level: "L6",
      annualLeaveDays: 28,
    },
    esther: {
      employeeNumber: esther.employeeNumber,
      employeeName: employeeName(esther),
      designation: esther.designation.name,
      designationCode: esther.designation.code,
      level: "L3",
      annualLeaveDays: 21,
    },
  };
}

async function createV2PolicyVersions({ organizationId, actorUserId, activationDate, tx }) {
  const changes = [];

  for (const definition of POLICY_DEFINITIONS) {
    const latest = await tx.leavePolicy.findFirst({
      where: { organizationId, code: definition.policyCode },
      orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
    });
    if (!latest) {
      throw new Error(`ZERMATT_POLICY_REQUIRED:${definition.policyCode}`);
    }

    if (latest.entitlementRules?.hierarchyVersion === "V2") {
      changes.push({
        policyCode: definition.policyCode,
        mode: "ALREADY_V2",
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
        changeReason:
          "Superseded by management-approved ZERMATT Employment Level Hierarchy V2.",
      },
    });

    const { id, createdAt, updatedAt, ...clone } = latest;
    const nextVersion = Number(latest.versionNumber || 0) + 1;
    const eligibilityRules =
      definition.key === "ANNUAL"
        ? {
            ...(latest.eligibilityRules || {}),
            requiredForAll: false,
            employmentTypes: ["Full-Time", "Expatriate"],
          }
        : latest.eligibilityRules;
    const entitlementRules = {
      ...(latest.entitlementRules || {}),
      unit: "WORKING_DAYS",
      allocationBasis: "EMPLOYMENT_LEVEL",
      hierarchyVersion: "V2",
    };

    const created = await tx.leavePolicy.create({
      data: {
        ...clone,
        versionGroupId: latest.versionGroupId || latest.id,
        versionNumber: nextVersion,
        changeReason:
          "Management-approved ZERMATT seven-level hierarchy V2 activation.",
        eligibilityRules,
        entitlementRules,
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

async function main() {
  const { apply, leaveYear } = parseArgs();
  const { organization, actor, roleNames } = await resolveOrganizationAndActor();
  const source = await inspectLiveSourceState(organization.id);

  console.log("\n============================================================");
  console.log("ZERMATT EMPLOYMENT LEVEL V2 — CONTROLLED ACTIVATION");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Actor: ${actor.email}`);
  console.log(`Actor Roles: ${roleNames.join(", ")}`);
  console.log(`Leave Year: ${leaveYear}`);
  console.log(`Mode: ${apply ? "APPLY" : "PREVIEW_ONLY"}`);
  console.log("\nAPPROVED V2 HIERARCHY");
  console.table(hierarchySummary());
  console.log("Annual Leave Eligibility: Full-Time + Expatriate");
  console.log("Part-time and NYSC/Internship: outside standard Annual Leave matrix");

  if (source.v2Sentinel?.isActive && source.v2Sentinel.code === "L1") {
    const verified = await verifyAppliedState({
      organizationId: organization.id,
      leaveYear,
    });
    console.log("\nV2 is already active and passed postcondition verification.");
    console.log(JSON.stringify({ mode: "ALREADY_APPLIED", ...verified }, null, 2));
    console.log("============================================================\n");
    return;
  }

  assertV1SourceState(source);

  if (!apply) {
    console.log("\nPRECONDITIONS: PASS");
    console.log("Database Writes Issued: 0");
    console.log(
      "Run again with --apply only after reviewing this preview and confirming the approved V2 rules."
    );
    console.log("============================================================\n");
    return;
  }

  const activationDate = new Date();
  const result = await prisma.$transaction(
    async (tx) => {
      const employeesBefore = await tx.employee.findMany({
        where: { organizationId: organization.id },
        select: { id: true, employeeNumber: true, designationId: true },
        orderBy: { employeeNumber: "asc" },
      });
      const requestsBefore = await tx.leaveRequest.count({
        where: { organizationId: organization.id },
      });

      const currentLevels = await tx.organizationEmploymentLevel.findMany({
        where: { organizationId: organization.id },
        orderBy: { levelNumber: "asc" },
      });
      const v1Levels = currentLevels.filter(
        (level) => level.levelNumber >= 1 && level.levelNumber <= 11
      );
      if (v1Levels.length !== 11) {
        throw new Error(`ZERMATT_V1_LEVEL_COUNT_INVALID:${v1Levels.length}`);
      }

      const v1LevelChanges = [];
      for (const level of v1Levels) {
        const historicalCode = `V1_L${level.levelNumber}`;
        const updated = await tx.organizationEmploymentLevel.update({
          where: {
            organizationId_levelNumber: {
              organizationId: organization.id,
              levelNumber: level.levelNumber,
            },
          },
          data: {
            code: historicalCode,
            isActive: false,
            displayOrder: 1000 + level.levelNumber,
          },
        });
        v1LevelChanges.push({
          levelNumber: updated.levelNumber,
          code: updated.code,
          name: updated.name,
          isActive: updated.isActive,
        });
      }

      const v2LevelChanges = [];
      for (const level of ZERMATT_EMPLOYMENT_LEVELS_V2) {
        const saved = await tx.organizationEmploymentLevel.upsert({
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
        v2LevelChanges.push({
          internalLevelNumber: saved.levelNumber,
          code: saved.code,
          name: saved.name,
          annualLeaveDays: level.annualLeaveDays,
        });
      }

      const liveDesignations = await tx.designation.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          name: true,
          code: true,
          careerLevel: true,
          careerTrack: true,
        },
        orderBy: { code: "asc" },
      });
      const designationChanges = [];
      for (const designation of liveDesignations) {
        const reference = resolveZermattV2DesignationLevel(designation);
        if (!reference) {
          throw new Error(`ZERMATT_V2_DESIGNATION_MAPPING_REQUIRED:${designation.code}`);
        }
        if (Number(designation.careerLevel) === Number(reference.levelNumber)) continue;

        await tx.designation.update({
          where: { id: designation.id },
          data: { careerLevel: reference.levelNumber },
        });
        await tx.organizationAudit.create({
          data: {
            organizationId: organization.id,
            actorUserId: actor.id,
            entityType: "Designation",
            entityId: designation.id,
            action: "ZERMATT_EMPLOYMENT_LEVEL_V2_MAPPED",
            previousValue: {
              designationName: designation.name,
              designationCode: designation.code,
              careerLevel: designation.careerLevel,
              hierarchyVersion: "V1",
            },
            newValue: {
              designationName: designation.name,
              designationCode: designation.code,
              careerLevel: reference.levelNumber,
              publicLevel: reference.levelCode,
              levelName: reference.levelName,
              hierarchyVersion: "V2",
            },
            reason: "Management-approved ZERMATT seven-level hierarchy V2 mapping.",
          },
        });
        designationChanges.push({
          code: designation.code,
          designation: designation.name,
          from: designation.careerLevel,
          toInternal: reference.levelNumber,
          toPublic: reference.levelCode,
          toName: reference.levelName,
        });
      }

      const nwigwe = await tx.employee.findFirst({
        where: {
          organizationId: organization.id,
          employeeNumber: NWI_GWE_EMPLOYEE_NUMBER,
        },
        select: {
          id: true,
          employeeNumber: true,
          designationId: true,
          designation: { select: { id: true, code: true, name: true } },
        },
      });
      if (!nwigwe) throw new Error("ZLL000119_NOT_FOUND");
      const targetDesignation = await tx.designation.findFirst({
        where: {
          organizationId: organization.id,
          code: NWI_GWE_TARGET_DESIGNATION,
        },
        select: { id: true, code: true, name: true, careerLevel: true },
      });
      if (!targetDesignation) throw new Error("AIC_HOD_DESIGNATION_NOT_FOUND");

      let nwigweCorrection = { mode: "ALREADY_CORRECT" };
      if (normalizeCode(nwigwe.designation?.code) !== NWI_GWE_TARGET_DESIGNATION) {
        if (normalizeCode(nwigwe.designation?.code) !== NWI_GWE_SOURCE_DESIGNATION) {
          throw new Error(
            `ZLL000119_SOURCE_DESIGNATION_CHANGED:${nwigwe.designation?.code || "NONE"}`
          );
        }
        await tx.employee.update({
          where: { id: nwigwe.id },
          data: { designationId: targetDesignation.id },
        });
        await tx.organizationAudit.create({
          data: {
            organizationId: organization.id,
            actorUserId: actor.id,
            entityType: "Employee",
            entityId: nwigwe.id,
            action: "ZERMATT_DESIGNATION_DATA_CORRECTION",
            previousValue: {
              employeeNumber: nwigwe.employeeNumber,
              designationId: nwigwe.designation?.id || null,
              designationCode: nwigwe.designation?.code || null,
              designationName: nwigwe.designation?.name || null,
            },
            newValue: {
              employeeNumber: nwigwe.employeeNumber,
              designationId: targetDesignation.id,
              designationCode: targetDesignation.code,
              designationName: targetDesignation.name,
              publicLevel: "L6",
              annualLeaveDays: 28,
            },
            reason:
              "Management confirmed ZLL000119 Nwigwe Jude Ogechukwu is the Audit Head; correct designation is Head of Audit & Internal Control.",
          },
        });
        nwigweCorrection = {
          mode: "APPLIED",
          from: nwigwe.designation?.code || null,
          to: targetDesignation.code,
        };
      }

      const policyVersionChanges = await createV2PolicyVersions({
        organizationId: organization.id,
        actorUserId: actor.id,
        activationDate,
        tx,
      });

      const configuredPolicies = await configureZermattLeavePolicies({
        organizationId: organization.id,
        actorUserId: actor.id,
        tx,
      });
      const configuredAnnual = configuredPolicies.find(
        (item) => item.definition.key === "ANNUAL"
      );
      if (!configuredAnnual) throw new Error("ZERMATT_V2_ANNUAL_POLICY_NOT_CONFIGURED");

      const annualEmployees = await tx.employee.findMany({
        where: {
          organizationId: organization.id,
          status: { in: CURRENT_STATUSES },
        },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          employmentType: true,
          designation: {
            select: { id: true, code: true, name: true, careerLevel: true },
          },
        },
        orderBy: { employeeNumber: "asc" },
      });
      const annualEligible = annualEmployees.filter((employee) =>
        isAnnualEligibleEmploymentType(employee.employmentType, "V2")
      );

      const existingBalances = await tx.leaveBalance.findMany({
        where: {
          organizationId: organization.id,
          employeeId: { in: annualEligible.map((employee) => employee.id) },
          leaveTypeId: configuredAnnual.leaveType.id,
          leaveYear,
        },
      });
      const balanceByEmployeeId = new Map(
        existingBalances.map((balance) => [balance.employeeId, balance])
      );

      const unsafeRebases = [];
      for (const employee of annualEligible) {
        const level = resolveZermattV2Level(employee.designation?.careerLevel);
        if (!level) {
          throw new Error(`EMPLOYMENT_LEVEL_MAPPING_REQUIRED:${employee.employeeNumber}`);
        }
        const balance = balanceByEmployeeId.get(employee.id);
        if (!balance) continue;
        const prospectiveGross =
          Number(level.annualLeaveDays) +
          numeric(balance.accrued) +
          numeric(balance.carriedForward) +
          numeric(balance.adjusted);
        if (prospectiveGross < numeric(balance.used)) {
          unsafeRebases.push({
            employeeNumber: employee.employeeNumber,
            employeeName: employeeName(employee),
            level: level.code,
            proposedEntitlement: level.annualLeaveDays,
            accrued: numeric(balance.accrued),
            carriedForward: numeric(balance.carriedForward),
            adjusted: numeric(balance.adjusted),
            used: numeric(balance.used),
            prospectiveGross,
          });
        }
      }
      if (unsafeRebases.length) {
        const error = new Error("ZERMATT_V2_ANNUAL_REBASE_WOULD_UNDERRUN_USED_LEAVE");
        error.details = unsafeRebases;
        throw error;
      }

      const annualRebases = [];
      for (const employee of annualEligible) {
        const level = resolveZermattV2Level(employee.designation.careerLevel);
        const previousBalance = balanceByEmployeeId.get(employee.id) || null;
        const balance = previousBalance
          ? await tx.leaveBalance.update({
              where: { id: previousBalance.id },
              data: { openingBalance: level.annualLeaveDays },
            })
          : await tx.leaveBalance.create({
              data: {
                organizationId: organization.id,
                employeeId: employee.id,
                leaveTypeId: configuredAnnual.leaveType.id,
                leaveYear,
                openingBalance: level.annualLeaveDays,
              },
            });

        const latestV2Allocation = await tx.leaveEntitlementAllocation.findFirst({
          where: {
            organizationId: organization.id,
            employeeId: employee.id,
            leavePolicyId: configuredAnnual.policy.id,
            leaveYear,
          },
          orderBy: { createdAt: "desc" },
        });
        let allocation = latestV2Allocation;
        if (
          !latestV2Allocation ||
          Number(latestV2Allocation.levelNumber) !== Number(level.levelNumber) ||
          Number(latestV2Allocation.allocatedEntitlement) !==
            Number(level.annualLeaveDays)
        ) {
          allocation = await tx.leaveEntitlementAllocation.create({
            data: {
              organizationId: organization.id,
              employeeId: employee.id,
              leaveBalanceId: balance.id,
              leavePolicyId: configuredAnnual.policy.id,
              leaveTypeId: configuredAnnual.leaveType.id,
              levelNumber: level.levelNumber,
              leaveYear,
              baseEntitlement: level.annualLeaveDays,
              allocatedEntitlement: level.annualLeaveDays,
              method: "BASELINE_REPROVISION",
              effectiveDate: activationDate,
              reason:
                "Management-approved ZERMATT Employment Level Hierarchy V2 annual entitlement rebase.",
              createdByUserId: actor.id,
            },
          });
        }

        annualRebases.push({
          employeeNumber: employee.employeeNumber,
          employeeName: employeeName(employee),
          employmentType: employee.employmentType,
          designationCode: employee.designation.code,
          level: level.code,
          previousOpeningBalance: previousBalance
            ? Number(previousBalance.openingBalance)
            : null,
          newOpeningBalance: Number(balance.openingBalance),
          usedPreserved: numeric(balance.used),
          allocationId: allocation.id,
        });
      }

      const employeesAfter = await tx.employee.findMany({
        where: { organizationId: organization.id },
        select: { id: true, employeeNumber: true, designationId: true },
        orderBy: { employeeNumber: "asc" },
      });
      if (
        fingerprintIgnoringEmployee(employeesBefore, NWI_GWE_EMPLOYEE_NUMBER) !==
        fingerprintIgnoringEmployee(employeesAfter, NWI_GWE_EMPLOYEE_NUMBER)
      ) {
        throw new Error("UNEXPECTED_EMPLOYEE_DESIGNATION_RELATIONSHIP_CHANGED");
      }

      const requestsAfter = await tx.leaveRequest.count({
        where: { organizationId: organization.id },
      });
      if (requestsBefore !== requestsAfter) {
        throw new Error("LEAVE_REQUEST_COUNT_CHANGED_UNEXPECTEDLY");
      }

      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          entityType: "Organization",
          entityId: organization.id,
          action: "ZERMATT_EMPLOYMENT_LEVEL_V2_ACTIVATED",
          previousValue: {
            hierarchyVersion: "V1",
            publicLevels: 11,
            annualEligibility: ["Full-Time"],
          },
          newValue: {
            hierarchyVersion: "V2",
            publicLevels: 7,
            annualEligibility: ["Full-Time", "Expatriate"],
            leaveYear,
            designationMappings: designationChanges.length,
            annualEmployeesRebased: annualRebases.length,
          },
          reason:
            "Management-approved ZERMATT seven-level hierarchy and Annual Leave eligibility restructuring.",
        },
      });

      const verified = await verifyAppliedState({
        organizationId: organization.id,
        leaveYear,
        tx,
      });

      return {
        activationDate: activationDate.toISOString(),
        v1LevelChanges,
        v2LevelChanges,
        designationChanges,
        nwigweCorrection,
        policyVersionChanges,
        annualRebases,
        requestsPreserved: requestsBefore,
        employeeDesignationRelationshipsPreservedExceptApprovedNwigweCorrection: true,
        verified,
      };
    },
    {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 120000,
    }
  );

  const increases = result.annualRebases.filter(
    (row) =>
      row.previousOpeningBalance != null &&
      row.newOpeningBalance > row.previousOpeningBalance
  );
  const decreases = result.annualRebases.filter(
    (row) =>
      row.previousOpeningBalance != null &&
      row.newOpeningBalance < row.previousOpeningBalance
  );
  const newlyProvisioned = result.annualRebases.filter(
    (row) => row.previousOpeningBalance == null
  );

  console.log("\nACTIVATION RESULT");
  console.log(
    JSON.stringify(
      {
        mode: "APPLIED",
        organization: organization.name,
        actor: actor.email,
        leaveYear,
        activationDate: result.activationDate,
        activeV2Levels: result.verified.activeV2Levels,
        inactiveV1Levels: result.verified.inactiveV1Levels,
        designationsChecked: result.verified.designationsChecked,
        designationMappingsChanged: result.designationChanges.length,
        annualPolicyVersion: result.verified.annualPolicyVersion,
        annualEligibility: ["Full-Time", "Expatriate"],
        annualEligibleEmployees: result.verified.annualEligibleEmployees,
        fullTimeEmployees: result.verified.fullTimeEmployees,
        expatriateEmployees: result.verified.expatriateEmployees,
        annualEntitlementIncreases: increases.length,
        annualEntitlementDecreases: decreases.length,
        annualNewlyProvisioned: newlyProvisioned.length,
        approvedDesignationCorrection: result.verified.nwigwe,
        executiveSecretaryCheck: result.verified.esther,
        leaveRequestsPreserved: result.requestsPreserved,
        controls: {
          historicalV1EmploymentLevelsPreserved: true,
          historicalV1PolicyVersionsPreserved: true,
          historicalLeaveAllocationsNotRewritten: true,
          usedAccruedCarryForwardAdjustedPreserved: true,
          employeeDesignationRelationshipsPreservedExceptApprovedNwigweCorrection:
            true,
        },
      },
      null,
      2
    )
  );

  if (increases.length) {
    console.log("\nANNUAL ENTITLEMENT INCREASES");
    console.table(increases);
  }
  if (decreases.length) {
    console.log("\nANNUAL ENTITLEMENT DECREASES");
    console.table(decreases);
  }
  if (newlyProvisioned.length) {
    console.log("\nNEWLY ANNUAL-ELIGIBLE / PROVISIONED");
    console.table(newlyProvisioned);
  }

  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error("\nZERMATT V2 activation failed safely.");
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());