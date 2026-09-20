require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

const SLUG = "zermatt-liquor-limited";
const SYNTHETIC_MARKER = "SYNTHETIC STAGING ACCEPTANCE";
const ENABLED = String(process.env.CHRIS_ENABLE_SYNTHETIC_ZERMATT_FIXTURE || "").toLowerCase() === "true";

const PASSWORDS = {
  head: process.env.CHRIS_STAGING_ZERMATT_HEAD_HR_PASSWORD,
  abj: process.env.CHRIS_STAGING_ZERMATT_ABJ_HR_PASSWORD,
  phc: process.env.CHRIS_STAGING_ZERMATT_PHC_HR_PASSWORD,
  lag: process.env.CHRIS_STAGING_ZERMATT_LAG_HR_PASSWORD,
};

const HEAD_PERMISSIONS = [
  "dashboard.view","employees.view","employees.create","employees.update",
  "recruitment.view",
  "attendance.view","attendance.manage","leave.view","leave.manage",
  "payroll.view","payroll.process","payroll.manage","payslips.view","payslips.download",
  "loans.view",
  "performance.view","training.view",
  "reports.view","reports.export",
  "settings.view"
];

const BRANCH_PERMISSIONS = [
  "dashboard.view","employees.view","employees.create","employees.update",
  "attendance.view","attendance.manage","leave.view","leave.manage",
  "payroll.view","payslips.view","payslips.download","loans.view",
  "reports.view","reports.export"
];

function requiredEnv() {
  if (!ENABLED) throw new Error("Set CHRIS_ENABLE_SYNTHETIC_ZERMATT_FIXTURE=true to run this staging-only fixture.");
  const missing = Object.entries(PASSWORDS).filter(([, value]) => !value || String(value).length < 12).map(([key]) => key);
  if (missing.length) throw new Error(`Missing/weak staging passwords: ${missing.join(", ")}. Use 12+ characters in Render environment variables.`);
}

async function permissionMap(keys) {
  const rows = await prisma.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  const map = new Map(rows.map((row) => [row.key, row]));
  const missing = keys.filter((key) => !map.has(key));
  if (missing.length) throw new Error(`Required CHRiS permissions are missing: ${missing.join(", ")}`);
  return map;
}

async function setRolePermissions(role, keys, permissions) {
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: keys.map((key) => ({ roleId: role.id, permissionId: permissions.get(key).id })),
    skipDuplicates: true,
  });
}

