const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getZermattEmploymentResourceLibrary } = require("../src/services/zermattEmploymentResourceService");
const { ZERMATT_DESIGNATION_LEVELS } = require("../src/config/zermattEmploymentLevels");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Zermatt Documents employment resource library is complete and designation-driven", () => {
  const library = getZermattEmploymentResourceLibrary();
  assert.equal(library.tenant, "zermatt-liquor-limited");
  assert.equal(library.jobDescriptions.length, ZERMATT_DESIGNATION_LEVELS.length);
  assert.equal(library.jobDescriptions.length, 120);
  assert.ok(library.legalResources.some((item) => item.id === "labour-act"));
  assert.ok(library.legalResources.some((item) => item.id === "tax-laws"));
  assert.ok(library.legalResources.some((item) => item.id === "pension-reform-act"));
  assert.ok(library.legalResources.some((item) => item.id === "data-protection"));
  assert.ok(library.employmentPolicy.sections.length >= 20);
  assert.ok(library.employmentOfferTemplate.body.length >= 6);
  assert.ok(library.onboardingMaterials.length >= 10);
  assert.ok(library.hrTemplates.length >= 25);

  for (const job of library.jobDescriptions) {
    assert.ok(job.jobTitle);
    assert.ok(job.designationCode);
    assert.ok(job.employmentLevel);
    assert.ok(job.rolePurpose);
    assert.ok(job.responsibilities.length >= 5);
    assert.ok(job.kpis.length >= 5);
    assert.ok(job.compliance.length >= 4);
  }
});

test("Documents module activates the employment resources child workspace", () => {
  const dashboard = read("src/components/dashboard/ModuleDashboard.jsx");
  const workspace = read("src/pages/documents/ZermattEmploymentResources.jsx");
  const routes = read("backend/src/routes/zermattOperationsRoutes.js");

  assert.ok(dashboard.includes('moduleKey === "documents"'));
  assert.ok(dashboard.includes("ZermattEmploymentResources"));
  assert.ok(workspace.includes("Nigerian Employment Resources"));
  assert.ok(workspace.includes("Employment Policy"));
  assert.ok(workspace.includes("Employment Offer"));
  assert.ok(workspace.includes("Job Descriptions"));
  assert.ok(workspace.includes("Onboarding Material"));
  assert.ok(workspace.includes("HR Templates"));
  assert.ok(routes.includes('"/employment-resources"'));
});

console.log("PASS: Zermatt employment resources acceptance gate passed.");
