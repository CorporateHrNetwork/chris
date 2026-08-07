const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

require("dotenv").config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const organization = await prisma.organization.findUnique({
    where: {
      slug: "corporatehr-network",
    },
  });

  if (!organization) {
    throw new Error(
      "CorporateHr Network organization not found."
    );
  }

  const email = "corporatehr.crn@gmail.com";

  /*
    Temporary CHRIS administrator password.
    This is NOT your Gmail password.
    We will replace this with a proper password-change workflow.
  */
  const password = "ChangeMe123!";

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const adminRole = await prisma.role.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Administrator",
      },
    },
    update: {
      description:
        "Full administrative access to CHRIS.",
      isSystemRole: true,
    },
    create: {
      organizationId: organization.id,
      name: "Administrator",
      description:
        "Full administrative access to CHRIS.",
      isSystemRole: true,
    },
  });

  const user = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email,
      },
    },
    update: {
      passwordHash,
      firstName: "CHRIS",
      lastName: "Administrator",
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      email,
      passwordHash,
      firstName: "CHRIS",
      lastName: "Administrator",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: adminRole.id,
    },
  });

  console.log(
    "CHRIS administrator created successfully."
  );

  console.log(
    "Organization: corporatehr-network"
  );

  console.log(
    "Email: corporatehr.crn@gmail.com"
  );

  console.log(
    "Temporary password: ChangeMe123!"
  );
}

main()
  .catch((error) => {
    console.error(
      "Administrator creation failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });