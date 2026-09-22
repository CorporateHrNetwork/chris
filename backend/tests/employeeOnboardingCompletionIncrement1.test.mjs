import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { findNextIncompleteSection } from "../../src/utils/onboardingProgress.js";

const require = createRequire(import.meta.url);
const { updateOnboardingTask } = require("../src/services/employeeOnboardingTaskService");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sections = [
  { key: "personal", label: "Personal Details" },
  { key: "statutory", label: "Statutory Details" },
  { key: "documents", label: "Documents" },
];

test("successful section progression selects the next incomplete section", () => {
  const record = {
    status: "IN_PROGRESS",
    completionPercent: 33,
    template: { sections },
    sectionProgress: {
      personal: { completed: true },
      statutory: { completed: false },
      documents: { completed: false },
    },
  };
  assert.equal(findNextIncompleteSection(record, "personal")?.key, "statutory");
});

test("an incompletely saved section remains active and a completed workflow does not advance", () => {
  const incomplete = {
    status: "IN_PROGRESS",
    completionPercent: 0,
    template: { sections },
    sectionProgress: { personal: { completed: false } },
  };
  assert.equal(findNextIncompleteSection(incomplete, "personal")?.key, "personal");
  const allComplete = {
    ...incomplete,
    status: "COMPLETED",
    completionPercent: 100,
    sectionProgress: Object.fromEntries(sections.map((section) => [section.key, { completed: true }])),
  };
  assert.equal(findNextIncompleteSection(allComplete, "documents"), null);
});

test("page auto-advances only inside the successful save path and focuses the editor", () => {
  const source = read("src/pages/EmployeeOnboarding.jsx");
  const successPosition = source.indexOf("const nextSection = findNextIncompleteSection");
  const catchPosition = source.indexOf("Onboarding save error:");
  assert.ok(successPosition > source.indexOf("await apiRequest("));
  assert.ok(successPosition < catchPosition);
  assert.match(source, /sectionEditorRef\.current[\s\S]*scrollIntoView[\s\S]*focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /Onboarding workflow sections are complete\./);
});

test("checklist groups tasks, shows authoritative progress, and clears only transient drafts after save", () => {
  const source = read("src/components/employees/OnboardingTaskChecklist.jsx");
  assert.match(source, /grouped\.set\(category, \[\]\)/);
  assert.match(source, /group\.completed\}\/\{group\.tasks\.length\} complete/);
  assert.match(source, /setPersistedTasks[\s\S]*result\?\.data/);
  assert.match(source, /delete next\[task\.id\]/);
  assert.match(source, /dirty \? "Save Task" : recentlySavedId === task\.id \? "Saved" : "No changes"/);
  assert.match(source, /group\.overdue > 0 \|\| group\.inProgress > 0/);
});

test("task owner must remain an active user in the same tenant", async () => {
  const tx = {
    employeeOnboardingTask: {
      findFirst: async () => ({ id: "task-a" }),
    },
    user: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, {
          id: "foreign-owner",
          organizationId: "tenant-a",
          isActive: true,
        });
        return null;
      },
    },
  };
  const prisma = { $transaction: (work) => work(tx) };
  await assert.rejects(
    updateOnboardingTask(prisma, {
      organizationId: "tenant-a",
      onboardingId: "onboarding-a",
      taskId: "task-a",
      actorUserId: "actor-a",
      input: { status: "IN_PROGRESS", ownerUserId: "foreign-owner" },
    }),
    (error) => error.code === "INVALID_TASK_OWNER"
  );
});

console.log("PASS: Completion Sprint Increment 1 navigation and checklist contracts passed.");
