const crypto = require("crypto");
const prisma = require("../config/prisma");

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const PERIOD_STATUSES = ["OPEN", "LOCKED", "CLOSED"];
const COMPONENT_KINDS = ["ALLOWANCE", "DEDUCTION"];
const COMPONENT_CALCULATION_TYPES = ["FIXED", "PERCENT_GROSS"];
const ADVANCE_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

function operationalError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw operationalError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw operationalError("INVALID_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function positiveMoney(value, label, { allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw operationalError("INVALID_AMOUNT", `${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  return Math.round(number * 100) / 100;
}

function optionalMoney(value, label) {
  if (value === null || value === undefined || value === "") return null;
  return positiveMoney(value, label, { allowZero: true });
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function mapPeriod(row) {
  if (!row) return null;
  return {
    ...row,
    periodStart: row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : null,
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : null,
    payDate: row.payDate ? new Date(row.payDate).toISOString().slice(0, 10) : null,
  };
}

function mapSalaryRate(row) {
  if (!row) return null;
  return {
    ...row,
    amount: numberValue(row.amount),
    effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom).toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).toISOString().slice(0, 10) : null,
  };
}

function mapComponent(row) {
  if (!row) return null;
  return {
    ...row,
    amount: numberValue(row.amount),
    percentage: numberValue(row.percentage),
    effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom).toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).toISOString().slice(0, 10) : null,
  };
}

function mapAdvance(row) {
  if (!row) return null;
  return {
    ...row,
    amount: numberValue(row.amount),
    outstandingAmount: numberValue(row.outstandingAmount),
    installmentAmount: numberValue(row.installmentAmount),
    issuedDate: row.issuedDate ? new Date(row.issuedDate).toISOString().slice(0, 10) : null,
    recoveryStartDate: row.recoveryStartDate ? new Date(row.recoveryStartDate).toISOString().slice(0, 10) : null,
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    ...row,
    employeeCount: Number(row.employeeCount || 0),
    grossTotal: numberValue(row.grossTotal) || 0,
    deductionTotal: numberValue(row.deductionTotal) || 0,
    netPreviewTotal: numberValue(row.netPreviewTotal) || 0,
  };
}

function mapRunLine(row) {
  if (!row) return null;
  return {
    ...row,
    baseSalary: numberValue(row.baseSalary) || 0,
    allowances: numberValue(row.allowances) || 0,
    deductions: numberValue(row.deductions) || 0,
    advanceRecovery: numberValue(row.advanceRecovery) || 0,
    grossPay: numberValue(row.grossPay) || 0,
    netPreview: numberValue(row.netPreview) || 0,
  };
}

async function resolveEmployee(prismaClient, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) {
    throw operationalError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  }
  const employee = await prismaClient.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
    },
  });
  if (!employee) {
    throw operationalError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found in this organization.`, 404);
  }
  return employee;
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

async function writeAudit(prismaClient, { organizationId, actorUserId, entityType, entityId, action, previousValue, newValue, reason }) {
  await prismaClient.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType,
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function listPeriods({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id", "code", "name", "periodStart", "periodEnd", "payDate", "status", "createdAt", "updatedAt"
       FROM "payroll_periods"
      WHERE "organizationId" = $1
      ORDER BY "periodStart" DESC, "createdAt" DESC`,
    organizationId
  );
  return rows.map(mapPeriod);
}

