require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  /*
  ============================================================
  CHRIS RBAC DEVELOPMENT TEST USER
  ============================================================

  This account exists only to verify that permission
  enforcement is working correctly.

  It must NOT be used as a production account.
  */

  const organization =
    await prisma.organization.findUnique({
      where: {
        slug: "corporatehr-network",
      },
    });

  if (!organization) {
    throw new Error(
      "CorporateHr Network organization not found."
    );
  }

  const employeeRole =
    await prisma.role.findUnique({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name: "Employee",
        },
      },
    });

  if (!employeeRole) {
    throw new Error(
      "Employee role not found. Run the CHRIS seed first."
    );
  }

  /*
  DEVELOPMENT TEST CREDENTIALS
  */

  const email =
    "rbac.employee@chris.local";

  const password =
    "ChrisEmployeeTest123!";

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );

  /*
  Create or refresh the development test user.
  */

  const user =
    await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId:
            organization.id,

          email,
        },
      },

      update: {
        passwordHash,

        firstName:
          "RBAC",

        lastName:
          "Employee Test",

        isActive: true,
      },

      create: {
        organizationId:
          organization.id,

        email,

        passwordHash,

        firstName:
          "RBAC",

        lastName:
          "Employee Test",

        isActive: true,
      },
    });

  /*
  Ensure the test account has ONLY the Employee role.

  This prevents an older test assignment from accidentally
  giving the account additional privileges.
  */

  await prisma.userRole.deleteMany({
    where: {
      userId: user.id,

      roleId: {
        not: employeeRole.id,
      },
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId:
          user.id,

        roleId:
          employeeRole.id,
      },
    },

    update: {},

    create: {
      userId:
        user.id,

      roleId:
        employeeRole.id,
    },
  });

  /*
  Read the final permission set so we can verify
  exactly what this role carries.
  */

  const verifiedUser =
    await prisma.user.findUnique({
      where: {
        id: user.id,
      },

      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  const permissions =
    Array.from(
      new Set(
        verifiedUser.userRoles.flatMap(
          (userRole) =>
            userRole.role.rolePermissions.map(
              (rolePermission) =>
                rolePermission.permission.key
            )
        )
      )
    ).sort();

  console.log("");
  console.log(
    "CHRIS RBAC test user created successfully."
  );

  console.log(
    "Organization: corporatehr-network"
  );

  console.log(
    `Email: ${email}`
  );

  console.log(
    `Temporary password: ${password}`
  );

  console.log(
    "Role: Employee"
  );

  console.log(
    `Permissions: ${permissions.length}`
  );

  console.log("");

  console.log(
    "Assigned permissions:"
  );

  for (const permission of permissions) {
    console.log(
      `- ${permission}`
    );
  }

  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "RBAC test user creation failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });