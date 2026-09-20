const crypto = require("crypto");
const prisma = require("../config/prisma");

const COMPONENT_KINDS = ["ALLOWANCE", "DEDUCTION"];
const CALCULATION_TYPES = [
  "ENTERED_AMOUNT",
  "GROSS_DIV_26_REGULAR",
  "GROSS_DIV_26_X2",
  "GROSS_DIV_26_X1_5",
  "GROSS_DIV_208_X1_25",
];
const SCHEDULE_METHODS = ["INSTALLMENT_COUNT", "INSTALLMENT_AMOUNT"];

const ZERMATT_COMPONENTS = [
  { kind: "DEDUCTION", code: "DED-BBSB", name: "Beer Barn Sales Bill", calculationType: "ENTERED_AMOUNT", taxable: false, installmentEligible: true },
  { kind: "DEDUCTION", code: "DED-ZSB", name: "Zermatt Sales Bill", calculationType: "ENTERED_AMOUNT", taxable: false, installmentEligible: true },
  { kind: "DEDUCTION", code: "DED-PPO", name: "Previous Payroll Over-pay", calculationType: "ENTERED_AMOUNT", taxable: false, installmentEligible: true },
  { kind: "DEDUCTION", code: "DED-UNION", name: "Union Dues", calculationType: "ENTERED_AMOUNT", taxable: false, installmentEligible: true },
  { kind: "DEDUCTION", code: "DED-COOP", name: "Cooperative Dues", calculationType: "ENTERED_AMOUNT", taxable: false, installmentEligible: true },
  { kind: "ALLOWANCE", code: "ALW-BONUS", name: "Bonus", calculationType: "ENTERED_AMOUNT", taxable: true, installmentEligible: false },
  { kind: "ALLOWANCE", code: "ALW-PPSP", name: "Previous Payroll Short-pay", calculationType: "ENTERED_AMOUNT", taxable: true, installmentEligible: false },
  { kind: "ALLOWANCE", code: "ALW-PMO", name: "Previous Month Outstanding", calculationType: "GROSS_DIV_26_REGULAR", taxable: true, installmentEligible: false },
  { kind: "ALLOWANCE", code: "ALW-PH", name: "Public Holiday", calculationType: "GROSS_DIV_26_X2", taxable: true, installmentEligible: false },
  { kind: "ALLOWANCE", code: "ALW-EDOT", name: "Extra Day Overtime", calculationType: "GROSS_DIV_26_X1_5", taxable: true, installmentEligible: false },
  { kind: "ALLOWANCE", code: "ALW-EHOT", name: "Extra Hour Overtime", calculationType: "GROSS_DIV_208_X1_25", taxable: true, installmentEligible: false },
];

