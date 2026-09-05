const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT derives payroll salary rates from existing gross and uses tenant workday cycles", () => {
  const migration = read(
    "backend/prisma/migrations/20260905004000_zermatt_payroll_workday_policy_v3/migration.sql"
  );
  const script = read(
    "backend/scripts/derive-zermatt-salary-rates-from-existing-gross.cjs"
  );

  requireText(
    migration,
    [
      "ZERMATT Nigeria Payroll Policy — Tenant Workday Cycles",
      '"Full-Time":26',
      '"Part-time":16',
      '"Expatriate":26',
      '"NYSC/Internship":26',
      '"statutoryDeductionExemptEmploymentTypes":["Part-time"]',
      '"pensionParticipationExemptEmploymentTypes":["Part-time"]',
      "versionNumber\" < 3",
    ],
    "ZERMATT payroll policy v3"
  );

  assert.equal(
    migration.includes('ALTER TABLE "employees"'),
    false,
    "Workday-cycle correction must not rewrite Employee data."
  );

  requireText(
    script,
    [
      "derive-zermatt-salary-rates-from-existing-gross",
      "EmployeeOnboarding.sectionData",
      "monthlygrosssalary",
      "grosssalary",
      "payroll_salary_rates",
      "DERIVED_FROM_EXISTING_GROSS",
      "PREVIEW ONLY: no salary-rate data was changed.",
      "Run again with --apply only after the preview is clean.",
      "Apply aborted",
      "existingRateConflicts",
      "expected 312 current ZERMATT employees",
      "Derived from existing stored ZERMATT gross salary",
      "effectiveSalaryRatesAfter",
      "--effective-from=",
    ],
    "Salary-rate derivation script"
  );

  assert.ok(
    script.includes('if (!args.apply)'),
    "Derivation must default to preview mode."
  );
  assert.ok(
    script.includes('if (existingRate)'),
    "Existing effective salary rates must be detected and preserved."
  );
  assert.ok(
    !script.includes('UPDATE "payroll_salary_rates" SET "amount"'),
    "Existing salary-rate amounts must not be overwritten by the derivation backfill."
  );

  console.log("PASS: ZERMATT salary-rate derivation and tenant workday-cycle gate passed.");
});
