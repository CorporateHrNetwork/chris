const crypto = require("crypto");
const XLSX = require("xlsx");

const prisma = require("../config/prisma");
const { ZERMATT_LOAN_POLICIES, validateLoanPurpose } = require("./loanPolicyService");

const IMPORTABLE_STATUSES = new Set([
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
]);

function importError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCell(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(alias));
    if (found) return found[1];
  }
  return "";
}

function text(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).replace(/[₦$£€,%\s]/g, "").replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function normalizeDate(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return raw;
}

function normalizeStatus(value, { outstandingAmount, disbursedDate, recoveryStartDate }) {
  const raw = text(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (raw) return raw;
  if (outstandingAmount === 0) return "COMPLETED";
  if (disbursedDate && recoveryStartDate) return "ACTIVE";
  return "PENDING_APPROVAL";
}

function templateBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["CHRiS ZERMATT Loan Bulk Upload"],
      ["Use this workbook for existing/opening loan balances or controlled bulk loan migration."],
      ["Employee Number must already exist in CHRiS."],
      ["Loan Type must be one of the approved ZERMATT loan policies listed on the Loan Policies sheet."],
      ["All ZERMATT loan policies are 0% interest. Any non-zero interest value will be rejected."],
      ["Outstanding Balance may be supplied directly. If omitted, CHRiS derives it as Principal Amount minus Amount Already Recovered."],
      ["ACTIVE, PAUSED and COMPLETED rows require Disbursed Date and Recovery Start Date."],
      ["COMPLETED rows must have Outstanding Balance = 0. ACTIVE/PAUSED rows must have Outstanding Balance > 0."],
      ["Dates should use YYYY-MM-DD. Real Excel date cells are also accepted."],
      ["Always Validate/Preview before Import. If any row is invalid, the import is blocked until corrected."],
      ["Historical amounts already recovered before CHRiS are carried as opening recovery; CHRiS does not fabricate payroll recovery history for them."],
    ]),
    "Instructions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "Employee Number",
        "Loan Type",
        "Principal Amount",
        "Outstanding Balance",
        "Amount Already Recovered",
        "Monthly Installment",
        "Application Date",
        "Approved Date",
        "Disbursed Date",
        "Recovery Start Date",
        "Status",
        "Interest Rate %",
        "Source Reference",
        "Notes",
      ],
      [
        "ZLL000001",
        "Staff Loan",
        350000,
        350000,
        0,
        50000,
        "2026-09-01",
        "2026-09-01",
        "2026-09-01",
        "2026-09-01",
        "ACTIVE",
        0,
        "LEGACY-001",
        "Opening loan balance migration",
      ],
    ]),
    "Loans"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Approved ZERMATT Loan Type", "Interest Rate %"],
      ...ZERMATT_LOAN_POLICIES.map((name) => [name, 0]),
    ]),
    "Loan Policies"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function fingerprint(input) {
  return [
    input.employeeId,
    input.purpose,
    input.principalAmount,
    input.installmentAmount,
    input.disbursedDate || "",
    input.recoveryStartDate || "",
    input.sourceReference || "",
  ].join("|").toUpperCase();
}

