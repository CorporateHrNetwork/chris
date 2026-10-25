const assert = require("node:assert/strict");
const { test } = require("node:test");
const { saveEmployeeEditChangeSet } = require("../src/services/employeeEditChangeSetService");

function makeFixture() {
  const oldDepartment = { id: "dep-old", organizationId: "org", name: "Operations" };
  const newDepartment = { id: "dep-new", organizationId: "org", name: "Finance" };
  const currentDesignation = {
    id: "des-current", organizationId: "org", name: "Officer", departmentId: oldDepartment.id,
    careerLevel: 2, employmentLevel: { levelNumber: 2, isActive: true },
    departmentEligibility: [{ departmentId: newDepartment.id }],
  };
  const targetDesignation = {
    id: "des-target", organizationId: "org", name: "Officer", departmentId: oldDepartment.id,
    careerLevel: 2, employmentLevel: { levelNumber: 2, isActive: true },
    departmentEligibility: [{ departmentId: newDepartment.id }],
  };
  const initialEmployee = {
    id: "emp", employeeNumber: "ZLL000107", organizationId: "org", firstName: "Jonah", middleName: "Mary",
    lastName: "Eneh", email: "jonah@example.com", phone: "08000000000", gender: "MALE", status: "ACTIVE",
    hireDate: new Date("2020-01-01"), confirmationDate: null, exitDate: null, nationalIdentificationNumber: null,
    locationId: "loc", employmentType: "Full-Time", departmentId: oldDepartment.id, department: oldDepartment,
    designationId: currentDesignation.id, designation: currentDesignation, location: { id: "loc", name: "Branch" }, user: null,
  };
  const committed = { employee: structuredClone(initialEmployee), events: [], audits: [], employeeUpdates: [], levelAssignment: null };
  const prisma = {
    $transaction: async (callback) => {
      const working = structuredClone(committed);
      const tx = {
        employee: {
          findFirst: async ({ where }) => {
            if (where.email) return null;
            return working.employee.employeeNumber === (where.employeeNumber || where.OR?.[1]?.employeeNumber)
              ? structuredClone(working.employee)
              : null;
          },
          update: async ({ data }) => {
            working.employeeUpdates.push(structuredClone(data));
            Object.assign(working.employee, data);
            if (data.departmentId === newDepartment.id) working.employee.department = newDepartment;
            if (data.departmentId === oldDepartment.id) working.employee.department = oldDepartment;
            if (data.designationId === targetDesignation.id) working.employee.designation = targetDesignation;
            if (data.designationId === currentDesignation.id) working.employee.designation = currentDesignation;
            return structuredClone(working.employee);
          },
        },
        designation: { findFirst: async ({ where }) => where.id === targetDesignation.id ? targetDesignation : currentDesignation },
        department: { findFirst: async ({ where }) => where.id === newDepartment.id ? newDepartment : oldDepartment },
        organization: { findUnique: async () => ({ slug: "zermatt-liquor-limited" }) },
        organizationEmploymentLevel: { findUnique: async ({ where }) => ({ levelNumber: where.organizationId_levelNumber.levelNumber, isActive: true, code: `L${where.organizationId_levelNumber.levelNumber}`, name: `Level ${where.organizationId_levelNumber.levelNumber}` }) },
        organizationLocation: { findFirst: async () => ({ id: "loc" }) },
        organizationAudit: { create: async ({ data }) => { working.audits.push(structuredClone(data)); return data; } },
        employeeLifecycleEvent: { create: async ({ data }) => { working.events.push(structuredClone(data)); return data; } },
        employeeEmploymentLevelAssignment: {
          findFirst: async () => structuredClone(working.levelAssignment),
          findMany: async () => working.levelAssignment ? [structuredClone(working.levelAssignment)] : [],
          create: async ({ data }) => {
            working.levelAssignment = { id: "level-assignment", ...structuredClone(data), employmentLevel: { levelNumber: data.levelNumber, isActive: true, code: `L${data.levelNumber}`, name: `Level ${data.levelNumber}` } };
            return structuredClone(working.levelAssignment);
          },
          update: async ({ data }) => {
            working.levelAssignment = { ...working.levelAssignment, ...structuredClone(data) };
            return structuredClone(working.levelAssignment);
          },
        },
      };
      const result = await callback(tx);
      Object.assign(committed, working);
      return result;
    },
  };
  return { prisma, committed, initialEmployee, oldDepartment, newDepartment, currentDesignation, targetDesignation };
}

const base = { organizationId: "org", employeeNumber: "ZLL000107", actorUserId: "hr-user" };

