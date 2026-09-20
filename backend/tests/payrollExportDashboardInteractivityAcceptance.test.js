const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");

test("exported payroll dashboard supports formula-driven branch focus", () => {
  for (const expected of [
    '["Branch Focus", "ALL"',
    'return `IF($B$9="ALL",SUM(${range}),SUMIF(${branchRange},$B$9,${range}))`;',
    'COUNTIF(${branchRange},$B$9)',
    '"SELECTED BRANCH KPI VIEW"',
    '"STATUTORY COST COMPOSITION — SELECTED VIEW"',
    '"HOW TO USE THIS DASHBOARD"',
  ]) assert.ok(source.includes(expected), `Missing interactive dashboard control: ${expected}`);
});

test("exported payroll dashboard recalculates in Excel and links to supporting registers", () => {
  for (const expected of [
    'workbook.Workbook.CalcPr = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };',
    'dashboard["!autofilter"]',
    'Target: "#\'Payroll Register\'!A1"',
    'branchSheetNames.get(branch)',
    'Target: `#\'${branchSheet}\'!A1`',
    'REPT("█"',
  ]) assert.ok(source.includes(expected), `Missing exported workbook interaction: ${expected}`);
});

test("payroll detail registers retain Excel column filters", () => {
  assert.ok(source.includes('sheet["!autofilter"] = { ref: XLSX.utils.encode_range'));
});
