export async function runFullOnboarding({
  apiRequest,
  employee,
  onboardingRecord,
  employeePayload,
  templateId,
  sectionPayloads,
  documents,
  completedSectionKeys,
  uploadedDocumentIds,
  taskUpdates = [],
  completedTaskKeys = new Set(),
  onEmployeeCreated,
  onOnboardingStarted,
  onOnboardingUpdated,
}) {
  let currentEmployee = employee || null;
  let currentRecord = onboardingRecord || null;
  let phase = currentEmployee ? "ONBOARDING_START" : "EMPLOYEE_CREATE";

  try {
    if (!currentEmployee) {
      const result = await apiRequest("/api/employees", {
        method: "POST",
        body: employeePayload,
      });
      currentEmployee = result.data;
      onEmployeeCreated(currentEmployee);
    }

    if (!currentRecord) {
      phase = "ONBOARDING_START";
      const result = await apiRequest(
        `/api/employees/onboarding/${encodeURIComponent(currentEmployee.employeeNumber)}`,
        { method: "POST", body: { templateId } }
      );
      currentRecord = result.data;
      onOnboardingStarted(currentRecord);
    }

    const tasks = Array.isArray(currentRecord.tasks) ? currentRecord.tasks : [];
    for (const update of taskUpdates) {
      if (completedTaskKeys.has(update.itemKey)) continue;
      const task = tasks.find((item) => item.itemKey === update.itemKey);
      if (!task) continue;
      phase = `TASK:${update.itemKey}`;
      await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(currentRecord.id)}/tasks/${encodeURIComponent(task.id)}`,
        { method: "PATCH", body: update.data }
      );
      completedTaskKeys.add(update.itemKey);
    }

    for (const { key, data } of sectionPayloads) {
      if (completedSectionKeys.has(key) ||
          !currentRecord?.template?.sections?.some((section) => section.key === key)) continue;
      phase = `SECTION:${key}`;
      const result = await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(currentRecord.id)}/sections/${encodeURIComponent(key)}`,
        { method: "PATCH", body: { data } }
      );
      currentRecord = result.data || currentRecord;
      completedSectionKeys.add(key);
      onOnboardingUpdated(currentRecord);
    }

    for (const document of documents) {
      if (uploadedDocumentIds.has(document.id)) continue;
      phase = `DOCUMENT:${document.id}`;
      const body = new FormData();
      body.append("document", document.file);
      body.append("category", document.category);
      body.append("notes", document.notes);
      await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(currentRecord.id)}/documents`,
        { method: "POST", body }
      );
      uploadedDocumentIds.add(document.id);
    }

    return { employee: currentEmployee, onboardingRecord: currentRecord };
  } catch (error) {
    error.onboardingRecovery = {
      employee: currentEmployee,
      onboardingRecord: currentRecord,
      phase,
    };
    throw error;
  }
}
