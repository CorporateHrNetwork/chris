require("dotenv").config();
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const service = require("../src/services/lineManagerService");

function assert(value, message) { if (!value) throw new Error(message); }
async function expectCode(action, code) {
  try { await action(); } catch (error) { assert(error.message === code, `Expected ${code}, received ${error.message}`); return; }
  throw new Error(`Expected ${code} rejection`);
}

async function createTenant(marker) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: marker, slug: marker } });
    const department = await tx.department.create({ data: { organizationId: organization.id, name: "People", code: "PEOPLE" } });
    const designation = await tx.designation.create({ data: { organizationId: organization.id, departmentId: department.id, name: "HR", code: "HR" } });
    const location = await tx.organizationLocation.create({ data: { organizationId: organization.id, name: "HQ", code: "HQ" } });
    async function employee(number, firstName, status = "ACTIVE") {
      return tx.employee.create({ data: {
        organizationId: organization.id, departmentId: department.id, designationId: designation.id,
        locationId: location.id, employeeNumber: number, firstName, lastName: "Fixture", status,
      } });
    }
    return {
      organization, department, designation, location,
      a: await employee("CHR990001", "Ada"),
      b: await employee("CHR990002", "Bola"),
      c: await employee("CHR990003", "Chidi"),
      d: await employee("CHR990004", "Dayo", "INACTIVE"),
    };
  });
}

async function main() {
  const marker = `line-manager-e2e-${Date.now()}`;
  const ids = [];
  let server;
  try {
    const one = await createTenant(`${marker}-one`);
    const two = await createTenant(`${marker}-two`);
    ids.push(one.organization.id, two.organization.id);
    const base = {
      organizationId: one.organization.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      performedByUserId: null,
    };

    const assigned = await service.setLineManager(prisma, {
      ...base, employeeId: one.a.id, managerEmployeeId: one.b.id, reason: "Initial assignment",
    });
    assert(assigned.managerEmployeeId === one.b.id, "Valid manager was not assigned.");

    await expectCode(() => service.setLineManager(prisma, {
      ...base, employeeId: one.c.id, managerEmployeeId: one.c.id,
    }), "SELF_MANAGER");
    await expectCode(() => service.setLineManager(prisma, {
      ...base, employeeId: one.c.id, managerEmployeeId: two.a.id,
    }), "MANAGER_NOT_FOUND");
    await expectCode(() => service.setLineManager(prisma, {
      ...base, employeeId: one.c.id, managerEmployeeId: one.d.id,
    }), "MANAGER_NOT_CURRENT");

    await service.setLineManager(prisma, {
      ...base, employeeId: one.b.id, managerEmployeeId: one.c.id, reason: "Hierarchy",
    });
    await expectCode(() => service.setLineManager(prisma, {
      ...base, employeeId: one.c.id, managerEmployeeId: one.a.id, reason: "Cycle attempt",
    }), "MANAGEMENT_CYCLE");

    await service.setLineManager(prisma, {
      ...base,
      employeeId: one.a.id,
      managerEmployeeId: one.c.id,
      effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
      reason: "Manager change",
      notes: "History must remain",
    });
    const changedHistory = await prisma.employeeLineManagerAssignment.findMany({
      where: { organizationId: one.organization.id, employeeId: one.a.id },
      orderBy: { effectiveFrom: "asc" },
    });
    assert(changedHistory.length === 2, "Manager change destroyed history.");
    assert(changedHistory[0].effectiveTo && changedHistory[1].effectiveTo === null, "Manager change did not close old assignment.");

    const reports = await prisma.employeeLineManagerAssignment.findMany({
      where: { organizationId: one.organization.id, managerEmployeeId: one.c.id, effectiveTo: null },
    });
    assert(reports.some((item) => item.employeeId === one.a.id), "Direct reports query failed.");

    await service.removeLineManager(prisma, {
      organizationId: one.organization.id,
      employeeId: one.a.id,
      effectiveTo: new Date("2026-03-01T00:00:00.000Z"),
      reason: "Reporting restructure",
    });
    const afterRemoval = await prisma.employeeLineManagerAssignment.findMany({
      where: { organizationId: one.organization.id, employeeId: one.a.id },
    });
    assert(afterRemoval.length === 2 && afterRemoval.every((item) => item.effectiveTo), "Removal did not preserve and close history.");

    await service.setLineManager(prisma, {
      ...base,
      employeeId: one.a.id,
      managerEmployeeId: one.b.id,
      effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      reason: "New reporting line",
    });
    await prisma.$transaction((tx) => service.closeLineManagerAssignmentsForExit(tx, {
      organizationId: one.organization.id,
      employeeId: one.b.id,
      effectiveTo: new Date("2026-05-01T00:00:00.000Z"),
    }));
    const afterManagerExit = await prisma.employeeLineManagerAssignment.findFirst({
      where: { organizationId: one.organization.id, employeeId: one.a.id, effectiveTo: null },
    });
    assert(afterManagerExit === null, "Manager exit left an active reporting relationship.");

    await prisma.employee.update({ where: { id: one.b.id }, data: { status: "RESIGNED", exitDate: new Date("2026-05-01") } });
    await prisma.employee.update({ where: { id: one.b.id }, data: { status: "ACTIVE", exitDate: null } });
    const afterRehire = await prisma.employeeLineManagerAssignment.findFirst({
      where: { organizationId: one.organization.id, employeeId: one.a.id, effectiveTo: null },
    });
    assert(afterRehire === null, "Rehire automatically restored an old reporting line.");

    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/line-managers/employees/${one.a.employeeNumber}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert(response.status === 401, "Unauthorized manager update was not rejected.");

    const crossTenantCount = await prisma.employeeLineManagerAssignment.count({
      where: { organizationId: two.organization.id, employeeId: one.a.id },
    });
    assert(crossTenantCount === 0, "Tenant isolation failed.");

    console.log(JSON.stringify({ passed: true, checks: [
      "valid-assignment", "self-rejected", "cross-tenant-rejected", "inactive-manager-rejected",
      "change-closes-old", "history-preserved", "cycle-rejected", "direct-reports",
      "removal-preserves-history", "manager-exit-closes-reports", "rehire-does-not-restore",
      "tenant-isolation", "unauthorized-update-rejected"
    ] }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const id of ids) await prisma.organization.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
