require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");

const MARKER = "SYNTHETIC STAGING ACCEPTANCE";
const NUMBER = "ZST009901";
const EMAIL = "zst009901@example.invalid";
const EXIT_ID = "f480a0a8-3437-4f9c-8009-97853a83cba1";
const START = new Date("2025-01-01T00:00:00.000Z");
const EXIT = new Date("2026-08-31T00:00:00.000Z");

async function main() {
  if (String(process.env.CHRIS_ENABLE_SYNTHETIC_ZERMATT_FIXTURE).toLowerCase() !== "true") {
    throw new Error("Synthetic Zermatt staging fixture must be explicitly enabled.");
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" },
  });
  if (!organization || !String(organization.legalName || "").includes(MARKER)) {
    throw new Error("Refusing to run outside the marked synthetic staging tenant.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findUnique({
      where: { organizationId_employeeNumber: { organizationId: organization.id, employeeNumber: NUMBER } },
    });
    const exit = await tx.employeeExitProcess.findUnique({ where: { id: EXIT_ID } });
    if (existing || exit) {
      if (existing?.email !== EMAIL || exit?.organizationId !== organization.id ||
          exit?.employeeId !== existing.id || exit.status !== "COMPLETED") {
        throw new Error("Reserved print fixture is incomplete or belongs to another record; refusing to overwrite it.");
      }
      return { status: "already_present", employeeNumber: NUMBER, exitProcessId: EXIT_ID };
    }

    const [department, designation, location, costCentre] = await Promise.all([
      tx.department.findUnique({ where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS" } } }),
      tx.designation.findUnique({ where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS-ASSOC" } } }),
      tx.organizationLocation.findUnique({ where: { organizationId_code: { organizationId: organization.id, code: "HO" } } }),
      tx.costCentre.findUnique({ where: { organizationId_code: { organizationId: organization.id, code: "STG-OPS" } } }),
    ]);
    if (!department || !designation || !location || !costCentre) {
      throw new Error("Run the base synthetic staging provisioner before creating the print fixture.");
    }

    const employee = await tx.employee.create({ data: {
      organizationId: organization.id, employeeNumber: NUMBER,
      firstName: "Settlement", lastName: "Print Test", email: EMAIL,
      locationId: location.id, employmentType: "Full-Time",
      designationId: designation.id, departmentId: department.id,
      costCentreId: costCentre.id, status: "RESIGNED",
      hireDate: START, exitDate: EXIT,
    } });

    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_salary_rates" ("id","organizationId","employeeId","amount","currency","frequency","effectiveFrom","status","reason")
       VALUES ($1,$2,$3,180000,'NGN','MONTHLY',$4::date,'ACTIVE',$5)`,
      "stg-rate-zst009901", organization.id, employee.id, "2026-01-01", MARKER
    );
    await tx.employeeEmploymentEpisode.create({ data: {
      organizationId: organization.id, employeeId: employee.id, sequenceNumber: 1,
      startDate: START, endDate: EXIT, startStatus: "ACTIVE", endStatus: "RESIGNED",
      startDepartmentId: department.id, endDepartmentId: department.id,
      startDesignationId: designation.id, endDesignationId: designation.id,
      startLocationId: location.id, endLocationId: location.id,
      startReason: MARKER, endReason: "Staging print acceptance",
    } });
    await tx.employeeExitProcess.create({ data: {
      id: EXIT_ID, organizationId: organization.id, employeeId: employee.id,
      exitType: "RESIGNATION", targetStatus: "RESIGNED",
      noticeDate: new Date("2026-08-01T00:00:00.000Z"), noticeStatus: "WAIVED",
      entitledNoticeDays: 0, lastWorkingDay: EXIT,
      reason: "Synthetic staging settlement print acceptance", notes: MARKER,
      clearance: { assetsReturned: true, accessDisabled: true, handoverCompleted: true,
        financeCleared: true, payrollCleared: true, hrCleared: true },
      status: "COMPLETED", financialStatus: "PENDING", completedAt: EXIT,
    } });
    await tx.employeeLifecycleEvent.create({ data: {
      organizationId: organization.id, employeeId: employee.id, eventType: "EXITED",
      effectiveDate: EXIT, previousStatus: "ACTIVE", newStatus: "RESIGNED",
      previousDepartmentId: department.id, newDepartmentId: department.id,
      previousDesignationId: designation.id, newDesignationId: designation.id,
      fromLocationId: location.id, toLocationId: location.id,
      reason: "Synthetic staging settlement print acceptance",
    } });
    return { status: "created", employeeNumber: NUMBER, exitProcessId: EXIT_ID };
  });

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error("Staging exit-print fixture failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
