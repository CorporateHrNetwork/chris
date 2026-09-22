const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const service = fs.readFileSync(path.join(root, "backend/src/services/exitSettlementService.js"), "utf8");
const frontend = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.css"), "utf8");

test("CHRiS auto-generates calculation notes from active settlement rules", () => {
  assert.ok(service.includes("function buildCalculationNote(preview)"));
  assert.ok(service.includes("CHRiS Exit Settlement Calculation Basis"));
  assert.ok(service.includes("Gratuity / EoSB"));
  assert.ok(service.includes("Annual Leave Allowance"));
  assert.ok(service.includes("Outstanding Salary"));
  assert.ok(service.includes("Public Holiday Days"));
  assert.ok(service.includes("Extra Day Work Overtime"));
  assert.ok(service.includes("Extra Hours Work Overtime"));
  assert.ok(service.includes("In Lieu of Notice Deduction"));
  assert.ok(service.includes("Loan Balance"));
  assert.ok(service.includes("Salary Advance"));
  assert.ok(service.includes("if (numeric === 0) return"));
  assert.ok(service.includes("preview.calculationNote = buildCalculationNote(preview)"));
});

test("auto calculation note is persisted separately from optional HR commentary", () => {
  assert.ok(service.includes("calculationNote: preview.calculationNote"));
  assert.ok(service.includes("hrSupplementaryNote: text(input.notes) || null"));
  assert.ok(frontend.includes("Calculation Notes — Auto-filled by CHRiS"));
  assert.ok(frontend.includes("HR Supplementary Note (Optional)"));
  assert.ok(frontend.includes("readOnly"));
  assert.ok(frontend.includes("record.calculationSnapshot?.hrSupplementaryNote ||"));
});

test("settlement account keeps CREDIT left and DEBIT right on desktop", () => {
  assert.ok(frontend.includes('className="exit-settlement-account-columns"'));
  assert.ok(frontend.includes('gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)"'));
  const creditIndex = frontend.indexOf('<SettlementAccountSection title="CREDIT"');
  const debitIndex = frontend.indexOf('<SettlementAccountSection title="DEBIT"');
  assert.ok(creditIndex >= 0 && debitIndex > creditIndex);
  assert.ok(css.includes(".exit-settlement-account-columns"));
  assert.ok(css.includes("@media (max-width: 620px)"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) !important"));
});

test("settlement provides Print / Download PDF from preview stage and prints the calculation basis", () => {
  assert.ok(frontend.includes("Print / Download PDF"));
  assert.ok(frontend.includes("accountEmployee && accountExit ?"));
  assert.ok(frontend.includes("Employee Exit Settlement Account — Draft"));
  assert.ok(frontend.includes("Draft Preview"));
  assert.ok(frontend.includes("window.print()"));
  assert.ok(frontend.includes("exit-settlement-print-calculation-note"));
  assert.ok(frontend.includes("<h3>Calculation Basis</h3>"));
  assert.ok(css.includes(".exit-settlement-print-calculation-note"));
});
