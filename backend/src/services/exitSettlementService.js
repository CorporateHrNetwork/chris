const prisma = require("../config/prisma");
const { getEosbStatement } = require("./eosbService");
const { calculateLeaveAllowance } = require("./zermattLeaveAllowanceService");
const { getActivePolicy } = require("./nigeriaPayrollComplianceService");

const SYSTEM_VARIABLE_CODES = {
  publicHolidayDays: { code: "ALW-PH", name: "Public Holiday Days", calculationType: "GROSS_DIV_26_X2" },
  extraDayOvertime: { code: "ALW-EDOT", name: "Extra Day Work Overtime", calculationType: "GROSS_DIV_26_X1_5" },
  extraHoursOvertime: { code: "ALW-EHOT", name: "Extra Hours Work Overtime", calculationType: "GROSS_DIV_208_X1_25" },
};

function settlementError(code, message, statusCode = 409, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function money(value) {
  const result = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(result) || result < 0) {
    throw settlementError(
      "INVALID_SETTLEMENT_AMOUNT",
      "Settlement amounts must be valid non-negative numbers.",
      400
    );
  }
  return Object.is(result, -0) ? 0 : result;
}

function quantity(value, label) {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0) {
    throw settlementError("INVALID_SETTLEMENT_QUANTITY", `${label} must be a valid non-negative number.`, 400);
  }
  return Math.round(result * 10000) / 10000;
}

function text(value) {
  return String(value ?? "").trim();
}

function dateText(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

async function assertActor(tx, organizationId, actorUserId) {
  const actor = await tx.user.findFirst({
    where: { id: actorUserId, organizationId, isActive: true },
    select: { id: true },
  });
  if (!actor) {
    throw settlementError("INVALID_SETTLEMENT_ACTOR", "An active organization user is required.", 403);
  }
}

function variableValue(calculationType, monthlyGross, units) {
  const gross = Number(monthlyGross || 0);
  const qty = Number(units || 0);
  switch (calculationType) {
    case "GROSS_DIV_26_X2":
      return money((gross / 26) * qty * 2);
    case "GROSS_DIV_26_X1_5":
      return money((gross / 26) * qty * 1.5);
    case "GROSS_DIV_208_X1_25":
      return money((gross / 208) * qty * 1.25);
    default:
      return 0;
  }
}

function countPayrollDaysThroughDate(lastWorkingDay) {
  const exit = new Date(lastWorkingDay);
  if (Number.isNaN(exit.getTime())) return 0;
  const cursor = new Date(Date.UTC(exit.getUTCFullYear(), exit.getUTCMonth(), 1));
  const end = new Date(Date.UTC(exit.getUTCFullYear(), exit.getUTCMonth(), exit.getUTCDate()));
  let days = 0;
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.min(days, 26);
}

function serviceYearProration(hireDate, exitDate) {
  const hire = new Date(hireDate);
  const exit = new Date(exitDate);
  if ([hire, exit].some((value) => Number.isNaN(value.getTime())) || exit < hire) {
    return { factor: 0, serviceYearStart: null, serviceYearEnd: null, accruedDays: 0, serviceYearDays: 0 };
  }

  const anniversaryFor = (year) => {
    const month = hire.getUTCMonth();
    const day = hire.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
  };

  let serviceYearStart = anniversaryFor(exit.getUTCFullYear());
  if (serviceYearStart > exit) serviceYearStart = anniversaryFor(exit.getUTCFullYear() - 1);
  if (serviceYearStart < hire) serviceYearStart = hire;
  const serviceYearEnd = anniversaryFor(serviceYearStart.getUTCFullYear() + 1);

  const DAY = 86400000;
  const accruedDays = Math.max(0, Math.floor((exit - serviceYearStart) / DAY) + 1);
  const serviceYearDays = Math.max(1, Math.round((serviceYearEnd - serviceYearStart) / DAY));
  return {
    factor: Math.min(1, round4(accruedDays / serviceYearDays)),
    serviceYearStart: dateText(serviceYearStart),
    serviceYearEnd: dateText(serviceYearEnd),
    accruedDays,
    serviceYearDays,
  };
}

async function effectiveSalaryRate(client, organizationId, employeeId, asOf) {
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","amount","currency","frequency","effectiveFrom","effectiveTo","status"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1 AND "employeeId"=$2
        AND "status"='ACTIVE'
        AND "effectiveFrom" <= $3::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3::date)
      ORDER BY "effectiveFrom" DESC,"createdAt" DESC
      LIMIT 1`,
    organizationId,
    employeeId,
    dateText(asOf)
  );
  return rows[0] || null;
}

async function exitPayrollPeriod(client, organizationId, lastWorkingDay) {
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","code","name","periodStart","periodEnd","payDate"
       FROM "payroll_periods"
      WHERE "organizationId"=$1
        AND $2::date BETWEEN "periodStart" AND "periodEnd"
      ORDER BY "periodStart" DESC
      LIMIT 1`,
    organizationId,
    dateText(lastWorkingDay)
  );
  return rows[0] || null;
}

