const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PERMISSIONS = [
  {
    key: "support.internal.view",
    name: "View Internal Support Desk",
    description: "View the Corporate Resources Network cross-client CHRiS Support Desk.",
  },
  {
    key: "support.internal.manage",
    name: "Manage Internal Support Desk",
    description: "Manage cross-client CHRiS Support Desk cases and client-visible communications.",
  },
  {
    key: "support.engineering.escalate",
    name: "Escalate Support Cases to Engineering",
    description: "Escalate validated CHRiS Support Desk cases to engineering/GitHub.",
  },
];

const ROLES = [
  {
    name: "CHRiS Support Administrator",
    description: "Platform-level Support Desk administrator for Corporate Resources Network.",
    permissions: PERMISSIONS.map((item) => item.key),
  },
  {
    name: "CHRiS Support Agent",
    description: "Platform-level Support Desk agent for client support and case handling.",
    permissions: ["support.internal.view", "support.internal.manage"],
  },
  {
    name: "CHRiS Support Engineer",
    description: "Platform-level engineer access for Support Desk triage and engineering escalation.",
    permissions: ["support.internal.view", "support.engineering.escalate"],
  },
];

async function main() {
  const permissionByKey = new Map();

  for (const definition of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key: definition.key },
      update: {
        name: definition.name,
        description: definition.description,
      },
      create: definition,
    });
    permissionByKey.set(permission.key, permission);
  }

  const roleByName = new Map();
  for (const definition of ROLES) {
    let role = await prisma.role.findFirst({
      where: { organizationId: null, name: definition.name },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          organizationId: null,
          name: definition.name,
          description: definition.description,
          isSystemRole: true,
        },
      });
    } else {
      role = await prisma.role.update({
        where: { id: role.id },
        data: {
          description: definition.description,
          isSystemRole: true,
        },
      });
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: definition.permissions.map((key) => ({
        roleId: role.id,
        permissionId: permissionByKey.get(key).id,
      })),
      skipDuplicates: true,
    });
    roleByName.set(role.name, role);
  }

  const adminEmail = String(process.env.SUPPORT_ADMIN_EMAIL || "").trim().toLowerCase();
  const adminOrganizationSlug = String(process.env.SUPPORT_ADMIN_ORGANIZATION_SLUG || "").trim();

  if (adminEmail || adminOrganizationSlug) {
    if (!adminEmail || !adminOrganizationSlug) {
      throw new Error("SUPPORT_ADMIN_EMAIL and SUPPORT_ADMIN_ORGANIZATION_SLUG must be provided together.");
    }

    const organization = await prisma.organization.findUnique({
      where: { slug: adminOrganizationSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) throw new Error(`Organization not found: ${adminOrganizationSlug}`);

    const user = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email: { equals: adminEmail, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, email: true },
    });
    if (!user) throw new Error(`Active CHRiS user not found for ${adminEmail} in ${organization.slug}`);

    const supportAdminRole = roleByName.get("CHRiS Support Administrator");
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: supportAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: supportAdminRole.id,
      },
    });

    console.log(`Assigned CHRiS Support Administrator to ${user.email} (${organization.name}).`);
  } else {
    console.log("Platform Support Desk roles created. No administrator assigned because SUPPORT_ADMIN_EMAIL/SLUG were not provided.");
  }

  console.log("CHRiS Support Desk platform RBAC bootstrap complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
