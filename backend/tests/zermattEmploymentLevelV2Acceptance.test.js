const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ZERMATT_EMPLOYMENT_LEVELS_V2,
  ZERMATT_V2_DESIGNATION_LEVELS,
  resolveZermattV2DesignationLevel,
  resolveZermattV2Level,
} = require("../src/config/zermattEmploymentLevelsV2");

function byCode(code) {
  const resolved = resolveZermattV2DesignationLevel({ code });
  assert.ok(resolved, `Expected ${code} to have an approved V2 mapping.`);
  return resolved;
}

assert.deepStrictEqual(
  ZERMATT_EMPLOYMENT_LEVELS_V2.map((level) => ({
    code: level.code,
    internal: level.levelNumber,
    public: level.publicLevelNumber,
    name: level.name,
    annual: level.annualLeaveDays,
  })),
  [
    { code: "L1", internal: 101, public: 1, name: "Entry / Support / Junior Officer", annual: 14 },
    { code: "L2", internal: 102, public: 2, name: "Team Leader", annual: 14 },
    { code: "L3", internal: 103, public: 3, name: "Supervisors / Officers / Executive Assistant / Executive Secretary", annual: 21 },
    { code: "L4", internal: 104, public: 4, name: "Assistant Manager", annual: 22 },
    { code: "L5", internal: 105, public: 5, name: "Junior Manager / Manager", annual: 24 },
    { code: "L6", internal: 106, public: 6, name: "Head / Senior Management", annual: 28 },
    { code: "L7", internal: 107, public: 7, name: "Executive Management", annual: 30 },
  ]
);

assert.strictEqual(ZERMATT_V2_DESIGNATION_LEVELS.length, 120);

const designationCounts = new Map();
for (const designation of ZERMATT_V2_DESIGNATION_LEVELS) {
  designationCounts.set(
    designation.publicLevelNumber,
    (designationCounts.get(designation.publicLevelNumber) || 0) + 1
  );
}
assert.deepStrictEqual(
  [1, 2, 3, 4, 5, 6, 7].map((level) => designationCounts.get(level) || 0),
  [43, 9, 45, 4, 10, 6, 3]
);

// Management-approved specific classifications.
assert.strictEqual(byCode("EXEC-PAES").levelNumber, 103);
assert.strictEqual(byCode("EXEC-EA").levelNumber, 103);
assert.strictEqual(byCode("SEC-SO").levelNumber, 103);
assert.strictEqual(byCode("AIC-HOD").levelNumber, 106);
assert.strictEqual(byCode("AIC-IA").levelNumber, 103);
assert.strictEqual(byCode("EXEC-CS").levelNumber, 106);
assert.strictEqual(byCode("EXEC-MD").levelNumber, 107);
assert.strictEqual(byCode("EXEC-GM").levelNumber, 107);
assert.strictEqual(byCode("EXEC-DGM").levelNumber, 107);

// Old V1 L3 is intentionally designation-specific, not blanket-converted.
assert.strictEqual(byCode("HRA-AST").levelNumber, 101);
assert.strictEqual(byCode("FIN-AA").levelNumber, 101);
assert.strictEqual(byCode("AIC-AA").levelNumber, 101);
assert.strictEqual(byCode("BBO-ABTL").levelNumber, 102);
assert.strictEqual(byCode("BBO-SC").levelNumber, 102);
assert.strictEqual(byCode("BBO-SSA").levelNumber, 101);
assert.strictEqual(byCode("BBO-ATL").levelNumber, 102);
assert.strictEqual(byCode("PROC-AST").levelNumber, 101);
assert.strictEqual(byCode("WHSE-SK").levelNumber, 101);
assert.strictEqual(byCode("LOG-SD").levelNumber, 101);
assert.strictEqual(byCode("SEC-SSO").levelNumber, 103);
assert.strictEqual(byCode("HKF-AHS").levelNumber, 103);
assert.strictEqual(byCode("HKF-SH").levelNumber, 101);
assert.strictEqual(byCode("ENT-IDJ").levelNumber, 101);
assert.strictEqual(byCode("ENT-MC").levelNumber, 101);
assert.strictEqual(byCode("ENT-AV").levelNumber, 101);
assert.strictEqual(byCode("ICT-AST").levelNumber, 101);

assert.strictEqual(resolveZermattV2Level(101).annualLeaveDays, 14);
assert.strictEqual(resolveZermattV2Level(103).annualLeaveDays, 21);
assert.strictEqual(resolveZermattV2Level(104).annualLeaveDays, 22);
assert.strictEqual(resolveZermattV2Level(105).annualLeaveDays, 24);
assert.strictEqual(resolveZermattV2Level(106).annualLeaveDays, 28);
assert.strictEqual(resolveZermattV2Level(107).annualLeaveDays, 30);

const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/services/zermattLeaveEntitlementService.js"),
  "utf8"
);
assert.match(serviceSource, /employmentTypes:\s*\["Full-Time",\s*"Expatriate"\]/);
assert.match(serviceSource, /hierarchyVersion === "V2" && isExpatriate/);
assert.match(serviceSource, /V2_SENTINEL_LEVEL_NUMBER = 101/);
assert.match(serviceSource, /isZermattV2InternalLevel/);

const activationSource = fs.readFileSync(
  path.join(__dirname, "../scripts/apply-zermatt-employment-level-v2.cjs"),
  "utf8"
);
assert.match(activationSource, /process\.argv\.includes\("--apply"\)/);
assert.match(activationSource, /V1_L\$\{level\.levelNumber\}/);
assert.match(activationSource, /historicalV1EmploymentLevelsPreserved: true/);
assert.match(activationSource, /historicalV1PolicyVersionsPreserved: true/);
assert.match(activationSource, /historicalLeaveAllocationsNotRewritten: true/);
assert.match(activationSource, /NWI_GWE_TARGET_DESIGNATION = "AIC-HOD"/);
assert.match(activationSource, /ESTHER_DESIGNATION_CODE = "EXEC-PAES"/);
assert.match(activationSource, /annualEligibility: \["Full-Time", "Expatriate"\]/);
assert.match(activationSource, /isolationLevel: "Serializable"/);

console.log("PASS: ZERMATT Employment Level V2 seven-level hierarchy acceptance checks.");