async function approvedPayrollLine(client, organizationId, employeeId, periodId) {
  if (!periodId) return null;
  const rows = await client.$queryRawUnsafe(
    `SELECT pl."id",pl."baseSalary",pl."grossPay",pl."netPreview",pl."details",pr."id" AS "runId",pr."status"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pl."employeeId"=$2 AND pr."periodId"=$3
        AND pr."status"='APPROVED'
      ORDER BY pr."approvedAt" DESC NULLS LAST,pr."updatedAt" DESC
      LIMIT 1`,
    organizationId,
    employeeId,
    periodId
  );
  return rows[0] || null;
}

async function exitPeriodVariableInputs(client, organizationId, employeeId, periodId) {
  if (!periodId) return [];
  return client.$queryRawUnsafe(
    `SELECT pvc."code",pvc."name",pvc."calculationType",pvi."quantity",pvi."manualAmount",pvi."reference",pvi."remarks"
       FROM "payroll_variable_inputs" pvi
       JOIN "payroll_variable_components" pvc
         ON pvc."id"=pvi."componentId" AND pvc."organizationId"=pvi."organizationId"
      WHERE pvi."organizationId"=$1
        AND pvi."employeeId"=$2
        AND pvi."payrollPeriodId"=$3
        AND pvi."status"='ACTIVE'
        AND pvc."code" IN ('ALW-PH','ALW-EDOT','ALW-EHOT')`,
    organizationId,
    employeeId,
    periodId
  );
}

async function authoritativeBalances(client, organizationId, employeeId) {
  const [loanRows, advanceRows] = await Promise.all([
    client.$queryRawUnsafe(
      `SELECT COALESCE(SUM("outstandingAmount"),0) AS "amount"
         FROM "payroll_loans"
        WHERE "organizationId"=$1 AND "employeeId"=$2
          AND "status" IN ('ACTIVE','APPROVED','DISBURSED')`,
      organizationId,
      employeeId
    ),
    client.$queryRawUnsafe(
      `SELECT COALESCE(SUM("outstandingAmount"),0) AS "amount"
         FROM "payroll_salary_advances"
        WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'`,
      organizationId,
      employeeId
    ),
  ]);
  return {
    loanBalance: money(loanRows[0]?.amount),
    salaryAdvanceBalance: money(advanceRows[0]?.amount),
  };
}