async function getPeriod(prismaClient, organizationId, periodId) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id", "code", "name", "periodStart", "periodEnd", "payDate", "status", "createdAt", "updatedAt"
       FROM "payroll_periods"
      WHERE "organizationId" = $1 AND "id" = $2
      LIMIT 1`,
    organizationId,
    text(periodId)
  );
  if (!rows[0]) throw operationalError("PAYROLL_PERIOD_NOT_FOUND", "Payroll period not found.", 404);
  return mapPeriod(rows[0]);
}

async function createPeriod({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const code = text(input?.code).toUpperCase();
  const name = text(input?.name);
  const periodStart = dateOnly(input?.periodStart, "Period Start");
  const periodEnd = dateOnly(input?.periodEnd, "Period End");
  const payDate = input?.payDate ? dateOnly(input.payDate, "Pay Date") : null;
  if (!code || !name) throw operationalError("PAYROLL_PERIOD_FIELDS_REQUIRED", "Period Code and Name are required.");
  if (periodEnd < periodStart) throw operationalError("INVALID_PAYROLL_PERIOD", "Period End cannot be earlier than Period Start.");

  const overlap = await prismaClient.$queryRawUnsafe(
    `SELECT "id", "code" FROM "payroll_periods"
      WHERE "organizationId" = $1
        AND "periodStart" <= $2::date
        AND "periodEnd" >= $3::date
      LIMIT 1`,
    organizationId,
    periodEnd,
    periodStart
  );
  if (overlap[0]) {
    throw operationalError("PAYROLL_PERIOD_OVERLAP", `Payroll period overlaps existing period ${overlap[0].code}.`, 409);
  }

  const id = crypto.randomUUID();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_periods"
      ("id","organizationId","code","name","periodStart","periodEnd","payDate","status","createdByUserId")
     VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date,'OPEN',$8)
     RETURNING "id","code","name","periodStart","periodEnd","payDate","status","createdAt","updatedAt"`,
    id,
    organizationId,
    code,
    name,
    periodStart,
    periodEnd,
    payDate,
    actorUserId || null
  );
  const created = mapPeriod(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollPeriod",
    entityId: id,
    action: "CREATED",
    newValue: created,
    reason: input?.reason || "Payroll period created",
  });
  return created;
}

async function updatePeriodStatus({ organizationId, actorUserId, periodId, status, reason, prismaClient = prisma }) {
  const nextStatus = text(status).toUpperCase();
  if (!PERIOD_STATUSES.includes(nextStatus)) throw operationalError("INVALID_PAYROLL_PERIOD_STATUS", "Invalid payroll period status.");
  const previous = await getPeriod(prismaClient, organizationId, periodId);
  const allowed = {
    OPEN: ["LOCKED"],
    LOCKED: ["OPEN", "CLOSED"],
    CLOSED: [],
  };
  if (previous.status !== nextStatus && !allowed[previous.status]?.includes(nextStatus)) {
    throw operationalError("INVALID_PAYROLL_PERIOD_TRANSITION", `Payroll period cannot move from ${previous.status} to ${nextStatus}.`, 409);
  }
  if (previous.status === nextStatus) return previous;
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_periods"
        SET "status" = $3, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "organizationId" = $1 AND "id" = $2
      RETURNING "id","code","name","periodStart","periodEnd","payDate","status","createdAt","updatedAt"`,
    organizationId,
    periodId,
    nextStatus
  );
  const updated = mapPeriod(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollPeriod",
    entityId: periodId,
    action: "STATUS_CHANGED",
    previousValue: previous,
    newValue: updated,
    reason,
  });
  return updated;
}

async function listSalaryRates({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT sr."id", sr."employeeId", e."employeeNumber",
            CONCAT_WS(' ', e."firstName", e."middleName", e."lastName") AS "employeeName",
            sr."amount", sr."currency", sr."frequency", sr."effectiveFrom", sr."effectiveTo",
            sr."status", sr."reason", sr."createdAt", sr."updatedAt"
       FROM "payroll_salary_rates" sr
       JOIN "employees" e ON e."id" = sr."employeeId" AND e."organizationId" = sr."organizationId"
      WHERE sr."organizationId" = $1
      ORDER BY e."employeeNumber" ASC, sr."effectiveFrom" DESC`,
    organizationId
  );
  return rows.map(mapSalaryRate);
}

