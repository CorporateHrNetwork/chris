const crypto = require("crypto");
const prisma = require("../config/prisma");
const { replaceDraftObligations } = require("./statutoryObligationService");
const { loadPeriodVariableItems, calculateVariableValue } = require("./zermattVariablePayrollService");

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function payrollError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function percent(value, rate) {
  return round2(Number(value || 0) * Number(rate || 0) / 100);
}

function dateText(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

function normalizedEmploymentType(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statutoryEmploymentTypeExemption(employmentType) {
  const normalized = normalizedEmploymentType(employmentType);
  const compact = normalized.replace(/\s+/g, "");

  const isPartTime =
    normalized.includes("PART TIME") ||
    compact.includes("PARTTIME");

  const isExpatriate =
    normalized.includes("EXPATRIATE");

  const isInternship =
    normalized.includes("INTERNSHIP") ||
    normalized.includes("INTERN") ||
    normalized.includes("NYSC");

  const exempt = isPartTime || isExpatriate || isInternship;

  return {
    exempt,
    normalizedEmploymentType: normalized,
    matchedCategory: isPartTime
      ? "PART_TIME"
      : isExpatriate
        ? "EXPATRIATE"
        : isInternship
          ? "INTERNSHIP_NYSC"
          : null,
    payeExempt: exempt,
    pensionExempt: exempt,
    source: exempt ? "CHRIS_EMPLOYMENT_TYPE_EXEMPTION_RULE" : null,
    reason: exempt
      ? "CHRiS employment-type rule: Part-Time, Expatriate and Internship/Intern/NYSC employees are excluded from PAYE and pension deductions."
      : null,
  };
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function writeAudit(client, { organizationId, actorUserId, entityType, entityId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
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

function mapPolicy(row) {
  if (!row) return null;
  return {
    ...row,
    effectiveFrom: dateText(row.effectiveFrom),
    effectiveTo: dateText(row.effectiveTo),
    pensionEmployeeRate: Number(row.pensionEmployeeRate || 0),
    pensionEmployerRate: Number(row.pensionEmployerRate || 0),
    salaryStructure: jsonValue(row.salaryStructure, {}),
    standardDays: jsonValue(row.standardDays, {}),
    pensionableComponents: jsonValue(row.pensionableComponents, []),
    payeRules: jsonValue(row.payeRules, {}),
    employerStatutoryRules: jsonValue(row.employerStatutoryRules, {}),
  };
}

async function getActivePolicy({ organizationId, asOf, prismaClient = prisma }) {
  const effectiveDate = text(asOf) || new Date().toISOString().slice(0, 10);
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT *
       FROM "payroll_policy_versions"
      WHERE "organizationId"=$1
        AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $2::date)
      ORDER BY "effectiveFrom" DESC, "versionNumber" DESC
      LIMIT 1`,
    organizationId,
    effectiveDate
  );
  return mapPolicy(rows[0]);
}

async function getCompliancePolicy({ organizationId, prismaClient = prisma }) {
  const policy = await getActivePolicy({ organizationId, prismaClient });
  if (!policy) {
    return {
      configured: false,
      policy: null,
      controls: {
        paye: "NOT_CONFIGURED",
        pension: "NOT_CONFIGURED",
        nsitf: "NOT_CONFIGURED",
        itf: "NOT_CONFIGURED",
      },
    };
  }
  return {
    configured: true,
    policy,
    controls: {
      paye: policy.payeRules?.ruleCode || "NG-NTA-2025-2026",
      pension: `${policy.pensionEmployeeRate}% employee + ${policy.pensionEmployerRate}% employer on configured pensionable components`,
      nsitf: policy.employerStatutoryRules?.nsitf?.enabled ? "EMPLOYER_ONLY" : "DISABLED",
      itf: policy.employerStatutoryRules?.itf?.enabled ? "EMPLOYER_ONLY_ACCRUAL" : "DISABLED",
      nhf: policy.payeRules?.nhf?.enabled ? "EMPLOYEE_DEDUCTION_ENABLED" : "CONFIGURATION_REQUIRED_BEFORE_DEDUCTION",
    },
  };
}

async function resolveEmployee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw payrollError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  const employee = await client.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  });
  if (!employee) throw payrollError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found in this organization.`, 404);
  return employee;
}

async function listTaxReliefs({ organizationId, taxYear, prismaClient = prisma }) {
  const year = taxYear ? Number(taxYear) : null;
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT tr."id",tr."employeeId",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            tr."taxYear",tr."reliefType",tr."annualDeclaredAmount",tr."eligibleReliefAmount",
            tr."evidenceReference",tr."status",tr."verifiedByUserId",tr."verifiedAt",tr."notes",tr."createdAt",tr."updatedAt"
       FROM "payroll_tax_reliefs" tr
       JOIN "employees" e ON e."id"=tr."employeeId" AND e."organizationId"=tr."organizationId"
      WHERE tr."organizationId"=$1 AND ($2::int IS NULL OR tr."taxYear"=$2)
      ORDER BY tr."taxYear" DESC,e."employeeNumber" ASC`,
    organizationId,
    year
  );
  return rows.map((row) => ({
    ...row,
    annualDeclaredAmount: Number(row.annualDeclaredAmount || 0),
    eligibleReliefAmount: Number(row.eligibleReliefAmount || 0),
  }));
}

async function declareRentRelief({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const taxYear = Number(input?.taxYear);
  const annualRent = Number(input?.annualRentPaid);
  if (!Number.isInteger(taxYear) || taxYear < 2026) throw payrollError("INVALID_TAX_YEAR", "Tax Year must be 2026 or later.");
  if (!Number.isFinite(annualRent) || annualRent < 0) throw payrollError("INVALID_ANNUAL_RENT", "Annual Rent Paid must be zero or greater.");

  const policy = await getActivePolicy({ organizationId, asOf: `${taxYear}-12-31`, prismaClient });
  if (!policy) throw payrollError("PAYROLL_POLICY_NOT_CONFIGURED", `No active Nigeria payroll policy covers tax year ${taxYear}.`, 409);
  const rate = Number(policy.payeRules?.rentReliefRate ?? 20);
  const cap = Number(policy.payeRules?.rentReliefCap ?? 500000);
  const eligible = Math.min(cap, percent(annualRent, rate));
  const evidenceReference = text(input?.evidenceReference) || null;
  const notes = text(input?.notes) || null;

  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status","annualDeclaredAmount","eligibleReliefAmount","evidenceReference"
       FROM "payroll_tax_reliefs"
      WHERE "organizationId"=$1 AND "employeeId"=$2 AND "taxYear"=$3 AND "reliefType"='RENT'
      LIMIT 1`,
    organizationId,
    employee.id,
    taxYear
  );
  if (existing[0]?.status === "VERIFIED") {
    throw payrollError(
      "VERIFIED_RENT_RELIEF_IMMUTABLE",
      "A verified rent-relief declaration cannot be overwritten. Reject/correct it through an auditable relief workflow before replacement.",
      409
    );
  }

  const id = existing[0]?.id || crypto.randomUUID();
  const rows = existing[0]
    ? await prismaClient.$queryRawUnsafe(
        `UPDATE "payroll_tax_reliefs"
            SET "annualDeclaredAmount"=$4,"eligibleReliefAmount"=$5,"evidenceReference"=$6,
                "status"='PENDING_VERIFICATION',"declaredByUserId"=$7,"verifiedByUserId"=NULL,"verifiedAt"=NULL,
                "notes"=$8,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "taxYear"=$3 AND "reliefType"='RENT'
          RETURNING *`,
        organizationId,
        employee.id,
        taxYear,
        round2(annualRent),
        eligible,
        evidenceReference,
        actorUserId || null,
        notes
      )
    : await prismaClient.$queryRawUnsafe(
        `INSERT INTO "payroll_tax_reliefs"
          ("id","organizationId","employeeId","taxYear","reliefType","annualDeclaredAmount","eligibleReliefAmount","evidenceReference","status","declaredByUserId","notes")
         VALUES ($1,$2,$3,$4,'RENT',$5,$6,$7,'PENDING_VERIFICATION',$8,$9)
         RETURNING *`,
        id,
        organizationId,
        employee.id,
        taxYear,
        round2(annualRent),
        eligible,
        evidenceReference,
        actorUserId || null,
        notes
      );

  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollTaxRelief",
    entityId: id,
    action: existing[0] ? "REDECLARED_RENT_RELIEF" : "DECLARED_RENT_RELIEF",
    previousValue: existing[0] || undefined,
    newValue: {
      employeeNumber: employee.employeeNumber,
      taxYear,
      annualRentPaid: round2(annualRent),
      eligibleRentRelief: eligible,
      status: "PENDING_VERIFICATION",
    },
    reason: notes || "Rent relief declaration recorded for verification",
  });

  return {
    ...rows[0],
    employeeNumber: employee.employeeNumber,
    employeeName: employeeName(employee),
    annualDeclaredAmount: Number(rows[0].annualDeclaredAmount || 0),
    eligibleReliefAmount: Number(rows[0].eligibleReliefAmount || 0),
  };
}