async function deriveSystemItems({ client, organizationId, exit, input }) {
  const lastWorkingDay = exit.lastWorkingDay;
  const rate = await effectiveSalaryRate(client, organizationId, exit.employeeId, lastWorkingDay);
  if (!rate) {
    throw settlementError(
      "EXIT_SETTLEMENT_SALARY_RATE_REQUIRED",
      `No effective salary rate exists for ${exit.employee.employeeNumber} on the exit date.`,
      409
    );
  }

  const monthlyGross = money(rate.amount);
  const dayRate = money(monthlyGross / 26);
  const hourRate = money(monthlyGross / 208);
  const [period, eosb, balances, policy] = await Promise.all([
    exitPayrollPeriod(client, organizationId, lastWorkingDay),
    getEosbStatement({
      organizationId,
      employeeNumber: exit.employee.employeeNumber,
      asOf: lastWorkingDay,
      prismaClient: client,
    }),
    authoritativeBalances(client, organizationId, exit.employeeId),
    getActivePolicy({
      organizationId,
      asOf: dateText(lastWorkingDay),
      prismaClient: client,
    }),
  ]);

  const [approvedLine, variableInputs] = await Promise.all([
    approvedPayrollLine(client, organizationId, exit.employeeId, period?.id),
    exitPeriodVariableInputs(client, organizationId, exit.employeeId, period?.id),
  ]);

  const salaryDaysEntitled = approvedLine ? 0 : countPayrollDaysThroughDate(lastWorkingDay);
  const outstandingSalary = approvedLine ? 0 : money(dayRate * salaryDaysEntitled);

  let fullLeaveAllowance = 0;
  let leaveAllowanceProration = { factor: 0, accruedDays: 0, serviceYearDays: 0, serviceYearStart: null, serviceYearEnd: null };
  if (policy) {
    const leaveCalc = calculateLeaveAllowance({
      scheduledMonthlyGross: monthlyGross,
      salaryStructure: policy.salaryStructure,
    });
    fullLeaveAllowance = money(leaveCalc.leaveAllowance);
    leaveAllowanceProration = serviceYearProration(exit.employee.hireDate, lastWorkingDay);
  }
  const annualLeaveAllowance = money(fullLeaveAllowance * leaveAllowanceProration.factor);

  const unitsByCode = new Map();
  for (const row of variableInputs) {
    const current = unitsByCode.get(row.code) || { quantity: 0, references: [] };
    current.quantity += Number(row.quantity || 0);
    if (row.reference) current.references.push(row.reference);
    unitsByCode.set(row.code, current);
  }

  const publicHoliday = unitsByCode.get(SYSTEM_VARIABLE_CODES.publicHolidayDays.code) || { quantity: 0, references: [] };
  const extraDay = unitsByCode.get(SYSTEM_VARIABLE_CODES.extraDayOvertime.code) || { quantity: 0, references: [] };
  const extraHours = unitsByCode.get(SYSTEM_VARIABLE_CODES.extraHoursOvertime.code) || { quantity: 0, references: [] };

  const gratuity = money(eosb?.eosb?.accruedValue || 0);
  const publicHolidayAmount = approvedLine ? 0 : variableValue("GROSS_DIV_26_X2", monthlyGross, publicHoliday.quantity);
  const extraDayAmount = approvedLine ? 0 : variableValue("GROSS_DIV_26_X1_5", monthlyGross, extraDay.quantity);
  const extraHoursAmount = approvedLine ? 0 : variableValue("GROSS_DIV_208_X1_25", monthlyGross, extraHours.quantity);

  return {
    salary: {
      salaryRateId: rate.id,
      monthlyGross,
      currency: rate.currency || "NGN",
      dayRate,
      hourRate,
      dayBasis: 26,
      hourBasis: 208,
      effectiveFrom: dateText(rate.effectiveFrom),
      effectiveTo: dateText(rate.effectiveTo),
    },
    payrollPeriod: period
      ? {
          id: period.id,
          code: period.code,
          name: period.name,
          periodStart: dateText(period.periodStart),
          periodEnd: dateText(period.periodEnd),
          approvedPayrollAlreadyExists: Boolean(approvedLine),
          approvedPayrollRunId: approvedLine?.runId || null,
        }
      : null,
    credits: {
      gratuityEosb: {
        amount: gratuity,
        source: "EOSB_ACCOUNT",
        formula: eosb?.eosb?.formula || "Gross Monthly Salary × (Actual Days in Service ÷ 30) × 7.5%",
      },
      annualLeaveAllowance: {
        amount: annualLeaveAllowance,
        fullAnnualAmount: fullLeaveAllowance,
        prorationFactor: leaveAllowanceProration.factor,
        accruedDays: leaveAllowanceProration.accruedDays,
        serviceYearDays: leaveAllowanceProration.serviceYearDays,
        serviceYearStart: leaveAllowanceProration.serviceYearStart,
        serviceYearEnd: leaveAllowanceProration.serviceYearEnd,
        source: "ZERMATT_LEAVE_ALLOWANCE_FORMULA",
        formula: "Annual Leave Allowance × accrued service-year day fraction",
      },
      outstandingSalary: {
        amount: outstandingSalary,
        daysEntitled: salaryDaysEntitled,
        source: approvedLine ? "APPROVED_PAYROLL_ALREADY_PAID" : "EXIT_MONTH_PAYROLL_PRORATION",
        formula: approvedLine ? "0 — approved payroll already exists for exit period" : "Gross Monthly Salary ÷ 26 × entitled payroll days to exit date",
      },
      publicHolidayDays: {
        amount: publicHolidayAmount,
        quantity: quantity(publicHoliday.quantity, "Public Holiday Days"),
        source: "RECORDED_PAYROLL_VARIABLE_INPUT",
        formula: "Gross ÷ 26 × Public Holiday Days × 2",
        references: publicHoliday.references,
      },
      extraDayOvertime: {
        amount: extraDayAmount,
        quantity: quantity(extraDay.quantity, "Extra Day Overtime"),
        source: "RECORDED_PAYROLL_VARIABLE_INPUT",
        formula: "Gross ÷ 26 × Extra Days × 1.5",
        references: extraDay.references,
      },
      extraHoursOvertime: {
        amount: extraHoursAmount,
        quantity: quantity(extraHours.quantity, "Extra Hours Overtime"),
        source: "RECORDED_PAYROLL_VARIABLE_INPUT",
        formula: "Gross ÷ 208 × Extra Hours × 1.25",
        references: extraHours.references,
      },
    },
    debits: {
      loanBalance: {
        amount: balances.loanBalance,
        source: "LOAN_ACCOUNT",
      },
      salaryAdvance: {
        amount: balances.salaryAdvanceBalance,
        source: "SALARY_ADVANCE_ACCOUNT",
      },
    },
  };
}