async function saveSalaryRate({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const amount = positiveMoney(input?.amount, "Monthly Gross Salary");
  const currency = text(input?.currency || "NGN").toUpperCase();
  const effectiveFrom = dateOnly(input?.effectiveFrom, "Effective From");
  const effectiveTo = input?.effectiveTo ? dateOnly(input.effectiveTo, "Effective To") : null;
  if (effectiveTo && effectiveTo < effectiveFrom) throw operationalError("INVALID_SALARY_RATE_DATES", "Effective To cannot be earlier than Effective From.");

  const overlapping = await prismaClient.$queryRawUnsafe(
    `SELECT "id", "effectiveFrom", "effectiveTo"
       FROM "payroll_salary_rates"
      WHERE "organizationId" = $1 AND "employeeId" = $2 AND "status" = 'ACTIVE'
        AND "effectiveFrom" <= COALESCE($4::date, DATE '9999-12-31')
        AND COALESCE("effectiveTo", DATE '9999-12-31') >= $3::date
      LIMIT 1`,
    organizationId,
    employee.id,
    effectiveFrom,
    effectiveTo
  );
  if (overlapping[0]) {
    throw operationalError("SALARY_RATE_OVERLAP", `An active salary rate already overlaps this effective period for ${employee.employeeNumber}. Retire or end-date the existing rate first.`, 409);
  }

  const id = crypto.randomUUID();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_salary_rates"
      ("id","organizationId","employeeId","amount","currency","frequency","effectiveFrom","effectiveTo","status","reason","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,'MONTHLY',$6::date,$7::date,'ACTIVE',$8,$9)
     RETURNING "id","employeeId","amount","currency","frequency","effectiveFrom","effectiveTo","status","reason","createdAt","updatedAt"`,
    id,
    organizationId,
    employee.id,
    amount,
    currency,
    effectiveFrom,
    effectiveTo,
    text(input?.reason) || null,
    actorUserId || null
  );
  const created = mapSalaryRate({ ...rows[0], employeeNumber: employee.employeeNumber, employeeName: employeeName(employee) });
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollSalaryRate",
    entityId: id,
    action: "CREATED",
    newValue: created,
    reason: input?.reason || "Effective-dated salary rate configured",
  });
  return created;
}

async function retireSalaryRate({ organizationId, actorUserId, rateId, effectiveTo, reason, prismaClient = prisma }) {
  const endDate = dateOnly(effectiveTo, "Effective To");
  const existingRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","amount","currency","frequency","effectiveFrom","effectiveTo","status","reason","createdAt","updatedAt"
       FROM "payroll_salary_rates" WHERE "organizationId" = $1 AND "id" = $2 LIMIT 1`,
    organizationId,
    rateId
  );
  if (!existingRows[0]) throw operationalError("SALARY_RATE_NOT_FOUND", "Salary rate not found.", 404);
  const previous = mapSalaryRate(existingRows[0]);
  if (endDate < previous.effectiveFrom) throw operationalError("INVALID_SALARY_RATE_DATES", "Effective To cannot be earlier than Effective From.");
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_salary_rates"
        SET "effectiveTo"=$3::date, "status"='RETIRED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING "id","employeeId","amount","currency","frequency","effectiveFrom","effectiveTo","status","reason","createdAt","updatedAt"`,
    organizationId,
    rateId,
    endDate
  );
  const updated = mapSalaryRate(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollSalaryRate",
    entityId: rateId,
    action: "RETIRED",
    previousValue: previous,
    newValue: updated,
    reason,
  });
  return updated;
}

