const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.resolve(__dirname,"..",f),"utf8");

test("production payroll preserves salary split and prioritizes the authorized individual exemption", () => {
  const source = read("src/services/nigeriaPayrollComplianceService.js");
  assert.match(source, /splitAllocation/);
  assert.match(source, /zermattEmployeeStatutoryExemption\(\{/);
  assert.match(source, /if \(employeeOverride\) Object\.assign\(employmentTypeExemption, employeeOverride\)/);
  assert.ok(source.indexOf("if (employeeOverride) Object.assign") > source.indexOf("if (splitAllocation) {"));
  assert.match(source, /employmentTypeExemption\.employerPensionExempt \?\? employmentTypeExemption\.pensionExempt/);
  assert.match(source, /employmentTypeExemption\.nhfExempt === true/);
});

test("production EoSB preserves other employees elapsed-day basis but counts historical qualifying end days", () => {
  const source = read("src/services/eosbService.js");
  assert.match(source, /const serviceDays = serviceDaysBetween\(startDate, calculationDate\) \+ \(historical \? 1 : 0\)/);
  assert.match(source, /historical \? historical\.monthlyGross/);
  assert.match(source, /loanCollateralMode: "SURETY_REQUIRED"/);
});

test("production payroll correction SQL is held and cannot update payroll lines", () => {
  const source = read("scripts/zermatt-employee-entitlement-20261117-APPLY-AFTER-DEPLOY.sql");
  assert.match(source, /HOLD: Do not execute/);
  assert.match(source, /v_count<>2/);
  assert.match(source, /INSERT INTO organization_audits/);
  assert.doesNotMatch(source, /UPDATE payroll_run_lines/i);
});