function calculateAccount(system, input) {
  const noticePayDays = quantity(input.noticePayDays, "In Lieu of Notice Pay days");
  const noticeDeductionDays = quantity(input.noticeDeductionDays, "In Lieu of Notice Deduction days");

  const credits = {
    gratuityEosb: money(system.credits.gratuityEosb.amount),
    annualLeaveAllowance: money(system.credits.annualLeaveAllowance.amount),
    outstandingSalary: money(system.credits.outstandingSalary.amount),
    publicHolidayDays: money(system.credits.publicHolidayDays.amount),
    extraDayOvertime: money(system.credits.extraDayOvertime.amount),
    extraHoursOvertime: money(system.credits.extraHoursOvertime.amount),
    bonusGift: money(input.bonusGift),
    noticePay: money(system.salary.dayRate * noticePayDays),
    previousSalaryShortPaid: money(input.previousSalaryShortPaid),
  };

  const debits = {
    loanBalance: money(system.debits.loanBalance.amount),
    salaryAdvance: money(system.debits.salaryAdvance.amount),
    noticeDeduction: money(system.salary.dayRate * noticeDeductionDays),
    unreturnedUniform: money(input.unreturnedUniform),
    previousSalaryOverpaid: money(input.previousSalaryOverpaid),
  };

  const totalCredits = money(Object.values(credits).reduce((sum, value) => sum + value, 0));
  const totalDebits = money(Object.values(debits).reduce((sum, value) => sum + value, 0));
  const netSettlement = Math.round((totalCredits - totalDebits) * 100) / 100;

  return {
    credits,
    debits,
    totalCredits,
    totalDebits,
    netSettlement,
    noticePayDays,
    noticeDeductionDays,
  };
}

