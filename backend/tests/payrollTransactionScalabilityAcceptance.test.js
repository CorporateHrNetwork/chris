const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "backend/src/services/nigeriaPayrollComplianceService.js"), "utf8");

test("Nigeria payroll uses a bounded extended interactive transaction timeout", () => {
  assert.ok(source.includes("maxWait: 10000"));
  assert.ok(source.includes("timeout: 30000"));
});

test("Nigeria payroll bulk-inserts payroll run lines instead of one SQL insert per employee", () => {
  assert.ok(source.includes("async function insertPayrollRunLinesBulk"));
  assert.ok(source.includes("const chunkSize = 100"));
  assert.ok(source.includes('const p = (offset) => "$" + (base + offset);'));
  assert.ok(!source.includes('const p = (offset) => `${base + offset}`;'));
  assert.ok(source.includes("VALUES ${values.join(\",\")}"));
  assert.ok(source.includes("await insertPayrollRunLinesBulk(tx"));
});

test("draft statutory obligations are cleared before replacing payroll run lines", () => {
  const statutoryDelete = source.indexOf("await tx.statutoryObligation.deleteMany");
  const payrollLineDelete = source.indexOf('DELETE FROM "payroll_run_lines"');
  assert.ok(statutoryDelete >= 0);
  assert.ok(payrollLineDelete > statutoryDelete);
});
