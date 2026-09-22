require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/prisma");
const {
  ZERMATT_EMPLOYMENT_LEVELS,
  ZERMATT_DESIGNATION_LEVELS,
} = require("../src/config/zermattEmploymentLevels");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const ANNUAL_POLICY_CODE = "ZLL-ANNUAL-FT";
const DEFAULT_LEAVE_YEAR = 2026;

const ZERMATT_V2_LEVELS = [
  {
    levelNumber: 1,
    code: "L1",
    name: "Entry / Support / Junior Officer",
    annualLeaveDays: 14,
  },
  {
    levelNumber: 2,
    code: "L2",
    name: "Team Leader",
    annualLeaveDays: 14,
  },
  {
    levelNumber: 3,
    code: "L3",
    name: "Supervisors / Officers / Executive Assistant / Executive Secretary",
    annualLeaveDays: 21,
  },
  {
    levelNumber: 4,
    code: "L4",
    name: "Assistant Manager",
    annualLeaveDays: 22,
  },
  {
    levelNumber: 5,
    code: "L5",
    name: "Junior Manager / Manager",
    annualLeaveDays: 24,
  },
  {
    levelNumber: 6,
    code: "L6",
    name: "Head / Senior Management",
    annualLeaveDays: 28,
  },
  {
    levelNumber: 7,
    code: "L7",
    name: "Executive Management",
    annualLeaveDays: 30,
  },
];

const V2_LEVEL_BY_NUMBER = new Map(
  ZERMATT_V2_LEVELS.map((level) => [level.levelNumber, level])
);

/*
 * Old-L3 was intentionally reviewed designation-by-designation.
 * Do not replace this map with a blanket old-L3 conversion.
 */
const OLD_L3_EXPLICIT_V2_MAPPING = new Map([
  ["HRA-AST", 1],
  ["FIN-AA", 1],
  ["AIC-AA", 1],
  ["BBO-ABTL", 2],
  ["BBO-SC", 2],
  ["BBO-SSA", 1],
  ["BBO-ATL", 2],
  ["PROC-AST", 1],
  ["WHSE-SK", 1],
  ["LOG-SD", 1],
  ["SEC-SSO", 3],
  ["HKF-AHS", 3],
  ["HKF-SH", 1],
  ["ENT-IDJ", 1],
  ["ENT-MC", 1],
  ["ENT-AV", 1],
  ["ICT-AST", 1],
]);

/*
 * Additional designation-specific decisions required by the approved ZERMATT
 * seven-level structure.
 */
const DESIGNATION_OVERRIDES = new Map([
  // "Officer" in the approved v2 structure belongs to L3 even though this
  // designation was previously grouped with junior operational staff.
  ["SEC-SO", { levelNumber: 3, source: "OFFICER_TITLE_OVERRIDE" }],

  // Executive support is explicitly assigned to the v2 Officer band.
  ["EXEC-EA", { levelNumber: 3, source: "EXECUTIVE_SUPPORT_OVERRIDE" }],
  ["EXEC-PAES", { levelNumber: 3, source: "EXECUTIVE_SUPPORT_OVERRIDE" }],

  // Deputy General Manager is treated as executive management under v2.
  ["EXEC-DGM", { levelNumber: 7, source: "EXECUTIVE_TITLE_OVERRIDE" }],
]);

/*
 * The Company Secretary is deliberately not equated with Executive Secretary.
 * Its final v2 grade remains an approval item rather than being silently forced
 * into the generic old-L9 -> v2-L5 conversion.
 */
const DESIGNATION_REVIEW_REQUIRED = new Map([
  [
    "EXEC-CS",
    "Company Secretary is a corporate-governance role and is not the same as Executive Secretary. Confirm whether ZERMATT wants this role at L5 or L6 before activation.",
  ],
]);

