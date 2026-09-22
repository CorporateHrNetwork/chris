const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const globalPrint = fs.readFileSync(path.join(root, "src/styles/ChrisPrintVisualLanguage.css"), "utf8");
const exitsCss = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.css"), "utf8");
const reportBranding = fs.readFileSync(path.join(root, "src/components/reporting/PrintableReportBranding.css"), "utf8");
const reportsCss = fs.readFileSync(path.join(root, "src/pages/Reports.css"), "utf8");

test("CHRiS loads one global print visual language at app level", () => {
  assert.ok(app.includes('import "./styles/ChrisPrintVisualLanguage.css";'));
  assert.ok(globalPrint.includes("--chris-print-paper: #f7f3e8"));
  assert.ok(globalPrint.includes("--chris-print-paper-strong: #fffdf7"));
  assert.ok(globalPrint.includes("--chris-print-green: #064e3b"));
  assert.ok(globalPrint.includes("--chris-print-gold: #a77b12"));
});

test("printable CHRiS surfaces use warm off-white paper and readable ink", () => {
  assert.ok(globalPrint.includes("background: var(--chris-print-paper) !important"));
  assert.ok(exitsCss.includes(".exit-settlement-print-document"));
  assert.ok(exitsCss.includes("background: var(--chris-print-paper) !important"));
  assert.ok(exitsCss.includes(".exit-settlement-print-table-section td"));
  assert.ok(exitsCss.includes("background: var(--chris-print-paper-strong) !important"));
  assert.ok(exitsCss.includes("color: var(--chris-print-ink) !important"));
});

test("shared report branding and reports inherit the global CHRiS print palette", () => {
  assert.ok(reportBranding.includes("var(--chris-print-paper)"));
  assert.ok(reportBranding.includes("var(--chris-print-green)"));
  assert.ok(reportBranding.includes("var(--chris-print-gold)"));
  assert.ok(reportsCss.includes("var(--chris-print-paper)"));
  assert.ok(reportsCss.includes("var(--chris-print-green-soft)"));
});

test("settlement accounting orientation never stacks credit above debit", () => {
  assert.ok(exitsCss.includes("Settlement accounting orientation is fixed"));
  const matches = exitsCss.match(/grid-template-columns:\s*minmax\(360px, 1fr\) minmax\(360px, 1fr\)/g) || [];
  assert.ok(matches.length >= 2);
  assert.ok(exitsCss.includes("overflow-x: auto"));
});
