const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const salarySplit = require("../src/services/zermattSalarySplit");
const source = fs.readFileSync(path.join(root, "src/services/zermattYearEndBonusService.js"), "utf8");
const moduleRef = { exports: {} };
vm.runInNewContext(source, {
  module: moduleRef, exports: moduleRef.exports, Date, Map, Number, String, Math, Array, console,
  require: name => {
    if (name === "../config/prisma") return {};
    if (name === "./zermattSalarySplit") return salarySplit;
    throw new Error("Unexpected module " + name);
  },
});
const { serviceMonths, projectBonus } = moduleRef.exports;
test("full January–December engagement gives all twelve months", () => {
  assert.equal(serviceMonths({ hireDate: "2024-01-01", year: 2026 }), 12);
});
test("new hire in October receives three calendar months; exits in September receive nine", () => {
  assert.equal(serviceMonths({ hireDate: "2026-10-20", year: 2026 }), 3);
  assert.equal(serviceMonths({ hireDate: "2025-02-01", exitDate: "2026-09-09", year: 2026 }), 9);
});
test("employment episodes do not double-count overlapping months", () => {
  assert.equal(serviceMonths({ hireDate: "2025-01-01", year: 2026, episodes: [
    { startDate: "2025-01-01", endDate: "2026-03-31" },
    { startDate: "2026-03-20", endDate: "2026-06-15" },
  ] }), 6);
});
test("bonus is Basic + half end-month gross, prorated and expatriate ineligible", () => {
  const employee = { hireDate: "2026-04-01", employmentType: "Full-Time" };
  const split = salarySplit.splitSalary({ fullMonthlyGross: 200000, employmentType: "Full-Time", hireDate: "2026-04-01", periodMonth: "2026-12" });
  const full = projectBonus({ employee, year: 2026, grossMonthly: 200000, months: 12 });
  assert.equal(full.fullBonus, Math.round((split.components.basic + .5 * split.endMonthGross) * 100) / 100);
  assert.equal(full.bonus, full.fullBonus);
  const prorated = projectBonus({ employee, year: 2026, grossMonthly: 200000, months: 9 });
  assert.equal(prorated.bonus, Math.round(full.fullBonus * 9 / 12 * 100) / 100);
  const excluded = projectBonus({ employee: { ...employee, employmentType: "Expatriate" }, year: 2026, grossMonthly: 200000, months: 12 });
  assert.equal(excluded.status, "INELIGIBLE_EXPATRIATE");
  assert.equal(excluded.bonus, 0);
});
test("bonus register and export are read-only and branch-restricted", () => {
  const routes = fs.readFileSync(path.join(root, "src/routes/zermattYearEndBonusRoutes.js"), "utf8");
  assert.ok(routes.includes("locationIds: scope"));
  assert.ok(routes.includes('requireAnyPermission("benefits.year_end_bonus.view", "payroll.manage")'));
  assert.ok(routes.includes('router.get("/export.csv"'));
  assert.ok(!routes.includes("router.post("));
});
