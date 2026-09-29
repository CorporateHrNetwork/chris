const XLSX = require("xlsx");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const { getActivePolicy } = require("./nigeriaPayrollComplianceService");
const {
  calculateLeaveAllowance,
  ELIGIBLE_EMPLOYMENT_TYPE,
} = require("./zermattLeaveAllowanceService");

function text(value) { return String(value ?? "").trim(); }
function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[₦,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}
function normalizeHeader(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
const HEADER_ALIASES = {
  employeeNumber: ["employeenumber","employeeno","staffid","staffno","employeecode","staffnumber"],
  employeeName: ["employeename","staffname","name"],
  referenceDecemberYear: ["referencedecemberyear","decemberyear","referenceyear","salaryyear","year"],
  referenceDecemberGross: ["referencedecembergross","decembergross","lastdecembergross","decembergrosssalary","lastdecembersalary","salary","grosssalary","gross"],
  leaveAllowanceAmount: ["leaveallowanceamount","leaveallowance","allowanceamount","amount"],
};
function pick(row, key) {
  const aliases = HEADER_ALIASES[key];
  for (const [header, value] of Object.entries(row || {})) {
    if (aliases.includes(normalizeHeader(header))) return value;
  }
  return undefined;
}
function workbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}
function applicableMonthFromHireDate(hireDate, paymentYear) {
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime()) || !Number.isInteger(paymentYear)) return null;
  return `${paymentYear}-${String(hire.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function previewLeaveAllowanceReferenceWorkbook({ organizationId, buffer, fileName, prismaClient = prisma }) {
  const sourceRows = workbookRows(buffer);
  if (!sourceRows.length) {
    const error = new Error("The workbook contains no data rows.");
    error.code = "LEAVE_ALLOWANCE_REFERENCE_EMPTY";
    error.statusCode = 400;
    throw error;
  }

  const employees = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."status",e."hireDate",e."employmentType"
       FROM "employees" e
      WHERE e."organizationId"=$1`,
    organizationId
  );
  const byNumber = new Map(employees.map((employee) => [text(employee.employeeNumber).toUpperCase(), employee]));
  const seen = new Set();
  const policyCache = new Map();

  const rows = [];
  for (let index = 0; index < sourceRows.length; index += 1) {
    const row = sourceRows[index];
    const employeeNumber = text(pick(row, "employeeNumber")).toUpperCase();
    const employee = byNumber.get(employeeNumber) || null;
    const referenceDecemberYearRaw = Number(pick(row, "referenceDecemberYear"));
    const referenceDecemberYear = Number.isInteger(referenceDecemberYearRaw) ? referenceDecemberYearRaw : null;
    const referenceDecemberGross = money(pick(row, "referenceDecemberGross"));
    const suppliedAllowance = money(pick(row, "leaveAllowanceAmount"));
    const errors = [];
    const warnings = [];

    if (!employeeNumber) errors.push("Employee Number is required.");
    else if (!employee) errors.push(`Employee ${employeeNumber} was not found in this Zermatt tenant.`);
    if (!Number.isInteger(referenceDecemberYear) || referenceDecemberYear < 2000 || referenceDecemberYear > 2100) {
      errors.push("Reference December Year is required and must be valid.");
    }
    if (referenceDecemberGross == null || referenceDecemberGross <= 0) {
      errors.push("Last December Gross Salary must be greater than zero.");
    }
    if (employee && employee.employmentType !== ELIGIBLE_EMPLOYMENT_TYPE) {
      warnings.push(`${employee.employmentType || "This employment type"} is not currently eligible for Zermatt annual Leave Allowance.`);
    }

    let calculation = null;
    let applicableMonth = null;
    if (!errors.length) {
      const paymentYear = referenceDecemberYear + 1;
      applicableMonth = applicableMonthFromHireDate(employee.hireDate, paymentYear);
      if (!applicableMonth) errors.push("Employee Hire Date is required to derive the annual payment month.");

      let policy = policyCache.get(referenceDecemberYear);
      if (!policy) {
        policy = await getActivePolicy({
          organizationId,
          asOf: `${referenceDecemberYear}-12-31`,
          prismaClient,
        });
        policyCache.set(referenceDecemberYear, policy || null);
      }
      if (!policy) {
        errors.push(`No active payroll salary structure covers December ${referenceDecemberYear}.`);
      } else {
        calculation = calculateLeaveAllowance({
          referenceMonthlyGross: referenceDecemberGross,
          salaryStructure: policy.salaryStructure,
        });
        if (suppliedAllowance != null && Math.abs(suppliedAllowance - calculation.leaveAllowance) >= 0.01) {
          warnings.push(`Workbook Leave Allowance amount ${suppliedAllowance} is ignored; CHRiS computes ${calculation.leaveAllowance} from December Basic × 12 × 10%.`);
        }
      }
    }

    const key = employee && referenceDecemberYear ? `${employee.id}:${referenceDecemberYear}` : null;
    if (key && seen.has(key)) errors.push("Duplicate Employee + Reference December Year occurs in this workbook.");
    if (key) seen.add(key);

    rows.push({
      rowNumber: index + 2,
      employeeId: employee?.id || null,
      employeeNumber,
      employeeName: employee?.employeeName || text(pick(row, "employeeName")) || null,
      employeeStatus: employee?.status || null,
      employmentType: employee?.employmentType || null,
      hireDate: employee?.hireDate ? new Date(employee.hireDate).toISOString().slice(0,10) : null,
      applicableMonth,
      referenceDecemberYear,
      referenceDecemberGross,
      referenceDecemberBasic: calculation?.monthlyBasicSalary ?? null,
      annualBasicSalary: calculation?.annualBasicSalary ?? null,
      leaveAllowanceAmount: calculation?.leaveAllowance ?? null,
      ratePercent: calculation?.ratePercent ?? 10,
      formula: calculation?.formula || "Reference December Basic Salary × 12 × 10%",
      suppliedAllowanceAmount: suppliedAllowance,
      sourceFileName: fileName || null,
      valid: errors.length === 0,
      errors,
      warnings,
    });
  }

  return {
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.valid).length,
    invalidRows: rows.filter((row) => !row.valid).length,
    warningRows: rows.filter((row) => row.warnings.length).length,
    importAllowed: rows.length > 0 && rows.every((row) => row.valid),
    formula: "Reference December Basic Salary × 12 × 10%",
  };
}

