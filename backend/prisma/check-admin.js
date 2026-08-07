require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const organization =
    await prisma.organization.findUnique({
      where: {
        slug: "corporatehr-network",
      },
    });

  console.log(
    "ORG:",
    organization?.id,
    organization?.status
  );

  if (!organization) {
    console.log(
      "CorporateHr Network organization not found."
    );
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      email: "corporatehr.crn@gmail.com",
    },
  });

  console.log(
    "USER:",
    user?.id,
    user?.email,
    user?.isActive
  );
}

main()
  .catch((error) => {
    console.error(
      "Check failed:",
      error
    );
  })
  .finally(async () => {
    await prisma.$disconnect();
  });