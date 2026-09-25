const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ZERMATT_EMPLOYMENT_LEVELS_V3,
  ZERMATT_V3_DESIGNATION_LEVELS,
  resolveZermattV3DesignationLevel,
  resolveZermattV3Level,
  isZermattV3InternalLevel,
} = require("../src/config/zermattEmploymentLevelsV3");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

function byCode(code) {
  const item = resolveZermattV3DesignationLevel({ code });
  assert.ok(item, `Expected ${code} to have a V3 mapping`);
  return item;
}

test("ZERMATT V3 uses the approved seven-level employment and annual leave structure", () => {
  assert.deepEqual(
    ZERMATT_EMPLOYMENT_LEVELS_V3.map((level) => ({
      code: level.code,
      internal: level.levelNumber,
      name: level.name,
      annualLeaveDays: level.annualLeaveDays,
    })),
    [
      { code: "L1", internal: 201, name: "Operations Support", annualLeaveDays: 14 },
      { code: "L2", internal: 202, name: "Branch Junior Officers and Team Leadership", annualLeaveDays: 16 },
      { code: "L3", internal: 203, name: "Senior Officers and Branch Supervisors", annualLeaveDays: 21 },
      { code: "L4", internal: 204, name: "Assistant Branch Management", annualLeaveDays: 24 },
      { code: "L5", internal: 205, name: "Branch Management", annualLeaveDays: 28 },
      { code: "L6", internal: 206, name: "Senior Management", annualLeaveDays: 30 },
      { code: "L7", internal: 207, name: "General Management", annualLeaveDays: 35 },
    ]
  );

  assert.equal(ZERMATT_V3_DESIGNATION_LEVELS.length, 120);
  assert.equal(resolveZermattV3Level(201).annualLeaveDays, 14);
  assert.equal(resolveZermattV3Level(202).annualLeaveDays, 16);
  assert.equal(resolveZermattV3Level(203).annualLeaveDays, 21);
  assert.equal(resolveZermattV3Level(204).annualLeaveDays, 24);
  assert.equal(resolveZermattV3Level(205).annualLeaveDays, 28);
  assert.equal(resolveZermattV3Level(206).annualLeaveDays, 30);
  assert.equal(resolveZermattV3Level(207).annualLeaveDays, 35);
  assert.equal(isZermattV3InternalLevel(207), true);
  assert.equal(isZermattV3InternalLevel(107), false);
});

test("approved named ZERMATT roles map to the intended V3 levels", () => {
  assert.equal(byCode("EXEC-GM").levelCode, "L7");

  assert.equal(byCode("HRA-HOD").levelCode, "L6");
  assert.equal(byCode("FIN-CA").levelCode, "L6");
  assert.equal(byCode("WHSE-MGR").levelCode, "L6");
  assert.equal(byCode("AIC-HOD").levelCode, "L6");

  assert.equal(byCode("BBO-BOM").levelCode, "L5");
  assert.equal(byCode("ZOP-BOM").levelCode, "L5");
  assert.equal(byCode("FIN-BA").levelCode, "L5");

  assert.equal(byCode("BBO-ABOM").levelCode, "L4");
  assert.equal(byCode("ZOP-ABOM").levelCode, "L4");

  assert.equal(byCode("HRA-OFF").levelCode, "L3");
  assert.equal(byCode("HRA-SRO").levelCode, "L3");
  assert.equal(byCode("EXEC-PAES").levelCode, "L3");
  assert.equal(byCode("BBO-FOS").levelCode, "L3");
  assert.equal(byCode("ZOP-FOS").levelCode, "L3");

  assert.equal(byCode("FIN-AO").levelCode, "L2");
  assert.equal(byCode("PROC-OFF").levelCode, "L2");
  assert.equal(byCode("BBO-BTL").levelCode, "L2");
  assert.equal(byCode("BBO-TL").levelCode, "L2");

  assert.equal(byCode("BBO-TA").levelCode, "L1");
  assert.equal(byCode("BBO-WTR").levelCode, "L1");
  assert.equal(byCode("WHSE-LOAD").levelCode, "L1");
});

test("V3 leave services prefer V3 while preserving V1/V2 compatibility", () => {
  const leaveService = read("backend/src/services/zermattLeaveEntitlementService.js");
  assert.match(leaveService, /ZERMATT_EMPLOYMENT_LEVELS_V3/);
  assert.match(leaveService, /hierarchyVersion === "V3"/);
  assert.match(leaveService, /isZermattV3InternalLevel/);
  assert.match(leaveService, /V3_SENTINEL_LEVEL_NUMBER = 201/);
  assert.match(leaveService, /return \{ version: "V3", levels: ZERMATT_EMPLOYMENT_LEVELS_V3 \}/);

  const liveService = read("backend/src/services/zermattEmployeeLevelLiveService.js");
  assert.match(liveService, /isZermattV3InternalLevel/);
  assert.match(liveService, /resolveZermattV3Level/);
  assert.match(liveService, /hierarchyVersion/);
});

test("V3 activation is preview-first and preserves V2 history", () => {
  const activation = read("backend/scripts/apply-zermatt-employment-level-v3.cjs");
  assert.match(activation, /process\.argv\.includes\("--apply"\)/);
  assert.match(activation, /Database Writes Issued: 0/);
  assert.match(activation, /V2_L\$\{publicNumber\}/);
  assert.match(activation, /hierarchyVersion: "V3"/);
  assert.match(activation, /ZERMATT_EMPLOYMENT_LEVEL_V3_ACTIVATED/);
  assert.match(activation, /provisionAllCurrentFullTimeEmployees/);
  assert.match(activation, /isolationLevel: "Serializable"/);
});

console.log("PASS: ZERMATT Employment Level V3 structure acceptance checks.");
