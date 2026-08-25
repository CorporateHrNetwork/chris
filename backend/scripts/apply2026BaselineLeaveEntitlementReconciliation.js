process.env.DOTENV_CONFIG_QUIET = "true";
require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");
const { applyBaselineReconciliation } = require("../src/services/baselineLeaveEntitlementReconciliationService");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("EXPLICIT_APPLY_FLAG_REQUIRED");
  const report = await applyBaselineReconciliation({
    organizationId: argument("--organization-id"),
    leaveYear: Number(argument("--leave-year")),
    actorUserId: argument("--actor-user-id"),
    confirmationToken: argument("--confirmation-token"),
    reason: argument("--reason"),
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
