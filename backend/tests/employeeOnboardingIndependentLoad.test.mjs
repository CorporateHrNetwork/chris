import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadOnboardingPageResources } from "../../src/utils/onboardingPageResources.js";

const EMPLOYEES = [
  {
    id: "employee-1",
    employeeNumber: "CHR000007",
    firstName: "Ann",
    lastName: "Joseph",
  },
];

function createHarness(failEndpoint, employeeData = EMPLOYEES) {
  const received = { employees: null, templates: null, records: null };
  const apiRequest = async (endpoint) => {
    if (endpoint === failEndpoint) {
      throw new Error(`Failed ${endpoint}`);
    }
    if (endpoint === "/api/employees") return { data: employeeData };
    if (endpoint.endsWith("/templates")) return { data: [{ id: "template-1" }] };
    return { data: [{ id: "record-1" }] };
  };

  return {
    received,
    run: () => loadOnboardingPageResources({
      apiRequest,
      onEmployees: (data) => { received.employees = data; },
      onTemplates: (data) => { received.templates = data; },
      onRecords: (data) => { received.records = data; },
    }),
  };
}

test("employees still load when onboarding status fails", async () => {
  const harness = createHarness("/api/employees/onboarding/status");
  const result = await harness.run();
  assert.equal(result.records.ok, false);
  assert.equal(result.employees.ok, true);
  assert.deepEqual(harness.received.employees, EMPLOYEES);
});

test("employees still load when onboarding templates fail", async () => {
  const harness = createHarness("/api/employees/onboarding/templates");
  const result = await harness.run();
  assert.equal(result.templates.ok, false);
  assert.equal(result.employees.ok, true);
  assert.deepEqual(harness.received.employees, EMPLOYEES);
});

test("employee failure is isolated and reports its own error", async () => {
  const harness = createHarness("/api/employees");
  const result = await harness.run();
  assert.equal(result.employees.ok, false);
  assert.match(result.employees.error, /Failed \/api\/employees/);
  assert.equal(harness.received.employees, null);
  assert.equal(result.templates.ok, true);
  assert.equal(result.records.ok, true);
});

test("a successful empty employee response remains a genuine empty list", async () => {
  const harness = createHarness("", []);
  const result = await harness.run();
  assert.equal(result.employees.ok, true);
  assert.deepEqual(harness.received.employees, []);
});

test("existing employee objects are mapped into the selector unchanged", async () => {
  const harness = createHarness("");
  await harness.run();
  assert.strictEqual(harness.received.employees[0], EMPLOYEES[0]);
});

test("all three onboarding resources load normally", async () => {
  const harness = createHarness("");
  const result = await harness.run();
  assert.equal(result.employees.ok, true);
  assert.equal(result.templates.ok, true);
  assert.equal(result.records.ok, true);
  assert.deepEqual(harness.received.employees, EMPLOYEES);
  assert.deepEqual(harness.received.templates, [{ id: "template-1" }]);
  assert.deepEqual(harness.received.records, [{ id: "record-1" }]);
});

test("EmployeeOnboarding imports the helper from an existing resolvable module", async () => {
  const pageSource = await readFile(
    new URL("../../src/pages/EmployeeOnboarding.jsx", import.meta.url),
    "utf8"
  );
  const helperSource = await readFile(
    new URL("../../src/utils/onboardingPageResources.js", import.meta.url),
    "utf8"
  );
  assert.match(pageSource, /from "\.\.\/utils\/onboardingPageResources"/);
  assert.match(helperSource, /export function loadOnboardingPageResources/);
});
