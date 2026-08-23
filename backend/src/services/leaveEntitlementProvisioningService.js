const prisma = require("../config/prisma");
const {
  policyEntitlementForService,
} = require("./leaveService");

const CURRENT_EMPLOYEE_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "LEAVE",
];

function validYear(value) {
  const year = Number(value || new Date().getFullYear());

  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error("INVALID_LEAVE_YEAR");
  }

  return year;
}

function normalizedList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))]
    : [];
}

function serviceDaysAt(employee, date) {
  const episode = employee.employmentEpisodes?.[0];

  return episode
    ? Math.max(
        0,
        Math.floor(
          (date - new Date(episode.startDate)) / 86400000
        )
      )
    : 0;
}

async function buildProvisioningPreview({
  organizationId,
  leaveYear,
  policyIds,
  employeeNumbers,
  tx = prisma,
}) {
  if (!organizationId) {
    throw new Error("ORGANIZATION_REQUIRED");
  }

  const year = validYear(leaveYear);
  const selectedPolicyIds = normalizedList(policyIds);
  const selectedEmployees = normalizedList(employeeNumbers);
  const effectiveDate = new Date(Date.UTC(year, 0, 1));
  const evaluationDate =
    year === new Date().getFullYear()
      ? new Date()
      : new Date(Date.UTC(year, 11, 31));
  const policyWhere = {
    organizationId,
    status: "ACTIVE",
    isActive: true,
    effectiveFrom: {
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    },
    OR: [
      { effectiveTo: null },
      { effectiveTo: { gte: effectiveDate } },
    ],
    ...(selectedPolicyIds.length
      ? { id: { in: selectedPolicyIds } }
      : {}),
  };

  const employeeWhere = {
    organizationId,
    status: { in: CURRENT_EMPLOYEE_STATUSES },
    employmentEpisodes: { some: { endDate: null } },
    ...(selectedEmployees.length
      ? { employeeNumber: { in: selectedEmployees } }
      : {}),
  };

  const [policies, employees, existingBalances] =
    await Promise.all([
      tx.leavePolicy.findMany({
        where: policyWhere,
        include: { leaveType: true },
        orderBy: [{ leaveType: { name: "asc" } }, { name: "asc" }],
      }),
      tx.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          employmentEpisodes: {
            where: { endDate: null },
            orderBy: { sequenceNumber: "desc" },
            take: 1,
            select: { startDate: true },
          },
        },
        orderBy: { employeeNumber: "asc" },
      }),
      tx.leaveBalance.findMany({
        where: {
          organizationId,
          leaveYear: year,
          ...(selectedEmployees.length
            ? {
                employee: {
                  employeeNumber: { in: selectedEmployees },
                },
              }
            : {}),
        },
        select: {
          id: true,
          employeeId: true,
          leaveTypeId: true,
          openingBalance: true,
          accrued: true,
          carriedForward: true,
          used: true,
          adjusted: true,
        },
      }),
    ]);

  if (selectedPolicyIds.length && !policies.length) {
    throw new Error("TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND");
  }

  const existingByKey = new Map(
    existingBalances.map((balance) => [
      `${balance.employeeId}:${balance.leaveTypeId}`,
      balance,
    ])
  );

  const candidates = [];

  for (const employee of employees) {
    const serviceDays = serviceDaysAt(employee, evaluationDate);

    for (const policy of policies) {
      const eligibility = policy.eligibilityRules || {};
      const minimumServiceDays = Number(
        eligibility.minimumServiceDays ||
          policy.minimumServiceDays ||
          0
      );
      const eligible = serviceDays >= minimumServiceDays;
      const proposedOpeningBalance =
        policyEntitlementForService(policy, {
          eligibility: { measured: { serviceDays } },
        });
      const key = `${employee.id}:${policy.leaveTypeId}`;

      candidates.push({
        key,
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        department: employee.department,
        designation: employee.designation,
        policyId: policy.id,
        policyName: policy.name,
        policyVersion: policy.versionNumber,
        leaveTypeId: policy.leaveTypeId,
        leaveType: policy.leaveType,
        leaveYear: year,
        unit:
          policy.entitlementRules?.unit ||
          (policy.leaveType?.unit === "HOURS"
            ? "HOURS"
            : "WORKING_DAYS"),
        proposedOpeningBalance,
        minimumServiceDays,
        serviceDays,
        eligible,
        existingBalance: existingByKey.get(key) || null,
      });
    }
  }

  const applicableCounts = new Map();

  candidates
    .filter((row) => row.eligible)
    .forEach((row) => {
      applicableCounts.set(
        row.key,
        (applicableCounts.get(row.key) || 0) + 1
      );
    });

  const rows = candidates.map((row) => {
    let status = "READY";

    if (!row.eligible) status = "INELIGIBLE";
    else if ((applicableCounts.get(row.key) || 0) > 1) {
      status = "POLICY_CONFLICT";
    } else if (row.existingBalance) status = "EXISTS";

    return {
      ...row,
      status,
      message:
        status === "POLICY_CONFLICT"
          ? "Select only one active policy for this employee and leave type."
          : status === "EXISTS"
            ? "Existing balance will be preserved."
            : status === "INELIGIBLE"
              ? "Employee does not yet satisfy the supported minimum-service rule."
              : "Missing entitlement is ready to provision.",
    };
  });

  return {
    leaveYear: year,
    policies: policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      versionNumber: policy.versionNumber,
      leaveType: policy.leaveType,
      entitlement: Number(policy.entitlementDays),
      unit:
        policy.entitlementRules?.unit ||
        policy.leaveType?.unit,
    })),
    employees: employees.map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: [
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      department: employee.department,
      designation: employee.designation,
    })),
    rows,
    summary: {
      ready: rows.filter((row) => row.status === "READY").length,
      existing: rows.filter((row) => row.status === "EXISTS").length,
      ineligible: rows.filter((row) => row.status === "INELIGIBLE").length,
      conflicts: rows.filter((row) => row.status === "POLICY_CONFLICT").length,
    },
  };
}