async function decideRentRelief({ organizationId, actorUserId, reliefId, decision, notes, prismaClient = prisma }) {
  const action = text(decision).toUpperCase();
  if (!["VERIFY", "REJECT"].includes(action)) throw payrollError("INVALID_RELIEF_DECISION", "Decision must be VERIFY or REJECT.");
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT * FROM "payroll_tax_reliefs" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    reliefId
  );
  const existing = rows[0];
  if (!existing) throw payrollError("TAX_RELIEF_NOT_FOUND", "Tax relief record not found.", 404);
  if (existing.status !== "PENDING_VERIFICATION") throw payrollError("INVALID_RELIEF_STATE", "Only a pending rent-relief declaration can be verified or rejected.", 409);
  if (action === "VERIFY" && !text(existing.evidenceReference)) {
    throw payrollError("RENT_RELIEF_EVIDENCE_REQUIRED", "Add a rent-payment evidence/document reference before verifying rent relief.", 409);
  }
  const status = action === "VERIFY" ? "VERIFIED" : "REJECTED";
  const updated = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_tax_reliefs"
        SET "status"=$3,"verifiedByUserId"=$4,"verifiedAt"=CURRENT_TIMESTAMP,"notes"=COALESCE($5,"notes"),"updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING *`,
    organizationId,
    reliefId,
    status,
    actorUserId || null,
    text(notes) || null
  );
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollTaxRelief",
    entityId: reliefId,
    action: status === "VERIFIED" ? "VERIFIED_RENT_RELIEF" : "REJECTED_RENT_RELIEF",
    previousValue: existing,
    newValue: updated[0],
    reason: notes,
  });
  return updated[0];
}

