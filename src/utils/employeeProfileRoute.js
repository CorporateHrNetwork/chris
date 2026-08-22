const EMPLOYEE_PROFILE_ACTIONS = new Set([
  "promotion",
  "transfer",
  "suspend",
  "deactivate",
  "reactivate",
]);

export function buildEmployeeProfileTarget(employeeNumber, action) {
  const path = `/employees/${encodeURIComponent(employeeNumber)}`;

  return EMPLOYEE_PROFILE_ACTIONS.has(action)
    ? `${path}?action=${encodeURIComponent(action)}`
    : path;
}

export function isEmployeeProfileActionActive(searchParams, action) {
  return getEmployeeProfileAction(searchParams) === action;
}

export function getEmployeeProfileAction(searchParams) {
  const action = searchParams?.get("action");
  return EMPLOYEE_PROFILE_ACTIONS.has(action) ? action : null;
}
