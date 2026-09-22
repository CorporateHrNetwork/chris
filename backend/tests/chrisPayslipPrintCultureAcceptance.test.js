const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const payslip = fs.readFileSync(
  path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"),
  "utf8"
);
const branding = fs.readFileSync(
  path.join(root, "src/components/reporting/PrintableReportBranding.jsx"),
  "utf8"
);
const brandingCss = fs.readFileSync(
  path.join(root, "src/components/reporting/PrintableReportBranding.css"),
  "utf8"
);
const globalPrint = fs.readFileSync(
  path.join(root, "src/styles/ChrisPrintVisualLanguage.css"),
  "utf8"
);

test("shared CHRiS printable branding reuses the payslip document culture", () => {
  for (const expected of [
    "chris-print-document-watermark",
    "chris-print-document-watermark-text",
    "chris-print-report-logo",
    "chris-print-report-owner",
    "chris-print-report-scope",
  ]) {
    assert.ok(branding.includes(expected), `Missing shared payslip-derived print control: ${expected}`);
  }

  for (const expected of [
    "text-align: center",
    "max-width: 92px",
    "max-height: 48px",
    "border-bottom: 2px solid var(--chris-print-green)",
    "color: var(--chris-print-gold)",
    "top: 52%",
    "opacity: .08",
  ]) {
    assert.ok(brandingCss.includes(expected), `Missing payslip-derived print style: ${expected}`);
  }
});

test("payslip and shared CHRiS print documents use the same off-white paper culture", () => {
  assert.ok(globalPrint.includes("--chris-print-paper: #f7f3e8"));
  assert.ok(payslip.includes("body{margin:0;background:#f7f3e8"));
  assert.ok(payslip.includes(".payslip{position:relative"));
  assert.ok(payslip.includes("background:#f7f3e8"));
  assert.ok(payslip.includes("th{background:#f7f3e8!important;color:#064e3b!important"));
  assert.equal(payslip.includes("th{background:#064e3b!important"), false);
});

test("payslip watermark and centered organisation header remain authoritative", () => {
  assert.ok(payslip.includes('class="watermark"'));
  assert.ok(payslip.includes('class="organization-logo"'));
  assert.ok(payslip.includes('class="organization-name"'));
  assert.ok(payslip.includes('class="document-title"'));
  assert.ok(payslip.includes("organization-header{text-align:center"));
});
