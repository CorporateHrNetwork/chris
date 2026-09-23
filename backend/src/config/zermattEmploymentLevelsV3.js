const {
  ZERMATT_V2_DESIGNATION_LEVELS,
} = require("./zermattEmploymentLevelsV2");

/*
 * ZERMATT Employment Level Hierarchy V3
 * -------------------------------------
 * Management-approved structure effective from activation.
 *
 * Public HR grades remain L1-L7, but V3 uses internal levelNumber 201-207 so
 * historical V1/V2 employment-level references and leave allocations retain
 * their original meaning.
 */
const ZERMATT_V3_INTERNAL_OFFSET = 200;

const ZERMATT_EMPLOYMENT_LEVELS_V3 = [
  {
    publicLevelNumber: 1,
    code: "L1",
    name: "Operations Support",
    roleScope: "Operations Support Staff",
    description: "Performs frontline and support duties within an assigned team or branch.",
    annualLeaveDays: 14,
  },
  {
    publicLevelNumber: 2,
    code: "L2",
    name: "Branch Junior Officers and Team Leadership",
    roleScope: "Other Officers; Team Leaders",
    description: "Performs assigned officer duties or coordinates a branch team.",
    annualLeaveDays: 16,
  },
  {
    publicLevelNumber: 3,
    code: "L3",
    name: "Senior Officers and Branch Supervisors",
    roleScope: "HR & Admin Officers; P.A. to the GM; Branch Operations Supervisors",
    description: "HR & Admin Officers and supervisors serve their assigned branches. The P.A. supports the GM centrally.",
    annualLeaveDays: 21,
  },
  {
    publicLevelNumber: 4,
    code: "L4",
    name: "Assistant Branch Management",
    roleScope: "Assistant Operations Managers",
    description: "Supports and deputises for the Branch Operations Manager within an assigned branch.",
    annualLeaveDays: 24,
  },
  {
    publicLevelNumber: 5,
    code: "L5",
    name: "Branch Management",
    roleScope: "Branch Operations Managers; Branch Accountants",
    description: "Manages operations or accounts within an assigned branch.",
    annualLeaveDays: 28,
  },
  {
    publicLevelNumber: 6,
    code: "L6",
    name: "Senior Management",
    roleScope: "Branch Business Managers; Head of Human Resources; Head of Finance & Accounts; Head of Warehousing & Stores; Head of Internal Audit & Controls",
    description: "Functional heads have organisation-wide responsibility. Each Branch Business Manager leads the business of an assigned branch.",
    annualLeaveDays: 30,
  },
  {
    publicLevelNumber: 7,
    code: "L7",
    name: "General Management",
    roleScope: "General Manager",
    description: "Overall organisation-wide leadership across all Zermatt locations and functions.",
    annualLeaveDays: 35,
  },
].map((level) => ({
  ...level,
  levelNumber: ZERMATT_V3_INTERNAL_OFFSET + level.publicLevelNumber,
  displayOrder: level.publicLevelNumber,
  isActive: true,
}));

const ZERMATT_V3_LEVEL_BY_PUBLIC_NUMBER = new Map(
  ZERMATT_EMPLOYMENT_LEVELS_V3.map((level) => [level.publicLevelNumber, level])
);
const ZERMATT_V3_LEVEL_BY_INTERNAL_NUMBER = new Map(
  ZERMATT_EMPLOYMENT_LEVELS_V3.map((level) => [level.levelNumber, level])
);

const GENERAL_MANAGEMENT_CODES = new Set(["EXEC-MD", "EXEC-GM", "EXEC-DGM"]);

const SENIOR_MANAGEMENT_CODES = new Set([
  "HRA-HOD",
  "FIN-CA",
  "AIC-HOD",
  "WHSE-MGR",
  "SEC-HOD",
  "ICT-HOD",
  "EXEC-CS",
  "HRA-MGR",
  "AIC-MGR",
  "PROC-MGR",
  "LOG-MGR",
  "ENT-MGR",
]);

const BRANCH_MANAGEMENT_CODES = new Set([
  "BBO-BOM",
  "BBO-FOM",
  "ZOP-BOM",
  "ZOP-FOM",
  "FIN-BA",
]);

const ASSISTANT_BRANCH_MANAGEMENT_CODES = new Set([
  "BBO-ABOM",
  "BBO-AFOM",
  "ZOP-ABOM",
  "ZOP-AFOM",
]);

