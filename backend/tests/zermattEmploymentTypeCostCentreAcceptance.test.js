const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEmployeeWithDependencies,
} = require("../src/services/employeeCreationService");

test("ZERMATT R1 persists authoritative Employment Type + Cost Centre without regressing ZLL numbering", async () => {
  const captured = {
    costCentreWhere: null,
    employeeData: null,
  };

  const prisma = {
    employee: {
      findFirst: async () => null,
    },
    department: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, {
          id: "department-ops",
          organizationId: "zermatt-org",
          isActive: true,
        });
        return { id: "department-ops", name: "Operations", code: "OPS", isActive: true };
      },
    },
    designation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "zermatt-org");
        assert.equal(where.departmentId, "department-ops");
        return {
          id: "designation-1",
          name: "Operations Officer",
          code: "OPS-OFF",
          departmentId: "department-ops",
          careerLevel: 2,
          isActive: true,
        };
      },
    },
    organizationLocation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "zermatt-org");
        return { id: "location-abj", name: "Abuja", code: "ABJ", isActive: true };
      },
    },
    costCentre: {
      findFirst: async ({ where }) => {
        captured.costCentreWhere = where;
        return {
          id: "cost-centre-beer-barn",
          code: "BB-01",
          name: "Beer Barn - Abuja",
          status: "ACTIVE",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: null,
        };
      },
    },
    $transaction: async (operation) => operation({
      organization: {
        update: async () => ({
          employeeNumberSequence: 1,
          slug: "zermatt-liquor-limited",
        }),
      },
      employee: {
        create: async ({ data }) => {
          captured.employeeData = data;
          return {
            id: "employee-1",
            ...data,
            createdAt: new Date("2026-09-04T00:00:00.000Z"),
            hireDate: data.hireDate || null,
          };
        },
      },
      employeeEmploymentEpisode: {
        create: async () => ({}),
      },
    }),
  };

  const employee = await createEmployeeWithDependencies(
    {
      organizationId: "zermatt-org",
      actorUserId: "actor-1",
      input: {
        name: "Ada Zermatt Employee",
        departmentId: "department-ops",
        designationId: "designation-1",
        locationId: "location-abj",
        costCentreId: "cost-centre-beer-barn",
        employmentType: "Full-Time-Employment",
        status: "Active",
      },
    },
    {
      prisma,
      resolveEmploymentLevelFromDesignation: async () => ({ levelNumber: 2 }),
      provisionNewEmployeeEntitlements: async () => ({}),
      assertTenantNinAvailable: async () => null,
    }
  );

  assert.equal(employee.employeeNumber, "ZLL000001");
  assert.equal(captured.employeeData.employmentType, "Full-Time");
  assert.equal(captured.employeeData.costCentreId, "cost-centre-beer-barn");
  assert.equal(captured.employeeData.departmentId, "department-ops");
  assert.equal(captured.costCentreWhere.organizationId, "zermatt-org");
  assert.equal(captured.costCentreWhere.status, "ACTIVE");
  assert.ok(captured.costCentreWhere.effectiveFrom?.lte instanceof Date);
  assert.deepEqual(captured.costCentreWhere.OR, [
    { effectiveTo: null },
    { effectiveTo: { gte: captured.costCentreWhere.effectiveFrom.lte } },
  ]);
});