function calculateAnnualPaye(chargeableIncome, bands) {
  let remaining = Math.max(0, Number(chargeableIncome || 0));
  let tax = 0;
  for (const band of bands || []) {
    const rate = Number(band?.rate || 0) / 100;
    const limit = band?.limit === null || band?.limit === undefined ? null : Number(band.limit);
    if (limit === null) {
      tax += remaining * rate;
      remaining = 0;
      break;
    }
    const slice = Math.min(remaining, Math.max(0, limit));
    tax += slice * rate;
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return round2(tax);
}

function calculateStructure(gross, structure) {
  const entries = Object.entries(structure || {});
  const totalPercent = round2(entries.reduce((sum, [, rate]) => sum + Number(rate || 0), 0));
  if (Math.abs(totalPercent - 100) > 0.001) {
    throw payrollError("INVALID_SALARY_STRUCTURE", `Payroll salary structure must total 100%; configured total is ${totalPercent}%.`, 409);
  }
  const amounts = {};
  let assigned = 0;
  entries.forEach(([key, rate], index) => {
    const value = index === entries.length - 1 ? round2(gross - assigned) : percent(gross, rate);
    amounts[key] = value;
    assigned = round2(assigned + value);
  });
  return amounts;
}

function componentValue(component, grossBase) {
  if (component.calculationType === "PERCENT_GROSS") return percent(grossBase, component.percentage);
  return round2(component.amount || 0);
}

async function insertPayrollRunLinesBulk(tx, { organizationId, runId, lines }) {
  const chunkSize = 100;
  for (let start = 0; start < lines.length; start += chunkSize) {
    const chunk = lines.slice(start, start + chunkSize);
    const params = [];
    const values = chunk.map((line) => {
      line.runLineId = line.runLineId || crypto.randomUUID();
      const base = params.length;
      params.push(
        line.runLineId,
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
      const p = (offset) => "$" + (base + offset);
      return `(${p(1)},${p(2)},${p(3)},${p(4)},${p(5)},${p(6)},${p(7)},${p(8)},${p(9)},${p(10)},${p(11)},${p(12)},${p(13)},'CALCULATED_NIGERIA_2026',${p(14)}::jsonb)`;
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_run_lines"
        ("id","organizationId","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions","advanceRecovery","grossPay","netPreview","statutoryStatus","details")
       VALUES ${values.join(",")}`,
      ...params
    );
  }
}

async function getPeriod(client, organizationId, periodId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT "id","code","name","periodStart","periodEnd","payDate","status"
       FROM "payroll_periods" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    text(periodId)
  );
  if (!rows[0]) throw payrollError("PAYROLL_PERIOD_NOT_FOUND", "Payroll period not found.", 404);
  return {
    ...rows[0],
    periodStart: dateText(rows[0].periodStart),
    periodEnd: dateText(rows[0].periodEnd),
    payDate: dateText(rows[0].payDate),
  };
}

async function executeNigeriaDraftPayroll({ organizationId, actorUserId, periodId, prismaClient = prisma }) {
  const period = await getPeriod(prismaClient, organizationId, periodId);
  if (period.status === "CLOSED") throw payrollError("PAYROLL_PERIOD_CLOSED", "Closed payroll periods cannot be recalculated.", 409);
  const policy = await getActivePolicy({ organizationId, asOf: period.periodEnd, prismaClient });
  if (!policy) throw payrollError("PAYROLL_POLICY_NOT_CONFIGURED", "No active Nigeria payroll policy covers this payroll period.", 409);
  const complianceRule = await prismaClient.complianceRule.findFirst({
    where: {
      organizationId,
      ruleKey: "NIGERIA_PAYROLL",
      jurisdiction: "NG",
      status: "ACTIVE",
      effectiveFrom: { lte: new Date(`${period.periodEnd}T23:59:59.999Z`) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${period.periodStart}T00:00:00.000Z`) } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
  });

  const organization = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, country: true, currency: true },
  });
  if (!organization) throw payrollError("ORGANIZATION_NOT_FOUND", "Organization not found.", 404);
  if (String(policy.jurisdiction || "").toUpperCase() !== "NG") throw payrollError("PAYROLL_JURISDICTION_UNSUPPORTED", "The active payroll policy is not a Nigeria policy.", 409);

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
  if (!employees.length) throw payrollError("NO_PAYROLL_EMPLOYEES", "There are no current employees to include in payroll.", 409);

  const structuralMissing = employees.filter((employee) => !text(employee.employmentType) || !text(employee.costCentreId));
  if (structuralMissing.length) {
    throw payrollError(
      "PAYROLL_EMPLOYMENT_AUTHORITY_INCOMPLETE",
      `${structuralMissing.length} current employee(s) are missing Employment Type or Cost Centre.`,
      409,
      { employees: structuralMissing.slice(0, 25).map((row) => row.employeeNumber), total: structuralMissing.length }
    );
  }

  const missingStandardDays = employees.filter((employee) => !Number(policy.standardDays?.[employee.employmentType]));
  if (missingStandardDays.length) {
    throw payrollError(
      "PAYROLL_STANDARD_DAYS_NOT_CONFIGURED",
      `${missingStandardDays.length} employee(s) have Employment Types without configured payroll standard days.`,
      409,
      {
        employees: missingStandardDays.slice(0, 25).map((row) => ({ employeeNumber: row.employeeNumber, employmentType: row.employmentType })),
        configuredStandardDays: policy.standardDays,
      }
    );
  }

  const rateRows = await prismaClient.$queryRawUnsafe(
    `SELECT DISTINCT ON ("employeeId") "employeeId","amount","currency","effectiveFrom","effectiveTo"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3::date)
      ORDER BY "employeeId","effectiveFrom" DESC`,
    organizationId,
    period.periodEnd,
    period.periodStart
  );
  const rateByEmployee = new Map(rateRows.map((row) => [row.employeeId, row]));
  const missingRates = employees.filter((employee) => !rateByEmployee.has(employee.id));
  if (missingRates.length) {
    throw payrollError(
      "PAYROLL_SALARY_RATES_INCOMPLETE",
      `${missingRates.length} current employee(s) do not have an effective gross salary rate for ${period.code}.`,
      409,
      { employees: missingRates.slice(0, 25).map((row) => row.employeeNumber), total: missingRates.length }
    );
  }

  const periodStartDate = new Date(`${period.periodStart}T00:00:00.000Z`);
  const periodEndDate = new Date(`${period.periodEnd}T00:00:00.000Z`);
  const attendanceInputs = await prismaClient.attendancePayrollInput.findMany({
    where: {
      organizationId,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
      employeeId: { in: employees.map((row) => row.id) },
    },
    select: { employeeId: true, workedDays: true, workedHours: true, notes: true },
  });
  const attendanceByEmployee = new Map(attendanceInputs.map((row) => [row.employeeId, row]));

  const componentRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","kind","code","name","calculationType","amount","percentage","oneTimePeriodId","taxable"
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

  // ZERMATT payroll periods reset manual "Other" items at the start of every period.
  // Historical effective-dated components remain in the audit/register, but an
  // indefinite legacy component must not silently carry into a later payroll.
  // Period-specific legacy items may still be honored for their explicitly linked
  // period. Finite recurring deductions are supplied separately by the governed
  // installment schedule engine.
  const zermattPeriodScopedLegacyComponents = organization.slug === "zermatt-liquor-limited"
    ? componentRows.filter((component) => component.oneTimePeriodId === period.id)
    : componentRows;

  const variableItemsByEmployee = await loadPeriodVariableItems({
    organizationId,
    period,
    employeeIds: employees.map((employee) => employee.id),
    prismaClient,
  });

  const advanceRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","outstandingAmount","installmentAmount","recoveryStartDate"
       FROM "payroll_salary_advances"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "outstandingAmount" > 0
        AND "installmentAmount" > 0
        AND "recoveryStartDate" <= $2::date`,
    organizationId,
    period.periodEnd
  );

  const taxYear = Number(period.periodEnd.slice(0, 4));
  const reliefRows = await prismaClient.$queryRawUnsafe(
    `SELECT "employeeId","eligibleReliefAmount"
       FROM "payroll_tax_reliefs"
      WHERE "organizationId"=$1 AND "taxYear"=$2 AND "reliefType"='RENT' AND "status"='VERIFIED'`,
    organizationId,
    taxYear
  );
  const rentReliefByEmployee = new Map(reliefRows.map((row) => [row.employeeId, Number(row.eligibleReliefAmount || 0)]));

  const pensionableKeys = new Set((policy.pensionableComponents || []).map((value) => String(value).toLowerCase()));
  const bands = policy.payeRules?.bands || [];
  const minimumWageMonthly = Number(policy.payeRules?.minimumWageMonthly || 0);
  const nhfRule = policy.payeRules?.nhf || {};
  const nsitfRule = policy.employerStatutoryRules?.nsitf || {};
  const itfRule = policy.employerStatutoryRules?.itf || {};

  const lines = employees.map((employee) => {
    const rate = rateByEmployee.get(employee.id);
    const scheduledMonthlyGross = round2(rate.amount || 0);
    const standardDays = Number(policy.standardDays[employee.employmentType]);
    const attendanceInput = attendanceByEmployee.get(employee.id);
    const payableDays = attendanceInput?.workedDays === null || attendanceInput?.workedDays === undefined
      ? standardDays
      : Number(attendanceInput.workedDays);
    if (!Number.isFinite(payableDays) || payableDays < 0) {
      throw payrollError("INVALID_PAYROLL_WORKED_DAYS", `Invalid payable days for ${employee.employeeNumber}.`, 409);
    }
    const prorationFactor = standardDays > 0 ? payableDays / standardDays : 0;
    const structuredGross = round2(scheduledMonthlyGross * prorationFactor);
    const salaryStructure = calculateStructure(structuredGross, policy.salaryStructure);
    const basicSalary = round2(salaryStructure.basic || 0);
    const structuredAllowances = round2(
      Object.entries(salaryStructure)
        .filter(([key]) => key !== "basic")
        .reduce((sum, [, value]) => sum + Number(value || 0), 0)
    );

    const applicable = zermattPeriodScopedLegacyComponents.filter((component) => !component.employeeId || component.employeeId === employee.id);
    const periodVariableItems = variableItemsByEmployee.get(employee.id) || { allowances: [], deductions: [] };
    const configuredAllowanceItems = applicable
      .filter((component) => component.kind === "ALLOWANCE")
      .map((component) => ({
        id: component.id,
        code: component.code,
        name: component.name,
        taxable: component.taxable === true,
        recurring: !component.oneTimePeriodId,
        source: "EFFECTIVE_DATED_COMPONENT",
        value: componentValue(component, structuredGross),
      }));
    const variableAllowanceItems = periodVariableItems.allowances.map((item) => ({
      ...item,
      id: item.inputId,
      recurring: false,
      value: calculateVariableValue(item, scheduledMonthlyGross),
      calculation: {
        calculationType: item.calculationType,
        monthlyGross: scheduledMonthlyGross,
        quantity: item.quantity ?? null,
        divisor: item.calculationType === "GROSS_DIV_208_X1_25" ? 208 : (item.calculationType === "ENTERED_AMOUNT" ? null : 26),
        multiplier: item.calculationType === "GROSS_DIV_26_X2" ? 2 : item.calculationType === "GROSS_DIV_26_X1_5" ? 1.5 : item.calculationType === "GROSS_DIV_208_X1_25" ? 1.25 : 1,
      },
    }));
    const customAllowanceItems = [...configuredAllowanceItems, ...variableAllowanceItems];

    const configuredDeductionItems = applicable
      .filter((component) => component.kind === "DEDUCTION")
      .map((component) => ({
        id: component.id,
        code: component.code,
        name: component.name,
        source: "EFFECTIVE_DATED_COMPONENT",
        value: componentValue(component, structuredGross),
      }));
    const variableDeductionItems = periodVariableItems.deductions.map((item) => ({
      ...item,
      id: item.inputId || item.installmentId,
      value: calculateVariableValue(item, scheduledMonthlyGross),
      calculation: {
        calculationType: item.calculationType,
        monthlyGross: scheduledMonthlyGross,
        quantity: item.quantity ?? null,
      },
    }));
    const customDeductionItems = [...configuredDeductionItems, ...variableDeductionItems];

    const otherAllowances = round2(customAllowanceItems.reduce((sum, item) => sum + item.value, 0));
    const grossPay = round2(structuredGross + otherAllowances);
    const pensionableBase = round2(
      Object.entries(salaryStructure)
        .filter(([key]) => pensionableKeys.has(String(key).toLowerCase()))
        .reduce((sum, [, value]) => sum + Number(value || 0), 0)
    );
    const employmentTypeExemption = statutoryEmploymentTypeExemption(employee.employmentType);
    const employeePension = employmentTypeExemption.pensionExempt
      ? 0
      : percent(pensionableBase, policy.pensionEmployeeRate);
    const employerPension = employmentTypeExemption.pensionExempt
      ? 0
      : percent(pensionableBase, policy.pensionEmployerRate);
    const nhfEmployee = nhfRule.enabled === true ? percent(basicSalary, Number(nhfRule.employeeRate || 0)) : 0;

    const recurringTaxableAllowances = round2(customAllowanceItems.filter((row) => row.taxable && row.recurring).reduce((sum, row) => sum + row.value, 0));
    const oneTimeTaxableAllowances = round2(customAllowanceItems.filter((row) => row.taxable && !row.recurring).reduce((sum, row) => sum + row.value, 0));
    const rentReliefAnnual = round2(rentReliefByEmployee.get(employee.id) || 0);
    const recurringAnnualTaxableIncome = round2((structuredGross + recurringTaxableAllowances) * 12);
    const annualEmployeePension = round2(employeePension * 12);
    const annualNhf = round2(nhfEmployee * 12);
    const recurringAnnualChargeable = Math.max(0, round2(recurringAnnualTaxableIncome - annualEmployeePension - annualNhf - rentReliefAnnual));
    const totalAnnualChargeable = Math.max(0, round2(recurringAnnualChargeable + oneTimeTaxableAllowances));
    const minimumWageExempt = minimumWageMonthly > 0 && round2(structuredGross + recurringTaxableAllowances) <= minimumWageMonthly;
    const recurringAnnualTax = employmentTypeExemption.payeExempt || minimumWageExempt
      ? 0
      : calculateAnnualPaye(recurringAnnualChargeable, bands);
    const totalAnnualTax = employmentTypeExemption.payeExempt || minimumWageExempt
      ? 0
      : calculateAnnualPaye(totalAnnualChargeable, bands);
    const payeTax = employmentTypeExemption.payeExempt
      ? 0
      : round2(recurringAnnualTax / 12 + Math.max(0, totalAnnualTax - recurringAnnualTax));

    const customDeductions = round2(customDeductionItems.reduce((sum, item) => sum + item.value, 0));
    const statutoryEmployeeDeductions = round2(employeePension + nhfEmployee + payeTax);
    const deductions = round2(customDeductions + statutoryEmployeeDeductions);

    // Salary Advance is zero by default in every payroll period. A value appears
    // only when an ACTIVE repayment schedule has reached its recovery start month
    // and still has an outstanding balance. No prior payroll-line value is carried.
    const advances = advanceRows
      .filter((advance) => advance.employeeId === employee.id)
      .map((advance) => ({
        id: advance.id,
        value: round2(Math.min(Number(advance.outstandingAmount || 0), Number(advance.installmentAmount || 0))),
        recoveryStartDate: dateText(advance.recoveryStartDate),
        scheduledPayrollPeriod: period.code,
        source: "ACTIVE_SALARY_ADVANCE_REPAYMENT_SCHEDULE",
      }));
    const advanceRecovery = advances.length
      ? round2(advances.reduce((sum, row) => sum + row.value, 0))
      : 0;
    const netPreview = Math.max(0, round2(grossPay - deductions - advanceRecovery));

    const employerNsitf = nsitfRule.enabled === true ? percent(grossPay, Number(nsitfRule.employerRate || 0)) : 0;
    const employerItf = itfRule.enabled === true ? percent(grossPay, Number(itfRule.employerRate || 0)) : 0;
    const employerStatutoryCost = round2(employerPension + employerNsitf + employerItf);

    return {
      employee,
      currency: rate.currency || organization.currency || "NGN",
      baseSalary: basicSalary,
      allowances: round2(structuredAllowances + otherAllowances),
      deductions,
      advanceRecovery,
      grossPay,
      netPreview,
      details: {
        policy: {
          id: policy.id,
          code: policy.code,
          versionNumber: policy.versionNumber,
          jurisdiction: policy.jurisdiction,
          payeRuleCode: policy.payeRules?.ruleCode || "NG-NTA-2025-2026",
        },
        attendance: {
          employmentType: employee.employmentType,
          standardDays,
          payableDays: round2(payableDays),
          prorationFactor: round2(prorationFactor),
          source: attendanceInput ? "ATTENDANCE_PAYROLL_INPUT" : "STANDARD_DAYS_DEFAULT",
          notes: attendanceInput?.notes || null,
          manualInputResetPolicy: "PERIOD_SCOPED_NO_CARRY_FORWARD",
        },
        scheduledMonthlyGross,
        structuredGross,
        salaryStructure,
        customAllowances: customAllowanceItems,
        customDeductions: customDeductionItems,
        statutory: {
          employmentTypeExemption,
          pensionableBase,
          employeePensionRate: policy.pensionEmployeeRate,
          employeePension,
          employerPensionRate: policy.pensionEmployerRate,
          employerPension,
          nhfEmployee,
          nhfStatus: nhfRule.enabled === true ? "ENABLED" : "NOT_DEDUCTED_PENDING_APPLICABILITY_CONFIGURATION",
          rentReliefAnnual,
          recurringAnnualChargeableIncome: recurringAnnualChargeable,
          annualChargeableIncomeIncludingOneTime: totalAnnualChargeable,
          minimumWageExempt,
          payeTax,
          nsitfEmployer: employerNsitf,
          nsitfEmployeeDeduction: 0,
          itfEmployerAccrual: employerItf,
          itfEmployeeDeduction: 0,
          employerStatutoryCost,
        },
        salaryAdvanceRecoveries: advances,
        periodReset: {
          expectedDaysDefault: true,
          manualAttendanceCarryForward: false,
          oneTimeAllowanceCarryForward: false,
          oneTimeDeductionCarryForward: false,
          legacyOtherComponentCarryForward: organization.slug !== "zermatt-liquor-limited",
          scheduledDeductionCarryForward: "ONLY_MAPPED_INSTALLMENT_MONTHS",
          statutoryRecalculatedEachPeriod: true,
          salaryAdvanceDefault: 0,
          salaryAdvanceCarryForward: false,
          salaryAdvanceRecovery: "ONLY_ACTIVE_REPAYMENT_SCHEDULE_DUE_THIS_PERIOD",
          loanRecovery: "AUTHORITATIVE_OUTSTANDING_BALANCE",
        },
        control: "PAYE and pension are calculated under the effective Nigeria payroll policy except where an explicit CHRiS employment-type exemption rule applies. Part-Time, Expatriate and Internship/Intern employment types are set to zero PAYE and zero pension contribution in payroll under this CHRiS rule. ZERMATT payroll periods reset manual attendance, Salary Advance and Other items to period defaults. Salary Advance is ₦0 unless an active repayment schedule is due in the current payroll period; mapped recurring deduction installments and authoritative loan recoveries continue under their governed schedules. NSITF and ITF are employer costs, not employee deductions. Approval does not transmit bank/payment instructions.",
      },
    };
  });

  const existing = await prismaClient.$queryRawUnsafe(
    `SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "periodId"=$2 LIMIT 1`,
    organizationId,
    period.id
  );
  if (existing[0] && !["DRAFT", "REJECTED"].includes(existing[0].status)) {
    throw payrollError("PAYROLL_RUN_NOT_RECALCULABLE", `Payroll run is ${existing[0].status} and cannot be recalculated.`, 409);
  }
  const runId = existing[0]?.id || crypto.randomUUID();

  await prismaClient.$transaction(async (tx) => {
    if (existing[0]) {
      await tx.statutoryObligation.deleteMany({
        where: { organizationId, payrollRunId: runId, status: "DRAFT_CALCULATED" },
      });
      await tx.$executeRawUnsafe(`DELETE FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`, organizationId, runId);
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_runs"
            SET "status"='DRAFT',"employeeCount"=0,"grossTotal"=0,"deductionTotal"=0,"netPreviewTotal"=0,
                "statutoryStatus"='CALCULATED_NIGERIA_2026',"submittedByUserId"=NULL,"approvedByUserId"=NULL,
                "submittedAt"=NULL,"approvedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "id"=$2`,
        organizationId,
        runId
      );
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO "payroll_runs" ("id","organizationId","periodId","status","statutoryStatus","createdByUserId")
         VALUES ($1,$2,$3,'DRAFT','CALCULATED_NIGERIA_2026',$4)`,
        runId,
        organizationId,
        period.id,
        actorUserId || null
      );
    }

    await insertPayrollRunLinesBulk(tx, {
      organizationId,
      runId,
      lines,
    });

    await replaceDraftObligations(tx, {
      organizationId,
      payrollRunId: runId,
      periodEnd: period.periodEnd,
      ruleId: complianceRule?.id || null,
      lines,
    });

    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "employeeCount"=$3,"grossTotal"=$4,"deductionTotal"=$5,"netPreviewTotal"=$6,"statutoryStatus"='CALCULATED_NIGERIA_2026',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      lines.length,
      round2(lines.reduce((sum, line) => sum + line.grossPay, 0)),
      round2(lines.reduce((sum, line) => sum + line.deductions + line.advanceRecovery, 0)),
      round2(lines.reduce((sum, line) => sum + line.netPreview, 0))
    );
  }, {
    maxWait: 10000,
    timeout: 30000,
  });

  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityType: "PayrollRun",
    entityId: runId,
    action: existing[0] ? "RECALCULATED_NIGERIA_DRAFT" : "CREATED_NIGERIA_DRAFT",
    newValue: {
      periodId: period.id,
      periodCode: period.code,
      employeeCount: lines.length,
      policyCode: policy.code,
      policyVersion: policy.versionNumber,
      statutoryStatus: "CALCULATED_NIGERIA_2026",
    },
    reason: "Nigeria-compliant payroll draft calculation",
  });

  const runRows = await prismaClient.$queryRawUnsafe(
    `SELECT pr."id",pr."periodId",pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
            pr."status",pr."employeeCount",pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",pr."statutoryStatus",
            pr."submittedAt",pr."approvedAt",pr."createdAt",pr."updatedAt"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pr."organizationId"=$1 AND pr."id"=$2 LIMIT 1`,
    organizationId,
    runId
  );
  const lineRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions","advanceRecovery","grossPay","netPreview","statutoryStatus","details","createdAt","updatedAt"
       FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY "employeeNumber" ASC`,
    organizationId,
    runId
  );
  return {
    run: {
      ...runRows[0],
      periodStart: dateText(runRows[0].periodStart),
      periodEnd: dateText(runRows[0].periodEnd),
      payDate: dateText(runRows[0].payDate),
      employeeCount: Number(runRows[0].employeeCount || 0),
      grossTotal: Number(runRows[0].grossTotal || 0),
      deductionTotal: Number(runRows[0].deductionTotal || 0),
      netPreviewTotal: Number(runRows[0].netPreviewTotal || 0),
    },
    lines: lineRows.map((row) => ({
      ...row,
      baseSalary: Number(row.baseSalary || 0),
      allowances: Number(row.allowances || 0),
      deductions: Number(row.deductions || 0),
      advanceRecovery: Number(row.advanceRecovery || 0),
      grossPay: Number(row.grossPay || 0),
      netPreview: Number(row.netPreview || 0),
      details: jsonValue(row.details, {}),
    })),
  };
}

module.exports = {
  calculateAnnualPaye,
  calculateStructure,
  getActivePolicy,
  getCompliancePolicy,
  listTaxReliefs,
  declareRentRelief,
  decideRentRelief,
  executeNigeriaDraftPayroll,
  statutoryEmploymentTypeExemption,
  payrollError,
};
