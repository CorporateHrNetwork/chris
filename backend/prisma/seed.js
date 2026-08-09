require("dotenv").config();

const {
  PrismaClient,
} = require("@prisma/client");

const {
  PrismaPg,
} = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL,
});

const prisma =
  new PrismaClient({
    adapter,
  });

async function main() {
  console.log("");
  console.log(
    "Starting CHRIS development seed..."
  );
  console.log("");

  /*
  ============================================================
  ORGANIZATION
  ============================================================
  */

  const organization =
    await prisma.organization.upsert({
      where: {
        slug:
          "corporatehr-network",
      },

      update: {
        name:
          "CorporateHr Network",

        legalName:
          "Corporate Resources Network",

        country:
          "Nigeria",

        timezone:
          "Africa/Lagos",

        currency:
          "NGN",
      },

      create: {
        name:
          "CorporateHr Network",

        slug:
          "corporatehr-network",

        legalName:
          "Corporate Resources Network",

        country:
          "Nigeria",

        timezone:
          "Africa/Lagos",

        currency:
          "NGN",

        status:
          "ACTIVE",
      },
    });

  /*
  ============================================================
  DEPARTMENTS
  ============================================================
  */

  const financeDepartment =
    await prisma.department.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Finance",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Finance",

        code:
          "FIN",
      },
    });

  const hrDepartment =
    await prisma.department.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Human Resources",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Human Resources",

        code:
          "HR",
      },
    });

  const operationsDepartment =
    await prisma.department.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Operations",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Operations",

        code:
          "OPS",
      },
    });

  const payrollDepartment =
    await prisma.department.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Payroll",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Payroll",

        code:
          "PAY",
      },
    });

  /*
  ============================================================
  DESIGNATIONS
  ============================================================
  */

  const financeManager =
    await prisma.designation.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Finance Manager",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Finance Manager",

        code:
          "FIN-MGR",
      },
    });

  const hrOfficer =
    await prisma.designation.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "HR Officer",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "HR Officer",

        code:
          "HR-OFF",
      },
    });

  const supervisor =
    await prisma.designation.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Supervisor",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Supervisor",

        code:
          "OPS-SUP",
      },
    });

  const payrollOfficer =
    await prisma.designation.upsert({
      where: {
        organizationId_name: {
          organizationId:
            organization.id,

          name:
            "Payroll Officer",
        },
      },

      update: {},

      create: {
        organizationId:
          organization.id,

        name:
          "Payroll Officer",

        code:
          "PAY-OFF",
      },
    });

  /*
  ============================================================
  DEVELOPMENT EMPLOYEES
  ============================================================
  */

  const employees = [
    {
      employeeNumber:
        "CHR000001",

      firstName:
        "John",

      lastName:
        "Musa",

      email:
        "john@corporatehr.ng",

      phone:
        "08031234567",

      status:
        "ACTIVE",

      departmentId:
        financeDepartment.id,

      designationId:
        financeManager.id,
    },

    {
      employeeNumber:
        "CHR000002",

      firstName:
        "Grace",

      lastName:
        "James",

      email:
        "grace@corporatehr.ng",

      phone:
        "08041234567",

      status:
        "ACTIVE",

      departmentId:
        hrDepartment.id,

      designationId:
        hrOfficer.id,
    },

    {
      employeeNumber:
        "CHR000003",

      firstName:
        "Samuel",

      lastName:
        "Bello",

      email:
        "samuel@corporatehr.ng",

      phone:
        "08051234567",

      status:
        "LEAVE",

      departmentId:
        operationsDepartment.id,

      designationId:
        supervisor.id,
    },

    {
      employeeNumber:
        "CHR000004",

      firstName:
        "Ruth",

      lastName:
        "Okafor",

      email:
        "ruth@corporatehr.ng",

      phone:
        "08061234567",

      status:
        "PROBATION",

      departmentId:
        payrollDepartment.id,

      designationId:
        payrollOfficer.id,
    },
  ];

  for (
    const employee of
    employees
  ) {
    await prisma.employee.upsert({
      where: {
        organizationId_employeeNumber:
          {
            organizationId:
              organization.id,

            employeeNumber:
              employee.employeeNumber,
          },
      },

      /*
      Development seed must not overwrite
      HR changes already made through CHRIS.
      */
      update: {},

      create: {
        organizationId:
          organization.id,

        ...employee,
      },
    });
  }

  /*
  ============================================================
  CHRIS PERMISSION CATALOGUE

  Permission convention:
      module.action

  The Permission catalogue is global.

  Upserting catalogue metadata is safe because it does not
  alter which roles currently possess the permission.
  ============================================================
  */

  const permissions = [
    /*
    ----------------------------------------------------------
    DASHBOARD
    ----------------------------------------------------------
    */
    {
      key:
        "dashboard.view",

      name:
        "View Dashboard",

      description:
        "View the CHRIS dashboard.",
    },

    /*
    ----------------------------------------------------------
    EMPLOYEES
    ----------------------------------------------------------
    */
    {
      key:
        "employees.view",

      name:
        "View Employees",

      description:
        "View employee records and profiles.",
    },

    {
      key:
        "employees.create",

      name:
        "Create Employees",

      description:
        "Create new employee records.",
    },

    {
      key:
        "employees.update",

      name:
        "Update Employees",

      description:
        "Update existing employee records.",
    },

    {
      key:
        "employees.delete",

      name:
        "Delete Employees",

      description:
        "Delete employee records.",
    },

    /*
    ----------------------------------------------------------
    RECRUITMENT
    ----------------------------------------------------------
    */
    {
      key:
        "recruitment.view",

      name:
        "View Recruitment",

      description:
        "View recruitment information.",
    },

    {
      key:
        "recruitment.manage",

      name:
        "Manage Recruitment",

      description:
        "Create and manage recruitment activities.",
    },

    /*
    ----------------------------------------------------------
    ATTENDANCE
    ----------------------------------------------------------
    */
    {
      key:
        "attendance.view",

      name:
        "View Attendance",

      description:
        "View attendance records.",
    },

    {
      key:
        "attendance.manage",

      name:
        "Manage Attendance",

      description:
        "Create and manage attendance records.",
    },

    /*
    ----------------------------------------------------------
    LEAVE
    ----------------------------------------------------------
    */
    {
      key:
        "leave.view",

      name:
        "View Leave",

      description:
        "View leave records.",
    },

    {
      key:
        "leave.request",

      name:
        "Request Leave",

      description:
        "Submit leave requests.",
    },

    {
      key:
        "leave.approve",

      name:
        "Approve Leave",

      description:
        "Approve or reject leave requests.",
    },

    {
      key:
        "leave.manage",

      name:
        "Manage Leave",

      description:
        "Administer leave records and settings.",
    },

    /*
    ----------------------------------------------------------
    PAYROLL
    ----------------------------------------------------------
    */
    {
      key:
        "payroll.view",

      name:
        "View Payroll",

      description:
        "View payroll information.",
    },

    {
      key:
        "payroll.process",

      name:
        "Process Payroll",

      description:
        "Prepare and execute payroll.",
    },

    {
      key:
        "payroll.manage",

      name:
        "Manage Payroll",

      description:
        "Manage payroll configuration and records.",
    },

    /*
    ----------------------------------------------------------
    PAYSLIPS

    Payslip permissions are intentionally separated from
    Payroll permissions.

    An Employee may view/download their own payslip without
    receiving access to organization-wide payroll data.
    ----------------------------------------------------------
    */
    {
      key:
        "payslips.view",

      name:
        "View Payslips",

      description:
        "View payslips available to the user.",
    },

    {
      key:
        "payslips.download",

      name:
        "Download Payslips",

      description:
        "Download available payslips.",
    },

    {
      key:
        "payslips.manage",

      name:
        "Manage Payslips",

      description:
        "Generate, publish and administer employee payslips.",
    },

    /*
    ----------------------------------------------------------
    LOANS
    ----------------------------------------------------------
    */
    {
      key:
        "loans.view",

      name:
        "View Loans",

      description:
        "View employee loan records.",
    },

    {
      key:
        "loans.request",

      name:
        "Request Loan",

      description:
        "Submit employee loan requests.",
    },

    {
      key:
        "loans.approve",

      name:
        "Approve Loans",

      description:
        "Approve or reject loan requests.",
    },

    {
      key:
        "loans.manage",

      name:
        "Manage Loans",

      description:
        "Administer employee loans.",
    },

    /*
    ----------------------------------------------------------
    PERFORMANCE
    ----------------------------------------------------------
    */
    {
      key:
        "performance.view",

      name:
        "View Performance",

      description:
        "View performance records.",
    },

    {
      key:
        "performance.manage",

      name:
        "Manage Performance",

      description:
        "Create and manage performance records.",
    },

    /*
    ----------------------------------------------------------
    TRAINING
    ----------------------------------------------------------
    */
    {
      key:
        "training.view",

      name:
        "View Training",

      description:
        "View training information.",
    },

    {
      key:
        "training.manage",

      name:
        "Manage Training",

      description:
        "Create and manage training activities.",
    },

    /*
    ----------------------------------------------------------
    REPORTS
    ----------------------------------------------------------
    */
    {
      key:
        "reports.view",

      name:
        "View Reports",

      description:
        "View CHRIS reports.",
    },

    {
      key:
        "reports.export",

      name:
        "Export Reports",

      description:
        "Export CHRIS reports and data.",
    },

    /*
    ----------------------------------------------------------
    USERS
    ----------------------------------------------------------
    */
    {
      key:
        "users.view",

      name:
        "View Users",

      description:
        "View CHRIS user accounts.",
    },

    {
      key:
        "users.manage",

      name:
        "Manage Users",

      description:
        "Create, update, activate and deactivate users.",
    },

    /*
    ----------------------------------------------------------
    ROLES
    ----------------------------------------------------------
    */
    {
      key:
        "roles.view",

      name:
        "View Roles",

      description:
        "View roles and permission assignments.",
    },

    {
      key:
        "roles.manage",

      name:
        "Manage Roles",

      description:
        "Create and manage roles and permissions.",
    },

    /*
    ----------------------------------------------------------
    SETTINGS
    ----------------------------------------------------------
    */
    {
      key:
        "settings.view",

      name:
        "View Settings",

      description:
        "View organization settings.",
    },

    {
      key:
        "settings.manage",

      name:
        "Manage Settings",

      description:
        "Manage organization and system settings.",
    },
  ];

  const permissionRecords = {};

  for (
    const permission of
    permissions
  ) {
    const record =
      await prisma.permission.upsert({
        where: {
          key:
            permission.key,
        },

        update: {
          name:
            permission.name,

          description:
            permission.description,
        },

        create:
          permission,
      });

    permissionRecords[
      permission.key
    ] = record;
  }

  /*
  ============================================================
  CHRIS SYSTEM ROLES
  ============================================================
  */

  const systemRoles = [
    {
      name:
        "Administrator",

      description:
        "Full administrative access to CHRIS.",
    },

    {
      name:
        "HR Manager",

      description:
        "Manages core HR operations, employees, recruitment, leave, performance and training.",
    },

    {
      name:
        "HR Officer",

      description:
        "Supports employee administration and day-to-day HR operations.",
    },

    {
      name:
        "Payroll Officer",

      description:
        "Manages payroll and payroll-related employee information.",
    },

    {
      name:
        "Line Manager",

      description:
        "Manages team attendance, leave and performance responsibilities.",
    },

    {
      name:
        "Employee",

      description:
        "Standard employee self-service access.",
    },
  ];

  const roleRecords = {};

  /*
  Track whether a role existed BEFORE this seed execution.

  Default permission templates must only initialize roles
  that do not yet have configured permissions.

  Once an Administrator configures permissions through CHRIS,
  the database becomes the authority.
  */
  const roleNeedsDefaults = {};

  for (
    const roleDefinition of
    systemRoles
  ) {
    const existingRole =
      await prisma.role.findFirst({
        where: {
          organizationId:
            organization.id,

          name:
            roleDefinition.name,
        },

        select: {
          id: true,

          _count: {
            select: {
              rolePermissions:
                true,
            },
          },
        },
      });

    const role =
      await prisma.role.upsert({
        where: {
          organizationId_name:
            {
              organizationId:
                organization.id,

              name:
                roleDefinition.name,
            },
        },

        update: {
          description:
            roleDefinition.description,

          isSystemRole:
            true,
        },

        create: {
          organizationId:
            organization.id,

          name:
            roleDefinition.name,

          description:
            roleDefinition.description,

          isSystemRole:
            true,
        },
      });

    roleRecords[
      roleDefinition.name
    ] = role;

    /*
    Only initialize default permissions when:

    1. this role is brand new, OR
    2. an existing role has never had any permission assigned.

    Existing configured roles are NEVER reset.
    */
    roleNeedsDefaults[
      roleDefinition.name
    ] =
      !existingRole ||
      existingRole._count
        .rolePermissions === 0;
  }

  /*
  ============================================================
  DEFAULT ROLE PERMISSION TEMPLATES

  IMPORTANT:

  These are INITIAL DEFAULTS only.

  They are NOT synchronization rules.

  After initial setup, Administrators manage role permissions
  through the CHRIS Roles & Permissions interface.

  Running this seed later must never remove or overwrite
  organization-specific permission configuration.
  ============================================================
  */

  const allPermissionKeys =
    permissions.map(
      (permission) =>
        permission.key
    );

  const defaultRolePermissions = {
    Administrator:
      allPermissionKeys,

    "HR Manager": [
      "dashboard.view",

      "employees.view",
      "employees.create",
      "employees.update",

      "recruitment.view",
      "recruitment.manage",

      "attendance.view",
      "attendance.manage",

      "leave.view",
      "leave.approve",
      "leave.manage",

      "performance.view",
      "performance.manage",

      "training.view",
      "training.manage",

      "reports.view",
      "reports.export",
    ],

    "HR Officer": [
      "dashboard.view",

      "employees.view",
      "employees.create",
      "employees.update",

      "recruitment.view",
      "recruitment.manage",

      "attendance.view",
      "attendance.manage",

      "leave.view",

      "performance.view",

      "training.view",

      "reports.view",
    ],

    "Payroll Officer": [
      "dashboard.view",

      "employees.view",

      "payroll.view",
      "payroll.process",
      "payroll.manage",

      "payslips.view",
      "payslips.download",
      "payslips.manage",

      "loans.view",
      "loans.manage",

      "reports.view",
      "reports.export",
    ],

    "Line Manager": [
      "dashboard.view",

      "employees.view",

      "attendance.view",

      "leave.view",
      "leave.request",
      "leave.approve",

      "performance.view",
      "performance.manage",

      "training.view",

      "reports.view",
    ],

    Employee: [
      "dashboard.view",

      "employees.view",

      "attendance.view",

      "leave.view",
      "leave.request",

      "payslips.view",
      "payslips.download",

      "loans.view",
      "loans.request",

      "performance.view",

      "training.view",
    ],
  };

  /*
  ============================================================
  NON-DESTRUCTIVE ROLE INITIALIZATION
  ============================================================

  We DO NOT use deleteMany() here.

  We DO NOT synchronize existing roles back to this file.

  If a role already has configured permissions, it is left
  completely untouched.
  ============================================================
  */

  for (
    const [
      roleName,
      permissionKeys,
    ] of Object.entries(
      defaultRolePermissions
    )
  ) {
    const role =
      roleRecords[
        roleName
      ];

    if (!role) {
      continue;
    }

    if (
      !roleNeedsDefaults[
        roleName
      ]
    ) {
      console.log(
        `Preserving configured permissions: ${roleName}`
      );

      continue;
    }

    console.log(
      `Initializing default permissions: ${roleName}`
    );

    for (
      const permissionKey of
      permissionKeys
    ) {
      const permission =
        permissionRecords[
          permissionKey
        ];

      if (!permission) {
        throw new Error(
          `Permission not found during seed: ${permissionKey}`
        );
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId:
            {
              roleId:
                role.id,

              permissionId:
                permission.id,
            },
        },

        update: {},

        create: {
          roleId:
            role.id,

          permissionId:
            permission.id,
        },
      });
    }
  }

  /*
  ============================================================
  COMPLETE
  ============================================================
  */

  console.log("");
  console.log(
    "CHRIS development seed completed successfully."
  );

  console.log(
    `Organization: ${organization.name}`
  );

  console.log(
    `Permissions in catalogue: ${permissions.length}`
  );

  console.log(
    `System roles: ${systemRoles.length}`
  );

  console.log("");
  console.log(
    "Existing role permission configurations were preserved."
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "Seed failed:",
      error
    );

    process.exit(1);
  })
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );