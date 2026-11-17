const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (relative) => fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");

test("Nigeria payroll looks up Zermatt employee exceptions independently from employment type", () => {
  const source = read("src/services/nigeriaPayrollComplianceService.js");
  assert.match(source, /zermattEmployeeStatutoryExemption\(\{/);
  assert.match(source, /organizationSlug: organization\.slug/);
  assert.match(source, /employeeNumber: employee\.employeeNumber/);
  assert.match(source, /asOf: period\.periodEnd/);
  assert.match(source, /\|\| statutoryEmploymentTypeExemption\(employee\.employmentType\)/);
  assert.match(source, /employmentTypeExemption\.nhfExempt === true/);
  assert.match(source, /employmentTypeExemption\.employerPensionExempt/);
});
test("EoSB uses the historical salary snapshot without changing current salary rates", () => {
  const source = read("src/services/eosbService.js");
  assert.match(source, /historicalEosb\(\{/);
  assert.match(source, /historical \? historical\.monthlyGross/);
  assert.match(source, /loanCollateralMode: "SURETY_REQUIRED"/);
  assert.match(source, /historicalFullTimeService: Boolean\(historical\)/);
});
test("production classification update is held behind independent preflight and audit", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "scripts/zermatt-employee-entitlement-20261117-APPLY-AFTER-DEPLOY.sql"), "utf8");
  assert.match(source, /HOLD: Do not execute/);
  assert.match(source, /v_count<>2/);
  assert.match(source, /INSERT INTO organization_audits/);
  assert.match(source, /BEGIN;/);
  assert.match(source, /COMMIT;/);
  assert.doesNotMatch(source, /UPDATE payroll_run_lines/i);
});
