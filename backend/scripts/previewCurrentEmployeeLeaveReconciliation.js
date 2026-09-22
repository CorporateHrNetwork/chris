require("dotenv").config();

const prisma = require("../src/config/prisma");
const {
  buildProvisioningPreview,
} = require("../src/services/leaveEntitlementProvisioningService");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function baselineKey(row) {
  const value = `${row.leaveType?.code || ""} ${row.leaveType?.name || ""}`.toUpperCase();
  if (value.includes("ANNUAL")) return "annual";
  if (value.includes("SICK")) return "sick";
  if (value.includes("UNPAID")) return "unpaid";
  return "additional";
}

function display(bucket) {
  if (!bucket?.length) return "—";
  return bucket.map((item) =>
    `${item.policyName} v${item.policyVersion}: ${item.entitlement ?? "not configured"} / ${item.used} / ${item.pending} / ${item.available ?? "not available"}`
  ).join(" | ");
}

async function main() {
  const organizationId = argument("--organization-id") || process.env.CHRIS_ORGANIZATION_ID;
  const leaveYear = Number(argument("--leave-year") || new Date().getFullYear());
  if (!organizationId) {
    throw new Error("Provide --organization-id <tenant-id> or CHRIS_ORGANIZATION_ID. Preview never selects a tenant implicitly.");
  }

  const preview = await buildProvisioningPreview({
    organizationId,
    leaveYear,
    baselineOnly: false,
    rebaseExisting: true,
  });

  const employees = new Map();
  for (const row of preview.rows) {
    const current = employees.get(row.employeeNumber) || {
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      designation: row.designation?.name || "—",
      resolvedCareerLevel: row.employmentLevel?.name || row.employmentLevel?.levelNumber || "EXCEPTION",
      annual: [],
      sick: [],
      unpaid: [],
      additional: [],
      exceptions: new Set(),
    };
    const item = {
      leaveTypeId: row.leaveTypeId || null,
      leaveType: row.leaveType?.name || null,
      policyId: row.policyId || null,
      policyCode: row.policyCode || null,
      policyName: row.policyName || null,
      policyVersion: row.policyVersion || null,
      versionGroupId: row.versionGroupId || null,
      entitlement: row.proposedOpeningBalance == null ? null : Number(row.proposedOpeningBalance),
      used: Number(row.retainedUsed || 0),
      pending: Number(row.retainedPending || 0),
      available: row.retainedAvailable == null ? null : Number(row.retainedAvailable),
      status: row.status,
      matrixSource: row.matrixSource || null,
    };
    current[baselineKey(row)].push(item);
    for (const code of row.exceptionCodes || []) current.exceptions.add(code);
    if (!["READY", "REBASE_READY", "EXISTS", "NOT_CONFIGURED_FOR_EMPLOYEE_LEVEL"].includes(row.status)) current.exceptions.add(row.status);
    employees.set(row.employeeNumber, current);
  }

  const detail = [...employees.values()].map((row) => ({
    ...row,
    exceptions: [...row.exceptions],
  }));
  const table = detail.map((row) => ({
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    designation: row.designation,
    resolvedCareerLevel: row.resolvedCareerLevel,
    "Annual entitlement / used / pending / available": display(row.annual),
    "Sick entitlement / used / pending / available": display(row.sick),
    "Unpaid entitlement / used / pending / available": display(row.unpaid),
    additionalPolicies: display(row.additional),
    exceptions: row.exceptions.length ? row.exceptions.join(" | ") : "None",
  }));

  console.table(table);
  console.log(JSON.stringify({ leaveYear, summary: preview.summary, employees: detail }, null, 2));
  console.log("PREVIEW ONLY: no entitlement reconciliation was applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