function payrollInputError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function round2(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function positiveMoney(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw payrollInputError("INVALID_AMOUNT", `${label} must be greater than zero.`);
  return round2(amount);
}
function positiveQuantity(value, label = "Quantity") {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) throw payrollInputError("INVALID_QUANTITY", `${label} must be greater than zero.`);
  return Math.round(quantity * 10000) / 10000;
}
function monthKey(year, month) { return `${year}-${String(month).padStart(2, "0")}`; }
function addMonths(year, month, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
function periodYearMonth(period) {
  const raw = period?.periodStart instanceof Date ? period.periodStart.toISOString().slice(0, 10) : text(period?.periodStart);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) throw payrollInputError("INVALID_PAYROLL_PERIOD", "Payroll period does not have a valid start month.", 409);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function buildInstallmentSchedule({ totalAmount, scheduleMethod, installmentCount, installmentAmount, startYear, startMonth }) {
  const total = positiveMoney(totalAmount, "Total deduction amount");
  const method = upper(scheduleMethod);
  if (!SCHEDULE_METHODS.includes(method)) throw payrollInputError("INVALID_INSTALLMENT_METHOD", "Schedule By must be Number of Installments or Amount Per Installment.");

  const totalCents = Math.round(total * 100);
  let count;
  let nominalCents;
  if (method === "INSTALLMENT_COUNT") {
    count = Number(installmentCount);
    if (!Number.isInteger(count) || count < 1 || count > 120) {
      throw payrollInputError("INVALID_INSTALLMENT_COUNT", "Number of installments must be a whole number between 1 and 120.");
    }
    nominalCents = Math.floor(totalCents / count);
    if (nominalCents <= 0) throw payrollInputError("INVALID_INSTALLMENT_COUNT", "Number of installments is too high for the deduction amount.");
  } else {
    nominalCents = Math.round(positiveMoney(installmentAmount, "Installment amount") * 100);
    if (nominalCents > totalCents) nominalCents = totalCents;
    count = Math.ceil(totalCents / nominalCents);
    if (count > 120) throw payrollInputError("INVALID_INSTALLMENT_COUNT", "The selected installment amount would create more than 120 payroll installments.");
  }

  let remaining = totalCents;
  const schedule = [];
  for (let index = 0; index < count; index += 1) {
    const slot = addMonths(startYear, startMonth, index);
    const cents = index === count - 1 ? remaining : Math.min(nominalCents, remaining);
    remaining -= cents;
    schedule.push({
      installmentNumber: index + 1,
      year: slot.year,
      month: slot.month,
      period: monthKey(slot.year, slot.month),
      amount: round2(cents / 100),
    });
  }
  const end = schedule[schedule.length - 1];
  return {
    method,
    totalAmount: total,
    installmentCount: schedule.length,
    nominalInstallmentAmount: round2(nominalCents / 100),
    startYear,
    startMonth,
    endYear: end.year,
    endMonth: end.month,
    schedule,
  };
}

async function organizationIsZermatt(organizationId, prismaClient = prisma) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "slug" FROM "organizations" WHERE "id"=$1 LIMIT 1`,
    organizationId
  );
  return rows[0]?.slug === "zermatt-liquor-limited";
}

async function ensureZermattComponentCatalogue({ organizationId, prismaClient = prisma }) {
  if (!(await organizationIsZermatt(organizationId, prismaClient))) return;
  for (const item of ZERMATT_COMPONENTS) {
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO "payroll_variable_components"
        ("id","organizationId","kind","code","name","calculationType","taxable","installmentEligible","isSystem","status","notes")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'ACTIVE',$9)
       ON CONFLICT ("organizationId","code") DO NOTHING`,
      crypto.randomUUID(),
      organizationId,
      item.kind,
      item.code,
      item.name,
      item.calculationType,
      Boolean(item.taxable),
      Boolean(item.installmentEligible),
      "ZERMATT payroll operating component"
    );
  }
}

async function listVariableComponents({ organizationId, kind, prismaClient = prisma }) {
  await ensureZermattComponentCatalogue({ organizationId, prismaClient });
  const normalizedKind = upper(kind);
  if (!COMPONENT_KINDS.includes(normalizedKind)) throw payrollInputError("INVALID_COMPONENT_KIND", "Payroll component kind must be ALLOWANCE or DEDUCTION.");
  return prismaClient.$queryRawUnsafe(
    `SELECT "id","kind","code","name","calculationType","taxable","installmentEligible","isSystem","status","notes","createdAt","updatedAt"
       FROM "payroll_variable_components"
      WHERE "organizationId"=$1 AND "kind"=$2
      ORDER BY "isSystem" DESC,"name" ASC`,
    organizationId,
    normalizedKind
  );
}

function generatedCode(kind, name) {
  const prefix = kind === "ALLOWANCE" ? "ALW" : "DED";
  const words = text(name).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const token = words.map((word) => word[0]).join("").slice(0, 6) || "CUSTOM";
  return `${prefix}-${token}`;
}

