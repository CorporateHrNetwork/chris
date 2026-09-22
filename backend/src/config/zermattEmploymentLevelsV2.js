const {
  ZERMATT_DESIGNATION_LEVELS,
} = require("./zermattEmploymentLevels");

/*
 * ZERMATT Employment Level Hierarchy V2
 * -------------------------------------
 * Public HR grades are L1-L7. Internal levelNumber values deliberately use
 * 101-107 so existing V1 level rows (1-11) remain addressable by historical
 * LeaveEntitlementAllocation records. Do not collapse V2 back onto 1-7 unless
 * historical allocations have first been given their own immutable hierarchy
 * version key.
 */
const ZERMATT_V2_INTERNAL_OFFSET = 100;

const ZERMATT_EMPLOYMENT_LEVELS_V2 = [
  {
    publicLevelNumber: 1,
    code: "L1",
    name: "Entry / Support / Junior Officer",
    description: "Entry, support, assistant, junior operational, junior technical and junior officer roles.",
    annualLeaveDays: 14,
  },
  {
    publicLevelNumber: 2,
    code: "L2",
    name: "Team Leader",
    description: "Front-line team leaders coordinating a defined team, shift or service group.",
    annualLeaveDays: 14,
  },
  {
    publicLevelNumber: 3,
    code: "L3",
    name: "Supervisors / Officers / Executive Assistant / Executive Secretary",
    description: "Supervisors, officers, professional contributors and approved executive-support roles.",
    annualLeaveDays: 21,
  },
  {
    publicLevelNumber: 4,
    code: "L4",
    name: "Assistant Manager",
    description: "Assistant managers supporting management of a branch, unit, floor or function.",
    annualLeaveDays: 22,
  },
  {
    publicLevelNumber: 5,
    code: "L5",
    name: "Junior Manager / Manager",
    description: "Junior managers and managers accountable for a branch, unit, function or material operating area.",
    annualLeaveDays: 24,
  },
  {
    publicLevelNumber: 6,
    code: "L6",
    name: "Head / Senior Management",
    description: "Heads of function, Company Secretary and senior management below executive management.",
    annualLeaveDays: 28,
  },
  {
    publicLevelNumber: 7,
    code: "L7",
    name: "Executive Management",
    description: "Managing Director, General Manager, Deputy General Manager and equivalent executive leadership roles.",
    annualLeaveDays: 30,
  },
].map((level) => ({
  ...level,
  levelNumber: ZERMATT_V2_INTERNAL_OFFSET + level.publicLevelNumber,
  displayOrder: level.publicLevelNumber,
  isActive: true,
}));

const ZERMATT_V2_LEVEL_BY_PUBLIC_NUMBER = new Map(
  ZERMATT_EMPLOYMENT_LEVELS_V2.map((level) => [level.publicLevelNumber, level])
);
const ZERMATT_V2_LEVEL_BY_INTERNAL_NUMBER = new Map(
  ZERMATT_EMPLOYMENT_LEVELS_V2.map((level) => [level.levelNumber, level])
);

/*
 * Old V1 L3 was a mixed group and was approved designation-by-designation.
 * Never replace this with a blanket V1-L3 mapping.
 */
const V1_L3_TO_V2_PUBLIC_LEVEL = new Map([
  ["HRA-AST", 1],
  ["FIN-AA", 1],
  ["AIC-AA", 1],
  ["PROC-AST", 1],
  ["WHSE-SK", 1],
  ["LOG-SD", 1],
  ["HKF-SH", 1],
  ["ENT-IDJ", 1],
  ["ENT-MC", 1],
  ["ENT-AV", 1],
  ["ICT-AST", 1],
  ["BBO-SSA", 1],
  ["BBO-ABTL", 2],
  ["BBO-SC", 2],
  ["BBO-ATL", 2],
  ["SEC-SSO", 3],
  ["HKF-AHS", 3],
]);

