require("dotenv").config();

const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const clearance = {
  assetsReturned: true,
  accessDisabled: true,
  handoverCompleted: true,
  financeCleared: true,
  payrollCleared: true,
  hrCleared: true,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const marker = `exit-e2e-${Date.now()}`;
  let organizationId;
  let server;

  try {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: ["employees.view", "employees.update"] } },
    });
    assert(permissions.length === 2, "Required employee permissions are not seeded.");

    const fixture = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: marker, slug: marker },
      });
      organizationId = organization.id;

      const role = await tx.role.create({
        data: {
          organizationId,
          name: "Exit E2E Administrator",
          rolePermissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      });

      const admin = await tx.user.create({
        data: {
          organizationId,
          email: `admin-${marker}@example.test`,
          passwordHash: "integration-test-only",
          firstName: "Exit",
          lastName: "Tester",
          userRoles: { create: { roleId: role.id } },
        },
      });

      const department = await tx.department.create({
        data: { organizationId, name: "Exit Test", code: "EXIT" },
      });
      const designation = await tx.designation.create({
        data: {
          organizationId,
          departmentId: department.id,
          name: "Exit Test Role",
          code: "EXIT-ROLE",
        },
      });
      const location = await tx.organizationLocation.create({
        data: { organizationId, name: "Exit Test Office", code: "EXIT-OFFICE" },
      });
      const employee = await tx.employee.create({
        data: {
          organizationId,
          departmentId: department.id,
          designationId: designation.id,
          locationId: location.id,
          employeeNumber: "CHR999998",
          firstName: "Exit",
          lastName: "Fixture",
          status: "ACTIVE",
          hireDate: new Date("2025-01-01T00:00:00.000Z"),
        },
      });
      await tx.employeeEmploymentEpisode.create({
        data: {
          organizationId,
          employeeId: employee.id,
          sequenceNumber: 1,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          startStatus: "ACTIVE",
          startDepartmentId: department.id,
          startDesignationId: designation.id,
          startLocationId: location.id,
          startReason: "Exit integration fixture",
        },
      });
      const linkedUser = await tx.user.create({
        data: {
          organizationId,
          employeeId: employee.id,
          email: `employee-${marker}@example.test`,
          passwordHash: "integration-test-only",
        },
      });
      return { organization, admin, department, designation, location, employee, linkedUser };
    });

    const token = jwt.sign(
      { userId: fixture.admin.id, organizationId },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(path, options = {}) {
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
        body:
          options.body && typeof options.body !== "string"
            ? JSON.stringify(options.body)
            : options.body,
      });
      const result = await response.json();
      return { response, result };
    }

    const exitBody = {
      employeeId: fixture.employee.id,
      exitType: "RESIGNATION",
      noticeDate: "2026-08-01",
      noticeStatus: "SERVED",
      lastWorkingDay: "2026-08-20",
      reason: "Exit integration test",
    };

    const initiated = await request("/api/exits", { method: "POST", body: exitBody });
    assert(initiated.response.status === 201, `Initiation failed: ${initiated.result.message}`);

    const cancelReason = "Exit request withdrawn during integration test";
    const cancelled = await request(
      `/api/exits/${initiated.result.data.id}/cancel`,
      { method: "POST", body: { cancellationReason: cancelReason } }
    );
    assert(cancelled.response.status === 200, `Cancellation failed: ${cancelled.result.message}`);
    assert(cancelled.result.data.status === "CANCELLED", "Cancelled status was not stored.");
    assert(cancelled.result.data.cancellationReason === cancelReason, "Cancellation reason was not stored.");
    assert(cancelled.result.data.cancelledAt, "Cancellation timestamp was not stored.");
    assert(cancelled.result.data.cancelledByUserId === fixture.admin.id, "Cancelling user was not stored.");

    const afterCancel = await prisma.employee.findUnique({
      where: { id: fixture.employee.id },
      include: {
        employmentEpisodes: true,
        lifecycleEvents: { where: { eventType: "EXITED" } },
      },
    });
    assert(afterCancel.status === "ACTIVE", "Cancellation changed employee status.");
    assert(afterCancel.exitDate === null, "Cancellation changed employee exitDate.");
    assert(afterCancel.employmentEpisodes.length === 1 && afterCancel.employmentEpisodes[0].endDate === null, "Cancellation closed the current episode.");
    assert(afterCancel.lifecycleEvents.length === 0, "Cancellation created an EXITED lifecycle event.");

    const reinitiated = await request("/api/exits", { method: "POST", body: exitBody });
    assert(reinitiated.response.status === 201, `Fresh initiation failed: ${reinitiated.result.message}`);

    const cleared = await request(
      `/api/exits/${reinitiated.result.data.id}`,
      { method: "PATCH", body: { clearance } }
    );
    assert(cleared.response.status === 200 && cleared.result.data.clearanceComplete, "Clearance did not complete.");

    const completed = await request(
      `/api/exits/${reinitiated.result.data.id}/complete`,
      { method: "POST" }
    );
    assert(completed.response.status === 200, `Completion failed: ${completed.result.message}`);

    const cancelCompleted = await request(
      `/api/exits/${reinitiated.result.data.id}/cancel`,
      { method: "POST", body: { cancellationReason: "Must be rejected" } }
    );
    assert(cancelCompleted.response.status === 409, "Completed exit was cancellable.");

    const afterComplete = await prisma.employee.findUnique({
      where: { id: fixture.employee.id },
      include: {
        employmentEpisodes: { orderBy: { sequenceNumber: "asc" } },
        lifecycleEvents: { orderBy: { createdAt: "asc" } },
        user: true,
      },
    });
    assert(afterComplete.status === "RESIGNED", "Completion did not apply final status.");
    assert(afterComplete.exitDate, "Completion did not set exitDate.");
    assert(afterComplete.employmentEpisodes[0].endDate, "Completion did not close the episode.");
    assert(afterComplete.lifecycleEvents.some((event) => event.eventType === "EXITED"), "Completion did not create EXITED event.");
    assert(afterComplete.user && afterComplete.user.isActive === false, "Completion did not disable linked user.");

    const exitList = await request("/api/exits");
    const completedRecord = exitList.result.data.find(
      (item) => item.id === reinitiated.result.data.id && item.status === "COMPLETED"
    );
    assert(completedRecord, "Completed employee is absent from exit data used by the Exits register.");

    const rehired = await request(
      `/api/employees/${fixture.employee.employeeNumber}/rehire`,
      {
        method: "PATCH",
        body: {
          status: "ACTIVE",
          effectiveDate: "2026-08-20",
          departmentId: fixture.department.id,
          designationId: fixture.designation.id,
          locationId: fixture.location.id,
          reason: "Return after completed exit integration test",
        },
      }
    );
    assert(rehired.response.status === 200, `Rehire failed: ${rehired.result.message}`);
    assert(rehired.result.data.id === fixture.employee.id, "Rehire changed permanent employee identity.");

    const afterRehire = await prisma.employee.findUnique({
      where: { id: fixture.employee.id },
      include: {
        employmentEpisodes: { orderBy: { sequenceNumber: "asc" } },
        lifecycleEvents: { orderBy: { createdAt: "asc" } },
        user: true,
      },
    });
    assert(afterRehire.status === "ACTIVE" && afterRehire.exitDate === null, "Rehire did not restore current employment state.");
    assert(afterRehire.employmentEpisodes.length === 2, "Rehire did not preserve history and create episode 2.");
    assert(afterRehire.employmentEpisodes[0].endDate && afterRehire.employmentEpisodes[1].endDate === null, "Employment episode history is invalid after rehire.");
    assert(afterRehire.lifecycleEvents.some((event) => event.eventType === "EXITED"), "EXITED history was lost after rehire.");
    assert(afterRehire.lifecycleEvents.some((event) => event.eventType === "REHIRED"), "REHIRED history was not created.");
    assert(afterRehire.user && afterRehire.user.isActive === true, "Rehire did not restore linked user access.");

    console.log(JSON.stringify({
      passed: true,
      checks: [
        "initiate", "cancel-with-reason", "cancel-preserves-current-employment",
        "fresh-initiation-after-cancel", "clearance", "complete",
        "completed-cannot-cancel", "exit-register-source", "rehire",
        "permanent-identity-and-history-preserved"
      ],
    }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
