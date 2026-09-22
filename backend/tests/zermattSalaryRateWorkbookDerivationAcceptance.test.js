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

test("ZERMATT derives salary rates from the existing migration workbook safely", () => {
  const script = read("backend/scripts/derive-zermatt-salary-rates-from-workbook.cjs");

  requireText(
    script,
    [
      "ZERMATT_workforce_source.xlsx",
      "ZERMATT_CHRiS_Workforce_Migration_Validated_Review.xlsx",
      "Monthly Gross Salary",
      "Employee Full Name*",
      "Start Date*",
      "DETERMINISTIC_START_DATE_AND_SOURCE_ROW",
      "exactEmployeeMatches",
      "nameMismatches",
      "hireDateMismatches",
      "missingGross",
      "existingRateConflicts",
      "expectedSalaryRatesAfter",
      "PREVIEW ONLY: no salary-rate data was changed.",
      "Run again with --apply only when all reconciliation blockers are zero.",
      "DERIVED_FROM_MIGRATION_WORKBOOK_GROSS",
      "Derived from existing ZERMATT migration workbook gross salary",
      "effectiveSalaryRatesAfter",
      "--workbook=",
      "--effective-from=",
    ],
    "Workbook salary-rate derivation"
  );

  assert.ok(script.includes('if (!args.apply)'), "Workbook derivation must default to preview mode.");
  assert.ok(script.includes("source.rows.length !== EXPECTED_EMPLOYEES"), "Apply must enforce the 312-row source population.");
  assert.ok(script.includes("employees.length !== EXPECTED_EMPLOYEES"), "Apply must enforce the 312 current-employee population.");
  assert.ok(script.includes("exactMatches !== EXPECTED_EMPLOYEES"), "Apply must require exact employee reconciliation.");
  assert.ok(script.includes("if (existingRate)"), "Existing salary rates must be detected and preserved.");
  assert.equal(
    script.includes('UPDATE "payroll_salary_rates" SET "amount"'),
    false,
    "Existing salary-rate amounts must never be overwritten by the workbook backfill."
  );

  console.log("PASS: ZERMATT workbook salary-rate derivation gate passed.");
});
