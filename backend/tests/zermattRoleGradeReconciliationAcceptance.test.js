const test = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("../scripts/reconcile-zermatt-v3-role-grades.cjs");

function syntheticDb({ name = "Nnaemeka Kingsley Nnenna", salesOverride = null } = {}) {
  const designations = [
    { id: "sales", code: "ZOP-SR", name: "Sales Representative", careerLevel: 202 },
    { id: "senior-sales", code: "ZOP-SSR", name: "Senior Sales Representative", careerLevel: 202 },
    { id: "procurement", code: "PROC-CCO", name: "Procurement Cost Control Officer", careerLevel: 202 },
  ];
  const [firstName, middleName, lastName] = name.split(" ");
  const employee = { id: "person-85", employeeNumber: "ZLL000085", firstName, middleName, lastName,
    designationId: "procurement", status: "ACTIVE", exitDate: null };
  const sales = { id: "person-sales", employeeNumber: "ZLL000086", designationId: "sales", status: "ACTIVE", exitDate: null };
  return {
    organizationEmploymentLevel: { findMany: async () => [{ levelNumber: 201, code: "L1", name: "Operations Support" }, { levelNumber: 203, code: "L3", name: "Senior Officers and Branch Supervisors" }] },
    designation: { findMany: async () => designations },
    employee: { findFirst: async () => employee, findMany: async () => [employee, sales] },
    employeeEmploymentLevelAssignment: { findMany: async () => [
      { employeeId: employee.id, levelNumber: 202 },
      ...(salesOverride ? [{ employeeId: sales.id, levelNumber: salesOverride }] : []),
    ] },
  };
}

test("read-only Zermatt preview identifies the named L3 correction and all Sales Representative grades", async () => {
  const state = await inspect(syntheticDb(), "synthetic-zermatt");
  assert.equal(state.targetOverride, 202);
  assert.equal(state.employees.length, 2);
  assert.deepEqual(state.conflicts, []);
  assert.equal(state.designations.length, 3);
});

test("preview flags unrelated manual overrides instead of silently rewriting them", async () => {
  const state = await inspect(syntheticDb({ salesOverride: 203 }), "synthetic-zermatt");
  assert.deepEqual(state.conflicts.map((x) => x.employeeNumber), ["ZLL000086"]);
});

test("named employee identity must match before any correction can proceed", async () => {
  await assert.rejects(inspect(syntheticDb({ name: "Another Person Entirely" }), "synthetic-zermatt"),
    /ZERMATT_TARGET_EMPLOYEE_IDENTITY_MISMATCH/);
});
