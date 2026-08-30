const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEmployeeWithDependencies,
} = require("../src/services/employeeCreationService");

const input = {
  name: "Mary Okili Ojoma",
  departmentId: "department-1",
  designationId: "designation-1",
  locationId: "location-1",
  email: "MARY.OJOMA@CORPORATEHR.COM",
  phone: "09100234567",
  gender: "Female",
  status: "Probation",
};

function createFixture({ provisioningFails = false } = {}) {
  const persisted = {
    sequence: 10,
    employees: [],
    episodes: [],
    provisions: [],
  };
  const calls = [];
  const prisma = {
    employee: { findFirst: async () => null },
    department: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "organization-1");
        return { id: "department-1", isActive: true };
      },
    },
    designation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "organization-1");
        assert.equal(where.departmentId, "department-1");
        return {
          id: "designation-1",
          departmentId: "department-1",
          careerLevel: 1,
          isActive: true,
        };
      },
    },
    organizationLocation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "organization-1");
        return { id: "location-1", isActive: true };
      },
    },
    $transaction: async (operation) => {
      const staged = structuredClone(persisted);
      const tx = {
        organization: {
          update: async () => {
            calls.push("sequence");
            staged.sequence += 1;
            return { employeeNumberSequence: staged.sequence };
          },
        },
        employee: {
          create: async ({ data }) => {
            calls.push("employee");
            const employee = {
              id: "employee-1",
              ...data,
              createdAt: new Date("2026-08-25T00:00:00.000Z"),
              hireDate: data.hireDate || null,
            };
            staged.employees.push(employee);
            return employee;
          },
        },
        employeeEmploymentEpisode: {
          create: async ({ data }) => {
            calls.push("episode");
            staged.episodes.push(data);
          },
        },
      };
      const result = await operation(tx);
      Object.assign(persisted, staged);
      return result;
    },
  };
  const dependencies = {
    prisma,
    resolveEmploymentLevelFromDesignation: async (args) => {
      calls.push("employment-level");
      assert.deepEqual(args, {
        organizationId: "organization-1",
        designationId: "designation-1",
      });
      return { levelNumber: 1 };
    },
    provisionNewEmployeeEntitlements: async (args) => {
      calls.push("provision");
      assert.equal(args.actorUserId, "actor-1");
      assert.equal(args.employeeNumber, "CHR000011");
      assert.ok(args.tx, "Leave provisioning must receive the transaction client.");
      if (provisioningFails) throw new Error("PROVISIONING_FAILED");
      persisted.provisions.push(args.employeeNumber);
    },
  };
  return { persisted, calls, dependencies };
}

test("creates Employee, Episode 1 and provisions Leave in transaction order", async () => {
  const fixture = createFixture();
  const employee = await createEmployeeWithDependencies(
    {
      organizationId: "organization-1",
      actorUserId: "actor-1",
      input,
    },
    fixture.dependencies
  );

  assert.equal(employee.employeeNumber, "CHR000011");
  assert.equal(employee.email, "mary.ojoma@corporatehr.com");
  assert.equal(employee.gender, "FEMALE");
  assert.equal(employee.status, "PROBATION");
  assert.deepEqual(fixture.calls, [
    "employment-level",
    "sequence",
    "employee",
    "episode",
    "provision",
  ]);
  assert.equal(fixture.persisted.sequence, 11);
  assert.equal(fixture.persisted.employees.length, 1);
  assert.equal(fixture.persisted.episodes[0].sequenceNumber, 1);
  assert.equal(
    fixture.persisted.episodes[0].startDate.toISOString(),
    "2026-08-25T00:00:00.000Z"
  );
});

test("explicit hireDate is stored and becomes Episode 1 start date", async () => {
  const fixture = createFixture();
  const employee = await createEmployeeWithDependencies(
    {
      organizationId: "organization-1",
      actorUserId: "actor-1",
      input: { ...input, hireDate: "2026-09-01" },
    },
    fixture.dependencies
  );

  assert.equal(employee.hireDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(
    fixture.persisted.episodes[0].startDate.toISOString(),
    "2026-09-01T00:00:00.000Z"
  );
});

test("Leave provisioning failure rolls back sequence, Employee and Episode 1", async () => {
  const fixture = createFixture({ provisioningFails: true });

  await assert.rejects(
    createEmployeeWithDependencies(
      {
        organizationId: "organization-1",
        actorUserId: "actor-1",
        input,
      },
      fixture.dependencies
    ),
    /PROVISIONING_FAILED/
  );

  assert.equal(fixture.persisted.sequence, 10);
  assert.deepEqual(fixture.persisted.employees, []);
  assert.deepEqual(fixture.persisted.episodes, []);
  assert.deepEqual(fixture.persisted.provisions, []);
});

test("does not create EmployeeOnboarding during ordinary creation", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../src/services/employeeCreationService.js"
    ),
    "utf8"
  );
  assert.doesNotMatch(source, /employeeOnboarding\.(create|upsert)/);
});
