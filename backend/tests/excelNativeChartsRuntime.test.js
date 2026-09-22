const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const CFB = require("cfb");
const { addNativeExcelCharts } = require("../src/services/excelNativeChartService");

test("native Excel chart service injects real drawing and chart parts", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Category", "Amount"],
    ["Gross", 100],
    ["Net", 80],
    ["PAYE", 10],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Payroll Dashboard");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const result = addNativeExcelCharts(buffer, [
    {
      type: "bar",
      title: "Payroll Metrics",
      position: { from: { col: 4, row: 1 }, to: { col: 12, row: 14 } },
      series: [{
        name: "Amount",
        categoriesRange: "'Payroll Dashboard'!$A$2:$A$4",
        valuesRange: "'Payroll Dashboard'!$B$2:$B$4",
        categories: ["Gross", "Net", "PAYE"],
        values: [100, 80, 10],
        pointColors: ["2EE98B", "F2CF57", "60A5FA"],
      }],
    },
  ]);

  assert.ok(Buffer.isBuffer(result));
  assert.ok(result.length > 0);

  const cfb = CFB.read(result, { type: "buffer" });
  const paths = cfb.FullPaths || [];
  assert.ok(paths.some((item) => item.includes("xl/drawings/drawing1.xml")));
  assert.ok(paths.some((item) => item.includes("xl/charts/chart1.xml")));
  assert.ok(paths.some((item) => item.includes("xl/drawings/_rels/drawing1.xml.rels")));

  const chartEntry = CFB.find(cfb, "xl/charts/chart1.xml") || CFB.find(cfb, "/xl/charts/chart1.xml");
  assert.ok(chartEntry);
  const chartXml = Buffer.from(chartEntry.content || []).toString("utf8");
  assert.ok(chartXml.includes("<c:barChart>"));
  assert.ok(chartXml.includes("Payroll Metrics"));
});
