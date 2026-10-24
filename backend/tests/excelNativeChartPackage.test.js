const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const CFB = require("cfb");
const { addNativeExcelCharts } = require("../src/services/excelNativeChartService");

const charts = [{type:"bar",title:"Demo payroll",series:[{
 name:"Gross",categoriesRange:"'Payroll Dashboard'!A2:A3",
 valuesRange:"'Payroll Dashboard'!B2:B3",categories:["Demo A","Demo B"],
 values:[1200,2300],pointColors:["0B6B3A","C89B2C"]
}]}];
function xml(zip, path) {
 const entry = CFB.find(zip,path) || CFB.find(zip,"/" + path);
 assert.ok(entry, "Missing ZIP part: " + path);
 return Buffer.from(entry.content).toString("utf8");
}
for (const comments of [false,true]) test("chart preserves dashboard and registers, comments=" + comments, () => {
 const book=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([["Employee","Gross"],["Demo A",1200],["Demo B",2300],["Total",3500]]);
 sheet.B4.f="SUM(B2:B3)";
 if(comments) sheet.A1.c=[{a:"CHRiS",t:"Fictional demo payroll only"}];
 XLSX.utils.book_append_sheet(book,sheet,"Payroll Dashboard");
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Employee","Net"],["Demo A",1000],["Demo B",2000]]),"Payroll Register");
 const input=XLSX.write(book,{type:"buffer",bookType:"xlsx"});
 const output=addNativeExcelCharts(input,charts);
 const before=CFB.read(input,{type:"buffer"}), after=CFB.read(output,{type:"buffer"});
 const sourceXml=xml(before,"xl/worksheets/sheet1.xml"), resultXml=xml(after,"xl/worksheets/sheet1.xml");
 assert.equal(resultXml.match(/<sheetData>[\s\S]*?<\/sheetData>/)[0],sourceXml.match(/<sheetData>[\s\S]*?<\/sheetData>/)[0]);
 assert.equal(xml(after,"xl/worksheets/sheet2.xml"),xml(before,"xl/worksheets/sheet2.xml"));
 assert.equal((resultXml.match(/<drawing\b/g)||[]).length,1);
 if(comments) {
  assert.ok(resultXml.indexOf("<drawing ")<resultXml.indexOf("<legacyDrawing "));
  assert.equal(xml(after,"xl/comments1.xml"),xml(before,"xl/comments1.xml"));
 }
 const recovered=XLSX.read(output,{type:"buffer"});
 assert.equal(recovered.Sheets["Payroll Dashboard"].B4.f,"SUM(B2:B3)");
 assert.equal(recovered.Sheets["Payroll Dashboard"].B4.v,3500);
 assert.equal(recovered.Sheets["Payroll Register"].B3.v,2000);
 if(process.env.CHRIS_CHART_VALIDATION_OUTPUT && comments)
  require("node:fs").writeFileSync(process.env.CHRIS_CHART_VALIDATION_OUTPUT,output);
});

test("colored series and pie labels follow the Open XML chart schema", () => {
 const book = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Demo", 1200]]), "Payroll Dashboard");
 const input = XLSX.write(book, {type:"buffer", bookType:"xlsx"});
 const output = addNativeExcelCharts(input, [charts[0], {...charts[0], type:"pie"}]);
 const zip = CFB.read(output, {type:"buffer"});
 const bar = xml(zip, "xl/charts/chart1.xml");
 const series = bar.match(/<c:ser>[\s\S]*?<\/c:ser>/)[0];
 assert.ok(series.indexOf("<c:spPr>") < series.indexOf("<c:dPt>"));
 const pie = xml(zip, "xl/charts/chart2.xml");
 assert.ok(pie.indexOf("</c:ser>") < pie.indexOf("<c:dLbls>"));
 assert.ok(pie.indexOf("</c:dLbls>") < pie.indexOf("</c:pieChart>"));
});
