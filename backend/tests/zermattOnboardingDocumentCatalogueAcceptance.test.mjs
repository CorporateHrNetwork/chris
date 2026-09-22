import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");

const catalogue = fs.readFileSync(
  path.join(root, "src/data/zermattOnboardingDocuments.js"),
  "utf8"
);
const documentForm = fs.readFileSync(
  path.join(root, "src/components/employees/OnboardingDocumentsForm.jsx"),
  "utf8"
);
const fullWizard = fs.readFileSync(
  path.join(root, "src/pages/FullOnboardingWizard.jsx"),
  "utf8"
);
const onboardingPage = fs.readFileSync(
  path.join(root, "src/pages/EmployeeOnboarding.jsx"),
  "utf8"
);
const backend = fs.readFileSync(
  path.join(root, "backend/src/routes/onboardingRoutes.js"),
  "utf8"
);

const expectedLabels = [
  "CV/Resume",
  "Offer of Appointment Letter",
  "Employee Personal Data",
  "SSCE Certificate/ND/HND/B. Sc/PGD/M. Sc/MBA",
  "Guarantor 1 & 2",
  "NIN Slip",
  "Passport",
];

test("Zermatt onboarding exposes the exact seven required document names", () => {
  for (const label of expectedLabels) {
    assert.ok(catalogue.includes(label), `Missing Zermatt document label: ${label}`);
    assert.ok(backend.includes(label), `Backend missing Zermatt document label: ${label}`);
  }
  assert.match(catalogue, /ZERMATT_DOCUMENT_TYPES\s*=\s*\[/);
  assert.equal((catalogue.match(/^\s*\["/gm) || []).length, 7);
});

test("both Zermatt document upload experiences use the tenant catalogue", () => {
  assert.ok(documentForm.includes("ZERMATT_DOCUMENT_TYPES"));
  assert.ok(documentForm.includes("isZermattOrganization(getStoredOrganization())"));
  assert.ok(fullWizard.includes("ZERMATT_DOCUMENT_TYPES"));
  assert.ok(fullWizard.includes("const organization = getStoredOrganization() || {};"));
  assert.ok(fullWizard.includes("const zermattTenant = isZermattOrganization(organization);"));
  assert.ok(fullWizard.includes("const documentTypes = zermattTenant ? ZERMATT_DOCUMENT_TYPES : DEFAULT_DOCUMENT_TYPES;"));
  assert.ok(onboardingPage.includes("ZERMATT_DOCUMENT_ITEMS"));
});

test("backend completion checks Zermatt requirements without deleting legacy document support", () => {
  assert.ok(backend.includes('ZERMATT_ORGANIZATION_SLUG = "zermatt-liquor-limited"'));
  assert.ok(backend.includes("useZermattDocumentRequirements"));
  assert.ok(backend.includes("documentCategoryLabelsForOrganization"));
  for (const legacyCategory of ["VALID_ID", "OTHER"]) {
    assert.ok(backend.includes(legacyCategory), `Legacy document category should remain readable: ${legacyCategory}`);
  }
  for (const newCategory of ["EMPLOYEE_PERSONAL_DATA", "GUARANTOR_1_2", "NIN_SLIP"]) {
    assert.ok(backend.includes(newCategory), `Missing new Zermatt category: ${newCategory}`);
  }
});