async function prepareLoanWorkbook({ organizationId, buffer, prismaClient = prisma }) {
  if (!buffer) throw importError("IMPORT_FILE_REQUIRED", "Select an Excel file to validate.");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "loans") || workbook.SheetNames[0];
  if (!sheetName) throw importError("EMPTY_WORKBOOK", "The workbook does not contain a worksheet.");
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: true });
  if (!sourceRows.length) throw importError("EMPTY_LOAN_WORKBOOK", "The selected worksheet contains no loan rows.");

  const employees = await prismaClient.employee.findMany({
    where: { organizationId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
    },
  });
  const employeeMap = new Map(employees.map((employee) => [employee.employeeNumber.toUpperCase(), employee]));
  const existingLoans = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."loanNumber",l."employeeId",l."purpose",l."principalAmount",l."installmentAmount",
            l."disbursedDate",l."recoveryStartDate",l."notes"
       FROM "payroll_loans" l
      WHERE l."organizationId"=$1`,
    organizationId
  );
  const existingFingerprints = new Map();
  for (const loan of existingLoans) {
    const sourceMatch = String(loan.notes || "").match(/Source Reference:\s*([^|\n]+)/i);
    const key = fingerprint({
      employeeId: loan.employeeId,
      purpose: loan.purpose || "",
      principalAmount: Number(loan.principalAmount || 0),
      installmentAmount: Number(loan.installmentAmount || 0),
      disbursedDate: loan.disbursedDate ? new Date(loan.disbursedDate).toISOString().slice(0, 10) : "",
      recoveryStartDate: loan.recoveryStartDate ? new Date(loan.recoveryStartDate).toISOString().slice(0, 10) : "",
      sourceReference: sourceMatch ? sourceMatch[1].trim() : "",
    });
    existingFingerprints.set(key, loan.loanNumber);
  }

  const workbookFingerprints = new Map();
  const rows = [];
  for (let index = 0; index < sourceRows.length; index += 1) {
    const row = sourceRows[index];
    const employeeNumber = text(getCell(row, ["Employee Number", "Employee No", "Employee ID", "Staff ID", "Staff Number"])).toUpperCase();
    const employee = employeeMap.get(employeeNumber);
    const purposeRaw = text(getCell(row, ["Loan Type", "Loan Policy", "Purpose", "Loan Purpose", "Reason for Loan", "Reason"]));
    const principalAmount = numberValue(getCell(row, ["Principal Amount", "Loan Amount", "Amount Granted", "Principal"]));
    let outstandingAmount = numberValue(getCell(row, ["Outstanding Balance", "Outstanding Amount", "Balance", "Loan Balance"]));
    const recoveredAmountRaw = numberValue(getCell(row, ["Amount Already Recovered", "Amount Paid", "Recovered Amount", "Total Recovered", "Paid Amount"]));
    const installmentAmount = numberValue(getCell(row, ["Monthly Installment", "Installment Amount", "Monthly Deduction", "Monthly Charge", "Repayment Amount"]));
    const applicationDate = normalizeDate(getCell(row, ["Application Date", "Applied Date", "Date Applied"]));
    const approvedDate = normalizeDate(getCell(row, ["Approved Date", "Approval Date"]));
    const disbursedDate = normalizeDate(getCell(row, ["Disbursed Date", "Disbursement Date", "Date Disbursed"]));
    const recoveryStartDate = normalizeDate(getCell(row, ["Recovery Start Date", "Repayment Start Date", "Deduction Start Date", "Start Recovery Date"]));
    const sourceReference = text(getCell(row, ["Source Reference", "Loan Reference", "Existing Loan Number", "Reference"]));
    const notes = text(getCell(row, ["Notes", "Remark", "Remarks", "Comment", "Comments"]));
    const interestRate = numberValue(getCell(row, ["Interest Rate %", "Interest Rate", "Interest", "Rate"]));

    if (outstandingAmount === null && principalAmount !== null && recoveredAmountRaw !== null) {
      outstandingAmount = Math.round(Math.max(0, principalAmount - recoveredAmountRaw) * 100) / 100;
    }
    if (outstandingAmount === null && principalAmount !== null) outstandingAmount = principalAmount;
    const recoveredAmount = principalAmount !== null && outstandingAmount !== null
      ? Math.round(Math.max(0, principalAmount - outstandingAmount) * 100) / 100
      : null;
    const status = normalizeStatus(getCell(row, ["Status", "Loan Status"]), { outstandingAmount, disbursedDate, recoveryStartDate });
    const errors = [];
    const warnings = [];

    if (!employeeNumber || !employee) errors.push("Employee Number was not found in this organization.");
    if (!purposeRaw) errors.push("Loan Type is required.");
    let purpose = purposeRaw;
    if (purposeRaw) {
      try {
        purpose = await validateLoanPurpose({ organizationId, purpose: purposeRaw, prismaClient });
      } catch (error) {
        errors.push(error.message || "Loan Type is not an approved ZERMATT loan policy.");
      }
    }
    if (principalAmount === null || principalAmount <= 0) errors.push("Principal Amount must be greater than zero.");
    if (outstandingAmount === null || outstandingAmount < 0) errors.push("Outstanding Balance must be zero or greater.");
    if (principalAmount !== null && outstandingAmount !== null && outstandingAmount > principalAmount) errors.push("Outstanding Balance cannot exceed Principal Amount.");
    if (installmentAmount === null || installmentAmount <= 0) errors.push("Monthly Installment must be greater than zero.");
    if (principalAmount !== null && installmentAmount !== null && installmentAmount > principalAmount) errors.push("Monthly Installment cannot exceed Principal Amount.");
    if (interestRate !== null && interestRate !== 0) errors.push("ZERMATT loans are zero-interest; Interest Rate must be blank or 0.");
    if (!IMPORTABLE_STATUSES.has(status)) errors.push(`Status ${status || "(blank)"} is not importable.`);
    if (!applicationDate) errors.push("Application Date is required for an opening-balance import.");
    for (const [label, value] of [["Application Date", applicationDate], ["Approved Date", approvedDate], ["Disbursed Date", disbursedDate], ["Recovery Start Date", recoveryStartDate]]) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${label} must use YYYY-MM-DD or be a valid Excel date.`);
    }
    if (["ACTIVE", "PAUSED", "COMPLETED"].includes(status) && (!disbursedDate || !recoveryStartDate)) {
      errors.push(`${status} loans require Disbursed Date and Recovery Start Date.`);
    }
    if (disbursedDate && recoveryStartDate && recoveryStartDate < disbursedDate) errors.push("Recovery Start Date cannot be earlier than Disbursed Date.");
    if (["PENDING_APPROVAL", "APPROVED"].includes(status) && principalAmount !== null && outstandingAmount !== principalAmount) {
      errors.push(`${status} loans cannot carry a previously recovered amount.`);
    }
    if (status === "COMPLETED" && outstandingAmount !== 0) errors.push("COMPLETED loans must have Outstanding Balance = 0.");
    if (["ACTIVE", "PAUSED"].includes(status) && outstandingAmount === 0) errors.push(`${status} loans must have an Outstanding Balance greater than zero.`);
    if (recoveredAmountRaw !== null && recoveredAmount !== null && Math.abs(recoveredAmountRaw - recoveredAmount) > 0.01) {
      errors.push("Amount Already Recovered does not reconcile to Principal Amount minus Outstanding Balance.");
    }
    if (employee && !["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"].includes(employee.status) && status === "ACTIVE") {
      errors.push(`Employee is ${employee.status}; an ACTIVE loan cannot be imported for payroll recovery.`);
    }
    if (!sourceReference) warnings.push("Source Reference is blank; duplicate protection will rely on loan terms and dates.");

    const input = employee && principalAmount !== null && outstandingAmount !== null && installmentAmount !== null
      ? {
          employeeId: employee.id,
          employeeNumber,
          employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
          purpose,
          principalAmount,
          outstandingAmount,
          recoveredAmount: recoveredAmount || 0,
          installmentAmount,
          applicationDate,
          approvedDate: approvedDate || null,
          disbursedDate: disbursedDate || null,
          recoveryStartDate: recoveryStartDate || null,
          status,
          sourceReference: sourceReference || null,
          notes: notes || null,
        }
      : null;

    if (input) {
      const key = fingerprint(input);
      if (existingFingerprints.has(key)) errors.push(`Likely duplicate of existing loan ${existingFingerprints.get(key)}.`);
      if (workbookFingerprints.has(key)) errors.push(`Duplicate of workbook row ${workbookFingerprints.get(key)}.`);
      else workbookFingerprints.set(key, index + 2);
    }

    rows.push({
      rowNumber: index + 2,
      valid: errors.length === 0,
      errors,
      warnings,
      input: errors.length ? null : input,
      display: {
        employeeNumber,
        employeeName: input?.employeeName || "",
        purpose: purposeRaw,
        principalAmount,
        recoveredAmount,
        outstandingAmount,
        installmentAmount,
        applicationDate,
        disbursedDate,
        recoveryStartDate,
        status,
        sourceReference,
      },
    });
  }
  return rows;
}

