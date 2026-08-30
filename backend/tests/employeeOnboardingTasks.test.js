const assert = require("node:assert/strict");
const test = require("node:test");

const {
  taskDefinitions,
  createTasksFromTemplate,
  isTaskOverdue,
  updateOnboardingTask,
} = require("../src/services/employeeOnboardingTaskService");

test("template items create tenant-scoped NOT_STARTED tasks without fabricated completion", async () => {
  let written;
  const tx = { employeeOnboardingTask: { createMany: async (input) => { written = input.data; return { count: input.data.length }; } } };
  const sections = [{ key: "documents", label: "Documents", required: true, items: ["Valid ID", "Offer Letter"] }];
  assert.equal(await createTasksFromTemplate(tx, { organizationId: "tenant-a", onboardingId: "onboarding-a", sections }), 2);
  assert.deepEqual(written.map(({ organizationId, onboardingId, itemKey, status }) => ({ organizationId, onboardingId, itemKey, status })), [
    { organizationId: "tenant-a", onboardingId: "onboarding-a", itemKey: "documents:1", status: "NOT_STARTED" },
    { organizationId: "tenant-a", onboardingId: "onboarding-a", itemKey: "documents:2", status: "NOT_STARTED" },
  ]);
  assert.equal(taskDefinitions(sections)[0].title, "Valid ID");
});

test("overdue requires a due date in the past and an actionable status", () => {
  const now = new Date("2026-08-28T12:00:00Z");
  assert.equal(isTaskOverdue({ dueDate: "2026-08-27", status: "IN_PROGRESS" }, now), true);
  assert.equal(isTaskOverdue({ dueDate: null, status: "IN_PROGRESS" }, now), false);
  assert.equal(isTaskOverdue({ dueDate: "2026-08-27", status: "COMPLETED" }, now), false);
  assert.equal(isTaskOverdue({ dueDate: "2026-08-27", status: "NOT_APPLICABLE" }, now), false);
});

test("task update validates tenant owner and records completion actor/date", async () => {
  let update;
  const tx = {
    employeeOnboardingTask: {
      findFirst: async ({ where }) => { assert.deepEqual(where, { id: "task-a", onboardingId: "onboarding-a", organizationId: "tenant-a" }); return { id: "task-a" }; },
      update: async (input) => { update = input.data; return { id: "task-a", ...input.data }; },
    },
    user: { findFirst: async ({ where }) => { assert.equal(where.organizationId, "tenant-a"); return { id: where.id }; } },
  };
  const prisma = { $transaction: (work) => work(tx) };
  const result = await updateOnboardingTask(prisma, {
    organizationId: "tenant-a", onboardingId: "onboarding-a", taskId: "task-a", actorUserId: "actor-a",
    input: { status: "COMPLETED", ownerUserId: "owner-a", dueDate: "2026-08-30", notes: "Evidence checked" },
  });
  assert.equal(update.completedByUserId, "actor-a");
  assert.ok(update.completedAt instanceof Date);
  assert.equal(result.status, "COMPLETED");
});

test("Not Applicable requires a reason", async () => {
  await assert.rejects(updateOnboardingTask({}, {
    organizationId: "tenant-a", onboardingId: "onboarding-a", taskId: "task-a", actorUserId: "actor-a",
    input: { status: "NOT_APPLICABLE", notes: "" },
  }), (error) => error.code === "NOT_APPLICABLE_REASON_REQUIRED");
});

console.log("PASS: operational onboarding task safety tests passed.");
