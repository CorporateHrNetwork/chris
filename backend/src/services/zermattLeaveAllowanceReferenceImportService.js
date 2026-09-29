const XLSX = require("xlsx");
const crypto = require("crypto");
const prisma = require("../config/prisma");

function text(value) { return String(value ?? "").trim(); }
function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[₦,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}
function monthStart(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function normalizeHeader(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
const HEADER_ALIASES = {
  employeeNumber: ["employeenumber","employeeno","staffid","staffno","employeecode","staffnumber"],
  employeeName: ["employeename","staffname","name"],
  applicableMonth: ["applicablemonth","paymentmonth","payrollmonth","month","paymonth"],
  referenceDecemberYear: ["referencedecemberyear","decemberyear","referenceyear","salaryyear"],
  referenceDecemberGross: ["referencedecembergross","decembergross","lastdecembergross","decembergrosssalary","lastdecembersalary"],
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

async function previewLeaveAllowanceReferenceWorkbook({ organizationId, buffer, fileName, prismaClient = prisma }) {
  const sourceRows = workbookRows(buffer);
  if (!sourceRows.length) {
    const error = new Error("The workbook contains no data rows.");
    error.code = "LEAVE_ALLOWANCE_REFERENCE_EMPTY";
    error.statusCode = 400;
    throw error;
  }

  const employees = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",e."status"
       FROM "employees" e
      WHERE e."organizationId"=$1`,
    organizationId
  );
  const byNumber = new Map(employees.map((employee) => [text(employee.employeeNumber).toUpperCase(), employee]));
  const seen = new Set();

  const rows = sourceRows.map((row, index) => {
    const employeeNumber = text(pick(row, "employeeNumber")).toUpperCase();
    const employee = byNumber.get(employeeNumber) || null;
    const applicableMonth = monthStart(pick(row, "applicableMonth"));
    const referenceDecemberYearRaw = Number(pick(row, "referenceDecemberYear"));
    const referenceDecemberGross = money(pick(row, "referenceDecemberGross"));
    const leaveAllowanceAmount = money(pick(row, "leaveAllowanceAmount"));
    const referenceDecemberYear = Number.isInteger(referenceDecemberYearRaw)
      ? referenceDecemberYearRaw
      : applicableMonth ? Number(applicableMonth.slice(0,4)) - 1 : null;
    const errors = [];
    const warnings = [];

    if (!employeeNumber) errors.push("Employee Number is required.");
    else if (!employee) errors.push(`Employee ${employeeNumber} was not found in this Zermatt tenant.`);
    if (!applicableMonth) errors.push("Applicable Month must be a valid month/date.");
    if (!Number.isInteger(referenceDecemberYear) || referenceDecemberYear < 2000 || referenceDecemberYear > 2100) {
      errors.push("Reference December Year is invalid.");
    }
    if (referenceDecemberGross == null || referenceDecemberGross < 0) errors.push("Last December Gross must be zero or greater.");
    if (leaveAllowanceAmount == null || leaveAllowanceAmount < 0) errors.push("Leave Allowance Amount must be zero or greater.");

    if (applicableMonth && referenceDecemberYear && Number(applicableMonth.slice(0,4)) <= referenceDecemberYear) {
      warnings.push("Applicable month should normally fall after the referenced December year.");
    }

    const key = employee && applicableMonth ? `${employee.id}:${applicableMonth}` : null;
    if (key && seen.has(key)) errors.push("Duplicate Employee + Applicable Month occurs in this workbook.");
    if (key) seen.add(key);

    return {
      rowNumber: index + 2,
      employeeId: employee?.id || null,
      employeeNumber,
      employeeName: employee?.employeeName || text(pick(row, "employeeName")) || null,
      employeeStatus: employee?.status || null,
      applicableMonth,
      referenceDecemberYear,
      referenceDecemberGross,
      leaveAllowanceAmount,
      sourceFileName: fileName || null,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });

  return {
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.valid).length,
    invalidRows: rows.filter((row) => !row.valid).length,
    warningRows: rows.filter((row) => row.warnings.length).length,
    importAllowed: rows.length > 0 && rows.every((row) => row.valid),
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
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "applicableMonth"=$3::date AND "status"='ACTIVE'`,
        organizationId,
        row.employeeId,
        row.applicableMonth
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
        entityType: "ZermattLeaveAllowanceReferenceImport",
        entityId: crypto.randomUUID(),
        action: "IMPORTED",
        newValue: {
          sourceFileName: fileName || null,
          rowCount: preview.rows.length,
          employeeMonths: preview.rows.map((row) => ({
            employeeNumber: row.employeeNumber,
            applicableMonth: row.applicableMonth,
            referenceDecemberYear: row.referenceDecemberYear,
            referenceDecemberGross: row.referenceDecemberGross,
            leaveAllowanceAmount: row.leaveAllowanceAmount,
          })),
        },
        reason: "Authoritative Zermatt Leave Allowance reference schedule imported for payroll.",
      },
    });
  });

  return { imported: preview.rows.length, rows: preview.rows };
}

function leaveAllowanceReferenceTemplateBuffer() {
  const rows = [
    ["Employee Number","Employee Name","Applicable Month","Reference December Year","Last December Gross","Leave Allowance Amount"],
    ["ZLL000001","Example Employee","2026-10",2025,250000,25000],
  ];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{wch:18},{wch:28},{wch:18},{wch:24},{wch:22},{wch:24}];
  XLSX.utils.book_append_sheet(workbook, sheet, "Leave Allowance Reference");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  previewLeaveAllowanceReferenceWorkbook,
  importLeaveAllowanceReferenceWorkbook,
  leaveAllowanceReferenceTemplateBuffer,
};
