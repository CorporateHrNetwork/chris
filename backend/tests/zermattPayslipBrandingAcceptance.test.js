const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("live and print payslips render organization branding and watermark", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  for (const expected of [
    "payslipPreviewLogoStyle",
    "payslipPreviewWatermarkImageStyle",
    "payslipPreviewWatermarkTextStyle",
    "organization?.logoUrl",
    "EMPLOYEE PAYSLIP",
    "watermark-text",
    "payslipOrganizationName",
    "SYNTHETIC STAGING ACCEPTANCE",
    "<title></title>",
    "@page{size:A4 portrait;margin:0}",
    "opacity:.10",
    'mixBlendMode: "multiply"',
  ]) {
    assert.ok(ui.includes(expected), `Missing payslip branding control: ${expected}`);
  }
});

test("synthetic Zermatt staging can receive the authoritative logo through Render environment", () => {
  const fixture = read("backend/scripts/provision-synthetic-zermatt-staging.cjs");
  for (const expected of [
    "CHRIS_STAGING_ZERMATT_LOGO_URL",
    "STAGING_ZERMATT_LOGO_URL && organization.logoUrl !== STAGING_ZERMATT_LOGO_URL",
    "data: { logoUrl: STAGING_ZERMATT_LOGO_URL }",
    "logoConfigured: Boolean(organization.logoUrl)",
  ]) {
    assert.ok(fixture.includes(expected), `Missing staging logo provisioning control: ${expected}`);
  }
});
