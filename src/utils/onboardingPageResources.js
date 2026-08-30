function normalizeList(result) {
  return Array.isArray(result?.data) ? result.data : [];
}

async function loadResource(apiRequest, endpoint, onSuccess) {
  try {
    const result = await apiRequest(endpoint);
    const data = normalizeList(result);
    onSuccess(data);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Unable to load this onboarding resource.",
    };
  }
}

export function loadOnboardingPageResources({
  apiRequest,
  onEmployees,
  onTemplates,
  onRecords,
}) {
  return Promise.all([
    loadResource(apiRequest, "/api/employees", onEmployees),
    loadResource(
      apiRequest,
      "/api/employees/onboarding/templates",
      onTemplates
    ),
    loadResource(
      apiRequest,
      "/api/employees/onboarding/status",
      onRecords
    ),
  ]).then(([employees, templates, records]) => ({
    employees,
    templates,
    records,
  }));
}