async function getSettlementPreview({
  organizationId,
  exitProcessId,
  input = {},
  prismaClient = prisma,
}) {
  const exit = await prismaClient.employeeExitProcess.findFirst({
    where: { id: exitProcessId, organizationId },
    include: {
      employee: {
        include: {
          department: { select: { code: true, name: true } },
          designation: { select: { code: true, name: true } },
          costCentre: { select: { code: true, name: true } },
          location: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!exit) throw settlementError("EXIT_PROCESS_NOT_FOUND", "Exit process not found.", 404);

  const system = await deriveSystemItems({
    client: prismaClient,
    organizationId,
    exit,
    input,
  });
  const account = calculateAccount(system, input);

  return {
    employee: {
      id: exit.employee.id,
      employeeNumber: exit.employee.employeeNumber,
      employeeName: [exit.employee.firstName, exit.employee.middleName, exit.employee.lastName]
        .filter(Boolean)
        .join(" "),
      employmentType: exit.employee.employmentType || null,
      hireDate: dateText(exit.employee.hireDate),
      department: exit.employee.department?.name || null,
      departmentCode: exit.employee.department?.code || null,
      designation: exit.employee.designation?.name || null,
      designationCode: exit.employee.designation?.code || null,
      costCentre: exit.employee.costCentre?.name || null,
      costCentreCode: exit.employee.costCentre?.code || null,
      branch: exit.employee.location?.name || null,
      branchCode: exit.employee.location?.code || null,
    },
    exit: {
      id: exit.id,
      exitType: exit.exitType,
      reason: exit.reason,
      noticeDate: dateText(exit.noticeDate),
      lastWorkingDay: dateText(exit.lastWorkingDay),
      status: exit.status,
      financialStatus: exit.financialStatus,
    },
    salary: system.salary,
    payrollPeriod: system.payrollPeriod,
    systemItems: system,
    hrInputs: {
      bonusGift: money(input.bonusGift),
      noticePayDays: account.noticePayDays,
      previousSalaryShortPaid: money(input.previousSalaryShortPaid),
      noticeDeductionDays: account.noticeDeductionDays,
      unreturnedUniform: money(input.unreturnedUniform),
      previousSalaryOverpaid: money(input.previousSalaryOverpaid),
    },
    credits: account.credits,
    debits: account.debits,
    totals: {
      totalCredits: account.totalCredits,
      totalDebits: account.totalDebits,
      netSettlement: account.netSettlement,
    },
  };
}

async function calculateSettlement({
  organizationId,
  actorUserId,
  exitProcessId,
  input,
  prismaClient = prisma,
}) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);

    const existing = await tx.exitSettlement.findUnique({ where: { exitProcessId } });
    if (existing && !["DRAFT", "CALCULATED", "DISPUTED"].includes(existing.status)) {
      throw settlementError(
        "SETTLEMENT_IMMUTABLE",
        "Approved or paid settlement values cannot be recalculated."
      );
    }

    const preview = await getSettlementPreview({
      organizationId,
      exitProcessId,
      input,
      prismaClient: tx,
    });

    const values = {
      finalSalary: preview.credits.outstandingSalary,
      allowancePayable: money(
        preview.credits.publicHolidayDays +
        preview.credits.extraDayOvertime +
        preview.credits.extraHoursOvertime +
        preview.credits.bonusGift +
        preview.credits.previousSalaryShortPaid
      ),
      leavePayable: preview.credits.annualLeaveAllowance,
      noticePay: preview.credits.noticePay,
      gratuitySeverance: preview.credits.gratuityEosb,
      taxAdjustment: 0,
      pensionAdjustment: 0,
      loanRecovery: preview.debits.loanBalance,
      salaryAdvanceRecovery: preview.debits.salaryAdvance,
      otherRecovery: money(
        preview.debits.noticeDeduction +
        preview.debits.unreturnedUniform +
        preview.debits.previousSalaryOverpaid
      ),
      grossPayable: preview.totals.totalCredits,
      totalRecovery: preview.totals.totalDebits,
      netSettlement: preview.totals.netSettlement,
    };

    const snapshot = {
      version: "EXIT_SETTLEMENT_ACCOUNT_V2",
      employee: preview.employee,
      exit: preview.exit,
      salary: preview.salary,
      payrollPeriod: preview.payrollPeriod,
      creditItems: {
        gratuityEosb: {
          label: "Gratuity / EoSB",
          amount: preview.credits.gratuityEosb,
          ...preview.systemItems.credits.gratuityEosb,
          entryMode: "SYSTEM",
        },
        annualLeaveAllowance: {
          label: "Full / Prorated Annual Leave Allowance",
          amount: preview.credits.annualLeaveAllowance,
          ...preview.systemItems.credits.annualLeaveAllowance,
          entryMode: "SYSTEM",
        },
        outstandingSalary: {
          label: "Full / Prorated Outstanding Salary",
          amount: preview.credits.outstandingSalary,
          ...preview.systemItems.credits.outstandingSalary,
          entryMode: "SYSTEM",
        },
        publicHolidayDays: {
          label: "Public Holiday Days",
          amount: preview.credits.publicHolidayDays,
          ...preview.systemItems.credits.publicHolidayDays,
          entryMode: "SYSTEM",
        },
        extraDayOvertime: {
          label: "Extra Day Work Overtime",
          amount: preview.credits.extraDayOvertime,
          ...preview.systemItems.credits.extraDayOvertime,
          entryMode: "SYSTEM",
        },
        extraHoursOvertime: {
          label: "Extra Hours Work Overtime",
          amount: preview.credits.extraHoursOvertime,
          ...preview.systemItems.credits.extraHoursOvertime,
          entryMode: "SYSTEM",
        },
        bonusGift: {
          label: "Bonus / Gift",
          amount: preview.credits.bonusGift,
          entryMode: "HR",
        },
        noticePay: {
          label: "In Lieu of Notice Pay",
          amount: preview.credits.noticePay,
          days: preview.hrInputs.noticePayDays,
          dailyRate: preview.salary.dayRate,
          formula: "Gross ÷ 26 × HR-entered notice days",
          entryMode: "HR_DAYS_SYSTEM_VALUE",
        },
        previousSalaryShortPaid: {
          label: "Previous Salary Short Paid",
          amount: preview.credits.previousSalaryShortPaid,
          entryMode: "HR",
        },
      },
      debitItems: {
        loanBalance: {
          label: "Loan Balance",
          amount: preview.debits.loanBalance,
          source: "LOAN_ACCOUNT",
          entryMode: "SYSTEM",
        },
        salaryAdvance: {
          label: "Salary Advance",
          amount: preview.debits.salaryAdvance,
          source: "SALARY_ADVANCE_ACCOUNT",
          entryMode: "SYSTEM",
        },
        noticeDeduction: {
          label: "In Lieu of Notice Deduction",
          amount: preview.debits.noticeDeduction,
          days: preview.hrInputs.noticeDeductionDays,
          dailyRate: preview.salary.dayRate,
          formula: "Gross ÷ 26 × HR-entered deficient notice days",
          entryMode: "HR_DAYS_SYSTEM_VALUE",
        },
        unreturnedUniform: {
          label: "Unreturned Uniform",
          amount: preview.debits.unreturnedUniform,
          entryMode: "HR",
        },
        previousSalaryOverpaid: {
          label: "Previous Salary Overpaid",
          amount: preview.debits.previousSalaryOverpaid,
          entryMode: "HR",
        },
      },
      hrInputs: preview.hrInputs,
      totals: preview.totals,
      calculatedAt: new Date().toISOString(),
    };

    const settlement = await tx.exitSettlement.upsert({
      where: { exitProcessId },
      create: {
        organizationId,
        exitProcessId,
        employeeId: preview.employee.id,
        currency: preview.salary.currency || text(input.currency) || "NGN",
        ...values,
        status: "CALCULATED",
        calculationSnapshot: snapshot,
        notes: text(input.notes) || null,
        calculatedByUserId: actorUserId,
        calculatedAt: new Date(),
      },
      update: {
        currency: preview.salary.currency || text(input.currency) || existing.currency,
        ...values,
        status: "CALCULATED",
        calculationSnapshot: snapshot,
        notes: text(input.notes) || null,
        calculatedByUserId: actorUserId,
        calculatedAt: new Date(),
        approvedByUserId: null,
        approvedAt: null,
      },
    });

    await tx.employeeExitProcess.update({
      where: { id: exitProcessId },
      data: { financialStatus: "PENDING", finalClosureAt: null },
    });

    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "ExitSettlement",
        entityId: settlement.id,
        action: "EXIT_SETTLEMENT_ACCOUNT_CALCULATED",
        newValue: snapshot,
        reason: text(input.notes) || "Employee Exit Settlement Account calculated",
      },
    });

    return settlement;
  }, { isolationLevel: "Serializable" });
}

