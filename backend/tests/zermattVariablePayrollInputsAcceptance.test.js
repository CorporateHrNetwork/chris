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
const exitSettlement = read(backendRoot, "src", "services", "exitSettlementService.js");
const routes = read(backendRoot, "src", "routes", "payrollRoutes.js");
const ui = read(repoRoot, "src", "pages", "payroll", "PayrollComponentsManaged.jsx");
const manualWorkedDaysUi = read(repoRoot, "src", "components", "payroll", "ManualWorkedDaysPanel.jsx");

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
expect(service, "PAYROLL_PERIOD_INPUT_LOCKED", "Inputs must be blocked once the payroll period is submitted/approved.");

expect(nigeriaPayroll, "loadPeriodVariableItems", "Nigeria payroll must load variable period inputs.");
expect(nigeriaPayroll, "calculateVariableValue(item, scheduledMonthlyGross)", "Formula allowances must calculate from authoritative monthly gross salary.");
expect(nigeriaPayroll, 'organization.slug === "zermatt-liquor-limited"', "ZERMATT-specific payroll reset control must be tenant-scoped.");
expect(nigeriaPayroll, "component.oneTimePeriodId === period.id", "Legacy ZERMATT Other components must participate only when explicitly tied to the current payroll period.");
expect(nigeriaPayroll, 'manualInputResetPolicy: "PERIOD_SCOPED_NO_CARRY_FORWARD"', "Manual attendance overrides must be explicitly period scoped.");
expect(nigeriaPayroll, 'scheduledDeductionCarryForward: "ONLY_MAPPED_INSTALLMENT_MONTHS"', "Only mapped recurring installments may continue into later payroll periods.");
expect(nigeriaPayroll, 'salaryAdvanceDefault: 0', "Salary Advance must reset to zero in a new payroll period.");
expect(nigeriaPayroll, 'salaryAdvanceCarryForward: false', "Prior payroll Salary Advance values must not carry forward.");
expect(nigeriaPayroll, 'salaryAdvanceRecovery: "ONLY_ACTIVE_REPAYMENT_SCHEDULE_DUE_THIS_PERIOD"', "Salary Advance may appear only when an active repayment schedule is due.");
expect(nigeriaPayroll, 'source: "ACTIVE_SALARY_ADVANCE_REPAYMENT_SCHEDULE"', "Salary Advance recovery rows must identify their schedule source.");
expect(nigeriaPayroll, '"installmentAmount" > 0', "Only salary advances with a valid installment schedule may enter payroll.");
expect(nigeriaPayroll, 'legacyOtherComponentCarryForward: organization.slug !== "zermatt-liquor-limited"', "Indefinite legacy Other components must not carry forward for ZERMATT.");
expect(payrollOps, "postDeductionInstallments(tx", "Payroll approval must post scheduled installments.");
expect(reopen, "reverseDeductionInstallments(tx", "Approved-payroll reopen must restore scheduled installments.");
assert.equal(
  exitSettlement.includes("scheduledDeductionRecovery"),
  false,
  "Generic scheduled deduction balances must not be swept into the approved exit settlement account."
);
assert.equal(
  exitSettlement.includes('"payroll_deduction_plans"'),
  false,
  "Exit settlement must use only the approved debit sources, not generic payroll deduction plans."
);

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

expect(manualWorkedDaysUi, "const changePeriod = (nextPeriodId) =>", "Worked Days UI must reset entry state when the payroll period changes.");
expect(manualWorkedDaysUi, 'setWorkedDays("");', "Worked Days must clear when a new payroll period is selected.");
expect(manualWorkedDaysUi, 'setWorkedHours("");', "Worked Hours must clear when a new payroll period is selected.");
expect(manualWorkedDaysUi, "Historical entries remain available for audit.", "UI must explain audit-safe period isolation.");

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
