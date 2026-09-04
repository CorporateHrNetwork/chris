const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPayrollReadiness,
} = require("../src/services/payrollReadinessService");

test("ZERMATT R1 payroll readiness remains tenant-scoped and blocks execution without authoritative compensation", async () => {
  const organizationId = "org-zermatt";

  const prismaClient = {
    employee: {
      async findMany(args) {
        assert.equal(args.where.organizationId, organizationId);
        assert.deepEqual(args.where.status.in, [
          "ACTIVE",
          "PROBATION",
          "LEAVE",
          "SUSPENDED",
        ]);

        return [
          {
            id: "emp-1",
            employeeNumber: "ZLL000001",
            firstName: "Jimoh",
            middleName: "Usman",
            lastName: "Sumonu",
            status: "ACTIVE",
            employmentType: "Full-Time",
            costCentreId: "cc-1",
          },
          {
            id: "emp-2",
            employeeNumber: "ZLL000002",
            firstName: "Ekle",
            middleName: null,
            lastName: "Adole",
            status: "ACTIVE",
            employmentType: "Full-Time",
            costCentreId: null,
          },
        ];
      },
    },
    employeeOnboarding: {
      async findMany(args) {
        assert.equal(args.where.organizationId, organizationId);
        assert.deepEqual(args.where.employeeId.in, ["emp-1", "emp-2"]);

        return [
          {
            employeeId: "emp-1",
            status: "COMPLETED",
            completionPercent: 100,
            updatedAt: new Date("2026-09-01T10:00:00Z"),
            createdAt: new Date("2026-08-20T10:00:00Z"),
            sectionData: {
              "payment-details": {
                bankName: "Zenith Bank",
                accountName: "Jimoh Usman Sumonu",
                accountNumber: "2006931036",
                payrollCurrency: "NGN",
                paymentMethod: "Bank Transfer",
              },
              "statutory-details": {
                taxIdentificationNumber: "6109421997",
                payeState: "Federal Capital Territory",
                pensionPfa: "Trustfund Pensions Limited",
                pensionPin: "PEN100493452413",
              },
            },
          },
          {
            employeeId: "emp-2",
            status: "IN_PROGRESS",
            completionPercent: 50,
            updatedAt: new Date("2026-09-01T09:00:00Z"),
            createdAt: new Date("2026-08-20T09:00:00Z"),
            sectionData: {
              "payment-details": {
                bankName: "Zenith Bank",
              },
            },
          },
        ];
      },
    },
    attendancePayrollSetting: {
      async findUnique(args) {
        assert.equal(args.where.organizationId, organizationId);
        return { basis: "ADMIN_ENTERED" };
      },
    },
  };

  const result = await getPayrollReadiness({
    organizationId,
    prismaClient,
  });

  assert.equal(result.executionEnabled, false);
  assert.equal(result.summary.currentEmployees, 2);
  assert.equal(result.summary.employmentReady, 1);
  assert.equal(result.summary.paymentReady, 1);
  assert.equal(result.summary.compensationReady, 0);
  assert.equal(result.summary.readyForExecution, 0);
  assert.equal(result.summary.attendanceBasis, "ADMIN_ENTERED");
  assert.equal(result.summary.taxRecorded, 1);
  assert.equal(result.summary.pensionRecorded, 1);
  assert.equal(result.employees[0].employeeNumber, "ZLL000001");
  assert.equal(result.employees[0].readyForExecution, false);
  assert.ok(
    result.employees[0].blockers.includes(
      "AUTHORITATIVE_COMPENSATION_RATE_NOT_CONFIGURED"
    )
  );
  assert.equal(
    result.systemBlockers[0].code,
    "AUTHORITATIVE_COMPENSATION_RATE_MODEL_NOT_AVAILABLE"
  );
});
