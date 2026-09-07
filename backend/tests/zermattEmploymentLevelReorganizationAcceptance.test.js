const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT employment levels form one professional L1-L11 hierarchy without generic placeholders", () => {
  const config = read("backend/src/config/zermattEmploymentLevels.js");
  const leaveService = read("backend/src/services/zermattLeaveEntitlementService.js");
  const script = read("backend/scripts/configure-zermatt-employment-levels.cjs");

  const expected = [
    'name: "Entry / Trainee"',
    'name: "Junior Support / Assistant"',
    'name: "Senior Support / Technician"',
    'name: "Junior Officer / Associate"',
    'name: "Officer / Professional"',
    'name: "Supervisor / Team Lead"',
    'name: "Senior Officer / Senior Professional"',
    'name: "Assistant Manager"',
    'name: "Manager"',
    'name: "Head of Department"',
    'name: "Executive Management"',
  ];
  expected.forEach((value) => assert.ok(config.includes(value), `missing ZERMATT level: ${value}`));

  for (let level = 1; level <= 11; level += 1) {
    assert.ok(config.includes(`levelNumber: ${level}`), `L${level} missing`);
    assert.ok(config.includes(`code: "L${level}"`), `L${level} code missing`);
  }

  assert.ok(!config.includes('name: "Level 7"'), "generic Level 7 placeholder must be removed");
  assert.ok(!config.includes('name: "Executive / Director"'), "old mixed six-level CHRiS title must not remain in ZERMATT hierarchy");
  assert.ok(leaveService.includes("ZERMATT_EMPLOYMENT_LEVELS"), "leave configuration must reuse authoritative ZERMATT level labels");
  assert.ok(!leaveService.includes('update: { name: `Level ${levelNumber}`'), "leave configuration must not restore generic Level N labels");
  assert.ok(script.includes("designationCountsByExistingLevel"), "normalization script must report existing designation distribution");
  assert.ok(script.includes("does not silently move employees or designations"), "normalization must preserve authoritative designation mappings");

  console.log("PASS: ZERMATT employment level reorganization gate passed.");
});
