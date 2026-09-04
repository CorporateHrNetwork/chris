const assert = require("assert");
const {
  safeSpreadsheetValue,
  createInviteToken,
  hashInviteToken,
  IMPORT_HEADERS,
  EXPORT_COLUMN_CATALOG,
} = require("../src/services/employeeDataOperationsService");

assert.equal(safeSpreadsheetValue("=SUM(A1:A2)"), "'=SUM(A1:A2)");
assert.equal(safeSpreadsheetValue("+cmd"), "'+cmd");
assert.equal(safeSpreadsheetValue("-1+2"), "'-1+2");
assert.equal(safeSpreadsheetValue("@HYPERLINK"), "'@HYPERLINK");
assert.equal(safeSpreadsheetValue("Normal employee"), "Normal employee");

const token = createInviteToken();
assert.ok(token.length >= 64);
assert.equal(hashInviteToken(token).length, 64);
assert.notEqual(hashInviteToken(token), token);

assert.ok(IMPORT_HEADERS.includes("Employee Name"));
assert.ok(IMPORT_HEADERS.includes("Department"));
assert.ok(EXPORT_COLUMN_CATALOG.some((row) => row.key === "employeeNumber"));
assert.ok(EXPORT_COLUMN_CATALOG.some((row) => row.key === "taxIdentificationNumber"));

console.log("PASS: employee data operations security and spreadsheet contracts.");