async function listComponents({ organizationId, kind, prismaClient = prisma }) {
  const normalizedKind = text(kind).toUpperCase();
  if (!COMPONENT_KINDS.includes(normalizedKind)) throw operationalError("INVALID_PAYROLL_COMPONENT_KIND", "Invalid payroll component kind.");
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pc."id", pc."employeeId", e."employeeNumber",
            CASE WHEN pc."employeeId" IS NULL THEN 'All Employees' ELSE CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") END AS "employeeName",
            pc."kind", pc."code", pc."name", pc."calculationType", pc."amount", pc."percentage",
            pc."effectiveFrom", pc."effectiveTo", pc."oneTimePeriodId", pp."code" AS "oneTimePeriodCode",
            pc."taxable", pc."status", pc."notes", pc."createdAt", pc."updatedAt"
       FROM "payroll_components" pc
       LEFT JOIN "employees" e ON e."id" = pc."employeeId" AND e."organizationId" = pc."organizationId"
       LEFT JOIN "payroll_periods" pp ON pp."id" = pc."oneTimePeriodId" AND pp."organizationId" = pc."organizationId"
      WHERE pc."organizationId" = $1 AND pc."kind" = $2
      ORDER BY pc."createdAt" DESC`,
    organizationId,
    normalizedKind
  );
  return rows.map(mapComponent);
}

async function saveComponent({ organizationId, actorUserId, kind, input, prismaClient = prisma }) {
  const normalizedKind = text(kind).toUpperCase();
  if (!COMPONENT_KINDS.includes(normalizedKind)) throw operationalError("INVALID_PAYROLL_COMPONENT_KIND", "Invalid payroll component kind.");
  const code = text(input?.code).toUpperCase();
  const name = text(input?.name);
  const calculationType = text(input?.calculationType || "FIXED").toUpperCase();
  if (!code || !name) throw operationalError("PAYROLL_COMPONENT_FIELDS_REQUIRED", "Component Code and Name are required.");
  if (!COMPONENT_CALCULATION_TYPES.includes(calculationType)) throw operationalError("INVALID_PAYROLL_COMPONENT_CALCULATION", "Calculation Type must be FIXED or PERCENT_GROSS.");
  const amount = calculationType === "FIXED" ? positiveMoney(input?.amount, "Amount", { allowZero: true }) : null;
  const percentage = calculationType === "PERCENT_GROSS" ? positiveMoney(input?.percentage, "Percentage", { allowZero: true }) : null;
  const effectiveFrom = dateOnly(input?.effectiveFrom, "Effective From");
  const effectiveTo = input?.effectiveTo ? dateOnly(input.effectiveTo, "Effective To") : null;
  if (effectiveTo && effectiveTo < effectiveFrom) throw operationalError("INVALID_COMPONENT_DATES", "Effective To cannot be earlier than Effective From.");

  let employee = null;
  if (text(input?.employeeNumber)) employee = await resolveEmployee(prismaClient, organizationId, input.employeeNumber);
  let oneTimePeriod = null;
  if (text(input?.oneTimePeriodId)) oneTimePeriod = await getPeriod(prismaClient, organizationId, input.oneTimePeriodId);

  const id = crypto.randomUUID();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_components"
      ("id","organizationId","employeeId","kind","code","name","calculationType","amount","percentage","effectiveFrom","effectiveTo","oneTimePeriodId","taxable","status","notes","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,'ACTIVE',$14,$15)
     RETURNING "id","employeeId","kind","code","name","calculationType","amount","percentage","effectiveFrom","effectiveTo","oneTimePeriodId","taxable","status","notes","createdAt","updatedAt"`,
    id,
    organizationId,
    employee?.id || null,
    normalizedKind,
    code,
    name,
    calculationType,
    amount,
    percentage,
    effectiveFrom,
    effectiveTo,
    oneTimePeriod?.id || null,
    Boolean(input?.taxable),
    text(input?.notes) || null,
    actorUserId || null
  );
  const created = mapComponent({
    ...rows[0],
    employeeNumber: employee?.employeeNumber || null,
    employeeName: employee ? employeeName(employee) : "All Employees",
    oneTimePeriodCode: oneTimePeriod?.code || null,
  });
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: `Payroll${normalizedKind === "ALLOWANCE" ? "Allowance" : "Deduction"}`,
    entityId: id,
    action: "CREATED",
    newValue: created,
    reason: input?.notes || `${normalizedKind} configured`,
  });
  return created;
}

async function updateComponentStatus({ organizationId, actorUserId, componentId, status, reason, prismaClient = prisma }) {
  const nextStatus = text(status).toUpperCase();
  if (!["ACTIVE", "SUSPENDED", "RETIRED"].includes(nextStatus)) throw operationalError("INVALID_COMPONENT_STATUS", "Invalid component status.");
  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id","kind","code","name","status" FROM "payroll_components" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    componentId
  );
  if (!existing[0]) throw operationalError("PAYROLL_COMPONENT_NOT_FOUND", "Payroll component not found.", 404);
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_components" SET "status"=$3,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING "id","kind","code","name","status","updatedAt"`,
    organizationId,
    componentId,
    nextStatus
  );
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollComponent",
    entityId: componentId,
    action: "STATUS_CHANGED",
    previousValue: existing[0],
    newValue: rows[0],
    reason,
  });
  return rows[0];
}

