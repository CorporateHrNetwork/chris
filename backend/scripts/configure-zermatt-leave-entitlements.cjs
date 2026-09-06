require("dotenv").config();
const prisma = require("../src/config/prisma");
const { provisionAllCurrentFullTimeEmployees } = require("../src/services/zermattLeaveEntitlementService");

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      isActive: true,
      userRoles: { some: { role: { name: { in: ["Super User", "SuperUser", "Super Admin", "SuperAdmin", "Organization Super User"] } } } },
    },
    select: { id: true, email: true },
  });

  // Intentionally do not wrap the whole tenant-wide provisioning run in one
  // Prisma interactive transaction. The operation is idempotent and may touch
  // hundreds of employees; a single 5-second transaction can expire before the
  // matrix and employee allocations finish. Validation occurs before employee
  // balances are changed, and reruns safely reuse the configured policy/rules.
  const result = await provisionAllCurrentFullTimeEmployees({
    organizationId: organization.id,
    actorUserId: actor?.id || null,
    leaveYear: 2026,
    tx: prisma,
  });

  console.log(JSON.stringify({
    organization: organization.name,
    leaveYear: result.leaveYear,
    currentEmployees: result.currentEmployees,
    fullTimeEmployeesProvisioned: result.fullTimeEmployees,
    employeeProfilesUpdated: result.results.length,
    controls: {
      annual: "L11=30; L9-L10=28; L5-L8=21; L1-L4=14",
      sick: 12,
      unpaidCasual: 5,
      compassionate: 6,
      maternity: "90, FEMALE + Full-Time only",
      excludedEmploymentTypes: "All non-Full-Time employment types",
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error?.details) console.error("Details:", JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
