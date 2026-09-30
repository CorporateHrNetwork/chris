const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const { buildTemplateWorkbook } = require("../src/services/employeeDataOperationsService");

const approved = [
  "Accounts & Finance","Audit & Internal Control","Beer Barn Operations",
  "Entertainment","Executive Management","Facilities Management",
  "Housekeeping","Housekeeping & Facilities",
  "Human Resources & Administration","ICT","Purchase & Procurement",
  "Security","Transport & Logistics","Warehouse & Stores","Zermatt Operations",
];

test("Zermatt template retains all 15 approved departments and flags unmatched live catalogue entries", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/routes/employeeDataOperationsRoutes.js"), "utf8");
  for (const name of approved) {
    assert.ok(source.includes(JSON.stringify(name)), `Approved department missing from route: ${name}`);
  }
  assert.ok(source.includes("catalog.departmentStatus = approvedDepartments.map"));
  const wb = XLSX.read(buildTemplateWorkbook({
    isZermatt: true,
    catalog: {
      departments: approved,
      departmentStatus: approved.map((name, idx) => ({ name, active: idx !== 4 })),
    },
  }), { type: "buffer" });
  const listRows = XLSX.utils.sheet_to_json(wb.Sheets["Dropdown Lists"], { header: 1 });
  assert.deepEqual(listRows.slice(1, 16).map((row) => row[3]), approved);
  const reconciliationRows = XLSX.utils.sheet_to_json(wb.Sheets["Department Reconciliation"], { header: 1 });
  assert.equal(reconciliationRows.length, 16);
  assert.equal(reconciliationRows[5][1], "FOUND - INACTIVE");
  assert.equal(reconciliationRows[5][2], "NO");
  assert.match(reconciliationRows[5][5], /reconcile status and Cost Centre/);
});