async function provisionEntitlements({
  organizationId,
  actorUserId,
  leaveYear,
  policyIds,
  employeeNumbers,
  reason,
}) {
  const explanation = String(reason || "").trim();

  if (!explanation) {
    throw new Error("PROVISIONING_REASON_REQUIRED");
  }

  return prisma.$transaction(
    async (tx) => {
      const preview = await buildProvisioningPreview({
        organizationId,
        leaveYear,
        policyIds,
        employeeNumbers,
        tx,
      });

      if (preview.summary.conflicts) {
        const error = new Error(
          "MULTIPLE_POLICIES_FOR_LEAVE_TYPE"
        );
        error.details = preview.rows
          .filter(
            (row) => row.status === "POLICY_CONFLICT"
          )
          .map((row) => ({
            employeeNumber: row.employeeNumber,
            leaveType: row.leaveType?.name,
            policyName: row.policyName,
          }));
        throw error;
      }

      const ready = preview.rows.filter(
        (row) => row.status === "READY"
      );
      const created = [];

      for (const row of ready) {
        const balance = await tx.leaveBalance.upsert({
          where: {
            organizationId_employeeId_leaveTypeId_leaveYear:
              {
                organizationId,
                employeeId: row.employeeId,
                leaveTypeId: row.leaveTypeId,
                leaveYear: preview.leaveYear,
              },
          },
          update: {},
          create: {
            organizationId,
            employeeId: row.employeeId,
            leaveTypeId: row.leaveTypeId,
            leaveYear: preview.leaveYear,
            openingBalance: row.proposedOpeningBalance,
          },
        });

        created.push({
          balanceId: balance.id,
          employeeNumber: row.employeeNumber,
          policyId: row.policyId,
          policyName: row.policyName,
          openingBalance: row.proposedOpeningBalance,
          unit: row.unit,
        });
      }

      const byPolicy = new Map();

      created.forEach((row) => {
        const values = byPolicy.get(row.policyId) || [];
        values.push(row);
        byPolicy.set(row.policyId, values);
      });

      for (const [policyId, allocations] of byPolicy) {
        await tx.leavePolicyAudit.create({
          data: {
            organizationId,
            leavePolicyId: policyId,
            actorUserId: actorUserId || null,
            action: "ENTITLEMENT_CHANGED",
            previousValue: {
              operation: "ENTITLEMENT_PROVISIONING",
              leaveYear: preview.leaveYear,
            },
            newValue: {
              operation: "ENTITLEMENT_PROVISIONING",
              leaveYear: preview.leaveYear,
              allocations,
            },
            reason: explanation,
          },
        });
      }

      return {
        leaveYear: preview.leaveYear,
        created,
        createdCount: created.length,
        preservedCount: preview.summary.existing,
        ineligibleCount: preview.summary.ineligible,
      };
    },
    { isolationLevel: "Serializable" }
  );
}

module.exports = {
  buildProvisioningPreview,
  provisionEntitlements,
};
