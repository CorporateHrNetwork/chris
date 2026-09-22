const prisma = require("../src/config/prisma");
const payroll = require("../src/services/payrollOperationsService");
const nigeriaPayroll = require("../src/services/nigeriaPayrollComplianceService");
const { getPayrollReadiness } = require("../src/services/payrollReadinessService");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const PERIOD_START = "2026-09-01";
const PERIOD_END = "2026-09-30";
const SIMULATION_PERIOD_CODE = "SIM-SEP-2026";
const SIMULATION_PERIOD_NAME = "September 2026 Controlled Payroll Simulation";
const EXPECTED_EMPLOYEES = 312;

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function jsonValue(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sum(rows, selector) {
  return round2(rows.reduce((total, row) => total + Number(selector(row) || 0), 0));
}

function countBy(rows, selector) {
  return rows.reduce((result, row) => {
    const key = String(selector(row) ?? "UNKNOWN");
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function distinctByEmploymentType(rows, selector) {
  const result = {};
  for (const row of rows) {
    const type = row.employmentType || "UNKNOWN";
    if (!result[type]) result[type] = new Set();
    result[type].add(selector(row));
  }
  return Object.fromEntries(
    Object.entries(result).map(([key, values]) => [key, Array.from(values).sort()])
  );
}

async function findOrCreateSimulationPeriod(organizationId) {
  const exact = await prisma.$queryRawUnsafe(
    `SELECT "id","code","name","periodStart","periodEnd","payDate","status"
       FROM "payroll_periods"
      WHERE "organizationId"=$1
        AND "periodStart"=$2::date
        AND "periodEnd"=$3::date
      ORDER BY "createdAt" ASC
      LIMIT 1`,
    organizationId,
    PERIOD_START,
    PERIOD_END
  );

  if (exact[0]) {
    if (exact[0].status === "CLOSED") {
      throw new Error(
        `The existing ${exact[0].code} payroll period is CLOSED. A closed operational period will not be reopened by the simulation script.`
      );
    }
    return {
      createdForSimulation: false,
      period: {
        ...exact[0],
        periodStart: new Date(exact[0].periodStart).toISOString().slice(0, 10),
        periodEnd: new Date(exact[0].periodEnd).toISOString().slice(0, 10),
        payDate: exact[0].payDate ? new Date(exact[0].payDate).toISOString().slice(0, 10) : null,
      },
    };
  }

  const created = await payroll.createPeriod({
    organizationId,
    actorUserId: null,
    input: {
      code: SIMULATION_PERIOD_CODE,
      name: SIMULATION_PERIOD_NAME,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      payDate: null,
      reason: "Controlled ZERMATT Release-1 payroll simulation; no payment or approval action",
    },
  });
  return { createdForSimulation: true, period: created };
}

async function liabilitySnapshot(organizationId) {
  const [advances, loans] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "records",
              COUNT(*) FILTER (WHERE "status"='ACTIVE' AND "outstandingAmount">0)::int AS "activeRecords",
              COALESCE(SUM("outstandingAmount"),0) AS "outstandingTotal",
              COALESCE(SUM(LEAST("outstandingAmount","installmentAmount"))
                FILTER (WHERE "status"='ACTIVE' AND "outstandingAmount">0 AND "recoveryStartDate" <= $2::date),0) AS "scheduledRecovery"
         FROM "payroll_salary_advances"
        WHERE "organizationId"=$1`,
      organizationId,
      PERIOD_END
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "records",
              COUNT(*) FILTER (WHERE "status"='ACTIVE' AND "outstandingAmount">0)::int AS "activeRecords",
              COALESCE(SUM("outstandingAmount"),0) AS "outstandingTotal",
              COALESCE(SUM(LEAST("outstandingAmount","installmentAmount"))
                FILTER (WHERE "status"='ACTIVE' AND "outstandingAmount">0 AND "recoveryStartDate" <= $2::date),0) AS "scheduledRecovery"
         FROM "payroll_loans"
        WHERE "organizationId"=$1`,
      organizationId,
      PERIOD_END
    ),
  ]);

  const normalize = (row = {}) => ({
    records: Number(row.records || 0),
    activeRecords: Number(row.activeRecords || 0),
    outstandingTotal: Number(row.outstandingTotal || 0),
    scheduledRecovery: Number(row.scheduledRecovery || 0),
  });

  return {
    salaryAdvances: normalize(advances[0]),
    loans: normalize(loans[0]),
  };
}

async function loadPersistedSimulation(organizationId, runId) {
  const [runRows, lineRows, approvalRows] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT pr."id",pr."status",pr."statutoryStatus",pr."employeeCount",
              pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",
              pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate"
         FROM "payroll_runs" pr
         JOIN "payroll_periods" pp
           ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
        WHERE pr."organizationId"=$1 AND pr."id"=$2
        LIMIT 1`,
      organizationId,
      runId
    ),
    prisma.$queryRawUnsafe(
      `SELECT pl."id",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
              pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",
              pl."grossPay",pl."netPreview",pl."statutoryStatus",pl."details",e."employmentType"
         FROM "payroll_run_lines" pl
         JOIN "employees" e
           ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
        WHERE pl."organizationId"=$1 AND pl."runId"=$2
        ORDER BY pl."employeeNumber" ASC`,
      organizationId,
      runId
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count"
         FROM "payroll_approvals"
        WHERE "organizationId"=$1 AND "runId"=$2`,
      organizationId,
      runId
    ),
  ]);

  return {
    run: runRows[0],
    lines: lineRows.map((row) => ({
      ...row,
      baseSalary: Number(row.baseSalary || 0),
      allowances: Number(row.allowances || 0),
      deductions: Number(row.deductions || 0),
      advanceRecovery: Number(row.advanceRecovery || 0),
      loanRecovery: Number(row.loanRecovery || 0),
      grossPay: Number(row.grossPay || 0),
      netPreview: Number(row.netPreview || 0),
      details: jsonValue(row.details, {}),
    })),
    approvalHistoryCount: Number(approvalRows[0]?.count || 0),
  };
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, slug: true, country: true, currency: true },
  });
  if (!organization) throw new Error("ZERMATT LIQUOR LIMITED organization was not found.");

  const readiness = await getPayrollReadiness({ organizationId: organization.id });
  if (!readiness.executionEnabled || !readiness.statutoryCalculationEnabled) {
    const blocked = (readiness.employees || [])
      .filter((employee) => !employee.calculationReady)
      .slice(0, 25)
      .map((employee) => ({ employeeNumber: employee.employeeNumber, blockers: employee.blockers }));
    throw new Error(
      `Payroll simulation is blocked: calculation-ready ${readiness.summary?.calculationReady || 0}/${readiness.summary?.currentEmployees || 0}; ` +
      `statutoryCalculationEnabled=${readiness.statutoryCalculationEnabled}. Sample blockers: ${JSON.stringify(blocked)}`
    );
  }

  if (Number(readiness.summary.currentEmployees) !== EXPECTED_EMPLOYEES) {
    throw new Error(
      `Expected ${EXPECTED_EMPLOYEES} current ZERMATT employees for this controlled gate, found ${readiness.summary.currentEmployees}. Reconcile workforce before simulation.`
    );
  }

  const { createdForSimulation, period } = await findOrCreateSimulationPeriod(organization.id);
  const liabilitiesBefore = await liabilitySnapshot(organization.id);

  const calculated = await nigeriaPayroll.executeNigeriaDraftPayroll({
    organizationId: organization.id,
    actorUserId: null,
    periodId: period.id,
  });

  const persisted = await loadPersistedSimulation(
    organization.id,
    calculated.run?.id
  );
  if (!persisted.run) throw new Error("Draft payroll run was not persisted.");
  if (persisted.run.status !== "DRAFT") {
    throw new Error(`Simulation safety violation: expected DRAFT run, found ${persisted.run.status}.`);
  }

  const liabilitiesAfter = await liabilitySnapshot(organization.id);
  if (
    round2(liabilitiesBefore.salaryAdvances.outstandingTotal) !== round2(liabilitiesAfter.salaryAdvances.outstandingTotal) ||
    round2(liabilitiesBefore.loans.outstandingTotal) !== round2(liabilitiesAfter.loans.outstandingTotal)
  ) {
    throw new Error("Simulation safety violation: a Loan or Salary Advance outstanding balance changed during DRAFT calculation.");
  }

  const lines = persisted.lines;
  const partTime = lines.filter((row) => row.employmentType === "Part-time");
  const partTimeStatutoryViolations = partTime
    .filter((row) => {
      const statutory = row.details?.statutory || {};
      return [
        statutory.payeTax,
        statutory.employeePension,
        statutory.employerPension,
        statutory.nhfEmployee,
      ].some((value) => Math.abs(Number(value || 0)) > 0.001);
    })
    .map((row) => row.employeeNumber);

  const workdayViolations = lines
    .filter((row) => {
      const standardDays = Number(row.details?.attendance?.standardDays);
      return row.employmentType === "Part-time" ? standardDays !== 16 : standardDays !== 26;
    })
    .map((row) => ({
      employeeNumber: row.employeeNumber,
      employmentType: row.employmentType,
      standardDays: row.details?.attendance?.standardDays,
    }));

  const calculatedDeductionTotal = sum(
    lines,
    (row) => row.deductions + row.advanceRecovery + row.loanRecovery
  );
  const persistedDeductionTotal = Number(persisted.run.deductionTotal || 0);
  const totalsMatch = Math.abs(calculatedDeductionTotal - persistedDeductionTotal) < 0.01;

  const report = {
    mode: "CONTROLLED_DRAFT_SIMULATION",
    organization: organization.name,
    period: {
      code: persisted.run.periodCode,
      name: persisted.run.periodName,
      start: new Date(persisted.run.periodStart).toISOString().slice(0, 10),
      end: new Date(persisted.run.periodEnd).toISOString().slice(0, 10),
      payDate: persisted.run.payDate ? new Date(persisted.run.payDate).toISOString().slice(0, 10) : null,
      createdForSimulation,
    },
    controls: {
      runStatus: persisted.run.status,
      statutoryStatus: persisted.run.statutoryStatus,
      approvalHistoryCount: persisted.approvalHistoryCount,
      submitted: false,
      approved: false,
      paymentTransmissionEnabled: false,
      loanOrAdvanceBalancesChanged: false,
      note: "This script creates/recalculates a DRAFT only. It never submits or approves the run and never transmits payment/remittance instructions.",
    },
    readiness: {
      currentEmployees: readiness.summary.currentEmployees,
      employmentReady: readiness.summary.employmentReady,
      compensationReady: readiness.summary.compensationReady,
      calculationReady: readiness.summary.calculationReady,
      paymentReady: readiness.summary.paymentReady,
      paymentFinalizationReady: readiness.summary.paymentFinalizationReady,
      taxRecorded: readiness.summary.taxRecorded,
      pensionRecorded: readiness.summary.pensionRecorded,
      executionEnabled: readiness.executionEnabled,
      statutoryCalculationEnabled: readiness.statutoryCalculationEnabled,
      paymentFinalizationEnabled: readiness.paymentFinalizationEnabled,
      paymentExceptions: (readiness.employees || [])
        .filter((employee) => !employee.paymentReady)
        .map((employee) => employee.employeeNumber),
    },
    population: {
      runLines: lines.length,
      employmentTypeCounts: countBy(lines, (row) => row.employmentType),
      standardDaysByEmploymentType: distinctByEmploymentType(
        lines,
        (row) => Number(row.details?.attendance?.standardDays)
      ),
      attendanceSourceCounts: countBy(
        lines,
        (row) => row.details?.attendance?.source || "UNKNOWN"
      ),
      workdayViolations: workdayViolations.slice(0, 25),
    },
    payrollTotals: {
      gross: Number(persisted.run.grossTotal || 0),
      employeeStatutoryAndCustomDeductions: sum(lines, (row) => row.deductions),
      salaryAdvanceRecovery: sum(lines, (row) => row.advanceRecovery),
      loanRecovery: sum(lines, (row) => row.loanRecovery),
      deductionTotal: persistedDeductionTotal,
      calculatedDeductionTotal,
      deductionTotalsMatch: totalsMatch,
      netPreview: Number(persisted.run.netPreviewTotal || 0),
      paye: sum(lines, (row) => row.details?.statutory?.payeTax),
      employeePension: sum(lines, (row) => row.details?.statutory?.employeePension),
      employerPension: sum(lines, (row) => row.details?.statutory?.employerPension),
      employerNSITF: sum(lines, (row) => row.details?.statutory?.nsitfEmployer),
      employerITF: sum(lines, (row) => row.details?.statutory?.itfEmployerAccrual),
      zeroNetEmployees: lines.filter((row) => Number(row.netPreview) === 0).length,
      negativeNetEmployees: lines.filter((row) => Number(row.netPreview) < 0).length,
    },
    liabilities: {
      salaryAdvances: {
        ...liabilitiesBefore.salaryAdvances,
        actualDraftRecovery: sum(lines, (row) => row.advanceRecovery),
      },
      loans: {
        ...liabilitiesBefore.loans,
        actualDraftRecovery: sum(lines, (row) => row.loanRecovery),
      },
    },
    partTimeControl: {
      expectedEmployees: 38,
      actualEmployees: partTime.length,
      statutoryDeductionViolations: partTimeStatutoryViolations,
      passed: partTime.length === 38 && partTimeStatutoryViolations.length === 0,
    },
    acceptance: {
      expectedRunLines: EXPECTED_EMPLOYEES,
      runLineCountPassed: lines.length === EXPECTED_EMPLOYEES,
      workdayCyclePassed: workdayViolations.length === 0,
      partTimeStatutoryExemptionPassed:
        partTime.length === 38 && partTimeStatutoryViolations.length === 0,
      deductionTotalsPassed: totalsMatch,
      noNegativeNetPassed: lines.every((row) => Number(row.netPreview) >= 0),
      liabilitiesUnchangedAtDraft: true,
    },
  };

  report.acceptance.overallPassed = Object.entries(report.acceptance)
    .filter(([key]) => key !== "expectedRunLines")
    .every(([, value]) => value === true);

  console.log(JSON.stringify(report, null, 2));

  if (!report.acceptance.overallPassed) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