async function importOpeningLoans({ organizationId, actorUserId, rows, prismaClient = prisma }) {
  if (!Array.isArray(rows) || !rows.length) throw importError("NO_VALID_LOAN_ROWS", "There are no loan rows to import.");
  const invalid = rows.filter((row) => !row.valid || !row.input);
  if (invalid.length) {
    throw importError("LOAN_IMPORT_VALIDATION_FAILED", "Loan import is blocked until every row passes validation.", 409, {
      invalidRows: invalid.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })),
    });
  }

  return prismaClient.$transaction(async (tx) => {
    const created = [];
    for (const row of rows) {
      const input = row.input;
      const id = crypto.randomUUID();
      const loanNumber = `LN-${input.employeeNumber}-${id.slice(0, 8).toUpperCase()}`;
      const auditNotes = [
        input.sourceReference ? `Source Reference: ${input.sourceReference}` : null,
        input.notes,
        input.recoveredAmount > 0 ? `Opening recovered before CHRiS: ${input.recoveredAmount.toFixed(2)}` : null,
      ].filter(Boolean).join(" | ") || "Opening loan balance bulk import";

      const result = await tx.$queryRawUnsafe(
        `INSERT INTO "payroll_loans"
          ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount",
           "applicationDate","approvedDate","disbursedDate","recoveryStartDate","status","purpose","notes","createdByUserId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11::date,$12,$13,$14,$15)
         RETURNING "id","loanNumber","status","principalAmount","outstandingAmount"`,
        id,
        organizationId,
        input.employeeId,
        loanNumber,
        input.principalAmount,
        input.outstandingAmount,
        input.installmentAmount,
        input.applicationDate,
        input.approvedDate,
        input.disbursedDate,
        input.recoveryStartDate,
        input.status,
        input.purpose,
        auditNotes,
        actorUserId || null
      );

      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: actorUserId || null,
          entityType: "PayrollLoan",
          entityId: id,
          action: "LOAN_BULK_OPENING_IMPORT",
          newValue: {
            employeeNumber: input.employeeNumber,
            loanNumber,
            purpose: input.purpose,
            principalAmount: input.principalAmount,
            openingRecoveredAmount: input.recoveredAmount,
            outstandingAmount: input.outstandingAmount,
            installmentAmount: input.installmentAmount,
            status: input.status,
            sourceReference: input.sourceReference,
          },
          reason: "Controlled Excel opening-balance loan import",
        },
      });
      created.push({
        rowNumber: row.rowNumber,
        employeeNumber: input.employeeNumber,
        employeeName: input.employeeName,
        loanNumber,
        status: input.status,
        principalAmount: input.principalAmount,
        outstandingAmount: input.outstandingAmount,
        id: result[0]?.id || id,
      });
    }
    return created;
  });
}

module.exports = {
  IMPORTABLE_STATUSES,
  templateBuffer,
  prepareLoanWorkbook,
  importOpeningLoans,
};
