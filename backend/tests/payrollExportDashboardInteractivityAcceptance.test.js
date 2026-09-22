const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const chartService = fs.readFileSync(path.join(root, "backend/src/services/excelNativeChartService.js"), "utf8");

test("exported payroll dashboard supports branch, department and cost-centre focus", () => {
  for (const expected of [
    '["Branch Focus", "ALL"',
    '["Department Focus", "ALL"',
    '["Cost Centre Focus", "ALL"',
    'const selectedCriteria = [',
    '"SELECTED VIEW KPI"',
    '"DEPARTMENT PAYROLL ALLOCATION"',
    '"COST CENTRE / OPERATING UNIT PAYROLL ALLOCATION"',
    '"STATUTORY COST COMPOSITION — SELECTED VIEW"',
    '"HOW TO USE THIS DASHBOARD"',
  ]) assert.ok(source.includes(expected), `Missing interactive dashboard control: ${expected}`);
});

test("payroll register and statutory register include organizational cost dimensions", () => {
  for (const expected of [
    '"Department", "Cost Centre Code", "Cost Centre / Operating Unit", "Branch"',
    'snapshot.departmentName',
    'snapshot.costCentreName',
    '"Employee No", "Employee Name", "Department", "Cost Centre Code", "Cost Centre / Operating Unit", "Branch"',
  ]) assert.ok(source.includes(expected), `Missing payroll reporting dimension: ${expected}`);
});

test("exported payroll dashboard uses real native Excel chart objects instead of cell bar glyphs", () => {
  for (const expected of [
    'addNativeExcelCharts(workbookBuffer, nativeCharts)',
    'title: "Selected View Payroll Metrics"',
    'title: "Payroll by Branch"',
    'title: "Gross Payroll by Department"',
    'title: "Gross Payroll by Cost Centre"',
    'pointColors:',
  ]) assert.ok(source.includes(expected), `Missing native Excel chart configuration: ${expected}`);

  assert.equal(source.includes('REPT("█"'), false, "Cell-based chart bars must not be used.");
  assert.equal(source.includes('"Gross Visual"'), false, "Pseudo-chart text columns must not be used.");
});

test("native Excel chart service writes OOXML chart and drawing parts", () => {
  for (const expected of [
    'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
    'xl/drawings/drawing1.xml',
    'xl/drawings/_rels/drawing1.xml.rels',
    'xl/charts/chart',
    'const tag = chart.type === "line" ? "lineChart" : "barChart";',
    '<c:pieChart>',
    'a:srgbClr',
  ]) assert.ok(chartService.includes(expected), `Missing OOXML chart capability: ${expected}`);
});

test("exported payroll dashboard recalculates in Excel and links to supporting registers", () => {
  for (const expected of [
    'workbook.Workbook.CalcPr = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };',
    'dashboard["!autofilter"]',
    'Target: "#\'Payroll Register\'!A1"',
    'branchSheetNames.get(branch)',
    'Target: `#\'${branchSheet}\'!A1`',
  ]) assert.ok(source.includes(expected), `Missing exported workbook interaction: ${expected}`);
});

test("payroll detail registers retain Excel column filters", () => {
  assert.ok(source.includes('sheet["!autofilter"] = { ref: XLSX.utils.encode_range'));
});