async function listSalaryAdvances({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pa."id", pa."employeeId", e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            pa."amount",pa."outstandingAmount",pa."installmentAmount",pa."issuedDate",pa."recoveryStartDate",
            pa."status",pa."reason",pa."createdAt",pa."updatedAt"
       FROM "payroll_salary_advances" pa
       JOIN "employees" e ON e."id"=pa."employeeId" AND e."organizationId"=pa."organizationId"
      WHERE pa."organizationId"=$1
      ORDER BY pa."createdAt" DESC`,
    organizationId
  );
  return rows.map(mapAdvance);
}

async function createSalaryAdvance({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const amount = positiveMoney(input?.amount, "Advance Amount");
  const installmentAmount = positiveMoney(input?.installmentAmount, "Installment Amount");
  if (installmentAmount > amount) throw operationalError("INVALID_ADVANCE_INSTALLMENT", "Installment Amount cannot exceed the advance amount.");
  const issuedDate = dateOnly(input?.issuedDate, "Issued Date");
  const recoveryStartDate = dateOnly(input?.recoveryStartDate, "Recovery Start Date");
  const id = crypto.randomUUID();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_salary_advances"
      ("id","organizationId","employeeId","amount","outstandingAmount","installmentAmount","issuedDate","recoveryStartDate","status","reason","createdByUserId")
     VALUES ($1,$2,$3,$4,$4,$5,$6::date,$7::date,'ACTIVE',$8,$9)
     RETURNING "id","employeeId","amount","outstandingAmount","installmentAmount","issuedDate","recoveryStartDate","status","reason","createdAt","updatedAt"`,
    id,
    organizationId,
    employee.id,
    amount,
    installmentAmount,
    issuedDate,
    recoveryStartDate,
    text(input?.reason) || null,
    actorUserId || null
  );
  const created = mapAdvance({ ...rows[0], employeeNumber: employee.employeeNumber, employeeName: employeeName(employee) });
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollSalaryAdvance",
    entityId: id,
    action: "CREATED",
    newValue: created,
    reason: input?.reason || "Salary advance recorded",
  });
  return created;
}

async function updateSalaryAdvanceStatus({ organizationId, actorUserId, advanceId, status, reason, prismaClient = prisma }) {
  const nextStatus = text(status).toUpperCase();
  if (!ADVANCE_STATUSES.includes(nextStatus)) throw operationalError("INVALID_ADVANCE_STATUS", "Invalid salary advance status.");
  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status","outstandingAmount" FROM "payroll_salary_advances" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    advanceId
  );
  if (!existing[0]) throw operationalError("SALARY_ADVANCE_NOT_FOUND", "Salary advance not found.", 404);
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_salary_advances" SET "status"=$3,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING "id","status","outstandingAmount","updatedAt"`,
    organizationId,
    advanceId,
    nextStatus
  );
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollSalaryAdvance",
    entityId: advanceId,
    action: "STATUS_CHANGED",
    previousValue: existing[0],
    newValue: rows[0],
    reason,
  });
  return rows[0];
}

async function listPaidLeave({ organizationId, periodId, prismaClient = prisma }) {
  let period = null;
  if (periodId) period = await getPeriod(prismaClient, organizationId, periodId);
  const where = {
    organizationId,
    status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] },
    leaveType: { isPaid: true },
  };
  if (period) {
    where.startDate = { lte: new Date(`${period.periodEnd}T23:59:59.999Z`) };
    where.endDate = { gte: new Date(`${period.periodStart}T00:00:00.000Z`) };
  }
  const rows = await prismaClient.leaveRequest.findMany({
    where,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      requestedUnits: true,
      status: true,
      employee: { select: { employeeNumber: true, firstName: true, middleName: true, lastName: true } },
      leaveType: { select: { name: true, code: true, isPaid: true, unit: true } },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employee.employeeNumber,
    employeeName: employeeName(row.employee),
    leaveType: row.leaveType.name,
    leaveCode: row.leaveType.code,
    unit: row.leaveType.unit,
    requestedUnits: Number(row.requestedUnits || 0),
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    status: row.status,
    isPaid: true,
  }));
}

function componentValue(component, grossBase) {
  if (component.calculationType === "PERCENT_GROSS") {
    return Math.round((grossBase * Number(component.percentage || 0)) * 100) / 10000;
  }
  return Number(component.amount || 0);
}

async function listRuns({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pr."id",pr."periodId",pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
            pr."status",pr."employeeCount",pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",pr."statutoryStatus",
            pr."submittedAt",pr."approvedAt",pr."createdAt",pr."updatedAt"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pr."organizationId"=$1
      ORDER BY pp."periodStart" DESC, pr."createdAt" DESC`,
    organizationId
  );
  return rows.map((row) => ({ ...mapRun(row), ...mapPeriod(row) }));
}

async function listRunLines({ organizationId, runId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions","advanceRecovery","grossPay","netPreview","statutoryStatus","details","createdAt","updatedAt"
       FROM "payroll_run_lines"
      WHERE "organizationId"=$1 AND ($2::text IS NULL OR "runId"=$2)
      ORDER BY "employeeNumber" ASC`,
    organizationId,
    runId || null
  );
  return rows.map(mapRunLine);
}

