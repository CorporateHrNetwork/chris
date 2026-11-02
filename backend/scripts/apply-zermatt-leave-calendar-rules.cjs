require("dotenv").config();

const prisma = require("../src/config/prisma");
const {
  ZERMATT_SLUG,
  POLICY_DEFINITIONS,
  ZERMATT_LEAVE_CALENDAR_RULES,
} = require("../src/services/zermattLeaveEntitlementService");

const APPLY = process.argv.includes("--apply");
const POLICY_CODES = [...new Set(POLICY_DEFINITIONS.map((item) => item.policyCode))];

async function resolveActor(organizationId) {
  const email = String(process.env.ZERMATT_LEAVE_RULES_ACTOR_EMAIL || "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("ZERMATT_LEAVE_RULES_ACTOR_EMAIL_REQUIRED");

  const actor = await prisma.user.findFirst({
    where: { organizationId, email, isActive: true },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("ZERMATT_LEAVE_RULES_ACTOR_NOT_FOUND");
  return actor;
}

function assertPolicyCoverage(policies) {
  const found = new Set(policies.map((policy) => policy.code));
  const missing = POLICY_CODES.filter((code) => !found.has(code));
  if (missing.length) {
    throw new Error(`ZERMATT_ACTIVE_LEAVE_POLICIES_MISSING:${missing.join(",")}`);
  }
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const policies = await prisma.leavePolicy.findMany({
    where: {
      organizationId: organization.id,
      code: { in: POLICY_CODES },
      status: "ACTIVE",
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      versionNumber: true,
      calendarRules: true,
    },
    orderBy: [{ code: "asc" }, { versionNumber: "desc" }],
  });
  assertPolicyCoverage(policies);

  console.log("\nZERMATT LEAVE CALENDAR RULES");
  console.log(`Organization: ${organization.name}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW ONLY"}`);
  console.log("Target: active ZERMATT leave policies only");
  console.table(policies.map((policy) => ({
    code: policy.code,
    version: policy.versionNumber,
    currentCountWeekends: policy.calendarRules?.countWeekends ?? false,
    currentCountPublicHolidays: policy.calendarRules?.countPublicHolidays ?? false,
    targetCountWeekends: ZERMATT_LEAVE_CALENDAR_RULES.countWeekends,
    targetCountPublicHolidays: ZERMATT_LEAVE_CALENDAR_RULES.countPublicHolidays,
  })));

  if (!APPLY) {
    console.log("Database Writes Issued: 0");
    console.log("Review the target policies, then rerun with --apply and ZERMATT_LEAVE_RULES_ACTOR_EMAIL.");
    return;
  }

  const actor = await resolveActor(organization.id);
  await prisma.$transaction(async (tx) => {
    const current = await tx.leavePolicy.findMany({
      where: {
        organizationId: organization.id,
        code: { in: POLICY_CODES },
        status: "ACTIVE",
        isActive: true,
      },
      select: { id: true, code: true, calendarRules: true },
    });
    assertPolicyCoverage(current);

    for (const policy of current) {
      const previousRules = policy.calendarRules || {};
      const nextRules = {
        ...previousRules,
        ...ZERMATT_LEAVE_CALENDAR_RULES,
      };
      await tx.leavePolicy.update({
        where: { id: policy.id },
        data: { calendarRules: nextRules },
      });
      await tx.leavePolicyAudit.create({
        data: {
          organizationId: organization.id,
          leavePolicyId: policy.id,
          actorUserId: actor.id,
          action: "CHANGED",
          previousValue: { calendarRules: previousRules },
          newValue: { calendarRules: nextRules },
          reason: "ZERMATT policy correction: count weekends and rostered off-days; exclude public holidays.",
        },
      });
      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          entityType: "LEAVE_POLICY",
          entityId: policy.id,
          action: "ZERMATT_LEAVE_CALENDAR_RULES_UPDATED",
          previousValue: {
            policyCode: policy.code,
            calendarRules: previousRules,
          },
          newValue: {
            policyCode: policy.code,
            calendarRules: nextRules,
          },
          reason: "Apply ZERMATT rule: count weekends and rostered off-days; exclude public holidays.",
        },
      });
    }
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });

  const verified = await prisma.leavePolicy.findMany({
    where: {
      organizationId: organization.id,
      code: { in: POLICY_CODES },
      status: "ACTIVE",
      isActive: true,
    },
    select: { code: true, calendarRules: true },
    orderBy: { code: "asc" },
  });
  assertPolicyCoverage(verified);
  for (const policy of verified) {
    if (
      policy.calendarRules?.countWeekends !== true ||
      policy.calendarRules?.countPublicHolidays !== false
    ) {
      throw new Error(`ZERMATT_LEAVE_CALENDAR_RULES_VERIFICATION_FAILED:${policy.code}`);
    }
  }

  console.log("\nPASS: All active ZERMATT leave policies now count off-days and exclude public holidays.");
}

main()
  .catch((error) => {
    console.error("\nZERMATT leave calendar rule update failed safely.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
