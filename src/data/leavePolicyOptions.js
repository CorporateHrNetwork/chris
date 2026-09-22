export const fallbackPolicyNameOptions = {
  ANNUAL: ["Standard Annual Leave", "Executive Annual Leave", "Custom Policy"],
  SICK: ["Standard Sick Leave", "Extended Sick Leave", "Custom Policy"],
  UNPAID: ["Standard Unpaid Leave", "Extended Unpaid Leave", "Custom Policy"],
  MATERNITY: ["Maternity Leave", "Enhanced Maternity Leave", "Custom Policy"],
  PATERNITY: ["Paternity / Partner Leave", "Enhanced Partner Leave", "Custom Policy"],
  DEFAULT: ["Standard Policy", "Custom Policy"],
};

export const fallbackRecommendedDefaults = {
  ANNUAL: { value: 20, unit: "WORKING_DAYS", legalMinimum: false },
  SICK: { value: 12, unit: "WORKING_DAYS", legalMinimum: false },
  UNPAID: { value: 5, unit: "WORKING_DAYS", legalMinimum: false },
};

export function leaveTypeKey(type) {
  return String(type?.code || type?.name || "DEFAULT").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function readablePolicyCode(type, name) {
  return `${leaveTypeKey(type)}_${String(name || "POLICY").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
