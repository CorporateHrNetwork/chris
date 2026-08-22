export const EMPLOYEE_STATUS_META = Object.freeze({
  ACTIVE: { label: "Active", tone: "green", color: "#4FD79A", background: "rgba(16,120,72,.22)", border: "rgba(79,215,154,.46)" },
  PROBATION: { label: "Probation", tone: "amber", color: "#E7C85B", background: "rgba(176,132,24,.20)", border: "rgba(231,200,91,.46)" },
  LEAVE: { label: "On Leave", tone: "blue", color: "#79B8F3", background: "rgba(37,99,180,.22)", border: "rgba(121,184,243,.46)" },
  SUSPENDED: { label: "Suspended", tone: "orange", color: "#F0A35E", background: "rgba(180,83,9,.22)", border: "rgba(240,163,94,.46)" },
  TERMINATED: { label: "Terminated", tone: "red", color: "#F08A8A", background: "rgba(153,27,27,.24)", border: "rgba(240,138,138,.46)" },
  RESIGNED: { label: "Resigned", tone: "red", color: "#F08A8A", background: "rgba(153,27,27,.24)", border: "rgba(240,138,138,.46)" },
  RETIRED: { label: "Retired", tone: "red", color: "#F08A8A", background: "rgba(153,27,27,.24)", border: "rgba(240,138,138,.46)" },
  INACTIVE: { label: "Inactive", tone: "red", color: "#F08A8A", background: "rgba(153,27,27,.24)", border: "rgba(240,138,138,.46)" },
});

export const UNKNOWN_EMPLOYEE_STATUS_META = Object.freeze({ label: "Unspecified", tone: "neutral", color: "#B7C4BD", background: "rgba(148,163,184,.14)", border: "rgba(183,196,189,.32)" });

export function normalizeEmployeeStatus(status) {
  return String(status || "").trim().toUpperCase();
}

export function getEmployeeStatusMeta(status) {
  const key = normalizeEmployeeStatus(status);
  const fallbackLabel = key ? key.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : UNKNOWN_EMPLOYEE_STATUS_META.label;
  return { key, ...UNKNOWN_EMPLOYEE_STATUS_META, ...(EMPLOYEE_STATUS_META[key] || {}), label: EMPLOYEE_STATUS_META[key]?.label || fallbackLabel };
}

export const formatEmployeeStatus = (status) => getEmployeeStatusMeta(status).label;