test("gender-only change updates only gender", async () => {
  const fixture = makeFixture();
  await saveEmployeeEditChangeSet(fixture.prisma, { ...base, changes: { profile: { gender: "FEMALE" } } });
  assert.deepEqual(fixture.committed.employeeUpdates, [{ gender: "FEMALE" }]);
  assert.equal(fixture.committed.employee.departmentId, "dep-old");
  assert.equal(fixture.committed.employee.designationId, "des-current");
  assert.equal(fixture.committed.employee.employmentType, "Full-Time");
});

test("Department and Gender share one transaction and retain unchanged fields", async () => {
  const fixture = makeFixture();
  await saveEmployeeEditChangeSet(fixture.prisma, {
    ...base,
    changes: {
      profile: { gender: "OTHER" },
      jobChange: { departmentId: "dep-new", designationId: "des-current", effectiveDate: "2026-10-01", reason: "Reassignment" },
    },
  });
  assert.deepEqual(fixture.committed.employeeUpdates, [{ gender: "OTHER", departmentId: "dep-new", designationId: "des-current" }]);
  assert.equal(fixture.committed.events.length, 1);
  assert.equal(fixture.committed.events[0].reason, "Reassignment");
  assert.equal(fixture.committed.employee.employmentType, "Full-Time");
  assert.equal(fixture.committed.employee.designationId, "des-current");
});

test("Employment Type-only change updates only Employment Type and audits it", async () => {
  const fixture = makeFixture();
  await saveEmployeeEditChangeSet(fixture.prisma, {
    ...base,
    changes: { employmentType: { employmentType: "Part-time", reason: "Reduced hours" } },
  });
  assert.deepEqual(fixture.committed.employeeUpdates, [{ employmentType: "Part-time" }]);
  assert.equal(fixture.committed.audits.length, 1);
  assert.equal(fixture.committed.employee.departmentId, "dep-old");
  assert.equal(fixture.committed.employee.gender, "MALE");
});

test("Job Change, Gender, Employment Type and Employment Level save together without replacing untouched values", async () => {
  const fixture = makeFixture();
  await saveEmployeeEditChangeSet(fixture.prisma, {
    ...base,
    changes: {
      profile: { gender: "FEMALE" },
      jobChange: { departmentId: "dep-new", designationId: "des-current", effectiveDate: "2026-10-01", reason: "Reassignment" },
      employmentType: { employmentType: "Part-time", reason: "Reduced hours" },
      employmentLevel: { levelNumber: 3, effectiveFrom: "2026-10-15", reason: "Level reclassification" },
    },
  });
  assert.deepEqual(fixture.committed.employeeUpdates, [{ gender: "FEMALE", departmentId: "dep-new", designationId: "des-current", employmentType: "Part-time" }]);
  assert.equal(fixture.committed.events.length, 1);
  assert.equal(fixture.committed.events[0].effectiveDate.toISOString().slice(0, 10), "2026-10-01");
  assert.ok(fixture.committed.levelAssignment);
  assert.equal(fixture.committed.levelAssignment.levelNumber, 3);
  assert.equal(fixture.committed.levelAssignment.effectiveFrom.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(fixture.committed.levelAssignment.reason, "Level reclassification");
  assert.equal(fixture.committed.employee.firstName, "Jonah");
  assert.equal(fixture.committed.employee.locationId, "loc");
  assert.equal(fixture.committed.audits.length, 2, "both Employment Type and Employment Level changes receive their audits");
});

test("no-change save performs no database update or history write", async () => {
  const fixture = makeFixture();
  fixture.committed.employee.locationId = null;
  const result = await saveEmployeeEditChangeSet(fixture.prisma, { ...base, changes: {} });
  assert.equal(result.changed, false);
  assert.deepEqual(fixture.committed.employeeUpdates, []);
  assert.deepEqual(fixture.committed.events, []);
  assert.deepEqual(fixture.committed.audits, []);
});

test("a late Employment Level validation failure rolls back earlier Job Change and profile writes", async () => {
  const fixture = makeFixture();
  await assert.rejects(() => saveEmployeeEditChangeSet(fixture.prisma, {
    ...base,
    changes: {
      profile: { gender: "FEMALE" },
      jobChange: { departmentId: "dep-new", designationId: "des-current", effectiveDate: "2026-10-01", reason: "Reassignment" },
      employmentLevel: { levelNumber: 3, effectiveFrom: "", reason: "Level change" },
    },
  }), (error) => error.code === "INVALID_EFFECTIVE_DATE");
  assert.equal(fixture.committed.employee.gender, "MALE");
  assert.equal(fixture.committed.employee.departmentId, "dep-old");
  assert.deepEqual(fixture.committed.employeeUpdates, []);
  assert.deepEqual(fixture.committed.events, []);
});
