import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { findNextIncompleteSection } from "../../src/utils/onboardingProgress.js";

const require = createRequire(import.meta.url);
const {
  listOnboardingTasks,
  projectTaskFromSectionProgress,
} = require("../src/services/employeeOnboardingTaskService");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const pristineTask = (overrides = {}) => ({
  id: "task-a",
  itemKey: "next-of-kin:1",
  title: "Name",
  category: "Next of Kin",
  isRequired: true,
  status: "NOT_STARTED",
  ownerUserId: null,
  dueDate: null,
  notes: null,
  completedAt: null,
  completedByUserId: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z",
  ...overrides,
});

test("completed section projects pristine tasks as satisfied without fabricated audit fields", () => {
  const projected = projectTaskFromSectionProgress(
    pristineTask(),
    { "next-of-kin": { completed: true } }
  );
  assert.equal(projected.status, "COMPLETED");
  assert.equal(projected.completionSource, "SECTION_INFERRED");
  assert.equal(projected.ownerUserId, null);
  assert.equal(projected.dueDate, null);
  assert.equal(projected.completedAt, null);
  assert.equal(projected.completedByUserId, null);
});

test("partial employees receive employee-specific task projection", () => {
  const personal = pristineTask({ itemKey: "personal-details:1" });
  const legal = pristineTask({ id: "task-b", itemKey: "legal:1", category: "Legal" });
  const progress = { "personal-details": { completed: true }, legal: { completed: false } };
  assert.equal(projectTaskFromSectionProgress(personal, progress).status, "COMPLETED");
  assert.equal(projectTaskFromSectionProgress(legal, progress).status, "NOT_STARTED");
});

test("timestamp-only task touches do not override completed section evidence", () => {
  const harmlesslyTouched = pristineTask({
    updatedAt: "2026-08-29T09:00:00.000Z",
    status: "NOT_STARTED",
  });
  const projected = projectTaskFromSectionProgress(
    harmlesslyTouched,
    { "next-of-kin": { completed: true } }
  );
  assert.equal(projected.status, "COMPLETED");
  assert.equal(projected.completionSource, "SECTION_INFERRED");
});

test("meaningfully managed task state wins over inferred section completion", () => {
  const explicitlyManaged = pristineTask({
    updatedAt: "2026-08-29T09:00:00.000Z",
    status: "IN_PROGRESS",
    notes: "HR follow-up required",
  });
  const projected = projectTaskFromSectionProgress(
    explicitlyManaged,
    { "next-of-kin": { completed: true } }
  );
  assert.equal(projected.status, "IN_PROGRESS");
  assert.equal(projected.completionSource, "TASK");
});

test("100 percent workflow does not leave pristine optional tasks outstanding", () => {
  const optional = pristineTask({ itemKey: "assets:1", category: "Assets", isRequired: false });
  const projected = projectTaskFromSectionProgress(optional, { assets: { completed: false } }, true);
  assert.equal(projected.status, "NOT_APPLICABLE");
  assert.equal(projected.completionSource, "OPTIONAL_SECTION_INFERRED");
});

test("task listing remains tenant and onboarding scoped", async () => {
  const calls = [];
  const prisma = {
    employeeOnboarding: {
      findFirst: async ({ where }) => {
        calls.push(where);
        return { id: "onboarding-a", status: "IN_PROGRESS", completionPercent: 50, sectionProgress: {} };
      },
    },
    employeeOnboardingTask: {
      findMany: async ({ where }) => {
        calls.push(where);
        return [];
      },
    },
  };
  await listOnboardingTasks(prisma, { organizationId: "tenant-a", onboardingId: "onboarding-a" });
  assert.deepEqual(calls, [
    { id: "onboarding-a", organizationId: "tenant-a" },
    { organizationId: "tenant-a", onboardingId: "onboarding-a" },
  ]);
});

test("Next of Kin, Emergency Contact, Legal and Assets share ordered progression", () => {
  const sections = ["next-of-kin", "emergency-contact", "legal", "assets"].map((key) => ({ key }));
  const record = {
    status: "IN_PROGRESS",
    completionPercent: 75,
    template: { sections },
    sectionProgress: {
      "next-of-kin": { completed: true },
      "emergency-contact": { completed: false },
      legal: { completed: false },
      assets: { completed: false },
    },
  };
  assert.equal(findNextIncompleteSection(record, "next-of-kin")?.key, "emergency-contact");
  record.sectionProgress["emergency-contact"].completed = true;
  assert.equal(findNextIncompleteSection(record, "emergency-contact")?.key, "legal");
  record.sectionProgress.legal.completed = true;
  record.status = "COMPLETED";
  record.completionPercent = 100;
  assert.equal(findNextIncompleteSection(record, "legal")?.key, "assets");
  record.sectionProgress.assets.completed = true;
  assert.equal(findNextIncompleteSection(record, "assets"), null);
});

test("backend rejects blank required section payload before progress mutation", () => {
  const routes = read("backend/src/routes/onboardingRoutes.js");
  const sectionRoute = routes.slice(routes.indexOf('"/records/:id/sections/:sectionKey"'));
  assert.match(sectionRoute, /ONBOARDING_SECTION_REQUIRED/);
  assert.match(sectionRoute, /buildCompletion\(req\.params\.sectionKey, incomingData\)\.length === 0/);
  assert.ok(sectionRoute.indexOf("ONBOARDING_SECTION_REQUIRED") < sectionRoute.indexOf("await applySectionProgress"));
});

test("final completion closes the editor and task success alone auto-dismisses", () => {
  const page = read("src/pages/EmployeeOnboarding.jsx");
  const checklist = read("src/components/employees/OnboardingTaskChecklist.jsx");
  assert.match(page, /clearSectionEditor\(\)[\s\S]*setSelectedSectionKey\(""\)/);
  assert.match(page, /setWorkflowCompleteRecordId\(updatedRecord\.id\)/);
  assert.match(checklist, /feedback\?\.type !== "success"/);
  assert.match(checklist, /3500/);
  assert.match(checklist, /setFeedback\(null\)[\s\S]*setRecentlySavedId\(""\)/);
});

test("Documents exposes 6 of 6 completion action and server-side completion contract", () => {
  const form = read("src/components/employees/OnboardingDocumentsForm.jsx");
  const routes = read("backend/src/routes/onboardingRoutes.js");
  const page = read("src/pages/EmployeeOnboarding.jsx");
  assert.match(form, /completedCount === requiredCount/);
  assert.match(form, /Complete Documents & Continue/);
  assert.match(routes, /records\/:id\/documents\/complete/);
  assert.match(routes, /DOCUMENT_REQUIREMENTS_INCOMPLETE/);
  assert.match(page, /onCompleted=[\s\S]*advanceAfterSuccessfulSectionSave\(updatedRecord, "documents"\)/);
});

console.log("PASS: Increment 1 browser-acceptance reconciliation contracts passed.");
