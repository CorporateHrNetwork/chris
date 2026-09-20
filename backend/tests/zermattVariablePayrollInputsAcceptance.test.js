const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
function read(...parts) { return fs.readFileSync(path.join(...parts), "utf8").replace(/\r\n/g, "\n"); }
function expect(source, fragment, message) { assert.ok(source.includes(fragment), message || `Expected source to contain: ${fragment}`); }

const migration = read(backendRoot, "prisma", "migrations", "20260920014500_zermatt_variable_payroll_inputs", "migration.sql");
const service = read(backendRoot, "src", "services", "zermattVariablePayrollService.js");
const nigeriaPayroll = read(backendRoot, "src", "services", "nigeriaPayrollComplianceService.js");
const payrollOps = read(backendRoot, "src", "services", "payrollOperationsService.js");
const reopen = read(backendRoot, "src", "services", "payrollReopenService.js");
const routes = read(backendRoot, "src", "routes", "payrollRoutes.js");
const ui = read(repoRoot, "src", "pages", "payroll", "PayrollComponentsManaged.jsx");

for (const table of [
  "payroll_variable_components",
  "payroll_variable_inputs",
  "payroll_deduction_plans",
  "payroll_deduction_installments",
]) expect(migration, `CREATE TABLE "${table}"`, `Missing additive table ${table}.`);

for (const [code, name] of [
  ["DED-BBSB", "Beer Barn Sales Bill"],
  ["DED-ZSB", "Zermatt Sales Bill"],
  ["DED-PPO", "Previous Payroll Over-pay"],
  ["DED-UNION", "Union Dues"],
  ["DED-COOP", "Cooperative Dues"],
  ["ALW-BONUS", "Bonus"],
  ["ALW-PPSP", "Previous Payroll Short-pay"],
  ["ALW-PMO", "Previous Month Outstanding"],
  ["ALW-PH", "Public Holiday"],
  ["ALW-EDOT", "Extra Day Overtime"],
  ["ALW-EHOT", "Extra Hour Overtime"],
]) {
  expect(service, `code: "${code}"`, `Missing component code ${code}.`);
  expect(service, `name: "${name}"`, `Missing component name ${name}.`);
}

for (const calculation of [
  'case "GROSS_DIV_26_REGULAR": return round2((gross / 26) * quantity);',
  'case "GROSS_DIV_26_X2": return round2((gross / 26) * quantity * 2);',
  'case "GROSS_DIV_26_X1_5": return round2((gross / 26) * quantity * 1.5);',
  'case "GROSS_DIV_208_X1_25": return round2((gross / 208) * quantity * 1.25);',
]) expect(service, calculation, `Missing authoritative ZERMATT formula: ${calculation}`);

expect(service, "const totalCents = Math.round(total * 100);", "Installments must be scheduled in cents to avoid rounding drift.");
expect(service, "index === count - 1 ? remaining", "Final installment must absorb the exact remaining balance.");
expect(service, "count = Math.ceil(totalCents / nominalCents);", "Amount-per-installment mode must derive the number of months.");
expect(service, '"status"=CASE WHEN NOT EXISTS', "Deduction plan must complete when no scheduled installment remains.");
expect(service, "postDeductionInstallments", "Approval posting lifecycle is missing.");
expect(service, "reverseDeductionInstallments", "Reopen reversal lifecycle is missing.");

expect(nigeriaPayroll, "loadPeriodVariableItems", "Nigeria payroll must load variable period inputs.");
expect(nigeriaPayroll, "calculateVariableValue(item, scheduledMonthlyGross)", "Formula allowances must calculate from authoritative monthly gross salary.");
expect(payrollOps, "postDeductionInstallments(tx", "Payroll approval must post scheduled installments.");
expect(reopen, "reverseDeductionInstallments(tx", "Approved-payroll reopen must restore scheduled installments.");

for (const route of [
  '"/variable-components"',
  '"/variable-inputs"',
  '"/deduction-plans"',
  '"/variable-inputs/template"',
  '"/variable-inputs/bulk/preview"',
  '"/variable-inputs/bulk/import"',
]) expect(routes, route, `Missing payroll input route ${route}.`);
expect(routes, "assertPayrollInputEmployeeScope", "Bulk and manual variable inputs must enforce branch/location scope.");
expect(routes, "markDraftRunsRecalculationRequired", "Variable input changes must invalidate stale draft payroll.");

for (const label of [
  "One-Time",
  "Recurring / Installments",
  "Total Amount to Deduct",
  "Number of Installments",
  "Amount Per Installment",
  "Installment Preview",
  "Download Template",
  "Validate / Preview",
  "Confirm Import",
  "Create Additional Payroll Component",
]) expect(ui, label, `Payroll input UI is missing ${label}.`);

console.log("PASS: ZERMATT variable payroll inputs and finite installment schedules acceptance checks.");