async function submitSettlement({ organizationId, actorUserId, exitProcessId, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || settlement.status !== "CALCULATED") {
      throw settlementError("SETTLEMENT_NOT_CALCULATED", "A calculated settlement is required before submission.");
    }
    return tx.exitSettlement.update({
      where: { id: settlement.id },
      data: { status: "PENDING_APPROVAL" },
    });
  });
}

async function approveSettlement({ organizationId, actorUserId, exitProcessId, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || settlement.status !== "PENDING_APPROVAL") {
      throw settlementError("SETTLEMENT_NOT_PENDING_APPROVAL", "Settlement must be pending approval.");
    }
    // Employee Exit Settlement is a Head HR prepare-and-approve control.
    // External Auditor review, GM payout approval and Accounts payout processing
    // occur on the printed settlement document outside CHRiS.
    const zeroBalance = Math.round(Number(settlement.netSettlement || 0) * 100) / 100 === 0;
    const updated = await tx.exitSettlement.update({
      where: { id: settlement.id },
      data: {
        status: zeroBalance ? "PAID" : "PAYMENT_PENDING",
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        paidAt: zeroBalance ? new Date() : null,
        notes: text(notes) || settlement.notes,
      },
    });
    await tx.employeeExitProcess.update({
      where: { id: exitProcessId },
      data: {
        financialStatus: zeroBalance ? "PAID" : "APPROVED",
        finalClosureAt: zeroBalance ? new Date() : null,
      },
    });
    return updated;
  });
}