async function executeDraftPayroll({ organizationId, actorUserId, periodId, prismaClient = prisma }) {
  const period = await getPeriod(prismaClient, organizationId, periodId);
  if (period.status === "CLOSED") throw operationalError("PAYROLL_PERIOD_CLOSED", "Closed payroll periods cannot be recalculated.", 409);

  const employees = await prismaClient.employee.findMany({
    where: { organizationId, status: { in: CURRENT_EMPLOYEE_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      employmentType: true,
      costCentreId: true,
    },
    orderBy: { employeeNumber: "asc" },
  });
  if (!employees.length) throw operationalError("NO_PAYROLL_EMPLOYEES", "There are no current employees to include in payroll.", 409);

  const rateRows = await prismaClient.$queryRawUnsafe(
    `SELECT DISTINCT ON ("employeeId") "employeeId","amount","currency","effectiveFrom","effectiveTo"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3::date)
      ORDER BY "employeeId", "effectiveFrom" DESC`,
    organizationId,
    period.periodEnd,
    period.periodStart
  );
  const rateByEmployee = new Map(rateRows.map((row) => [row.employeeId, row]));
  const missingRates = employees.filter((employee) => !rateByEmployee.has(employee.id));
  if (missingRates.length) {
    throw operationalError(
      "PAYROLL_SALARY_RATES_INCOMPLETE",
      `${missingRates.length} current employee(s) do not have an effective salary rate for ${period.code}.`,
      409,
      { employees: missingRates.slice(0, 25).map((row) => row.employeeNumber), total: missingRates.length }
    );
  }

  const structuralMissing = employees.filter((employee) => !text(employee.employmentType) || !text(employee.costCentreId));
  if (structuralMissing.length) {
    throw operationalError(
      "PAYROLL_EMPLOYMENT_AUTHORITY_INCOMPLETE",
      `${structuralMissing.length} current employee(s) are missing Employment Type or Cost Centre.`,
      409,
      { employees: structuralMissing.slice(0, 25).map((row) => row.employeeNumber), total: structuralMissing.length }
    );
  }

  const componentRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","kind","code","name","calculationType","amount","percentage","oneTimePeriodId"
       FROM "payroll_components"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3::date)
        AND ("oneTimePeriodId" IS NULL OR "oneTimePeriodId"=$4)`,
    organizationId,
    period.periodEnd,
    period.periodStart,
    period.id
  );

  const advanceRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","outstandingAmount","installmentAmount"
       FROM "payroll_salary_advances"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "outstandingAmount" > 0
        AND "recoveryStartDate" <= $2::date`,
    organizationId,
    period.periodEnd
  );

  const lines = employees.map((employee) => {
    const rate = rateByEmployee.get(employee.id);
    const baseSalary = Number(rate.amount || 0);
    const applicable = componentRows.filter((component) => !component.employeeId || component.employeeId === employee.id);
    const allowanceItems = applicable
      .filter((component) => component.kind === "ALLOWANCE")
      .map((component) => ({ ...component, value: componentValue(component, baseSalary) }));
    const grossPay = Math.round((baseSalary + allowanceItems.reduce((sum, row) => sum + row.value, 0)) * 100) / 100;
    const deductionItems = applicable
      .filter((component) => component.kind === "DEDUCTION")
      .map((component) => ({ ...component, value: componentValue(component, grossPay) }));
    const advances = advanceRows
      .filter((advance) => advance.employeeId === employee.id)
      .map((advance) => ({
        id: advance.id,
        value: Math.min(Number(advance.outstandingAmount || 0), Number(advance.installmentAmount || 0)),
      }));
    const allowances = Math.round(allowanceItems.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
    const deductions = Math.round(deductionItems.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
    const advanceRecovery = Math.round(advances.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
    const netPreview = Math.max(0, Math.round((grossPay - deductions - advanceRecovery) * 100) / 100);
    return {
      employee,
      currency: rate.currency || "NGN",
      baseSalary,
      allowances,
      deductions,
      advanceRecovery,
      grossPay,
      netPreview,
      details: {
        allowanceItems: allowanceItems.map(({ id, code, name, value }) => ({ id, code, name, value })),
        deductionItems: deductionItems.map(({ id, code, name, value }) => ({ id, code, name, value })),
        salaryAdvanceRecoveries: advances,
        statutoryControl: "PAYE/pension statutory calculations are not automatically derived in Release-1. Net Preview is not a payment instruction until manual statutory review is confirmed in Payroll Approvals.",
      },
    };
  });

  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "periodId"=$2 LIMIT 1`,
    organizationId,
    period.id
  );
  if (existing[0] && existing[0].status !== "DRAFT" && existing[0].status !== "REJECTED") {
    throw operationalError("PAYROLL_RUN_NOT_RECALCULABLE", `Payroll run is ${existing[0].status} and cannot be recalculated.`, 409);
  }

  const runId = existing[0]?.id || crypto.randomUUID();
  await prismaClient.$transaction(async (tx) => {
    if (existing[0]) {
      await tx.$executeRawUnsafe(`DELETE FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`, organizationId, runId);
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_runs" SET "status"='DRAFT',"employeeCount"=0,"grossTotal"=0,"deductionTotal"=0,"netPreviewTotal"=0,"statutoryStatus"='NOT_AUTOMATED',"submittedByUserId"=NULL,"approvedByUserId"=NULL,"submittedAt"=NULL,"approvedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,
        organizationId,
        runId
      );
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO "payroll_runs" ("id","organizationId","periodId","status","createdByUserId") VALUES ($1,$2,$3,'DRAFT',$4)`,
        runId,
        organizationId,
        period.id,
        actorUserId || null
      );
    }

    for (const line of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "payroll_run_lines"
          ("id","organizationId","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions","advanceRecovery","grossPay","netPreview","statutoryStatus","details")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'NOT_AUTOMATED',$14::jsonb)`,
        crypto.randomUUID(),
        organizationId,
        runId,
        line.employee.id,
        line.employee.employeeNumber,
        employeeName(line.employee),
        line.currency,
        line.baseSalary,
        line.allowances,
        line.deductions,
        line.advanceRecovery,
        line.grossPay,
        line.netPreview,
        JSON.stringify(line.details)
      );
    }

    const grossTotal = lines.reduce((sum, line) => sum + line.grossPay, 0);
    const deductionTotal = lines.reduce((sum, line) => sum + line.deductions + line.advanceRecovery, 0);
    const netPreviewTotal = lines.reduce((sum, line) => sum + line.netPreview, 0);
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "employeeCount"=$3,"grossTotal"=$4,"deductionTotal"=$5,"netPreviewTotal"=$6,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      lines.length,
      grossTotal,
      deductionTotal,
      netPreviewTotal
    );
  });

  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollRun",
    entityId: runId,
    action: existing[0] ? "RECALCULATED_DRAFT" : "CREATED_DRAFT",
    newValue: { periodId: period.id, periodCode: period.code, employeeCount: lines.length },
    reason: "Release-1 payroll draft calculation",
  });

  const runs = await listRuns({ organizationId, prismaClient });
  const run = runs.find((row) => row.id === runId);
  return { run, lines: await listRunLines({ organizationId, runId, prismaClient }) };
}

async function submitPayrollRun({ organizationId, actorUserId, runId, notes, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status","employeeCount" FROM "payroll_runs" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    runId
  );
  const run = rows[0];
  if (!run) throw operationalError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);
  if (run.status !== "DRAFT" && run.status !== "REJECTED") throw operationalError("INVALID_PAYROLL_RUN_STATE", "Only a Draft or Rejected payroll run can be submitted.", 409);
  if (!Number(run.employeeCount || 0)) throw operationalError("EMPTY_PAYROLL_RUN", "Payroll run has no employee lines.", 409);

  const approvalId = crypto.randomUUID();
  await prismaClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs" SET "status"='PENDING_APPROVAL',"submittedByUserId"=$3,"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      actorUserId || null
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_approvals" ("id","organizationId","runId","action","actorUserId","notes") VALUES ($1,$2,$3,'SUBMITTED',$4,$5)`,
      approvalId,
      organizationId,
      runId,
      actorUserId || null,
      text(notes) || null
    );
  });
  await writeAudit(prismaClient, { organizationId, actorUserId, entityType: "PayrollRun", entityId: runId, action: "SUBMITTED_FOR_APPROVAL", reason: notes });
  return { runId, status: "PENDING_APPROVAL" };
}

