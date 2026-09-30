const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const { IMPORT_HEADERS, buildTemplateWorkbook, prepareBulkRows } =
  require("../src/services/employeeDataOperationsService");

const expected = [
  "Employee Name", "Work Email", "Phone", "Gender", "Status", "Hire Date",
  "Employment Type", "Department", "Designation", "Employment Level", "Location",
  "Cost Centre / Operating Unit", "Monthly Gross Salary", "Salary Currency",
  "Salary Effective From", "NIN", "Account Number", "Bank", "Pension Provider",
  "RSA Number", "Branch", "Date of Birth", "TaxIdentificationNO", "Tax Authority",
  "Guarantor 1", "Guarantor 2", "Next Of Kin",
];

test("complete Zermatt template includes every requested column in order", () => {
  assert.deepEqual(IMPORT_HEADERS, expected);
  const book = XLSX.read(buildTemplateWorkbook(), { type: "buffer" });
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets["Employee Import"], {
    header: 1, defval: ""
  })[0], expected);
});

test("bulk preview resolves Employment Level and preserves supplementary data", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([{
    "Employee Name": "Example Test Person", "Gender": "FEMALE",
    "Hire Date": "2026-09-01", "Employment Type": "Full-Time",
    "Department": "Human Resources", "Designation": "HR Officer",
    "Employment Level": "L3", "Location": "Abuja", "Branch": "Abuja",
    "Cost Centre / Operating Unit": "HEAD OFFICE",
    "Monthly Gross Salary": 450000, "Salary Currency": "NGN",
    "Account Number": "0123456789", "Bank": "Test Bank",
    "Pension Provider": "Test PFA", "RSA Number": "RSA-EXAMPLE",
    "Date of Birth": "1997-04-20", "TaxIdentificationNO": "TIN-TEST",
    "Tax Authority": "FCT", "Guarantor 1": "Example Guarantor One",
    "Guarantor 2": "Example Guarantor Two", "Next Of Kin": "Example Kin",
  }]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Employee Import");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const prisma = {
    organization: { findUnique: async () => ({ slug: "zermatt-liquor-limited" }) },
    department: { findMany: async () => [{ id: "dep", name: "Human Resources", code: "HR", costCentreId: "cc" }] },
    designation: { findMany: async () => [{ id: "des", departmentId: "dep", name: "HR Officer", code: "HR", careerLevel: 203 }] },
    organizationLocation: { findMany: async () => [{ id: "loc", name: "Abuja", code: "ABJ" }] },
    costCentre: { findMany: async () => [{ id: "cc", name: "HEAD OFFICE", code: "HO" }] },
    employee: { findMany: async () => [] },
    organizationEmploymentLevel: { findMany: async () => [{ levelNumber: 203, code: "L3", name: "Senior Officers and Branch Supervisors" }] },
    onboardingWorkflowTemplate: { findMany: async () => [{ id: "tmpl", employmentType: "Full-Time", sections: [] }] },
  };
  const rows = await prepareBulkRows(prisma, { organizationId: "org", buffer });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].valid, true);
  assert.equal(rows[0].input.openingEmploymentLevelNumber, 203);
  assert.equal(rows[0].input.onboardingTemplateId, "tmpl");
  assert.equal(rows[0].input.onboardingSectionData["payment-details"].accountNumber, "0123456789");
  assert.equal(rows[0].input.onboardingSectionData["statutory-details"].pensionPfa, "Test PFA");
  assert.equal(rows[0].input.onboardingSectionData["next-of-kin"].guarantor2, "Example Guarantor Two");
  assert.equal(rows[0].input.status, "Probation");
});

test("bulk create saves sections and grade in the employee transaction", () => {
  const creation = read("backend/src/services/employeeCreationService.js");
  const preview = read("src/pages/BulkEmployeeImport.jsx");
  assert.ok(creation.includes("tx.employeeOnboarding.create"));
  assert.ok(creation.includes("sectionData: input.onboardingSectionData"));
  assert.ok(creation.includes("tx.employeeEmploymentLevelAssignment.create"));
  assert.ok(creation.includes("tx.organizationAudit.create"));
  assert.ok(preview.includes("<th>Employment Level</th>"));
});

console.log("PASS: Zermatt complete bulk onboarding acceptance checks");


test("operational checklist always exposes branch HR assign-all while preserving individual owners", () => {
  const checklist = read("src/components/employees/OnboardingTaskChecklist.jsx");
  const route = read("backend/src/routes/onboardingRoutes.js");
  assert.ok(checklist.includes("Assign All to Branch HR & Admin Officer"));
  assert.ok(checklist.includes('className="onboarding-task-assign-all"'));
  assert.ok(checklist.includes("assignBranchHr"));
  assert.ok(checklist.includes("individual Owner dropdown"));
  assert.ok(checklist.includes("owners.map((owner)"));
  assert.equal(checklist.includes('assignmentMode === "branch-hr"'), false, "Bulk ownership must be immediately visible, not hidden behind a radio switch");
  assert.ok(route.includes('"/records/:id/tasks/assign-branch-hr"'));
  assert.ok(route.includes("overwriteExisting: false") || checklist.includes("overwriteExisting: false"));
});
