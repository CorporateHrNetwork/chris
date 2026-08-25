process.env.DOTENV_CONFIG_QUIET = "true";
require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");
const { buildBaselineReconciliationDryRun } = require("../src/services/baselineLeaveEntitlementReconciliationService");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function transactionSafetyEnvelope(report) {
  return {
    mode: "DRY_RUN_PREFLIGHT",
    organizationId: report.organizationId,
    leaveYear: report.leaveYear,
    actorUserId: report.actorUserId,
    confirmationToken: report.confirmationToken,
    actionCounts: report.actionCounts,
    assertions: report.assertions,
    fingerprints: report.fingerprints,
    rows: report.rows,
    readyForApply: report.readyForApply,
    baselinePolicies: report.baselinePolicies,
    summary: report.summary,
    blockers: report.blockers,
  };
}

async function main() {
  if (process.argv.includes("--apply")) throw new Error("APPLY_IS_NOT_AVAILABLE_FROM_THE_DRY_RUN_COMMAND");
  const organizationId = argument("--organization-id");
  const leaveYear = Number(argument("--leave-year"));
  const actorUserId = argument("--actor-user-id");
  const report = await buildBaselineReconciliationDryRun({ organizationId, leaveYear, actorUserId });
  const envelope = transactionSafetyEnvelope(report);
  if (envelope.mode !== "DRY_RUN_PREFLIGHT" || !envelope.organizationId || !envelope.leaveYear ||
    !envelope.actorUserId || !("confirmationToken" in envelope) || !envelope.actionCounts ||
    !envelope.assertions || !envelope.fingerprints || !Array.isArray(envelope.rows)) {
    throw new Error("DRY_RUN_SAFETY_ENVELOPE_INCOMPLETE");
  }
  const requiredAssertions = {
    policyConflicts: 0,
    entitlementDeficits: 0,
    employeeExceptions: 0,
    usedValuesUnchanged: true,
    pendingValuesUnchanged: true,
    employeeStatusesUnchanged: true,
    leaveRequestsUnchanged: true,
    optionalPoliciesUnchanged: true,
  };
  for (const [name, expected] of Object.entries(requiredAssertions)) {
    if (envelope.assertions[name] !== expected) throw new Error(`DRY_RUN_ASSERTION_FAILED: ${name}`);
  }
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
}

module.exports = { transactionSafetyEnvelope };
