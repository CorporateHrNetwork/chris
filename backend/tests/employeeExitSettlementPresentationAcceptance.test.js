const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const service = fs.readFileSync(path.join(root, "backend/src/services/exitSettlementService.js"), "utf8");
const frontend = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.css"), "utf8");\nconst printUtility = fs.readFileSync(path.join(root, "src/utils/exitSettlementPrint.js"), "utf8");

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

test("settlement account structurally locks CREDIT left and DEBIT right", () => {
  assert.ok(frontend.includes('className="exit-settlement-account-columns"'));
  assert.ok(frontend.includes('className="exit-settlement-credit-column"'));
  assert.ok(frontend.includes('className="exit-settlement-debit-column"'));
  assert.ok(frontend.includes('className="exit-settlement-workspace"'));
  assert.ok(frontend.includes('className="exit-settlement-panel"'));
  const creditIndex = frontend.indexOf('<SettlementAccountSection title="CREDIT"');
  const debitIndex = frontend.indexOf('<SettlementAccountSection title="DEBIT"');
  assert.ok(creditIndex >= 0 && debitIndex > creditIndex);
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important"));
  assert.ok(css.includes(".exit-settlement-credit-column"));
  assert.ok(css.includes("grid-column: 1 !important"));
  assert.ok(css.includes(".exit-settlement-debit-column"));
  assert.ok(css.includes("grid-column: 2 !important"));
  assert.equal(css.includes("flex-flow: row nowrap !important"), false);
});

test("settlement provides Print / Download PDF from preview stage and prints the calculation basis", () => {
  assert.ok(frontend.includes("Print / Download PDF"));
  assert.ok(frontend.includes("settlementExit ? ("));
  assert.ok(frontend.includes('className="chris-print-document exit-settlement-print-document"'));
  assert.ok(frontend.includes("fallbackAccountEmployee"));
  assert.ok(frontend.includes("fallbackAccountExit"));
  assert.ok(frontend.includes("Employee Exit Settlement Account — Draft"));
  assert.ok(frontend.includes("Draft Preview"));
  assert.ok(frontend.includes("printExitSettlementDocument"));
  assert.ok(frontend.includes('import("../utils/exitSettlementPrint")'));
  assert.ok(printUtility.includes("printWindow.print()"));
  assert.ok(printUtility.includes("Print / Download PDF"));
  assert.ok(frontend.includes("exit-settlement-print-calculation-note"));
  assert.ok(frontend.includes("<h3>Calculation Basis</h3>"));
  assert.ok(css.includes(".exit-settlement-print-calculation-note"));
});


test("settlement standalone print uses three-column employee details and explicit accounting sides", () => {
  assert.ok(frontend.includes('title="CREDIT — BENEFITS / ENTITLEMENTS"'));
  assert.ok(frontend.includes('title="DEBIT — DEDUCTIONS / RECOVERIES"'));
  assert.ok(printUtility.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"));
  assert.ok(printUtility.includes(".exit-settlement-print-account > :first-child"));
  assert.ok(printUtility.includes("grid-column: 1 !important"));
  assert.ok(printUtility.includes(".exit-settlement-print-account > :nth-child(2)"));
  assert.ok(printUtility.includes("grid-column: 2 !important"));
});

test("settlement standalone print provides visible controls and Head of HR signature section", () => {
  assert.ok(printUtility.includes('id="printSettlementDocument"'));
  assert.ok(printUtility.includes('id="closeSettlementDocument"'));
  assert.ok(frontend.includes("Head of HR Approval & Signature"));
  assert.ok(frontend.includes("exit-settlement-headhr-signature-grid"));
  assert.ok(frontend.includes("exit-settlement-headhr-signature-line"));
});

test("settlement print is isolated from EmployeeExits page rendering", () => {
  assert.ok(frontend.includes('import("../utils/exitSettlementPrint")'));
  assert.ok(frontend.includes("async function printExitSettlementDocument()"));
  assert.equal(frontend.includes("const PRINT_CSS"), false);
  assert.ok(printUtility.includes("export default function openExitSettlementPrint()"));
});

test("formal settlement print remains readable and compact", () => {
  assert.ok(printUtility.includes("@page { size: A4 landscape; margin: 7mm; }"));
  assert.ok(printUtility.includes("font-size: 12pt !important"));
  assert.ok(printUtility.includes("removeNilLedgerRows"));
  assert.ok(printUtility.includes("exit-settlement-print-lower-grid"));
  assert.ok(printUtility.includes("exit-settlement-external-approval-table"));
  assert.ok(printUtility.includes("Nil-value settlement items are omitted from the formal printed statement."));
});
