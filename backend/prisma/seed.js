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
  const organization = await prisma.organization.upsert({
    where: {
      slug: "corporatehr-network",
    },
    update: {},
    create: {
      name: "CorporateHr Network",
      slug: "corporatehr-network",
      legalName: "Corporate Resources Network",
      country: "Nigeria",
      timezone: "Africa/Lagos",
      currency: "NGN",
      status: "ACTIVE",
    },
  });

  const financeDepartment = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Finance",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Finance",
      code: "FIN",
    },
  });

  const hrDepartment = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Human Resources",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Human Resources",
      code: "HR",
    },
  });

  const operationsDepartment = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Operations",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Operations",
      code: "OPS",
    },
  });

  const payrollDepartment = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Payroll",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Payroll",
      code: "PAY",
    },
  });

  const financeManager = await prisma.designation.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Finance Manager",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Finance Manager",
      code: "FIN-MGR",
    },
  });

  const hrOfficer = await prisma.designation.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "HR Officer",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "HR Officer",
      code: "HR-OFF",
    },
  });

  const supervisor = await prisma.designation.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Supervisor",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Supervisor",
      code: "OPS-SUP",
    },
  });

  const payrollOfficer = await prisma.designation.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Payroll Officer",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Payroll Officer",
      code: "PAY-OFF",
    },
  });

  const employees = [
    {
      employeeNumber: "CHR000001",
      firstName: "John",
      lastName: "Musa",
      email: "john@corporatehr.ng",
      phone: "08031234567",
      status: "ACTIVE",
      departmentId: financeDepartment.id,
      designationId: financeManager.id,
    },
    {
      employeeNumber: "CHR000002",
      firstName: "Grace",
      lastName: "James",
      email: "grace@corporatehr.ng",
      phone: "08041234567",
      status: "ACTIVE",
      departmentId: hrDepartment.id,
      designationId: hrOfficer.id,
    },
    {
      employeeNumber: "CHR000003",
      firstName: "Samuel",
      lastName: "Bello",
      email: "samuel@corporatehr.ng",
      phone: "08051234567",
      status: "LEAVE",
      departmentId: operationsDepartment.id,
      designationId: supervisor.id,
    },
    {
      employeeNumber: "CHR000004",
      firstName: "Ruth",
      lastName: "Okafor",
      email: "ruth@corporatehr.ng",
      phone: "08061234567",
      status: "PROBATION",
      departmentId: payrollDepartment.id,
      designationId: payrollOfficer.id,
    },
  ];

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: {
        organizationId_employeeNumber: {
          organizationId: organization.id,
          employeeNumber: employee.employeeNumber,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        ...employee,
      },
    });
  }

  console.log("CHRIS development seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });