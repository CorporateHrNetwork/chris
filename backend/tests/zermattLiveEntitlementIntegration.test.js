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
  assert.match(source, /INSERT INTO employee_employment_level_assignments/);
  assert.match(source, /levelNumber"=201/);
  assert.match(source, /EMPLOYEE_EMPLOYMENT_LEVEL_OVERRIDE_ASSIGNED/);
  assert.doesNotMatch(source, /UPDATE designations/i);
});
test("full 2026 leave is approved at L2 for Kpokou and L1 for Uchenna, no proration", () => {
  const {leaveConversionReview} = require("../src/services/zermattEmployeeEntitlementPolicy");
  for (const [employeeNumber, levelNumber, annualEntitlementDays] of [["ZLL000046",202,16],["ZLL000053",201,14]]) {
    const decision = leaveConversionReview({organizationSlug:"zermatt-liquor-limited",employeeNumber,leaveYear:2026,employmentType:"Full-Time"});
    assert.equal(decision.status,"APPROVED_FULL_ANNUAL_ENTITLEMENT");
    assert.equal(decision.levelNumber,levelNumber);
    assert.equal(decision.annualEntitlementDays,annualEntitlementDays);
    assert.equal(decision.proration,"NONE");
    assert.equal(decision.fullTimeEffectiveFrom,"2026-11-17");
    assert.equal(leaveConversionReview({organizationSlug:"zermatt-liquor-limited",employeeNumber,leaveYear:2027,employmentType:"Full-Time"}),null);
    assert.equal(leaveConversionReview({organizationSlug:"zermatt-liquor-limited",employeeNumber,leaveYear:2026,employmentType:"Part-time"}),null);
  }
  assert.equal(leaveConversionReview({organizationSlug:"another-tenant",employeeNumber:"ZLL000046",leaveYear:2026,employmentType:"Full-Time"}),null);
  assert.equal(leaveConversionReview({organizationSlug:"zermatt-liquor-limited",employeeNumber:"ZLL000300",leaveYear:2026,employmentType:"Full-Time"}),null);
  const source=read("src/services/zermattLeaveEntitlementService.js");
  const guard=source.indexOf("const conversion = leaveConversionReview(");
  const write=source.indexOf("const balance = await tx.leaveBalance.upsert(");
  assert.ok(guard>0 && write>guard,"Conversion approval validation must precede leave balance mutation");
  assert.match(source,/APPROVED_EMPLOYMENT_LEVEL_MAPPING_REQUIRED/);
  assert.match(source,/APPROVED_ANNUAL_ENTITLEMENT_MISMATCH/);
  assert.match(source,/update: conversion \? \{\} : \{ openingBalance: entitlement \}/);
  assert.match(source,/conversion \? new Date/);
});