async function main() {
  requiredEnv();

  const existing = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (existing && !String(existing.legalName || "").includes(SYNTHETIC_MARKER)) {
    throw new Error("Refusing to overwrite an existing non-synthetic zermatt-liquor-limited tenant.");
  }

  const organization = existing || await prisma.organization.create({
    data: {
      name: "Zermatt Liquor Limited — Synthetic Staging",
      legalName: `Zermatt Liquor Limited — ${SYNTHETIC_MARKER}`,
      slug: SLUG,
      country: "Nigeria",
      timezone: "Africa/Lagos",
      currency: "NGN",
      code: "ZLL-STG",
      status: "ACTIVE",
    },
  });

  const locationSpecs = [
    ["HEAD OFFICE", "HO", "HEAD_OFFICE", "Abuja", "FCT"],
    ["ABUJA BRANCH", "ABJ", "BRANCH", "Abuja", "FCT"],
    ["PHC BRANCH", "PHC", "BRANCH", "Port Harcourt", "Rivers"],
    ["LAGOS BRANCH", "LAG", "BRANCH", "Lagos", "Lagos"],
  ];
  const locations = new Map();
  for (const [name, code, type, city, state] of locationSpecs) {
    const location = await prisma.organizationLocation.upsert({
      where: { organizationId_code: { organizationId: organization.id, code } },
      update: { name, type, city, state, country: "Nigeria", isActive: true },
      create: { organizationId: organization.id, name, code, type, city, state, country: "Nigeria", isActive: true },
    });
    locations.set(code, location);
  }

  const costCentre = await prisma.costCentre.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS" } },
    update: { name: "Synthetic Operations", status: "ACTIVE" },
    create: {
      organizationId: organization.id, code: "STG-OPS", name: "Synthetic Operations",
      description: SYNTHETIC_MARKER, status: "ACTIVE", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  const hrDepartment = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-HR" } },
    update: { name: "HR & Administration", isActive: true, costCentreId: costCentre.id },
    create: { organizationId: organization.id, code: "STG-HR", name: "HR & Administration", isActive: true, costCentreId: costCentre.id },
  });
  const opsDepartment = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS" } },
    update: { name: "Operations", isActive: true, costCentreId: costCentre.id },
    create: { organizationId: organization.id, code: "STG-OPS", name: "Operations", isActive: true, costCentreId: costCentre.id },
  });

  const headDesignation = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-HEAD-HR" } },
    update: { name: "Head of HR", departmentId: hrDepartment.id, isActive: true, careerTrack: "HUMAN_RESOURCES", careerLevel: null },
    create: { organizationId: organization.id, code: "STG-HEAD-HR", name: "Head of HR", departmentId: hrDepartment.id, isActive: true, careerTrack: "HUMAN_RESOURCES", careerLevel: null },
  });
  const branchDesignation = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-HRA-OFF" } },
    update: { name: "HR & Admin Officer", departmentId: hrDepartment.id, isActive: true, careerTrack: "HUMAN_RESOURCES", careerLevel: null },
    create: { organizationId: organization.id, code: "STG-HRA-OFF", name: "HR & Admin Officer", departmentId: hrDepartment.id, isActive: true, careerTrack: "HUMAN_RESOURCES", careerLevel: null },
  });
  const opsDesignation = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS-ASSOC" } },
    update: { name: "Operations Associate", departmentId: opsDepartment.id, isActive: true, careerTrack: "OPERATIONS", careerLevel: null },
    create: { organizationId: organization.id, code: "STG-OPS-ASSOC", name: "Operations Associate", departmentId: opsDepartment.id, isActive: true, careerTrack: "OPERATIONS", careerLevel: null },
  });

  const employees = [
    ["ZST000001","Helen","Adeyemi","HO","Full-Time",headDesignation.id,hrDepartment.id,650000],
    ["ZST000101","Ada","Ibrahim","ABJ","Full-Time",branchDesignation.id,hrDepartment.id,350000],
    ["ZST000102","Grace","James","ABJ","Full-Time",opsDesignation.id,opsDepartment.id,220000],
    ["ZST000201","Boma","Okorie","PHC","Full-Time",branchDesignation.id,hrDepartment.id,350000],
    ["ZST000202","Daniel","Eze","PHC","Full-Time",opsDesignation.id,opsDepartment.id,210000],
    ["ZST000301","Tola","Bello","LAG","Full-Time",branchDesignation.id,hrDepartment.id,350000],
    ["ZST000302","Musa","Akin","LAG","Part-time",opsDesignation.id,opsDepartment.id,160000],
  ];

  const employeeByNumber = new Map();
  for (const [employeeNumber, firstName, lastName, locationCode, employmentType, designationId, departmentId, salary] of employees) {
    const employee = await prisma.employee.upsert({
      where: { organizationId_employeeNumber: { organizationId: organization.id, employeeNumber } },
      update: {
        firstName,lastName,locationId:locations.get(locationCode).id,employmentType,designationId,departmentId,
        costCentreId:costCentre.id,status:"ACTIVE",hireDate:new Date("2025-01-01T00:00:00.000Z"),
      },
      create: {
        organizationId:organization.id,employeeNumber,firstName,lastName,locationId:locations.get(locationCode).id,
        employmentType,designationId,departmentId,costCentreId:costCentre.id,status:"ACTIVE",
        hireDate:new Date("2025-01-01T00:00:00.000Z"),email:`${employeeNumber.toLowerCase()}@example.invalid`,
      },
    });
    employeeByNumber.set(employeeNumber, employee);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "payroll_salary_rates" ("id","organizationId","employeeId","amount","currency","frequency","effectiveFrom","status","reason")
       VALUES ($1,$2,$3,$4,'NGN','MONTHLY',$5::date,'ACTIVE',$6)
       ON CONFLICT ("organizationId","employeeId","effectiveFrom")
       DO UPDATE SET "amount"=EXCLUDED."amount","status"='ACTIVE',"reason"=EXCLUDED."reason","updatedAt"=CURRENT_TIMESTAMP`,
      `stg-rate-${employeeNumber.toLowerCase()}`, organization.id, employee.id, salary, "2026-01-01", SYNTHETIC_MARKER
    );
  }

  const permissions = await permissionMap([...new Set([...HEAD_PERMISSIONS, ...BRANCH_PERMISSIONS])]);
  const headRole = await prisma.role.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Head of HR" } },
    update: { description: `${SYNTHETIC_MARKER} — client-admin Head HR authority with consolidated payroll control` },
    create: { organizationId: organization.id, name: "Head of HR", description: `${SYNTHETIC_MARKER} — client-admin Head HR authority with consolidated payroll control` },
  });
  const branchRole = await prisma.role.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "HR & Admin Officer - Branch" } },
    update: { description: `${SYNTHETIC_MARKER} — branch HR authority` },
    create: { organizationId: organization.id, name: "HR & Admin Officer - Branch", description: `${SYNTHETIC_MARKER} — branch HR authority` },
  });
  await setRolePermissions(headRole, HEAD_PERMISSIONS, permissions);
  await setRolePermissions(branchRole, BRANCH_PERMISSIONS, permissions);

  const userSpecs = [
    ["head","headhr.zermatt.staging@crnetwork.com.ng","ZST000001",headRole,"ALL_LOCATIONS",null],
    ["abj","abj.hr.zermatt.staging@crnetwork.com.ng","ZST000101",branchRole,"ASSIGNED_LOCATIONS","ABJ"],
    ["phc","phc.hr.zermatt.staging@crnetwork.com.ng","ZST000201",branchRole,"ASSIGNED_LOCATIONS","PHC"],
    ["lag","lag.hr.zermatt.staging@crnetwork.com.ng","ZST000301",branchRole,"ASSIGNED_LOCATIONS","LAG"],
  ];
  for (const [passwordKey,email,employeeNumber,role,locationScope,locationCode] of userSpecs) {
    const employee = employeeByNumber.get(employeeNumber);
    const passwordHash = await bcrypt.hash(PASSWORDS[passwordKey], 12);
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: organization.id, email } },
      update: { passwordHash, employeeId: employee.id, firstName: employee.firstName, lastName: employee.lastName, isActive: true, locationScope },
      create: { organizationId: organization.id, email, passwordHash, employeeId: employee.id, firstName: employee.firstName, lastName: employee.lastName, isActive: true, locationScope },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.userLocation.deleteMany({ where: { userId: user.id } });
    if (locationCode) await prisma.userLocation.create({ data: { organizationId: organization.id, userId: user.id, locationId: locations.get(locationCode).id } });
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "payroll_policy_versions"
      ("id","organizationId","code","name","versionNumber","jurisdiction","effectiveFrom","status",
       "salaryStructure","standardDays","pensionEmployeeRate","pensionEmployerRate","pensionableComponents","payeRules","employerStatutoryRules")
     VALUES ($1,$2,'ZLL-NG-PAYROLL','ZERMATT Nigeria Payroll Policy — Synthetic Staging',3,'NG',$3::date,'ACTIVE',
       $4::jsonb,$5::jsonb,8,10,$6::jsonb,$7::jsonb,$8::jsonb)
     ON CONFLICT ("organizationId","code","versionNumber")
     DO UPDATE SET "status"='ACTIVE',"effectiveFrom"=EXCLUDED."effectiveFrom","salaryStructure"=EXCLUDED."salaryStructure",
       "standardDays"=EXCLUDED."standardDays","payeRules"=EXCLUDED."payeRules","employerStatutoryRules"=EXCLUDED."employerStatutoryRules","updatedAt"=CURRENT_TIMESTAMP`,
    "zll-staging-ng-payroll-v3", organization.id, "2026-01-01",
    JSON.stringify({basic:57,housing:11,transport:10,meal:9,medical:8,utility:5}),
    JSON.stringify({"Full-Time":26,"Part-time":16,"Expatriate":26,"NYSC/Internship":26}),
    JSON.stringify(["basic","housing","transport"]),
    JSON.stringify({ruleCode:"NG-NTA-2025-2026",effectiveFrom:"2026-01-01",minimumWageMonthly:70000,rentReliefRate:20,rentReliefCap:500000,statutoryDeductionExemptEmploymentTypes:["Part-time"],bands:[{limit:800000,rate:0},{limit:2200000,rate:15},{limit:9000000,rate:18},{limit:13000000,rate:21},{limit:25000000,rate:23},{limit:null,rate:25}],nhf:{enabled:false,employeeRate:2.5,basis:"BASIC"}}),
    JSON.stringify({nsitf:{enabled:true,employerRate:1,basis:"TOTAL_PAYROLL",employeeDeduction:false},itf:{enabled:true,employerRate:1,basis:"ANNUAL_PAYROLL_ACCRUAL",employeeDeduction:false},pensionParticipationExemptEmploymentTypes:["Part-time"]})
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO "payroll_periods" ("id","organizationId","code","name","periodStart","periodEnd","payDate","status")
     VALUES ($1,$2,'STG-ZLL-SEP-2026','September 2026 — Synthetic Zermatt Acceptance','2026-09-01','2026-09-30','2026-09-30','OPEN')
     ON CONFLICT ("organizationId","code") DO UPDATE SET "status"='OPEN',"updatedAt"=CURRENT_TIMESTAMP`,
    "zll-staging-sep-2026", organization.id
  );

  await prisma.attendancePayrollSetting.upsert({
    where: { organizationId: organization.id },
    update: { basis: "ADMIN_ENTERED" },
    create: { organizationId: organization.id, basis: "ADMIN_ENTERED" },
  });

  await prisma.organizationAudit.create({
    data: {
      organizationId: organization.id,
      entityType: "SyntheticStagingFixture",
      entityId: "zermatt-payroll-acceptance",
      action: "PROVISIONED",
      newValue: {
        marker: SYNTHETIC_MARKER,
        locations: locationSpecs.map(([,code]) => code),
        employees: employees.map(([employeeNumber]) => employeeNumber),
        logins: userSpecs.map(([,email]) => email),
        payrollPeriod: "STG-ZLL-SEP-2026",
      },
      reason: "Isolated synthetic ZERMATT client-readiness acceptance fixture.",
    },
  });

  console.log(JSON.stringify({
    status: "success",
    organization: { id: organization.id, slug: organization.slug, name: organization.name },
    loginUrl: "/login?organization=zermatt-liquor-limited",
    users: userSpecs.map(([key,email,,role,,locationCode]) => ({ key, email, role: role.name, branch: locationCode || "HEAD OFFICE" })),
    payrollPeriod: "STG-ZLL-SEP-2026",
    note: "Passwords are supplied only through Render environment variables and are never printed.",
  }, null, 2));
}

main().catch((error) => {
  console.error("Synthetic ZERMATT staging fixture failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
