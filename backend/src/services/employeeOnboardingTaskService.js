const TASK_STATUSES = new Set([
  "NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE",
]);

function taskDefinitions(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section, sectionIndex) => {
    const category = String(section?.label || section?.key || `Section ${sectionIndex + 1}`).trim();
    const sectionKey = String(section?.key || `section-${sectionIndex + 1}`).trim();
    return (Array.isArray(section?.items) ? section.items : [])
      .map((title, itemIndex) => ({
        itemKey: `${sectionKey}:${itemIndex + 1}`,
        title: String(title || "").trim(),
        category,
        isRequired: section?.required !== false,
      }))
      .filter((task) => task.title);
  });
}

async function createTasksFromTemplate(tx, { organizationId, onboardingId, sections }) {
  const definitions = taskDefinitions(sections);
  if (!definitions.length) return 0;
  const result = await tx.employeeOnboardingTask.createMany({
    data: definitions.map((task) => ({ ...task, organizationId, onboardingId, status: "NOT_STARTED" })),
    skipDuplicates: true,
  });
  return result.count;
}

function isTaskOverdue(task, now = new Date()) {
  return Boolean(
    task?.dueDate &&
    !["COMPLETED", "NOT_APPLICABLE"].includes(task.status) &&
    new Date(task.dueDate).getTime() < now.getTime()
  );
}

function taskHasExplicitManagement(task) {
  /*
   * updatedAt alone is not evidence of an HR decision. Rows can be touched by
   * migrations, reconciliation, retries, or harmless persistence operations.
   * Treat a task as explicitly managed only when it carries meaningful
   * operational state or metadata. This keeps completed onboarding sections
   * authoritative for otherwise-pristine matching checklist rows.
   */
  return Boolean(
    task?.status !== "NOT_STARTED" ||
    task?.ownerUserId ||
    task?.dueDate ||
    task?.notes ||
    task?.completedAt ||
    task?.completedByUserId
  );
}

function taskSectionKey(task) {
  return String(task?.itemKey || "").split(":")[0] || null;
}

function projectTaskFromSectionProgress(task, sectionProgress, onboardingCompleted = false) {
  const sectionKey = taskSectionKey(task);
  const sectionCompleted = Boolean(
    sectionKey && sectionProgress?.[sectionKey]?.completed === true
  );

  if (!sectionCompleted || taskHasExplicitManagement(task)) {
    if (
      onboardingCompleted &&
      task?.isRequired === false &&
      !taskHasExplicitManagement(task)
    ) {
      return {
        ...task,
        status: "NOT_APPLICABLE",
        completionSource: "OPTIONAL_SECTION_INFERRED",
        isInferredCompletion: true,
      };
    }
    return { ...task, completionSource: "TASK", isInferredCompletion: false };
  }

  return {
    ...task,
    status: "COMPLETED",
    completionSource: "SECTION_INFERRED",
    isInferredCompletion: true,
  };
}

function serializeTask(task, now = new Date(), sectionProgress = null, onboardingCompleted = false) {
  const projected = projectTaskFromSectionProgress(task, sectionProgress, onboardingCompleted);
  return { ...projected, isOverdue: isTaskOverdue(projected, now) };
}

async function listOnboardingTasks(prisma, { organizationId, onboardingId }) {
  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, organizationId },
    select: { id: true, sectionProgress: true, status: true, completionPercent: true },
  });
  if (!onboarding) {
    const error = new Error("Employee onboarding record not found.");
    error.code = "ONBOARDING_NOT_FOUND";
    throw error;
  }
  const tasks = await prisma.employeeOnboardingTask.findMany({
    where: { organizationId, onboardingId },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      completedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  const completed = onboarding.status === "COMPLETED" || Number(onboarding.completionPercent || 0) >= 100;
  return tasks.map((task) => serializeTask(task, new Date(), onboarding.sectionProgress, completed));
}

async function updateOnboardingTask(prisma, {
  organizationId, onboardingId, taskId, actorUserId, input,
}) {
  const status = String(input?.status || "").trim().toUpperCase();
  if (!TASK_STATUSES.has(status)) {
    const error = new Error("Select a valid onboarding task status.");
    error.code = "INVALID_TASK_STATUS";
    throw error;
  }
  const notes = input?.notes == null ? null : String(input.notes).trim() || null;
  if (status === "NOT_APPLICABLE" && !notes) {
    const error = new Error("A reason is required when marking a task Not Applicable.");
    error.code = "NOT_APPLICABLE_REASON_REQUIRED";
    throw error;
  }
  const ownerUserId = input?.ownerUserId ? String(input.ownerUserId) : null;
  const dueDate = input?.dueDate ? new Date(`${input.dueDate}T23:59:59.999Z`) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    const error = new Error("Enter a valid task due date.");
    error.code = "INVALID_DUE_DATE";
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.employeeOnboardingTask.findFirst({
      where: { id: taskId, onboardingId, organizationId },
    });
    if (!task) {
      const error = new Error("Onboarding checklist task not found.");
      error.code = "TASK_NOT_FOUND";
      throw error;
    }
    if (ownerUserId) {
      const owner = await tx.user.findFirst({
        where: { id: ownerUserId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!owner) {
        const error = new Error("Select an active task owner from this organization.");
        error.code = "INVALID_TASK_OWNER";
        throw error;
      }
    }
    const completed = status === "COMPLETED";
    const updated = await tx.employeeOnboardingTask.update({
      where: { id: task.id },
      data: {
        status,
        ownerUserId,
        dueDate,
        notes,
        completedAt: completed ? new Date() : null,
        completedByUserId: completed ? actorUserId || null : null,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return serializeTask(updated);
  });
}

module.exports = {
  TASK_STATUSES,
  taskDefinitions,
  createTasksFromTemplate,
  isTaskOverdue,
  taskHasExplicitManagement,
  projectTaskFromSectionProgress,
  serializeTask,
  listOnboardingTasks,
  updateOnboardingTask,
};
