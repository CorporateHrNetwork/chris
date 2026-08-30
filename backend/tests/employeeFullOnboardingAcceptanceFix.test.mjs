import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { runFullOnboarding } = await import(pathToFileURL(path.join(root, "src/utils/fullOnboardingOrchestration.js")));
const shell = fs.readFileSync(path.join(root, "src/pages/FullOnboardingWizard.jsx"), "utf8");
const pfas = fs.readFileSync(path.join(root, "src/data/nigeriaPfas.js"), "utf8");
const sectionForm = fs.readFileSync(path.join(root, "src/components/employees/OnboardingSectionDataForm.jsx"), "utf8");
const searchable = fs.readFileSync(path.join(root, "src/components/common/SearchableRegistrySelect.jsx"), "utf8");

const employee = { id: "employee-1", employeeNumber: "CHR000011", name: "Mary Okili Ojoma" };
const onboarding = { id: "onboarding-1", template: { sections: [] } };

function argumentsFor(apiRequest, overrides = {}) {
  return {
    apiRequest,
    employee: null,
    onboardingRecord: null,
    employeePayload: { name: employee.name },
    templateId: "template-1",
    sectionPayloads: [],
    documents: [],
    completedSectionKeys: new Set(),
    uploadedDocumentIds: new Set(),
    onEmployeeCreated() {},
    onOnboardingStarted() {},
    onOnboardingUpdated() {},
    ...overrides,
  };
}

test("employee creation and onboarding initialization complete in order", async () => {
  const calls = [];
  const result = await runFullOnboarding(argumentsFor(async (url) => {
    calls.push(url);
    return { data: url === "/api/employees" ? employee : onboarding };
  }));
  assert.deepEqual(calls, ["/api/employees", "/api/employees/onboarding/CHR000011"]);
  assert.equal(result.employee.employeeNumber, "CHR000011");
  assert.equal(result.onboardingRecord.id, "onboarding-1");
});

test("onboarding failure preserves employee and retry never posts employee again", async () => {
  let persistedEmployee = null;
  await assert.rejects(runFullOnboarding(argumentsFor(async (url) => {
    if (url === "/api/employees") return { data: employee };
    throw new Error("Onboarding unavailable");
  }, { onEmployeeCreated(value) { persistedEmployee = value; } })), (error) => {
    assert.equal(error.onboardingRecovery.employee.employeeNumber, "CHR000011");
    assert.equal(error.onboardingRecovery.phase, "ONBOARDING_START");
    return true;
  });

  const retryCalls = [];
  await runFullOnboarding(argumentsFor(async (url) => {
    retryCalls.push(url);
    return { data: onboarding };
  }, { employee: persistedEmployee }));
  assert.deepEqual(retryCalls, ["/api/employees/onboarding/CHR000011"]);
});

test("successful completion clears draft but keeps employee completion actions", () => {
  assert.match(shell, /setCompletionEmployee\(\{ \.\.\.result\.employee, displayName: fullName \}\)/);
  assert.match(shell, /setComplete\(true\);\s*resetWizardDraft\(\)/);
  for (const action of ["View Employee", "Onboarding Tracker", "Add Another Employee"]) assert.ok(shell.includes(action));
  assert.match(shell, /completionEmployee\.employeeNumber/);
});

test("central Nigerian PFA registry is searchable and excludes non-PFA registries", () => {
  assert.match(sectionForm, /<SearchableRegistrySelect[\s\S]*NIGERIA_PFAS\.map/);
  assert.match(searchable, /type="search"[\s\S]*role="option"/);
  assert.match(sectionForm, /pensionPfaCode: match\?\.code/);
  assert.match(pfas, /Access ARM Pensions Limited/);
  assert.doesNotMatch(pfas, /First Pension Custodian|Nestle Nigeria Trust|Shell Nigeria Closed/);
  assert.match(shell, /statutory\.pensionPfa/);
});

console.log("PASS: Full Onboarding acceptance retry and Nigerian PFA contracts passed.");
