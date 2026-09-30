const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const { buildTemplateWorkbook } = require("../src/services/employeeDataOperationsService");

test("Zermatt template enumerates active and historically used stored departments without dropping non-baseline names", () => {
  const route = fs.readFileSync(path.join(__dirname, "../src/routes/employeeDataOperationsRoutes.js"), "utf8");
  assert.match(route, /prisma\.department\.findMany/);
  assert.match(route, /storedDepartmentCount: departments\.length/);
  assert.match(route, /departmentInventory = departments\.map/);
  assert.match(route, /_count: \{ select: \{ employees: true, designations: true \} \}/);
  assert.match(route, /configuredActive = departments\.filter\(\(item\) => item\.isActive\)/);

  const catalog = {
    departments: ["Accounts & Finance", "New Previously Stored Active Unit"],
    departmentStatus: [{ name: "Accounts & Finance", found: true, active: true, costCentreMapped: true, employeeCount: 6 }],
    departmentInventory: [
      { name: "Accounts & Finance", code: "AF", active: true, costCentreMapped: true, employeeCount: 6, designationCount: 4, inApprovedBaseline: true },
      { name: "New Previously Stored Active Unit", code: "NPS", active: true, costCentreMapped: false, employeeCount: 2, designationCount: 1, inApprovedBaseline: false },
      { name: "Previously Used Inactive Unit", code: "PUI", active: false, costCentreMapped: true, employeeCount: 3, designationCount: 1, inApprovedBaseline: false },
    ],
    departmentInventoryMeta: { generatedAt: "2026-09-30T16:00:00.000Z", storedDepartmentCount: 3, activeDepartmentCount: 2 },
  };
  const book = XLSX.read(buildTemplateWorkbook({ isZermatt: true, catalog }), { type: "buffer" });
  const choices = XLSX.utils.sheet_to_json(book.Sheets["Dropdown Lists"], { header: 1 });
  assert.deepEqual(choices.slice(1, 3).map((row) => row[3]), catalog.departments);
  const inventory = XLSX.utils.sheet_to_json(book.Sheets["Complete Department Inventory"], { header: 1, defval: "" });
  assert.deepEqual(inventory.slice(7).map((row) => row[0]), catalog.departmentInventory.map((item) => item.name));
  assert.equal(inventory[8][6], "OTHER PRE-STORED DEPARTMENT");
  assert.equal(inventory[9][2], "INACTIVE / HISTORICAL");
  assert.equal(inventory[9][4], 3);

  const incomplete = { ...catalog, departmentInventoryMeta: { ...catalog.departmentInventoryMeta, storedDepartmentCount: 4 } };
  assert.throws(() => buildTemplateWorkbook({ isZermatt: true, catalog: incomplete }), /BULK_TEMPLATE_DEPARTMENT_CATALOG_INCOMPLETE/);
});
