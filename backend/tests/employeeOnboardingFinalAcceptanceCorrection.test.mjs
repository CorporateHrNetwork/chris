import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { validateOnboardingSection } = require("../src/services/onboardingSectionValidationService");
const { assertTenantNinAvailable } = require("../src/services/employeeIdentityService");

test("statutory validation exposes exact TIN field metadata", () => {
  const result = validateOnboardingSection("statutory-details", {});
  assert.equal(result.valid, false);
  assert.deepEqual(result.fields[0], {
    field: "taxIdentificationNumber",
    label: "Tax Identification Number (TIN)",
    message: "Tax Identification Number (TIN) is required to complete this onboarding section.",
  });
});

test("NIN uniqueness permits blank and the same employee but rejects another employee", async () => {
  assert.equal(await assertTenantNinAvailable({ employee: { findFirst: async () => null } }, {
    organizationId: "tenant-a", employeeId: "employee-a", value: "",
  }), null);

  let where;
  const db = {
    employee: { findFirst: async (query) => { where = query.where; return null; } },
    employeeOnboarding: { findMany: async () => [] },
  };
  assert.equal(await assertTenantNinAvailable(db, {
    organizationId: "tenant-a", employeeId: "employee-a", value: "123 456 789 01",
  }), "12345678901");
  assert.equal(where.NOT.id, "employee-a");

  await assert.rejects(() => assertTenantNinAvailable({
    employee: { findFirst: async () => ({ id: "employee-b" }) },
  }, { organizationId: "tenant-a", employeeId: "employee-a", value: "12345678901" }),
  (error) => error.code === "DUPLICATE_EMPLOYEE_NIN" && /already assigned/.test(error.message));
});

test("frontend renders field focus metadata and explicit completion/review contracts", () => {
  const page = fs.readFileSync(new URL("../../src/pages/EmployeeOnboarding.jsx", import.meta.url), "utf8");
  const form = fs.readFileSync(new URL("../../src/components/employees/OnboardingSectionDataForm.jsx", import.meta.url), "utf8");
  const tracker = fs.readFileSync(new URL("../../src/pages/OnboardingTracker.jsx", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("../../src/components/employees/EmployeeProfile.jsx", import.meta.url), "utf8");
  assert.match(page, /data-onboarding-field/);
  assert.match(page, /Complete Onboarding/);
  assert.match(page, /setSelectedRecord\(null\)/);
  assert.match(form, /role="alert"/);
  assert.match(tracker, /Review Onboarding/);
  assert.match(profile, /Review Onboarding/);
});

test("completion endpoint is authoritative and idempotent", () => {
  const route = fs.readFileSync(new URL("../src/routes/onboardingRoutes.js", import.meta.url), "utf8");
  assert.match(route, /ONBOARDING_COMPLETION_BLOCKED/);
  assert.match(route, /ONBOARDING_ALREADY_COMPLETED/);
  assert.match(route, /status: \{ not: "COMPLETED" \}/);
  assert.match(route, /completedByUserId: req\.auth\.userId/);
});
