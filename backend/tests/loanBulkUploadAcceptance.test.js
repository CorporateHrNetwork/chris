const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const { templateBuffer } = require("../src/services/loanBulkImportService");
const { buildAmortizationSchedule } = require("../src/services/loanProfileService");

test("ZERMATT Loans expose controlled Excel bulk upload with opening-balance safeguards", () => {
  const routes = read("backend/src/routes/loanRoutes.js");
  const service = read("backend/src/services/loanBulkImportService.js");
  const loansUi = read("src/pages/Loans.jsx");
  const bulkUi = read("src/pages/LoanBulkUpload.jsx");
  const profile = read("backend/src/services/loanProfileService.js");

  for (const route of [
    'router.get("/bulk/template"',
    'router.post("/bulk/preview"',
    'router.post("/bulk/import"',
  ]) {
    assert.ok(routes.includes(route), `missing loan bulk route: ${route}`);
  }
  assert.ok(routes.includes('requirePermission("payroll.manage")'), "bulk loan upload must require payroll.manage");
  assert.ok(routes.includes('upload.single("file")'), "bulk loan preview/import must accept controlled Excel upload");

  for (const control of [
    "prepareLoanWorkbook",
    "importOpeningLoans",
    "LOAN_IMPORT_VALIDATION_FAILED",
    "Likely duplicate of existing loan",
    "Opening recovered before CHRiS",
    "INVALID_ZERMATT_LOAN_POLICY",
    "ACTIVE loan cannot be imported for payroll recovery",
  ]) {
    assert.ok(service.includes(control), `missing loan import control: ${control}`);
  }

  assert.ok(service.includes("rows.every((row) => row.valid)") === false, "service should not pretend preview-state logic lives inside import service");
  assert.ok(service.includes("prismaClient.$transaction"), "financial loan import must be atomic");
  assert.ok(service.includes('action: "LOAN_BULK_OPENING_IMPORT"'), "bulk import must be audited");
  assert.ok(service.includes("Interest Rate must be blank or 0"), "ZERMATT bulk import must reject non-zero interest");

  const workbook = XLSX.read(templateBuffer(), { type: "buffer" });
  assert.ok(workbook.SheetNames.includes("Instructions"));
  assert.ok(workbook.SheetNames.includes("Loans"));
  assert.ok(workbook.SheetNames.includes("Loan Policies"));
  const policyRows = XLSX.utils.sheet_to_json(workbook.Sheets["Loan Policies"], { header: 1 });
  assert.equal(policyRows.length, 9, "template must contain heading plus eight ZERMATT loan policies");
  assert.ok(policyRows.slice(1).every((row) => Number(row[1]) === 0), "all ZERMATT template policies must be 0% interest");

  assert.ok(loansUi.includes("Bulk Loan Upload"), "Loans dashboard must expose a Bulk Loan Upload quick action");
  assert.ok(loansUi.includes("setShowBulkUpload(true)"), "Bulk Loan Upload must be clickable from Loans");
  assert.ok(bulkUi.includes("Validate / Preview"), "bulk workflow must preview before import");
  assert.ok(bulkUi.includes("Import Validated Workbook"), "bulk workflow must expose explicit import action");
  assert.ok(bulkUi.includes("preview?.importAllowed"), "UI must block import until all rows validate");
  assert.ok(bulkUi.includes("Download CHRiS Template"), "bulk workflow must provide a reusable Excel template");

  const openingSchedule = buildAmortizationSchedule({
    principalAmount: 350000,
    installmentAmount: 50000,
    recoveryStartDate: "2026-01-01",
    openingRecoveredAmount: 100000,
    recoveries: [],
  });
  assert.equal(openingSchedule.length, 7);
  assert.equal(openingSchedule[0].status, "PAID");
  assert.equal(openingSchedule[1].status, "PAID");
  assert.equal(openingSchedule[2].status, "PENDING");
  assert.ok(profile.includes("openingRecoveredAmount"), "loan profile must distinguish opening recovery from CHRiS payroll history");
  assert.ok(profile.includes("payrollRecoveredAmount"), "loan profile must separately expose CHRiS payroll recoveries");
  assert.ok(profile.includes("LEGACY_OPENING_BALANCE_NOT_PAYROLL_HISTORY"), "opening balance must not be represented as fabricated payroll history");

  console.log("PASS: ZERMATT controlled loan bulk upload gate passed.");
});