const EMPLOYEE_SPECIFIC_DESIGNATION_CORRECTIONS = new Map([
  [
    "ZLL000119",
    {
      expectedCurrentDesignationCode: "AIC-IA",
      proposedDesignationCode: "AIC-HOD",
      reason:
        "Management confirmed Nwigwe Jude Ogechukwu is the Audit Head; proposed designation is Head of Audit & Internal Control.",
    },
  ],
]);

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isFullTime(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "") === "fulltime"
  );
}

function toNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLeaveYear() {
  const index = process.argv.indexOf("--leave-year");
  if (index === -1) return DEFAULT_LEAVE_YEAR;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error("INVALID_LEAVE_YEAR");
  }
  return value;
}

function csv(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
  const headers = rows.length
    ? Object.keys(rows[0])
    : ["NoData"];
  const content = [
    headers.map(csv).join(","),
    ...rows.map((row) => headers.map((header) => csv(row[header])).join(",")),
  ].join("\r\n");
  fs.writeFileSync(filePath, content, "utf8");
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function currentLevelName(levelNumber) {
  return (
    ZERMATT_EMPLOYMENT_LEVELS.find(
      (level) => Number(level.levelNumber) === Number(levelNumber)
    )?.name || "UNMAPPED"
  );
}

function resolveV2DesignationMapping(designation) {
  if (!designation) {
    return {
      status: "REVIEW_REQUIRED",
      proposedLevelNumber: null,
      source: "DESIGNATION_MISSING",
      note: "Designation is missing.",
    };
  }

  const code = normalizeCode(designation.code);
  const oldLevel = Number(designation.levelNumber ?? designation.careerLevel ?? 0);

  if (DESIGNATION_REVIEW_REQUIRED.has(code)) {
    return {
      status: "REVIEW_REQUIRED",
      proposedLevelNumber: null,
      source: "DESIGNATION_REVIEW_REQUIRED",
      note: DESIGNATION_REVIEW_REQUIRED.get(code),
    };
  }

  if (DESIGNATION_OVERRIDES.has(code)) {
    const override = DESIGNATION_OVERRIDES.get(code);
    return {
      status: "MAPPED",
      proposedLevelNumber: override.levelNumber,
      source: override.source,
      note: null,
    };
  }

  if (oldLevel === 3) {
    const explicit = OLD_L3_EXPLICIT_V2_MAPPING.get(code);
    if (!explicit) {
      return {
        status: "REVIEW_REQUIRED",
        proposedLevelNumber: null,
        source: "OLD_L3_EXPLICIT_MAPPING_MISSING",
        note:
          "Old L3 is a mixed designation group and must not be converted blindly.",
      };
    }
    return {
      status: "MAPPED",
      proposedLevelNumber: explicit,
      source: "OLD_L3_DESIGNATION_REVIEW",
      note: null,
    };
  }

  if (oldLevel === 1 || oldLevel === 2) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 1,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if (oldLevel === 4) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 2,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if ([5, 6, 7].includes(oldLevel)) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 3,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if (oldLevel === 8) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 4,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if (oldLevel === 9) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 5,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if (oldLevel === 10) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 6,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }
  if (oldLevel === 11) {
    return {
      status: "MAPPED",
      proposedLevelNumber: 7,
      source: "LEVEL_COLLAPSE",
      note: null,
    };
  }

  return {
    status: "REVIEW_REQUIRED",
    proposedLevelNumber: null,
    source: "CURRENT_LEVEL_INVALID",
    note: `Unsupported current level: ${oldLevel || "null"}.`,
  };
}

function classifyEntitlementChange(currentEntitlement, proposedEntitlement) {
  if (currentEntitlement == null || proposedEntitlement == null) return "N/A";
  if (proposedEntitlement > currentEntitlement) return "INCREASE";
  if (proposedEntitlement < currentEntitlement) return "DECREASE";
  return "UNCHANGED";
}