async function createVariableComponent({ organizationId, actorUserId, kind, input, prismaClient = prisma }) {
  const normalizedKind = upper(kind);
  if (!COMPONENT_KINDS.includes(normalizedKind)) throw payrollInputError("INVALID_COMPONENT_KIND", "Payroll component kind must be ALLOWANCE or DEDUCTION.");
  const name = text(input?.name);
  if (!name) throw payrollInputError("COMPONENT_NAME_REQUIRED", "Component Name is required.");
  let code = upper(input?.code) || generatedCode(normalizedKind, name);
  const calculationType = upper(input?.calculationType || "ENTERED_AMOUNT");
  if (!CALCULATION_TYPES.includes(calculationType)) throw payrollInputError("INVALID_COMPONENT_CALCULATION", "Select a supported payroll calculation method.");
  if (normalizedKind === "DEDUCTION" && calculationType !== "ENTERED_AMOUNT") {
    throw payrollInputError("INVALID_DEDUCTION_CALCULATION", "Custom variable deductions currently use entered monetary amounts.");
  }

  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id" FROM "payroll_variable_components" WHERE "organizationId"=$1 AND "code"=$2 LIMIT 1`,
    organizationId,
    code
  );
  if (existing[0] && !text(input?.code)) {
    let suffix = 2;
    while (suffix < 100) {
      const candidate = `${code}-${suffix}`;
      const rows = await prismaClient.$queryRawUnsafe(
        `SELECT "id" FROM "payroll_variable_components" WHERE "organizationId"=$1 AND "code"=$2 LIMIT 1`,
        organizationId,
        candidate
      );
      if (!rows[0]) { code = candidate; break; }
      suffix += 1;
    }
  } else if (existing[0]) {
    throw payrollInputError("COMPONENT_CODE_EXISTS", `Payroll component code ${code} already exists.`, 409);
  }

  const id = crypto.randomUUID();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_variable_components"
      ("id","organizationId","kind","code","name","calculationType","taxable","installmentEligible","isSystem","status","notes","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,'ACTIVE',$9,$10)
     RETURNING "id","kind","code","name","calculationType","taxable","installmentEligible","isSystem","status","notes","createdAt","updatedAt"`,
    id,
    organizationId,
    normalizedKind,
    code,
    name,
    calculationType,
    normalizedKind === "ALLOWANCE" ? Boolean(input?.taxable) : false,
    normalizedKind === "DEDUCTION" ? Boolean(input?.installmentEligible !== false) : false,
    text(input?.notes) || null,
    actorUserId || null
  );
  await prismaClient.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollVariableComponent",
      entityId: id,
      action: "CREATED",
      newValue: rows[0],
      reason: text(input?.notes) || "Payroll variable component created",
    },
  });
  return rows[0];
}

async function getComponent(client, organizationId, code, kind = null) {
  await ensureZermattComponentCatalogue({ organizationId, prismaClient: client });
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","kind","code","name","calculationType","taxable","installmentEligible","status"
       FROM "payroll_variable_components"
      WHERE "organizationId"=$1 AND "code"=$2 AND ($3::text IS NULL OR "kind"=$3)
      LIMIT 1`,
    organizationId,
    upper(code),
    kind ? upper(kind) : null
  );
  if (!rows[0]) throw payrollInputError("VARIABLE_COMPONENT_NOT_FOUND", `Payroll component ${upper(code) || "selected"} was not found.`, 404);
  if (rows[0].status !== "ACTIVE") throw payrollInputError("VARIABLE_COMPONENT_INACTIVE", `Payroll component ${rows[0].code} is not active.`, 409);
  return rows[0];
}

async function getEmployee(client, organizationId, employeeNumber) {
  const normalized = upper(employeeNumber);
  if (!normalized) throw payrollInputError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","employeeNumber",CONCAT_WS(' ',"firstName","middleName","lastName") AS "employeeName","locationId"
       FROM "employees" WHERE "organizationId"=$1 AND UPPER("employeeNumber")=$2 LIMIT 1`,
    organizationId,
    normalized
  );
  if (!rows[0]) throw payrollInputError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  return rows[0];
}

async function getPeriod(client, organizationId, periodIdOrCode) {
  const key = text(periodIdOrCode);
  if (!key) throw payrollInputError("PAYROLL_PERIOD_REQUIRED", "Payroll Period is required.");
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","code","name","periodStart","periodEnd","status"
       FROM "payroll_periods"
      WHERE "organizationId"=$1 AND ("id"=$2 OR UPPER("code")=UPPER($2))
      LIMIT 1`,
    organizationId,
    key
  );
  if (!rows[0]) throw payrollInputError("PAYROLL_PERIOD_NOT_FOUND", `Payroll period ${key} was not found.`, 404);
  return rows[0];
}