const DESIGNATION_V2_OVERRIDES = new Map([
  // Officer title: approved for V2 Officer band even though V1 placed it at L2.
  ["SEC-SO", 3],

  // Approved executive-support classification.
  ["EXEC-EA", 3],
  ["EXEC-PAES", 3],

  // Corporate governance is Head / Senior Management, not Executive Secretary.
  ["EXEC-CS", 6],

  // Deputy General Manager belongs to Executive Management in the new hierarchy.
  ["EXEC-DGM", 7],
]);

function normalizeDesignationCode(value) {
  return String(value || "").trim().toUpperCase();
}

function resolvePublicLevelFromV1Reference(reference) {
  if (!reference) return null;
  const code = normalizeDesignationCode(reference.code);
  const oldLevel = Number(reference.levelNumber || 0);

  if (DESIGNATION_V2_OVERRIDES.has(code)) {
    return DESIGNATION_V2_OVERRIDES.get(code);
  }

  if (oldLevel === 3) {
    return V1_L3_TO_V2_PUBLIC_LEVEL.get(code) || null;
  }

  if (oldLevel === 1 || oldLevel === 2) return 1;
  if (oldLevel === 4) return 2;
  if ([5, 6, 7].includes(oldLevel)) return 3;
  if (oldLevel === 8) return 4;
  if (oldLevel === 9) return 5;
  if (oldLevel === 10) return 6;
  if (oldLevel === 11) return 7;
  return null;
}

const ZERMATT_V2_DESIGNATION_LEVELS = ZERMATT_DESIGNATION_LEVELS.map((reference) => {
  const publicLevelNumber = resolvePublicLevelFromV1Reference(reference);
  if (!publicLevelNumber) {
    throw new Error(`ZERMATT_V2_DESIGNATION_MAPPING_REQUIRED:${reference.code}`);
  }
  const level = ZERMATT_V2_LEVEL_BY_PUBLIC_NUMBER.get(publicLevelNumber);
  return {
    ...reference,
    v1LevelNumber: reference.levelNumber,
    levelNumber: level.levelNumber,
    publicLevelNumber,
    levelCode: level.code,
    levelName: level.name,
    annualLeaveDays: level.annualLeaveDays,
  };
});

if (ZERMATT_V2_DESIGNATION_LEVELS.length !== 120) {
  throw new Error(
    `ZERMATT_V2_AUTHORITATIVE_DESIGNATION_COUNT_CHANGED:${ZERMATT_V2_DESIGNATION_LEVELS.length}`
  );
}

const ZERMATT_V2_DESIGNATION_BY_CODE = new Map();
for (const item of ZERMATT_V2_DESIGNATION_LEVELS) {
  const code = normalizeDesignationCode(item.code);
  if (!code || ZERMATT_V2_DESIGNATION_BY_CODE.has(code)) {
    throw new Error(`ZERMATT_V2_DUPLICATE_DESIGNATION_CODE:${code}`);
  }
  ZERMATT_V2_DESIGNATION_BY_CODE.set(code, item);
}

function resolveZermattV2DesignationLevel(designation) {
  const code = normalizeDesignationCode(designation?.code);
  return code ? ZERMATT_V2_DESIGNATION_BY_CODE.get(code) || null : null;
}

function resolveZermattV2Level(levelNumber) {
  return ZERMATT_V2_LEVEL_BY_INTERNAL_NUMBER.get(Number(levelNumber)) || null;
}

function isZermattV2InternalLevel(levelNumber) {
  return ZERMATT_V2_LEVEL_BY_INTERNAL_NUMBER.has(Number(levelNumber));
}

module.exports = {
  ZERMATT_V2_INTERNAL_OFFSET,
  ZERMATT_EMPLOYMENT_LEVELS_V2,
  ZERMATT_V2_DESIGNATION_LEVELS,
  ZERMATT_V2_LEVEL_BY_PUBLIC_NUMBER,
  ZERMATT_V2_LEVEL_BY_INTERNAL_NUMBER,
  V1_L3_TO_V2_PUBLIC_LEVEL,
  DESIGNATION_V2_OVERRIDES,
  resolveZermattV2DesignationLevel,
  resolveZermattV2Level,
  isZermattV2InternalLevel,
};