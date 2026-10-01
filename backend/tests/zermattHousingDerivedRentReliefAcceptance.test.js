const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getHousingDerivedRentBasis } = require("../src/services/nigeriaPayrollComplianceService");

test("Zermatt rent basis is monthly Payroll Housing Allowance times 12", async () => {
  const prisma = {
    employee: {
      findFirst: async () => ({
        id: "emp-1", employeeNumber: "ZLL999999",
        firstName: "Example", middleName: null, lastName: "Employee",
      }),
    },
    organization: {
      findUnique: async () => ({ slug: "zermatt-liquor-limited" }),
    },
    $queryRawUnsafe: async (sql) => {
      if (sql.includes('FROM "payroll_policy_versions"')) {
        return [{
          id: "policy", organizationId: "org", code: "ZLL-NG-PAYROLL",
          name: "ZERMATT Nigeria Payroll Policy", versionNumber: 3,
          jurisdiction: "NG", effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: null, status: "ACTIVE",
          salaryStructure: { basic: 57, housing: 11, transport: 10, meal: 9, medical: 8, utility: 5 },
          standardDays: {}, pensionEmployeeRate: 8, pensionEmployerRate: 10,
          pensionableComponents: ["basic","housing","transport"],
          payeRules: { rentReliefRate: 20, rentReliefCap: 500000 },
          employerStatutoryRules: {},
        }];
      }
      if (sql.includes('FROM "payroll_salary_rates"')) {
        return [{ amount: 150000, currency: "NGN", effectiveFrom: new Date("2026-09-30"), effectiveTo: null }];
      }
      throw new Error("Unexpected SQL");
    },
  };

  const basis = await getHousingDerivedRentBasis({
    organizationId: "org",
    employeeNumber: "ZLL999999",
    taxYear: 2026,
    prismaClient: prisma,
  });
  assert.equal(basis.monthlyGrossSalary, 150000);
  assert.equal(basis.housingAllowanceRate, 11);
  assert.equal(basis.monthlyHousingAllowance, 16500);
  assert.equal(basis.annualRentBasis, 198000);
  assert.equal(basis.eligibleRentRelief, 39600);
  assert.equal(basis.source, "PAYROLL_HOUSING_ALLOWANCE_X12");
});

test("individual and bulk paths use payroll-derived amounts, not typed annual rent", () => {
  const root = path.resolve(__dirname, "..", "..");
  const route = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "src/pages/payroll/RentReliefManaged.jsx"), "utf8");
  assert.ok(route.includes('"/tax-reliefs/rent/housing-basis"'));
  assert.ok(route.includes("getHousingDerivedRentBasis"));
  assert.ok(route.includes("Annual Rent Basis (Housing × 12)"));
  assert.ok(ui.includes("Monthly Housing Allowance"));
  assert.ok(ui.includes("Annual Rent Basis (Housing × 12)"));
  assert.ok(ui.includes("readOnly"));
});

test("new-staff backfill is non-destructive and preserves existing rent relief", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../prisma/migrations/20261001184500_backfill_zermatt_housing_derived_rent_relief/migration.sql"),
    "utf8"
  );
  assert.ok(migration.includes("Payroll Housing Allowance"));
  assert.ok(migration.includes("2026-09-30 00:00:00"));
  assert.ok(migration.includes("NOT EXISTS"));
  assert.ok(migration.includes('ON CONFLICT ("organizationId","employeeId","taxYear","reliefType") DO NOTHING'));
  assert.ok(migration.includes("'PENDING_VERIFICATION'"));
  assert.equal(/UPDATE\s+payroll_tax_reliefs/i.test(migration), false);
});
