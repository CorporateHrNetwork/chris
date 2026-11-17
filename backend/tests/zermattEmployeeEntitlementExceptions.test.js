const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { statutoryExemption, historicalEosb } = require("../src/services/zermattEmployeeEntitlementPolicy");

test("only the two named full-time employees receive Zermatt statutory exemptions from 17 November 2026", () => {
  for (const employeeNumber of ["ZLL000046", "ZLL000053"]) {
    const rule = statutoryExemption({ organizationSlug: "zermatt-liquor-limited", employeeNumber, employmentType: "Full-Time", asOf: "2026-11-30" });
    assert.equal(rule.exempt, true);
    assert.equal(rule.payeExempt, true);
    assert.equal(rule.pensionExempt, true);
    assert.equal(rule.nhfExempt, true);
    assert.equal(rule.employerPensionExempt, false);
    assert.equal(statutoryExemption({ organizationSlug: "zermatt-liquor-limited", employeeNumber, employmentType: "Part-time", asOf: "2026-11-30" }), null);
    assert.equal(statutoryExemption({ organizationSlug: "zermatt-liquor-limited", employeeNumber, employmentType: "Full-Time", asOf: "2026-10-31" }), null);
    assert.equal(statutoryExemption({ organizationSlug: "another-company", employeeNumber, employmentType: "Full-Time", asOf: "2026-11-30" }), null);
  }
  assert.equal(statutoryExemption({ organizationSlug: "zermatt-liquor-limited", employeeNumber: "ZLL000300", employmentType: "Full-Time", asOf: "2026-11-30" }), null);
});

test("historical EoSB periods use supplied salaries and stop on final full-time dates", () => {
  const gift = historicalEosb({ organizationSlug: "zermatt-liquor-limited", employeeNumber: "ZLL000057", asOf: "2026-11-17" });
  const sunday = historicalEosb({ organizationSlug: "zermatt-liquor-limited", employeeNumber: "ZLL000178", asOf: "2026-11-17" });
  assert.deepEqual([gift.startDate, gift.endDate, gift.monthlyGross], ["2021-04-22", "2026-06-30", 81956]);
  assert.deepEqual([sunday.startDate, sunday.endDate, sunday.monthlyGross], ["2025-01-22", "2026-05-14", 70560]);
  assert.equal(historicalEosb({ organizationSlug: "another-company", employeeNumber: "ZLL000057" }), null);
  assert.equal(historicalEosb({ organizationSlug: "zermatt-liquor-limited", employeeNumber: "ZLL000057", asOf: "2026-05-31" }).endDate, "2026-05-31");
});

// Mock only the Prisma import: no network, migration, or production access.
const load = Module._load;
let eosb;
try {
  Module._load = function(request, parent, isMain) {
    if (request === "../config/prisma" && parent?.filename?.endsWith("eosbService.js")) return {};
    return load.call(this, request, parent, isMain);
  };
  eosb = require("../src/services/eosbService");
} finally {
  Module._load = load;
}

test("EoSB formula calculates both historical amounts without offering part-time loan collateral", async () => {
  const organization = { id: "zermatt", name: "ZERMATT LIQUOR LIMITED", slug: "zermatt-liquor-limited" };
  const fixture = {
    ZLL000057: { id: "gift", employeeNumber: "ZLL000057", firstName: "Abang", lastName: "Gift", employmentType: "Part-time", status: "ACTIVE", hireDate: new Date("2021-04-22T00:00:00Z"), exitDate: null, employmentEpisodes: [] },
    ZLL000178: { id: "sunday", employeeNumber: "ZLL000178", firstName: "Emmanuel", middleName: "Sunday", lastName: "Joseph", employmentType: "Part-time", status: "ACTIVE", hireDate: new Date("2025-01-22T00:00:00Z"), exitDate: null, employmentEpisodes: [] },
  };
  const prismaClient = {
    organization: { findUnique: async () => organization },
    employee: { findFirst: async ({ where }) => fixture[where.employeeNumber] || null },
    $queryRawUnsafe: async (sql) => sql.includes("payroll_salary_rates") ? [] : [],
  };
  for (const [number, expectedDays, expectedAmount] of [
    ["ZLL000057", 1896, 388471.44],
    ["ZLL000178", 478, 84319.20],
  ]) {
    const result = await eosb.getEosbStatement({ organizationId: organization.id, employeeNumber: number, asOf: "2026-11-17", prismaClient });
    assert.equal(result.service.serviceDays, expectedDays);
    assert.equal(result.eosb.accruedValue, expectedAmount);
    assert.equal(result.eosb.eligible, true);
    assert.equal(result.eosb.historicalFullTimeService, true);
    assert.equal(result.eosb.calculationReady, true);
    assert.equal(result.loanCollateral.mode, "SURETY_REQUIRED");
    assert.equal(result.loanCollateral.availableCollateral, 0);
  }
});