async function main() {
  const leaveYear = parseLeaveYear();

  if (ZERMATT_DESIGNATION_LEVELS.length !== 120) {
    throw new Error(
      `AUTHORITATIVE_DESIGNATION_COUNT_CHANGED:${ZERMATT_DESIGNATION_LEVELS.length}`
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const liveDesignations = await prisma.designation.findMany({
    where: { organizationId: organization.id },
    select: {
      id: true,
      name: true,
      code: true,
      careerLevel: true,
      isActive: true,
      department: { select: { name: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const authoritativeByCode = new Map(
    ZERMATT_DESIGNATION_LEVELS.map((designation) => [
      normalizeCode(designation.code),
      designation,
    ])
  );
  const liveByCode = new Map(
    liveDesignations.map((designation) => [normalizeCode(designation.code), designation])
  );

  const designationRows = ZERMATT_DESIGNATION_LEVELS.map((designation, index) => {
    const live = liveByCode.get(normalizeCode(designation.code)) || null;
    const mapping = resolveV2DesignationMapping(designation);
    const proposedLevel = mapping.proposedLevelNumber
      ? V2_LEVEL_BY_NUMBER.get(mapping.proposedLevelNumber)
      : null;

    return {
      No: index + 1,
      Designation: designation.name,
      DesignationCode: designation.code,
      CareerTrack: designation.careerTrack,
      CurrentLevel: `L${designation.levelNumber} - ${currentLevelName(designation.levelNumber)}`,
      LiveCareerLevel: live?.careerLevel ?? "",
      ProposedLevel: proposedLevel
        ? `${proposedLevel.code} - ${proposedLevel.name}`
        : "REVIEW REQUIRED",
      ProposedAnnualLeaveDays: proposedLevel?.annualLeaveDays ?? "",
      MappingStatus: mapping.status,
      MappingSource: mapping.source,
      ReviewNote: mapping.note || "",
      LiveDesignationPresent: Boolean(live),
      LiveDesignationActive: live?.isActive ?? "",
      LiveDepartment: live?.department?.name || "",
    };
  });

  const authoritativeCodes = new Set(authoritativeByCode.keys());
  const extraLiveDesignations = liveDesignations.filter(
    (designation) => !authoritativeCodes.has(normalizeCode(designation.code))
  );
  const missingLiveDesignations = ZERMATT_DESIGNATION_LEVELS.filter(
    (designation) => !liveByCode.has(normalizeCode(designation.code))
  );

  const employees = await prisma.employee.findMany({
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
      gender: true,
      status: true,
      employmentType: true,
      department: { select: { name: true } },
      designation: {
        select: {
          id: true,
          name: true,
          code: true,
          careerLevel: true,
        },
      },
      location: { select: { name: true, code: true } },
    },
    orderBy: [{ employeeNumber: "asc" }],
  });

  const annualLeaveType = await prisma.leaveType.findFirst({
    where: {
      organizationId: organization.id,
      code: "ANNUAL",
    },
    select: { id: true, name: true, code: true },
  });

  const annualPolicy = await prisma.leavePolicy.findFirst({
    where: {
      organizationId: organization.id,
      code: ANNUAL_POLICY_CODE,
    },
    select: { id: true, code: true, name: true, versionNumber: true },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });

  const employeeIds = employees.map((employee) => employee.id);

  const balances = annualLeaveType
    ? await prisma.leaveBalance.findMany({
        where: {
          organizationId: organization.id,
          employeeId: { in: employeeIds },
          leaveTypeId: annualLeaveType.id,
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
      })
    : [];

  const allocations = annualPolicy
    ? await prisma.leaveEntitlementAllocation.findMany({
        where: {
          organizationId: organization.id,
          employeeId: { in: employeeIds },
          leavePolicyId: annualPolicy.id,
          leaveYear,
        },
        select: {
          id: true,
          employeeId: true,
          levelNumber: true,
          allocatedEntitlement: true,
          baseEntitlement: true,
          method: true,
          effectiveDate: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : [];

  const balanceByEmployeeId = new Map(
    balances.map((balance) => [balance.employeeId, balance])
  );
  const latestAllocationByEmployeeId = new Map();
  for (const allocation of allocations) {
    if (!latestAllocationByEmployeeId.has(allocation.employeeId)) {
      latestAllocationByEmployeeId.set(allocation.employeeId, allocation);
    }
  }

  const proposedDesignationByCode = new Map(
    ZERMATT_DESIGNATION_LEVELS.map((designation) => [
      normalizeCode(designation.code),
      designation,
    ])
  );

  const employeeRows = employees.map((employee, index) => {
    const correction = EMPLOYEE_SPECIFIC_DESIGNATION_CORRECTIONS.get(
      employee.employeeNumber
    );
    const currentDesignationCode = normalizeCode(employee.designation?.code);

    let proposedDesignation = employee.designation
      ? authoritativeByCode.get(currentDesignationCode) || {
          name: employee.designation.name,
          code: employee.designation.code,
          levelNumber: employee.designation.careerLevel,
          careerTrack: null,
        }
      : null;
    let employeeCorrectionStatus = "NONE";
    let employeeCorrectionNote = "";

    if (correction) {
      const target = proposedDesignationByCode.get(
        normalizeCode(correction.proposedDesignationCode)
      );
      if (!target) throw new Error("PROPOSED_DESIGNATION_NOT_FOUND");

      proposedDesignation = target;
      employeeCorrectionStatus =
        currentDesignationCode === normalizeCode(correction.proposedDesignationCode)
          ? "ALREADY_CORRECT"
          : "PROPOSED_DESIGNATION_CORRECTION";
      employeeCorrectionNote = correction.reason;

      if (
        correction.expectedCurrentDesignationCode &&
        currentDesignationCode !==
          normalizeCode(correction.expectedCurrentDesignationCode) &&
        currentDesignationCode !== normalizeCode(correction.proposedDesignationCode)
      ) {
        employeeCorrectionStatus = "REVIEW_REQUIRED_CURRENT_DESIGNATION_CHANGED";
        employeeCorrectionNote += ` Expected current designation ${correction.expectedCurrentDesignationCode}, found ${currentDesignationCode || "none"}.`;
      }
    }

    const mapping = resolveV2DesignationMapping(proposedDesignation);
    const proposedLevel = mapping.proposedLevelNumber
      ? V2_LEVEL_BY_NUMBER.get(mapping.proposedLevelNumber)
      : null;

    const fullTime = isFullTime(employee.employmentType);
    const balance = balanceByEmployeeId.get(employee.id) || null;
    const latestAllocation = latestAllocationByEmployeeId.get(employee.id) || null;
    const currentEntitlement =
      toNumber(latestAllocation?.allocatedEntitlement) ??
      toNumber(balance?.openingBalance);
    const proposedEntitlement = fullTime
      ? proposedLevel?.annualLeaveDays ?? null
      : null;
    const entitlementChange = classifyEntitlementChange(
      currentEntitlement,
      proposedEntitlement
    );
    const used = toNumber(balance?.used) ?? 0;

    const riskFlags = [];
    if (mapping.status !== "MAPPED") riskFlags.push("LEVEL_REVIEW_REQUIRED");
    if (employeeCorrectionStatus.startsWith("REVIEW_REQUIRED")) {
      riskFlags.push("EMPLOYEE_DESIGNATION_REVIEW_REQUIRED");
    }
    if (fullTime && currentEntitlement == null) {
      riskFlags.push("CURRENT_ANNUAL_ENTITLEMENT_NOT_FOUND");
    }
    if (fullTime && proposedEntitlement != null && used > proposedEntitlement) {
      riskFlags.push("PROPOSED_ENTITLEMENT_BELOW_USED");
    }

    return {
      No: index + 1,
      EmployeeNumber: employee.employeeNumber,
      EmployeeName: employeeName(employee),
      Department: employee.department?.name || "",
      Branch: employee.location?.name || "",
      EmploymentType: employee.employmentType || "",
      Status: employee.status,
      CurrentDesignation: employee.designation?.name || "",
      CurrentDesignationCode: employee.designation?.code || "",
      CurrentLevel: employee.designation?.careerLevel
        ? `L${employee.designation.careerLevel} - ${currentLevelName(employee.designation.careerLevel)}`
        : "UNMAPPED",
      ProposedDesignation: proposedDesignation?.name || "",
      ProposedDesignationCode: proposedDesignation?.code || "",
      ProposedLevel: proposedLevel
        ? `${proposedLevel.code} - ${proposedLevel.name}`
        : "REVIEW REQUIRED",
      CurrentAnnualEntitlement: currentEntitlement ?? "",
      ProposedAnnualEntitlement: proposedEntitlement ?? "",
      AnnualEntitlementDelta:
        currentEntitlement != null && proposedEntitlement != null
          ? proposedEntitlement - currentEntitlement
          : "",
      EntitlementChange: entitlementChange,
      AnnualLeaveUsed: used,
      CurrentOpeningBalance: toNumber(balance?.openingBalance) ?? "",
      CurrentAccrued: toNumber(balance?.accrued) ?? "",
      CurrentCarryForward: toNumber(balance?.carriedForward) ?? "",
      CurrentAdjusted: toNumber(balance?.adjusted) ?? "",
      LatestAllocationLevel: latestAllocation?.levelNumber ?? "",
      LatestAllocationMethod: latestAllocation?.method || "",
      MappingStatus: mapping.status,
      MappingSource: mapping.source,
      MappingReviewNote: mapping.note || "",
      EmployeeCorrectionStatus: employeeCorrectionStatus,
      EmployeeCorrectionNote: employeeCorrectionNote,
      RiskFlags: riskFlags.join(" | "),
    };
  });

  const designationReviewRows = designationRows.filter(
    (row) => row.MappingStatus !== "MAPPED" || !row.LiveDesignationPresent
  );
  const employeeReviewRows = employeeRows.filter(
    (row) => row.RiskFlags || row.EmployeeCorrectionStatus !== "NONE"
  );

  const designationSummary = ZERMATT_V2_LEVELS.map((level) => ({
    Level: level.code,
    Name: level.name,
    AnnualLeaveDays: level.annualLeaveDays,
    Designations: designationRows.filter(
      (row) => row.ProposedLevel.startsWith(`${level.code} -`)
    ).length,
  }));

  const employeeLevelSummary = ZERMATT_V2_LEVELS.map((level) => ({
    Level: level.code,
    Name: level.name,
    AnnualLeaveDays: level.annualLeaveDays,
    CurrentEmployees: employeeRows.filter(
      (row) => row.ProposedLevel.startsWith(`${level.code} -`)
    ).length,
    FullTimeEmployees: employeeRows.filter(
      (row) =>
        row.ProposedLevel.startsWith(`${level.code} -`) &&
        isFullTime(row.EmploymentType)
    ).length,
  }));

  const entitlementSummary = ["INCREASE", "DECREASE", "UNCHANGED", "N/A"].map(
    (change) => ({
      Change: change,
      Employees: employeeRows.filter((row) => row.EntitlementChange === change)
        .length,
    })
  );

  const outputDirectory = process.cwd();
  const designationCsv = path.join(
    outputDirectory,
    `zermatt-v2-designation-impact-preview-${leaveYear}.csv`
  );
  const employeeCsv = path.join(
    outputDirectory,
    `zermatt-v2-employee-impact-preview-${leaveYear}.csv`
  );
  const reviewCsv = path.join(
    outputDirectory,
    `zermatt-v2-review-items-${leaveYear}.csv`
  );
  const jsonPath = path.join(
    outputDirectory,
    `zermatt-v2-impact-summary-${leaveYear}.json`
  );

  writeCsv(designationCsv, designationRows);
  writeCsv(employeeCsv, employeeRows);
  writeCsv(reviewCsv, employeeReviewRows);

  const summary = {
    mode: "READ_ONLY_ZERMATT_EMPLOYMENT_LEVEL_V2_IMPACT_PREVIEW",
    databaseWritesIssued: 0,
    organization: organization.name,
    leaveYear,
    proposedLevels: ZERMATT_V2_LEVELS,
    authoritativeDesignationCount: ZERMATT_DESIGNATION_LEVELS.length,
    liveDesignationCount: liveDesignations.length,
    missingLiveDesignationCount: missingLiveDesignations.length,
    extraLiveDesignationCount: extraLiveDesignations.length,
    designationReviewRequiredCount: designationReviewRows.length,
    currentEmployeeCount: employees.length,
    fullTimeEmployeeCount: employees.filter((employee) =>
      isFullTime(employee.employmentType)
    ).length,
    employeeReviewItemCount: employeeReviewRows.length,
    designationSummary,
    employeeLevelSummary,
    entitlementSummary,
    specificChecks: employeeRows.filter((row) =>
      ["ZLL000087", "ZLL000119"].includes(row.EmployeeNumber)
    ),
    files: {
      designationCsv,
      employeeCsv,
      reviewCsv,
    },
  };

  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n============================================================");
  console.log("ZERMATT EMPLOYMENT LEVEL V2 — READ-ONLY IMPACT PREVIEW");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Leave Year: ${leaveYear}`);
  console.log(`Authoritative Designations: ${ZERMATT_DESIGNATION_LEVELS.length}`);
  console.log(`Live Designations: ${liveDesignations.length}`);
  console.log(`Current Employees: ${employees.length}`);
  console.log(
    `Full-Time Employees: ${employees.filter((employee) => isFullTime(employee.employmentType)).length}`
  );
  console.log(`Database Writes Issued: 0`);

  console.log("\nPROPOSED LEVELS");
  console.table(designationSummary);

  console.log("\nCURRENT EMPLOYEES BY PROPOSED LEVEL");
  console.table(employeeLevelSummary);

  console.log("\nANNUAL LEAVE IMPACT");
  console.table(entitlementSummary);

  console.log("\nSPECIFIC MANAGEMENT CORRECTIONS / CHECKS");
  console.table(
    employeeRows
      .filter((row) => ["ZLL000087", "ZLL000119"].includes(row.EmployeeNumber))
      .map((row) => ({
        EmployeeNumber: row.EmployeeNumber,
        EmployeeName: row.EmployeeName,
        CurrentDesignation: row.CurrentDesignation,
        ProposedDesignation: row.ProposedDesignation,
        ProposedLevel: row.ProposedLevel,
        CurrentAnnual: row.CurrentAnnualEntitlement,
        ProposedAnnual: row.ProposedAnnualEntitlement,
        Correction: row.EmployeeCorrectionStatus,
        RiskFlags: row.RiskFlags,
      }))
  );

  if (designationReviewRows.length) {
    console.log("\nDESIGNATION REVIEW REQUIRED");
    console.table(
      designationReviewRows.map((row) => ({
        DesignationCode: row.DesignationCode,
        Designation: row.Designation,
        CurrentLevel: row.CurrentLevel,
        ProposedLevel: row.ProposedLevel,
        Note: row.ReviewNote,
      }))
    );
  }

  if (missingLiveDesignations.length) {
    console.log("\nAUTHORITATIVE DESIGNATIONS MISSING FROM LIVE TENANT");
    console.table(
      missingLiveDesignations.map((designation) => ({
        Code: designation.code,
        Designation: designation.name,
      }))
    );
  }

  if (extraLiveDesignations.length) {
    console.log("\nLIVE DESIGNATIONS OUTSIDE AUTHORITATIVE 120-CATALOGUE");
    console.table(
      extraLiveDesignations.map((designation) => ({
        Code: designation.code,
        Designation: designation.name,
        CareerLevel: designation.careerLevel,
      }))
    );
  }

  console.log("\nFILES GENERATED");
  console.log(`- ${designationCsv}`);
  console.log(`- ${employeeCsv}`);
  console.log(`- ${reviewCsv}`);
  console.log(`- ${jsonPath}`);
  console.log("\nNO DATABASE CHANGES WERE MADE.");
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error("ZERMATT v2 impact preview failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
