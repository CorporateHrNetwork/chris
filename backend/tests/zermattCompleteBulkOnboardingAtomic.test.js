const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmployeeWithDependencies } = require("../src/services/employeeCreationService");

function fixture({ failOnTasks = false } = {}) {
  const saved = { employees: [], salaryRows: [], levels: [], onboardings: [], tasks: [], episodes: [], audits: [] };
  let sequence = 0;
  const prisma = {
    employee: { findFirst: async () => null },
    department: { findFirst: async () => ({ id: "dep", name: "Human Resources", isActive: true }) },
    designation: { findFirst: async () => ({ id: "des", departmentId: "dep", careerLevel: 203, isActive: true }) },
    organizationLocation: { findFirst: async () => ({ id: "loc", isActive: true }) },
    costCentre: { findFirst: async () => ({ id: "cc", isActive: true }) },
    $transaction: async (action) => {
      const staged = { employees: [], salaryRows: [], levels: [], onboardings: [], tasks: [], episodes: [], audits: [] };
      const tx = {
        organization: { update: async () => ({ employeeNumberSequence: ++sequence, slug: "zermatt-liquor-limited" }) },
        employee: { create: async ({ data }) => {
          const row = { id: "emp", ...data, createdAt: new Date("2026-09-01T00:00:00Z") };
          staged.employees.push(row);
          return row;
        } },
        $executeRawUnsafe: async (query, ...values) => {
          if (query.includes('"payroll_salary_rates"')) staged.salaryRows.push(values);
          return 1;
        },
        organizationEmploymentLevel: { findUnique: async () => ({ levelNumber: 204, code: "L4", name: "Assistant Branch Management", isActive: true }) },
        employeeEmploymentLevelAssignment: { create: async ({ data }) => {
          staged.levels.push(data);
          return { id: "level-assignment", ...data };
        } },
        organizationAudit: { create: async ({ data }) => { staged.audits.push(data); return data; } },
        onboardingWorkflowTemplate: { findFirst: async () => ({ id: "template", sections: [
          { key: "personal-details", label: "Personal Details", items: ["Name"], required: true },
          { key: "payment-details", label: "Payment Details", items: ["Bank Account"], required: true },
        ] }) },
        employeeOnboarding: { create: async ({ data }) => {
          staged.onboardings.push(data);
          return { id: "onboarding", ...data };
        } },
        employeeOnboardingTask: { createMany: async ({ data }) => {
          if (failOnTasks) throw new Error("SIMULATED_TASK_FAILURE");
          staged.tasks.push(...data);
          return { count: data.length };
        } },
        employeeEmploymentEpisode: { create: async ({ data }) => { staged.episodes.push(data); } },
      };
      try {
        const result = await action(tx);
        for (const key of Object.keys(saved)) saved[key].push(...staged[key]);
        return result;
      } catch (error) {
        sequence -= 1;
        throw error;
      }
    },
  };
  const dependencies = {
    prisma,
    resolveEmploymentLevelFromDesignation: async () => ({ levelNumber: 203 }),
    provisionNewEmployeeEntitlements: async () => null,
    assertTenantNinAvailable: async (_db, options) => options.value,
  };
  const input = {
    name: "Example Test Employee",
    departmentId: "dep",
    designationId: "des",
    locationId: "loc",
    costCentreId: "cc",
    employmentType: "Full-Time",
    status: "Probation",
    hireDate: "2026-09-01",
    openingSalaryRate: { amount: 450000, currency: "NGN", effectiveFrom: "2026-09-01", reason: "Bulk onboarding test" },
    openingEmploymentLevelNumber: 204,
    onboardingTemplateId: "template",
    onboardingSectionData: {
      "personal-details": { fullName: "Example Test Employee", dateOfBirth: "1995-01-01" },
      "payment-details": { bankName: "Sample Bank", accountNumber: "0123456789" },
      "statutory-details": { pensionPfa: "Sample Pension Provider", pensionPin: "RSA-TEST" },
      "next-of-kin": { name: "Example Kin", guarantor1: "Example Guarantor" },
    },
  };
  return { saved, dependencies, input };
}

test("complete Zermatt bulk row creates salary, level, onboarding and tasks together", async () => {
  const { saved, dependencies, input } = fixture();
  const employee = await createEmployeeWithDependencies({
    organizationId: "org", actorUserId: "hr-user", input,
  }, dependencies);
  assert.equal(employee.employeeNumber, "ZLL000001");
  assert.equal(saved.employees.length, 1);
  assert.equal(saved.salaryRows.length, 1);
  assert.equal(saved.levels[0].levelNumber, 204);
  assert.equal(saved.onboardings[0].sectionData["payment-details"].accountNumber, "0123456789");
  assert.equal(saved.onboardings[0].status, "IN_PROGRESS");
  assert.equal(saved.tasks.length > 0, true);
  assert.equal(saved.episodes.length, 1);
  assert.ok(saved.audits.some((audit) => audit.entityType === "EmployeeEmploymentLevelAssignment"));
});

test("failed onboarding task creation rolls the entire bulk employee unit back", async () => {
  const { saved, dependencies, input } = fixture({ failOnTasks: true });
  await assert.rejects(
    createEmployeeWithDependencies({ organizationId: "org", actorUserId: "hr-user", input }, dependencies),
    /SIMULATED_TASK_FAILURE/
  );
  for (const key of Object.keys(saved)) assert.equal(saved[key].length, 0, key);
});

console.log("PASS: complete bulk onboarding transaction safeguards");
