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
  assert.ok(library.standardOperatingProcedures.length >= 30);
  assert.ok(library.sopCategories.length >= 6);
  assert.equal(library.sopStatus, "DRAFT_FOR_MANAGEMENT_APPROVAL");
  assert.equal(library.summary.standardOperatingProcedures, library.standardOperatingProcedures.length);

  for (const job of library.jobDescriptions) {
    assert.ok(job.jobTitle);
    assert.ok(job.designationCode);
    assert.ok(job.employmentLevel);
    assert.ok(job.rolePurpose);
    assert.ok(job.responsibilities.length >= 5);
    assert.ok(job.kpis.length >= 5);
    assert.ok(job.compliance.length >= 4);
  }

  for (const sop of library.standardOperatingProcedures) {
    assert.ok(sop.id);
    assert.ok(sop.title);
    assert.ok(sop.category);
    assert.ok(sop.owner);
    assert.ok(sop.purpose);
    assert.ok(sop.scope);
    assert.ok(sop.trigger);
    assert.ok(sop.steps.length >= 5, `${sop.id} must contain an actionable procedure`);
    assert.ok(sop.controls.length >= 2, `${sop.id} must contain critical controls`);
    assert.ok(sop.records.length >= 3, `${sop.id} must identify audit evidence`);
    assert.match(sop.reviewNote, /Management approval/i);
  }

  const loanSop = library.standardOperatingProcedures.find((item) => item.id === "loan-administration");
  assert.ok(loanSop);
  assert.match(loanSop.controls.join(" "), /outside CHRiS/i);
  assert.match(loanSop.controls.join(" "), /fake salary deduction/i);

  const eosbSop = library.standardOperatingProcedures.find((item) => item.id === "eosb");
  assert.ok(eosbSop);
  assert.match(eosbSop.steps.join(" "), /7\.5%/);
  assert.match(eosbSop.steps.join(" "), /30-day basis/i);

  const disciplinarySop = library.standardOperatingProcedures.find((item) => item.id === "disciplinary");
  assert.ok(disciplinarySop);
  assert.match(disciplinarySop.controls.join(" "), /do not automatically decide/i);
});

test("Documents module activates the employment resources child workspace", () => {
  const dashboard = read("src/components/dashboard/ModuleDashboard.jsx");
  const workspace = read("src/pages/documents/ZermattEmploymentResources.jsx");
  const routes = read("backend/src/routes/zermattOperationsRoutes.js");
  const sopService = read("backend/src/services/zermattSopResourceService.js");

  assert.ok(dashboard.includes('moduleKey === "documents"'));
  assert.ok(dashboard.includes("ZermattEmploymentResources"));
  assert.ok(workspace.includes("Nigerian Employment Resources"));
  assert.ok(workspace.includes("Employment Policy"));
  assert.ok(workspace.includes("Employment Offer"));
  assert.ok(workspace.includes("SOPs"));
  assert.ok(workspace.includes("standardOperatingProcedures"));
  assert.ok(workspace.includes("Print / Save as PDF"));
  assert.ok(workspace.includes("Job Descriptions"));
  assert.ok(workspace.includes("Onboarding Material"));
  assert.ok(workspace.includes("HR Templates"));
  assert.ok(routes.includes('"/employment-resources"'));
  assert.ok(sopService.includes('"DRAFT_FOR_MANAGEMENT_APPROVAL"'));
  assert.ok(sopService.includes("Cashier Till, Cash Handling & Reconciliation SOP"));
  assert.ok(sopService.includes("Kitchen Production, Hygiene & Food-Safety SOP"));
  assert.ok(sopService.includes("Workplace Incident, Injury & NSITF Case SOP"));
});

console.log("PASS: Zermatt employment resources and SOP acceptance gate passed.");