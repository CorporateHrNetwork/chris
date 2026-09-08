const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ZERMATT_EMPLOYMENT_LEVELS,
  ZERMATT_DESIGNATION_LEVELS,
  resolveZermattDesignationLevel,
} = require("../src/config/zermattEmploymentLevels");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT authoritative designations map safely to one coherent L1-L11 hierarchy", () => {
  assert.deepEqual(
    ZERMATT_EMPLOYMENT_LEVELS.map(({ levelNumber, code, name }) => ({
      levelNumber,
      code,
      name,
    })),
    [
      { levelNumber: 1, code: "L1", name: "Entry / Support" },
      { levelNumber: 2, code: "L2", name: "Operational / Junior Staff" },
      { levelNumber: 3, code: "L3", name: "Senior Support / Assistant" },
      { levelNumber: 4, code: "L4", name: "Team Leader" },
      { levelNumber: 5, code: "L5", name: "Supervisor" },
      { levelNumber: 6, code: "L6", name: "Officer / Professional" },
      { levelNumber: 7, code: "L7", name: "Senior Officer / Specialist" },
      { levelNumber: 8, code: "L8", name: "Assistant Manager" },
      { levelNumber: 9, code: "L9", name: "Manager" },
      { levelNumber: 10, code: "L10", name: "Head / Senior Management" },
      { levelNumber: 11, code: "L11", name: "Executive Management" },
    ]
  );

  assert.equal(ZERMATT_DESIGNATION_LEVELS.length, 117);
  assert.equal(
    new Set(ZERMATT_DESIGNATION_LEVELS.map((item) => item.name.toLowerCase())).size,
    ZERMATT_DESIGNATION_LEVELS.length,
    "designation names must be unique"
  );
  assert.equal(
    new Set(ZERMATT_DESIGNATION_LEVELS.map((item) => item.code)).size,
    ZERMATT_DESIGNATION_LEVELS.length,
    "designation codes must be unique"
  );

  const expectedMappings = [
    ["Kitchen Attendant", "BBO-KA", 1],
    ["Waiter", "BBO-WTR", 2],
    ["HR & Admin Assistant", "HRA-AST", 3],
    ["Bar Team Leader", "BBO-BTL", 4],
    ["Beer Barn Floor Operations Supervisor", "BBO-FOS", 5],
    ["HR & Admin Officer", "HRA-OFF", 6],
    ["Senior Sales Representative", "ZOP-SSR", 7],
    ["Zermatt Assistant Branch Operations Manager", "ZOP-ABOM", 8],
    ["Zermatt Branch Operations Manager", "ZOP-BOM", 9],
    ["Head of HR & Admin", "HRA-HOD", 10],
    ["Managing Director", "EXEC-MD", 11],
    ["Personal Assistant / Executive Secretary", "EXEC-PAES", 7],
  ];

  for (const [name, code, levelNumber] of expectedMappings) {
    assert.equal(
      resolveZermattDesignationLevel({ name, code })?.levelNumber,
      levelNumber,
      `${name} must map to L${levelNumber}`
    );
  }

  assert.equal(
    resolveZermattDesignationLevel({
      name: "Unmapped ZERMATT Role",
      code: "ZLL-UNKNOWN",
    }),
    null,
    "unknown designations must not be guessed"
  );

  const script = read("backend/scripts/configure-zermatt-employment-levels.cjs");
  assert.match(script, /ZERMATT_DESIGNATION_MAPPING_REQUIRED/);
  assert.match(script, /ZERMATT_EMPLOYEE_DESIGNATION_RELATIONSHIP_CHANGED/);
  assert.match(script, /organizationAudit\.create/);
  assert.match(script, /designation\.update/);
  assert.doesNotMatch(script, /tx\.employee\.(update|updateMany|delete|deleteMany|create)/);
  assert.doesNotMatch(
    script,
    /tx\.(leaveEntitlementMatrixRule|leaveEntitlementAllocation|leaveBalance|leaveRequest)\.(update|updateMany|delete|deleteMany|create)/
  );

  const leaveService = read("backend/src/services/zermattLeaveEntitlementService.js");
  assert.match(leaveService, /if \(level === 11\) return 30/);
  assert.match(leaveService, /if \(level >= 9 && level <= 10\) return 28/);
  assert.match(leaveService, /if \(level >= 5 && level <= 8\) return 21/);
  assert.match(leaveService, /if \(level >= 1 && level <= 4\) return 14/);

  console.log("PASS: ZERMATT designation-driven L1-L11 reorganization gate passed.");
});