async function recordSettlementPayment({ organizationId, actorUserId, exitProcessId, amount, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || !["PAYMENT_PENDING", "PARTIALLY_PAID"].includes(settlement.status)) {
      throw settlementError("SETTLEMENT_NOT_PAYABLE", "Settlement is not awaiting payment.");
    }
    const paid = money(amount);
    const amountPaid = money(Number(settlement.amountPaid) + paid);
    const settlementTarget = money(Math.abs(Number(settlement.netSettlement)));
    if (amountPaid > settlementTarget) {
      throw settlementError("SETTLEMENT_OVERPAYMENT", "Payment or recovery exceeds the approved settlement balance.");
    }
    const final = amountPaid === settlementTarget;
    const updated = await tx.exitSettlement.update({
      where: { id: settlement.id },
      data: {
        amountPaid,
        status: final ? "PAID" : "PARTIALLY_PAID",
        paidByUserId: actorUserId,
        paidAt: final ? new Date() : null,
        notes: text(notes) || settlement.notes,
      },
    });
    if (final) {
      await tx.employeeExitProcess.update({
        where: { id: exitProcessId },
        data: { financialStatus: "PAID", finalClosureAt: new Date() },
      });
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

async function waiveSettlement({ organizationId, actorUserId, exitProcessId, reason, prismaClient = prisma }) {
  const notes = text(reason);
  if (!notes) {
    throw settlementError("WAIVER_REASON_REQUIRED", "A documented waiver reason is required.", 400);
  }
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || !["PENDING_APPROVAL", "APPROVED", "PAYMENT_PENDING"].includes(settlement.status)) {
      throw settlementError("SETTLEMENT_NOT_WAIVABLE", "Settlement is not eligible for waiver.");
    }
    if (settlement.calculatedByUserId === actorUserId) {
      throw settlementError(
        "SETTLEMENT_MAKER_CHECKER_REQUIRED",
        "The calculator cannot waive the same settlement."
      );
    }
    const updated = await tx.exitSettlement.update({
      where: { id: settlement.id },
      data: {
        status: "WAIVED",
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        notes,
      },
    });
    await tx.employeeExitProcess.update({
      where: { id: exitProcessId },
      data: { financialStatus: "WAIVED", finalClosureAt: new Date() },
    });
    return updated;
  });
}

async function getSettlement({ organizationId, exitProcessId, prismaClient = prisma }) {
  return prismaClient.exitSettlement.findFirst({ where: { organizationId, exitProcessId } });
}

module.exports = {
  SYSTEM_VARIABLE_CODES,
  variableValue,
  countPayrollDaysThroughDate,
  serviceYearProration,
  calculateAccount,
  getSettlementPreview,
  calculateSettlement,
  submitSettlement,
  approveSettlement,
  recordSettlementPayment,
  waiveSettlement,
  getSettlement,
  settlementError,
};
