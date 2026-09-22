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
  assert.match(globalPrint, /--chris-print-gold:\s*#[0-9a-f]{6}\s*;/i);
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
  assert.ok(exitsCss.includes("Authoritative settlement workspace and accounting orientation"));
  assert.ok(exitsCss.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important"));
  assert.ok(exitsCss.includes(".exit-settlement-credit-column"));
  assert.ok(exitsCss.includes("grid-column: 1 !important"));
  assert.ok(exitsCss.includes(".exit-settlement-debit-column"));
  assert.ok(exitsCss.includes("grid-column: 2 !important"));
  assert.equal(exitsCss.includes("flex-flow: row nowrap !important"), false);
});

test("global CHRiS print culture prohibits coloured background fills", () => {
  assert.ok(globalPrint.includes("background-color: var(--chris-print-paper) !important"));
  assert.ok(globalPrint.includes("background-image: none !important"));
  assert.ok(reportsCss.includes("background: var(--chris-print-paper) !important"));
  assert.ok(exitsCss.includes("CHRiS global print culture: off-white backgrounds only."));
});
