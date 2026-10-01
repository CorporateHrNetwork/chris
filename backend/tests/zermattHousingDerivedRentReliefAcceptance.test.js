const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/chris_test";
const { getHousingDerivedRentBasis } = require("../src/services/nigeriaPayrollComplianceService");

test("Zermatt recorded rent is Monthly Gross times 11 percent times 56", async () => {
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
  assert.equal(basis.annualRentBasis, 924000);
  assert.equal(basis.eligibleRentRelief, 184800);
  assert.equal(basis.source, "GROSS_X_HOUSING_RATE_X56");
});

test("individual and bulk paths use payroll-derived amounts, not typed annual rent", () => {
  const root = path.resolve(__dirname, "..", "..");
  const route = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "src/pages/payroll/RentReliefManaged.jsx"), "utf8");
  assert.ok(route.includes('"/tax-reliefs/rent/housing-basis"'));
  assert.ok(route.includes("getHousingDerivedRentBasis"));
  assert.ok(route.includes("Recorded Rent (Gross × 11% × 56)"));
  assert.ok(ui.includes("Monthly Housing Allowance"));
  assert.ok(ui.includes("Recorded Rent (Gross × 11% × 56)"));
  assert.ok(ui.includes("readOnly"));
  assert.ok(route.includes("System-derived Rent Relief"));
  assert.ok(route.includes("markDraftRunsRecalculationRequired"));
  const service = fs.readFileSync(path.join(root, "backend/src/services/nigeriaPayrollComplianceService.js"), "utf8");
  assert.ok(service.includes('const housingRate = 11'));
  assert.ok(service.includes('monthlyHousingAllowance * 56'));
  assert.ok(service.includes('targetStatus = isZermattOrganization ? "VERIFIED"'));
});

test("new authoritative migration corrects all current records and auto-syncs future salary changes", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../prisma/migrations/20261001193000_zermatt_rent_relief_gross_11pct_x56/migration.sql"),
    "utf8"
  );
  assert.ok(migration.includes("Monthly Gross Salary × 11% × 56"));
  assert.ok(migration.includes("CREATE TRIGGER trg_zermatt_sync_rent_relief_from_salary"));
  assert.ok(migration.includes("0.11) * 56"));
  assert.ok(migration.includes("'VERIFIED'"));
  assert.ok(migration.includes("'RECALCULATION_REQUIRED'"));
  assert.ok(migration.includes("ON CONFLICT (\"organizationId\",\"employeeId\",\"taxYear\",\"reliefType\")"));
  assert.ok(migration.includes("SYSTEM_RENT_RELIEF_CORRECTED_X56"));
});
