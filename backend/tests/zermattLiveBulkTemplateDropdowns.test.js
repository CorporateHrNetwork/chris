const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const CFB = require("cfb");
const { buildTemplateWorkbook, IMPORT_HEADERS } = require("../src/services/employeeDataOperationsService");

test("Zermatt Excel dropdowns use active organization catalogue, not illustrative seed lists", () => {
  const input = {
    departments: ["Live Zermatt Department Alpha"],
    designations: ["Live Zermatt Designation Alpha"],
    employmentLevels: ["L1", "L2", "L3"],
    locations: ["Live Zermatt Location Alpha"],
    costCentres: ["Live Zermatt Cost Centre Alpha"],
    employmentTypes: ["Full-Time"],
    banks: ["Example Bank"],
    pensionProviders: ["Example PFA"],
    taxAuthorities: ["FCT"],
  };
  const output = buildTemplateWorkbook({ isZermatt: true, catalog: input });
  const book = XLSX.read(output, { type: "buffer" });
  assert.deepEqual(book.SheetNames, ["Instructions", "Employee Import", "Dropdown Lists", "Section Guide"]);
  const headings = XLSX.utils.sheet_to_json(book.Sheets["Employee Import"], { header: 1 })[0];
  assert.deepEqual(headings, IMPORT_HEADERS);
  const lists = XLSX.utils.sheet_to_json(book.Sheets["Dropdown Lists"], { header: 1 });
  assert.equal(lists[0][3], "Department");
  assert.equal(lists[1][3], "Live Zermatt Department Alpha");
  assert.equal(lists[1][4], "Live Zermatt Designation Alpha");
  assert.equal(lists[1][6], "Live Zermatt Location Alpha");
  const archive = CFB.read(output, { type: "buffer" });
  const worksheet = CFB.find(archive, "/xl/worksheets/sheet2.xml")
    || CFB.find(archive, "xl/worksheets/sheet2.xml");
  assert.ok(worksheet?.content, "Excel import sheet must exist in archive.");
  const xml = Buffer.from(worksheet.content).toString("utf8");
  assert.match(xml, /<dataValidations count="13">/, "13 native dropdown validations must be present.");
  assert.match(xml, /sqref="H2:H1001"/, "Department must offer dropdown validation.");
  assert.match(xml, /sqref="J2:J1001"/, "Employment Level must offer dropdown validation.");
  assert.match(xml, /'Dropdown Lists'!\$D\$2:\$D\$250/, "Department dropdown must reference the live lists sheet.");
  const sections = XLSX.utils.sheet_to_json(book.Sheets["Section Guide"], { header: 1 });
  assert.equal(sections.length, 11, "Guide must match the ten CHRiS onboarding sections.");
});

test("ordinary non-Zermatt import remains backwards compatible", () => {
  const output = buildTemplateWorkbook({ isZermatt: false });
  const book = XLSX.read(output, { type: "buffer" });
  assert.deepEqual(book.SheetNames, ["Instructions", "Employee Import"]);
});