async function decidePayrollRun({ organizationId, actorUserId, runId, decision, statutoryReviewed, notes, prismaClient = prisma }) {
  const action = text(decision).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(action)) throw operationalError("INVALID_PAYROLL_DECISION", "Decision must be APPROVE or REJECT.");
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    runId
  );
  const run = rows[0];
  if (!run) throw operationalError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);
  if (run.status !== "PENDING_APPROVAL") throw operationalError("INVALID_PAYROLL_RUN_STATE", "Only a Pending Approval payroll run can be decided.", 409);
  if (action === "APPROVE" && statutoryReviewed !== true) {
    throw operationalError(
      "STATUTORY_REVIEW_CONFIRMATION_REQUIRED",
      "Confirm that PAYE, pension and other required statutory deductions have been manually reviewed before approving this Release-1 payroll run.",
      409
    );
  }
  const approvalAction = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const approvalId = crypto.randomUUID();
  await prismaClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "status"=$3,
              "statutoryStatus"=CASE WHEN $3='APPROVED' THEN 'MANUAL_REVIEW_CONFIRMED' ELSE "statutoryStatus" END,
              "approvedByUserId"=CASE WHEN $3='APPROVED' THEN $4 ELSE NULL END,
              "approvedAt"=CASE WHEN $3='APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      approvalAction,
      actorUserId || null
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_approvals" ("id","organizationId","runId","action","actorUserId","notes") VALUES ($1,$2,$3,$4,$5,$6)`,
      approvalId,
      organizationId,
      runId,
      approvalAction,
      actorUserId || null,
      text(notes) || null
    );

    if (action === "APPROVE") {
      const recoveryRows = await tx.$queryRawUnsafe(
        `SELECT "details" FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`,
        organizationId,
        runId
      );
      for (const row of recoveryRows) {
        const recoveries = row.details?.salaryAdvanceRecoveries || [];
        for (const recovery of recoveries) {
          const amount = Number(recovery.value || 0);
          if (!amount) continue;
          await tx.$executeRawUnsafe(
            `UPDATE "payroll_salary_advances"
                SET "outstandingAmount"=GREATEST(0,"outstandingAmount"-$3),
                    "status"=CASE WHEN GREATEST(0,"outstandingAmount"-$3)=0 THEN 'COMPLETED' ELSE "status" END,
                    "updatedAt"=CURRENT_TIMESTAMP
              WHERE "organizationId"=$1 AND "id"=$2 AND "status"='ACTIVE'`,
            organizationId,
            recovery.id,
            amount
          );
        }
      }
    }
  });
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollRun",
    entityId: runId,
    action: approvalAction,
    reason: notes,
    newValue: { statutoryReviewed: Boolean(statutoryReviewed), control: "Approval does not transmit payment instructions." },
  });
  return { runId, status: approvalAction, paymentPosted: false };
}

async function listApprovals({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pa."id",pa."runId",pp."code" AS "periodCode",pr."status" AS "runStatus",pa."action",pa."actorUserId",
            CONCAT_WS(' ',u."firstName",u."lastName") AS "actorName",u."email" AS "actorEmail",pa."notes",pa."createdAt"
       FROM "payroll_approvals" pa
       JOIN "payroll_runs" pr ON pr."id"=pa."runId" AND pr."organizationId"=pa."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
       LEFT JOIN "users" u ON u."id"=pa."actorUserId"
      WHERE pa."organizationId"=$1
      ORDER BY pa."createdAt" DESC`,
    organizationId
  );
  return rows;
}

module.exports = {
  PERIOD_STATUSES,
  COMPONENT_KINDS,
  listPeriods,
  createPeriod,
  updatePeriodStatus,
  listSalaryRates,
  saveSalaryRate,
  retireSalaryRate,
  listComponents,
  saveComponent,
  updateComponentStatus,
  listSalaryAdvances,
  createSalaryAdvance,
  updateSalaryAdvanceStatus,
  listPaidLeave,
  listRuns,
  listRunLines,
  executeDraftPayroll,
  submitPayrollRun,
  decidePayrollRun,
  listApprovals,
  operationalError,
};