const SENIOR_OFFICER_AND_SUPERVISOR_CODES = new Set([
  "HRA-SRO",
  "HRA-OFF",
  "PROC-SRO",
  "SEC-SSO",
  "EXEC-EA",
  "EXEC-PAES",
  "BBO-FOS",
  "ZOP-FOS",
  "WHSE-SUP",
  "LOG-SUP",
  "SEC-SUP",
  "HKF-AHS",
]);

const TEAM_LEADER_CODES = new Set([
  "BBO-BTL",
  "BBO-ABTL",
  "BBO-HC",
  "BBO-SC",
  "BBO-TL",
  "BBO-ATL",
  "SEC-CB",
  "SEC-TMTL",
  "HKF-HTL",
]);

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function isOfficerOrProfessional(reference) {
  const name = String(reference?.name || "").toLowerCase();
  return (
    /\bofficer\b/.test(name) ||
    /\bauditor\b/.test(name) ||
    /\baccountant\b/.test(name) ||
    /\brepresentative\b/.test(name) ||
    /\badministrator\b/.test(name) ||
    /\bengineer\b/.test(name) ||
    /\btechnician\b/.test(name) ||
    /\bcoordinator\b/.test(name)
  );
}

function resolveV3PublicLevel(reference) {
  const code = normalize(reference?.code);

  if (GENERAL_MANAGEMENT_CODES.has(code)) return 7;
  if (SENIOR_MANAGEMENT_CODES.has(code)) return 6;
  if (BRANCH_MANAGEMENT_CODES.has(code)) return 5;
  if (ASSISTANT_BRANCH_MANAGEMENT_CODES.has(code)) return 4;
  if (SENIOR_OFFICER_AND_SUPERVISOR_CODES.has(code)) return 3;
  if (TEAM_LEADER_CODES.has(code)) return 2;
  if (isOfficerOrProfessional(reference)) return 2;
  return 1;
}

const ZERMATT_V3_DESIGNATION_LEVELS = ZERMATT_V2_DESIGNATION_LEVELS.map((reference) => {
  const publicLevelNumber = resolveV3PublicLevel(reference);
  const level = ZERMATT_V3_LEVEL_BY_PUBLIC_NUMBER.get(publicLevelNumber);
  if (!level) throw new Error(`ZERMATT_V3_LEVEL_REQUIRED:${reference.code}`);

  return {
    ...reference,
    v2LevelNumber: reference.levelNumber,
    levelNumber: level.levelNumber,
    publicLevelNumber,
    levelCode: level.code,
    levelName: level.name,
    annualLeaveDays: level.annualLeaveDays,
  };
});

const ZERMATT_V3_DESIGNATION_BY_CODE = new Map();
for (const item of ZERMATT_V3_DESIGNATION_LEVELS) {
  const code = normalize(item.code);
  if (!code || ZERMATT_V3_DESIGNATION_BY_CODE.has(code)) {
    throw new Error(`ZERMATT_V3_DUPLICATE_DESIGNATION_CODE:${code}`);
  }
  ZERMATT_V3_DESIGNATION_BY_CODE.set(code, item);
}

function resolveZermattV3DesignationLevel(designation) {
  const code = normalize(designation?.code);
  return code ? ZERMATT_V3_DESIGNATION_BY_CODE.get(code) || null : null;
}

function resolveZermattV3Level(levelNumber) {
  return ZERMATT_V3_LEVEL_BY_INTERNAL_NUMBER.get(Number(levelNumber)) || null;
}

function isZermattV3InternalLevel(levelNumber) {
  return ZERMATT_V3_LEVEL_BY_INTERNAL_NUMBER.has(Number(levelNumber));
}

module.exports = {
  ZERMATT_V3_INTERNAL_OFFSET,
  ZERMATT_EMPLOYMENT_LEVELS_V3,
  ZERMATT_V3_DESIGNATION_LEVELS,
  ZERMATT_V3_LEVEL_BY_PUBLIC_NUMBER,
  ZERMATT_V3_LEVEL_BY_INTERNAL_NUMBER,
  GENERAL_MANAGEMENT_CODES,
  SENIOR_MANAGEMENT_CODES,
  BRANCH_MANAGEMENT_CODES,
  ASSISTANT_BRANCH_MANAGEMENT_CODES,
  SENIOR_OFFICER_AND_SUPERVISOR_CODES,
  TEAM_LEADER_CODES,
  resolveV3PublicLevel,
  resolveZermattV3DesignationLevel,
  resolveZermattV3Level,
  isZermattV3InternalLevel,
};