async function assertPeriodAcceptsPayrollInputs(client, organizationId, period) {
  if (period.status === "CLOSED") throw payrollInputError("PAYROLL_PERIOD_CLOSED", "A payroll input cannot be added to a closed payroll period.", 409);
  const rows = await client.$queryRawUnsafe(
    `SELECT "status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "periodId"=$2 LIMIT 1`,
    organizationId,
    period.id
  );
  const runStatus = rows[0]?.status;
  if (runStatus && !["DRAFT", "REJECTED"].includes(runStatus)) {
    throw payrollInputError(
      "PAYROLL_PERIOD_INPUT_LOCKED",
      `Payroll ${period.code} is already ${String(runStatus).replaceAll("_", " ")}. Reopen it for correction or select the next open payroll period.`,
      409,
      { payrollPeriodCode: period.code, payrollRunStatus: runStatus }
    );
  }
}

async function createVariableInput({ organizationId, actorUserId, input, source = "MANUAL", prismaClient = prisma }) {
  const employee = await getEmployee(prismaClient, organizationId, input?.employeeNumber);
  const component = await getComponent(prismaClient, organizationId, input?.componentCode, input?.kind || null);
  const period = await getPeriod(prismaClient, organizationId, input?.payrollPeriodId || input?.payrollPeriodCode);
  await assertPeriodAcceptsPayrollInputs(prismaClient, organizationId, period);

  let referencePeriod = null;
  if (text(input?.referencePayrollPeriodId || input?.referencePayrollPeriodCode)) {
    referencePeriod = await getPeriod(prismaClient, organizationId, input.referencePayrollPeriodId || input.referencePayrollPeriodCode);
  }
  const manualAmount = component.calculationType === "ENTERED_AMOUNT" ? positiveMoney(input?.amount, "Amount") : null;
  const quantity = component.calculationType === "ENTERED_AMOUNT" ? null : positiveQuantity(input?.quantity);
  const id = crypto.randomUUID();

  try {
    const rows = await prismaClient.$queryRawUnsafe(
      `INSERT INTO "payroll_variable_inputs"
        ("id","organizationId","employeeId","componentId","payrollPeriodId","manualAmount","quantity","referencePayrollPeriodId","reference","remarks","source","status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE',$12)
       RETURNING "id","employeeId","componentId","payrollPeriodId","manualAmount","quantity","referencePayrollPeriodId","reference","remarks","source","status","createdAt","updatedAt"`,
      id,
      organizationId,
      employee.id,
      component.id,
      period.id,
      manualAmount,
      quantity,
      referencePeriod?.id || null,
      text(input?.reference) || null,
      text(input?.remarks) || null,
      source === "BULK_IMPORT" ? "BULK_IMPORT" : "MANUAL",
      actorUserId || null
    );
    await prismaClient.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollVariableInput",
        entityId: id,
        action: "CREATED",
        newValue: {
          employeeNumber: employee.employeeNumber,
          componentCode: component.code,
          payrollPeriodCode: period.code,
          manualAmount,
          quantity,
          referencePayrollPeriodCode: referencePeriod?.code || null,
          source,
        },
        reason: text(input?.remarks) || "Variable payroll input recorded",
      },
    });
    return { ...rows[0], employeeNumber: employee.employeeNumber, employeeName: employee.employeeName, componentCode: component.code, componentName: component.name, payrollPeriodCode: period.code };
  } catch (error) {
    if (String(error?.message || "").includes("payroll_variable_inputs_employee_component_period_key")) {
      throw payrollInputError("VARIABLE_INPUT_DUPLICATE", `${component.name} already has an input for ${employee.employeeNumber} in ${period.code}. Edit/cancel the existing input instead of duplicating it.`, 409);
    }
    throw error;
  }
}