async function importLeaveAllowanceReferenceWorkbook({ organizationId, actorUserId, buffer, fileName, prismaClient = prisma }) {
  const preview = await previewLeaveAllowanceReferenceWorkbook({ organizationId, buffer, fileName, prismaClient });
  if (!preview.importAllowed) {
    const error = new Error("The workbook has validation errors. Correct them and preview again before import.");
    error.code = "LEAVE_ALLOWANCE_REFERENCE_VALIDATION_FAILED";
    error.statusCode = 409;
    error.details = { rows: preview.rows.filter((row) => !row.valid) };
    throw error;
  }

  await prismaClient.$transaction(async (tx) => {
    for (const row of preview.rows) {
      await tx.$executeRawUnsafe(
        `UPDATE "zermatt_leave_allowance_references"
            SET "status"='RETIRED',"updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "referenceDecemberYear"=$3 AND "status"='ACTIVE'`,
        organizationId,
        row.employeeId,
        row.referenceDecemberYear
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "zermatt_leave_allowance_references"
          ("id","organizationId","employeeId","employeeNumber","applicableMonth","referenceDecemberYear",
           "referenceDecemberGross","leaveAllowanceAmount","sourceFileName","sourceRowNumber","status","createdByUserId")
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,'ACTIVE',$11)`,
        crypto.randomUUID(),
        organizationId,
        row.employeeId,
        row.employeeNumber,
        row.applicableMonth,
        row.referenceDecemberYear,
        row.referenceDecemberGross,
        row.leaveAllowanceAmount,
        fileName || null,
        row.rowNumber,
        actorUserId || null
      );
    }

    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "ZermattLeaveAllowanceSalaryReferenceImport",
        entityId: crypto.randomUUID(),
        action: "IMPORTED",
        newValue: {
          sourceFileName: fileName || null,
          formula: "Reference December Basic Salary × 12 × 10%",
          rowCount: preview.rows.length,
          employeeReferences: preview.rows.map((row) => ({
            employeeNumber: row.employeeNumber,
            referenceDecemberYear: row.referenceDecemberYear,
            referenceDecemberGross: row.referenceDecemberGross,
            referenceDecemberBasic: row.referenceDecemberBasic,
            annualBasicSalary: row.annualBasicSalary,
            calculatedLeaveAllowance: row.leaveAllowanceAmount,
            applicableMonth: row.applicableMonth,
          })),
        },
        reason: "Authoritative Zermatt December salary reference imported. CHRiS calculates annual Leave Allowance using Basic Salary × 12 × 10%.",
      },
    });
  });

  return { imported: preview.rows.length, rows: preview.rows, formula: preview.formula };
}

function leaveAllowanceReferenceTemplateBuffer() {
  const rows = [
    ["Employee Number","Employee Name","Reference December Year","Last December Gross Salary"],
    ["ZLL000001","Example Employee",2025,250000],
  ];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{wch:18},{wch:28},{wch:24},{wch:28}];
  XLSX.utils.book_append_sheet(workbook, sheet, "December Salary Reference");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  previewLeaveAllowanceReferenceWorkbook,
  importLeaveAllowanceReferenceWorkbook,
  leaveAllowanceReferenceTemplateBuffer,
};