async function resolveStartPeriod(client, organizationId, input) {
  if (text(input?.startPayrollPeriodId || input?.startPayrollPeriodCode)) {
    return getPeriod(client, organizationId, input.startPayrollPeriodId || input.startPayrollPeriodCode);
  }
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","code","name","periodStart","periodEnd","status"
       FROM "payroll_periods"
      WHERE "organizationId"=$1 AND "status"='OPEN'
      ORDER BY CASE WHEN CURRENT_DATE BETWEEN "periodStart" AND "periodEnd" THEN 0 ELSE 1 END,
               "periodStart" DESC
      LIMIT 1`,
    organizationId
  );
  if (!rows[0]) throw payrollInputError("OPEN_PAYROLL_PERIOD_REQUIRED", "Create or open the current payroll period before scheduling a recurring deduction.", 409);
  return rows[0];
}

async function createDeductionPlan({ organizationId, actorUserId, input, source = "MANUAL", prismaClient = prisma }) {
  const employee = await getEmployee(prismaClient, organizationId, input?.employeeNumber);
  const component = await getComponent(prismaClient, organizationId, input?.componentCode, "DEDUCTION");
  if (component.installmentEligible !== true) throw payrollInputError("INSTALLMENTS_NOT_ALLOWED", `${component.name} is not configured for installment deductions.`, 409);
  const startPeriod = await resolveStartPeriod(prismaClient, organizationId, input);
  await assertPeriodAcceptsPayrollInputs(prismaClient, organizationId, startPeriod);
  const { year, month } = periodYearMonth(startPeriod);
  const schedule = buildInstallmentSchedule({
    totalAmount: input?.totalAmount,
    scheduleMethod: input?.scheduleMethod,
    installmentCount: input?.installmentCount,
    installmentAmount: input?.installmentAmount,
    startYear: year,
    startMonth: month,
  });

  const planId = crypto.randomUUID();
  await prismaClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_deduction_plans"
        ("id","organizationId","employeeId","componentId","totalAmount","outstandingAmount","scheduleMethod","installmentCount","nominalInstallmentAmount","startYear","startMonth","endYear","endMonth","reference","remarks","status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ACTIVE',$15)`,
      planId,
      organizationId,
      employee.id,
      component.id,
      schedule.totalAmount,
      schedule.method,
      schedule.installmentCount,
      schedule.nominalInstallmentAmount,
      schedule.startYear,
      schedule.startMonth,
      schedule.endYear,
      schedule.endMonth,
      text(input?.reference) || null,
      text(input?.remarks) || null,
      actorUserId || null
    );
    for (const item of schedule.schedule) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "payroll_deduction_installments"
          ("id","organizationId","planId","installmentNumber","scheduleYear","scheduleMonth","scheduledAmount","status")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'SCHEDULED')`,
        crypto.randomUUID(),
        organizationId,
        planId,
        item.installmentNumber,
        item.year,
        item.month,
        item.amount
      );
    }
    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollDeductionPlan",
        entityId: planId,
        action: "CREATED",
        newValue: {
          employeeNumber: employee.employeeNumber,
          componentCode: component.code,
          totalAmount: schedule.totalAmount,
          scheduleMethod: schedule.method,
          installmentCount: schedule.installmentCount,
          startPeriod: schedule.schedule[0]?.period,
          endPeriod: schedule.schedule[schedule.schedule.length - 1]?.period,
          source,
          schedule: schedule.schedule,
        },
        reason: text(input?.remarks) || "Finite recurring payroll deduction scheduled",
      },
    });
  });
  return {
    id: planId,
    employeeNumber: employee.employeeNumber,
    employeeName: employee.employeeName,
    componentCode: component.code,
    componentName: component.name,
    totalAmount: schedule.totalAmount,
    outstandingAmount: schedule.totalAmount,
    scheduleMethod: schedule.method,
    installmentCount: schedule.installmentCount,
    nominalInstallmentAmount: schedule.nominalInstallmentAmount,
    startPeriod: schedule.schedule[0]?.period,
    endPeriod: schedule.schedule[schedule.schedule.length - 1]?.period,
    status: "ACTIVE",
    schedule: schedule.schedule,
  };
}

async function listVariableInputs({ organizationId, kind, prismaClient = prisma }) {
  await ensureZermattComponentCatalogue({ organizationId, prismaClient });
  const normalizedKind = kind ? upper(kind) : null;
  return prismaClient.$queryRawUnsafe(
    `SELECT pvi."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            pvc."kind",pvc."code" AS "componentCode",pvc."name" AS "componentName",pvc."calculationType",
            pvi."manualAmount",pvi."quantity",pp."code" AS "payrollPeriodCode",rpp."code" AS "referencePayrollPeriodCode",
            pvi."reference",pvi."remarks",pvi."source",pvi."status",pvi."createdAt"
       FROM "payroll_variable_inputs" pvi
       JOIN "employees" e ON e."id"=pvi."employeeId" AND e."organizationId"=pvi."organizationId"
       JOIN "payroll_variable_components" pvc ON pvc."id"=pvi."componentId" AND pvc."organizationId"=pvi."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pvi."payrollPeriodId" AND pp."organizationId"=pvi."organizationId"
       LEFT JOIN "payroll_periods" rpp ON rpp."id"=pvi."referencePayrollPeriodId" AND rpp."organizationId"=pvi."organizationId"
      WHERE pvi."organizationId"=$1 AND ($2::text IS NULL OR pvc."kind"=$2)
      ORDER BY pp."periodStart" DESC,pvi."createdAt" DESC`,
    organizationId,
    normalizedKind
  );
}

async function listDeductionPlans({ organizationId, prismaClient = prisma }) {
  await ensureZermattComponentCatalogue({ organizationId, prismaClient });
  const plans = await prismaClient.$queryRawUnsafe(
    `SELECT pdp."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            pvc."code" AS "componentCode",pvc."name" AS "componentName",
            pdp."totalAmount",pdp."outstandingAmount",pdp."scheduleMethod",pdp."installmentCount",pdp."nominalInstallmentAmount",
            pdp."startYear",pdp."startMonth",pdp."endYear",pdp."endMonth",pdp."reference",pdp."remarks",pdp."status",pdp."createdAt"
       FROM "payroll_deduction_plans" pdp
       JOIN "employees" e ON e."id"=pdp."employeeId" AND e."organizationId"=pdp."organizationId"
       JOIN "payroll_variable_components" pvc ON pvc."id"=pdp."componentId" AND pvc."organizationId"=pdp."organizationId"
      WHERE pdp."organizationId"=$1
      ORDER BY pdp."createdAt" DESC`,
    organizationId
  );
  const installments = await prismaClient.$queryRawUnsafe(
    `SELECT "id","planId","installmentNumber","scheduleYear","scheduleMonth","scheduledAmount","status","payrollRunId","postedAt"
       FROM "payroll_deduction_installments"
      WHERE "organizationId"=$1
      ORDER BY "planId","installmentNumber"`,
    organizationId
  );
  const byPlan = new Map();
  for (const row of installments) {
    if (!byPlan.has(row.planId)) byPlan.set(row.planId, []);
    byPlan.get(row.planId).push({
      ...row,
      scheduledAmount: Number(row.scheduledAmount || 0),
      period: monthKey(row.scheduleYear, row.scheduleMonth),
    });
  }
  return plans.map((row) => ({
    ...row,
    totalAmount: Number(row.totalAmount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    nominalInstallmentAmount: Number(row.nominalInstallmentAmount || 0),
    startPeriod: monthKey(row.startYear, row.startMonth),
    endPeriod: monthKey(row.endYear, row.endMonth),
    schedule: byPlan.get(row.id) || [],
  }));
}

function calculateVariableValue(item, monthlyGross) {
  const gross = Number(monthlyGross || 0);
  const quantity = Number(item.quantity || 0);
  switch (item.calculationType) {
    case "GROSS_DIV_26_REGULAR": return round2((gross / 26) * quantity);
    case "GROSS_DIV_26_X2": return round2((gross / 26) * quantity * 2);
    case "GROSS_DIV_26_X1_5": return round2((gross / 26) * quantity * 1.5);
    case "GROSS_DIV_208_X1_25": return round2((gross / 208) * quantity * 1.25);
    default: return round2(item.manualAmount || item.scheduledAmount || 0);
  }
}

async function loadPeriodVariableItems({ organizationId, period, employeeIds, prismaClient = prisma }) {
  await ensureZermattComponentCatalogue({ organizationId, prismaClient });
  const ids = Array.isArray(employeeIds) ? employeeIds.filter(Boolean) : [];
  if (!ids.length) return new Map();
  const ym = periodYearMonth(period);
  const inputs = await prismaClient.$queryRawUnsafe(
    `SELECT pvi."id",pvi."employeeId",pvi."manualAmount",pvi."quantity",pvi."reference",pvi."remarks",pvi."source",
            pvc."kind",pvc."code",pvc."name",pvc."calculationType",pvc."taxable"
       FROM "payroll_variable_inputs" pvi
       JOIN "payroll_variable_components" pvc ON pvc."id"=pvi."componentId" AND pvc."organizationId"=pvi."organizationId"
      WHERE pvi."organizationId"=$1 AND pvi."payrollPeriodId"=$2 AND pvi."status"='ACTIVE'
        AND pvi."employeeId" = ANY($3::text[])`,
    organizationId,
    period.id,
    ids
  );
  const installments = await prismaClient.$queryRawUnsafe(
    `SELECT pdi."id" AS "installmentId",pdi."planId",pdi."employeeId",pdi."scheduledAmount",pdi."installmentNumber",
            pdp."installmentCount",pvc."code",pvc."name"
       FROM (
         SELECT i.*,p."employeeId",p."componentId"
           FROM "payroll_deduction_installments" i
           JOIN "payroll_deduction_plans" p ON p."id"=i."planId" AND p."organizationId"=i."organizationId"
          WHERE i."organizationId"=$1 AND i."scheduleYear"=$2 AND i."scheduleMonth"=$3
            AND i."status" IN ('SCHEDULED','POSTED') AND p."status" IN ('ACTIVE','COMPLETED')
       ) pdi
       JOIN "payroll_deduction_plans" pdp ON pdp."id"=pdi."planId" AND pdp."organizationId"=$1
       JOIN "payroll_variable_components" pvc ON pvc."id"=pdi."componentId" AND pvc."organizationId"=$1
      WHERE pdi."employeeId" = ANY($4::text[])`,
    organizationId,
    ym.year,
    ym.month,
    ids
  );

  const result = new Map(ids.map((id) => [id, { allowances: [], deductions: [] }]));
  for (const row of inputs) {
    const item = {
      inputId: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      calculationType: row.calculationType,
      taxable: row.taxable === true,
      manualAmount: row.manualAmount == null ? null : Number(row.manualAmount),
      quantity: row.quantity == null ? null : Number(row.quantity),
      reference: row.reference || null,
      remarks: row.remarks || null,
      source: row.source,
      frequency: "ONE_TIME",
    };
    const bucket = result.get(row.employeeId);
    if (bucket) (row.kind === "ALLOWANCE" ? bucket.allowances : bucket.deductions).push(item);
  }
  for (const row of installments) {
    const bucket = result.get(row.employeeId);
    if (!bucket) continue;
    bucket.deductions.push({
      installmentId: row.installmentId,
      planId: row.planId,
      code: row.code,
      name: row.name,
      kind: "DEDUCTION",
      calculationType: "ENTERED_AMOUNT",
      taxable: false,
      scheduledAmount: Number(row.scheduledAmount || 0),
      installmentNumber: Number(row.installmentNumber),
      installmentCount: Number(row.installmentCount),
      frequency: "RECURRING_INSTALLMENT",
      source: "INSTALLMENT_SCHEDULE",
    });
  }
  return result;
}

async function postDeductionInstallments(client, { organizationId, payrollRunId }) {
  const lineRows = await client.$queryRawUnsafe(
    `SELECT "details" FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`,
    organizationId,
    payrollRunId
  );
  const ids = new Set();
  for (const row of lineRows) {
    for (const item of row.details?.customDeductions || []) {
      if (item?.installmentId) ids.add(item.installmentId);
    }
  }
  const affectedPlans = new Set();
  let posted = 0;
  for (const id of ids) {
    const rows = await client.$queryRawUnsafe(
      `UPDATE "payroll_deduction_installments"
          SET "status"='POSTED',"payrollRunId"=$3,"postedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
          AND ("status"='SCHEDULED' OR ("status"='POSTED' AND "payrollRunId"=$3))
        RETURNING "planId"`,
      organizationId,
      id,
      payrollRunId
    );
    if (rows[0]) {
      affectedPlans.add(rows[0].planId);
      posted += 1;
    }
  }
  for (const planId of affectedPlans) {
    await client.$executeRawUnsafe(
      `UPDATE "payroll_deduction_plans" p
          SET "outstandingAmount"=GREATEST(0,p."totalAmount"-COALESCE((
                SELECT SUM(i."scheduledAmount") FROM "payroll_deduction_installments" i
                 WHERE i."organizationId"=$1 AND i."planId"=p."id" AND i."status"='POSTED'
              ),0)),
              "status"=CASE WHEN NOT EXISTS (
                SELECT 1 FROM "payroll_deduction_installments" i
                 WHERE i."organizationId"=$1 AND i."planId"=p."id" AND i."status"='SCHEDULED'
              ) THEN 'COMPLETED' ELSE 'ACTIVE' END,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE p."organizationId"=$1 AND p."id"=$2`,
      organizationId,
      planId
    );
  }
  return { installmentsPosted: posted, plansUpdated: affectedPlans.size };
}

async function reverseDeductionInstallments(client, { organizationId, payrollRunId }) {
  const rows = await client.$queryRawUnsafe(
    `UPDATE "payroll_deduction_installments"
        SET "status"='SCHEDULED',"payrollRunId"=NULL,"postedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "payrollRunId"=$2 AND "status"='POSTED'
      RETURNING "planId","scheduledAmount"`,
    organizationId,
    payrollRunId
  );
  const plans = new Set(rows.map((row) => row.planId));
  for (const planId of plans) {
    await client.$executeRawUnsafe(
      `UPDATE "payroll_deduction_plans" p
          SET "outstandingAmount"=GREATEST(0,p."totalAmount"-COALESCE((
                SELECT SUM(i."scheduledAmount") FROM "payroll_deduction_installments" i
                 WHERE i."organizationId"=$1 AND i."planId"=p."id" AND i."status"='POSTED'
              ),0)),
              "status"='ACTIVE',
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE p."organizationId"=$1 AND p."id"=$2 AND p."status"<>'CANCELLED'`,
      organizationId,
      planId
    );
  }
  return {
    installmentsReversed: rows.length,
    amountRestored: round2(rows.reduce((sum, row) => sum + Number(row.scheduledAmount || 0), 0)),
    plansUpdated: plans.size,
  };
}

module.exports = {
  COMPONENT_KINDS,
  CALCULATION_TYPES,
  SCHEDULE_METHODS,
  ZERMATT_COMPONENTS,
  payrollInputError,
  buildInstallmentSchedule,
  calculateVariableValue,
  ensureZermattComponentCatalogue,
  listVariableComponents,
  createVariableComponent,
  createVariableInput,
  createDeductionPlan,
  listVariableInputs,
  listDeductionPlans,
  loadPeriodVariableItems,
  postDeductionInstallments,
  reverseDeductionInstallments,
};
