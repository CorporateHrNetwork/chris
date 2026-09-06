const XLSX = require("xlsx");

const prisma = require("../config/prisma");
const { validateLoanPurpose } = require("./loanPolicyService");
const { markDraftRunsRecalculationRequired } = require("./payrollDraftFreshnessService");

const CORRECTABLE_STATUSES = new Set(["ACTIVE", "PAUSED", "COMPLETED"]);

function correctionError(code, message, statusCode = 400, details) {
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

function money(value) {
  const number = Number(value || 0);
  return Math.round(number * 100) / 100;
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).replace(/[₦$£€,%\s]/g, "").replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? money(number) : null;
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

function sourceReferenceFromNotes(notes) {
  const match = String(notes || "").match(/Source Reference:\s*([^|\n]+)/i);
  return match ? match[1].trim() : "";
}

function dateText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

async function parseCorrectionWorkbook({ organizationId, buffer, prismaClient = prisma }) {
  if (!buffer) throw correctionError("IMPORT_FILE_REQUIRED", "Select the corrected Excel loan workbook first.");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "loans") || workbook.SheetNames[0];
  if (!sheetName) throw correctionError("EMPTY_WORKBOOK", "The workbook does not contain a worksheet.");
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: true });
  if (!sourceRows.length) throw correctionError("EMPTY_LOAN_WORKBOOK", "The selected worksheet contains no loan rows.");

  const employees = await prismaClient.employee.findMany({
    where: { organizationId },
    select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true },
  });
  const employeeMap = new Map(employees.map((employee) => [employee.employeeNumber.toUpperCase(), employee]));
  const workbookSources = new Map();

  const rows = [];
  for (let index = 0; index < sourceRows.length; index += 1) {
    const row = sourceRows[index];
    const employeeNumber = text(getCell(row, ["Employee Number", "Employee No", "Employee ID", "Staff ID", "Staff Number"])).toUpperCase();
    const employee = employeeMap.get(employeeNumber);
    const purposeRaw = text(getCell(row, ["Loan Type", "Loan Policy", "Purpose", "Loan Purpose", "Reason for Loan", "Reason"]));
    const principalAmount = numberValue(getCell(row, ["Principal Amount", "Loan Amount", "Amount Granted", "Principal"]));
    const outstandingAmount = numberValue(getCell(row, ["Outstanding Balance", "Outstanding Amount", "Balance", "Loan Balance"]));
    const recoveredAmountRaw = numberValue(getCell(row, ["Amount Already Recovered", "Amount Paid", "Recovered Amount", "Total Recovered", "Paid Amount"]));
    const installmentAmount = numberValue(getCell(row, ["Monthly Installment", "Installment Amount", "Monthly Deduction", "Monthly Charge", "Repayment Amount"]));
    const applicationDate = normalizeDate(getCell(row, ["Application Date", "Applied Date", "Date Applied"]));
    const approvedDate = normalizeDate(getCell(row, ["Approved Date", "Approval Date"]));
    const disbursedDate = normalizeDate(getCell(row, ["Disbursed Date", "Disbursement Date", "Date Disbursed"]));
    const recoveryStartDate = normalizeDate(getCell(row, ["Recovery Start Date", "Repayment Start Date", "Deduction Start Date", "Start Recovery Date"]));
    const sourceReference = text(getCell(row, ["Source Reference", "Loan Reference", "Existing Loan Number", "Reference"]));
    const status = text(getCell(row, ["Status", "Loan Status"])).toUpperCase().replace(/[\s-]+/g, "_");
    const interestRate = numberValue(getCell(row, ["Interest Rate %", "Interest Rate", "Interest", "Rate"]));
    const errors = [];
    const warnings = [];

    if (!employee) errors.push("Employee Number was not found in this organization.");
    if (!sourceReference) errors.push("Source Reference is required for an opening-balance correction.");
    if (sourceReference) {
      const key = sourceReference.toUpperCase();
      if (workbookSources.has(key)) errors.push(`Source Reference duplicates workbook row ${workbookSources.get(key)}.`);
      else workbookSources.set(key, index + 2);
    }

    let purpose = purposeRaw;
    if (!purposeRaw) errors.push("Loan Type is required.");
    else {
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
    if (interestRate !== null && interestRate !== 0) errors.push("ZERMATT loans are zero-interest; Interest Rate must be blank or 0.");
    if (status && !CORRECTABLE_STATUSES.has(status)) errors.push(`Status ${status} is not eligible for opening-balance correction.`);

    for (const [label, value] of [
      ["Application Date", applicationDate],
      ["Approved Date", approvedDate],
      ["Disbursed Date", disbursedDate],
      ["Recovery Start Date", recoveryStartDate],
    ]) {
      if (!value) errors.push(`${label} is required for an opening-balance correction.`);
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${label} must use YYYY-MM-DD or be a valid Excel date.`);
    }
    if (disbursedDate && recoveryStartDate && recoveryStartDate < disbursedDate) errors.push("Recovery Start Date cannot be earlier than Disbursed Date.");

    const recoveredAmount = principalAmount !== null && outstandingAmount !== null ? money(principalAmount - outstandingAmount) : null;
    if (recoveredAmountRaw !== null && recoveredAmount !== null && Math.abs(recoveredAmountRaw - recoveredAmount) > 0.01) {
      errors.push("Amount Already Recovered does not reconcile to Principal Amount minus Outstanding Balance.");
    }

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
          approvedDate,
          disbursedDate,
          recoveryStartDate,
          status,
          sourceReference,
        }
      : null;

    rows.push({
      rowNumber: index + 2,
      valid: errors.length === 0,
      errors,
      warnings,
      input,
      display: {
        employeeNumber,
        employeeName: input?.employeeName || "",
        purpose: purposeRaw,
        principalAmount,
        recoveredAmount,
        outstandingAmount,
        installmentAmount,
        status,
        sourceReference,
      },
    });
  }
  return rows;
}

function buildCorrectionPlan({ rows, existingLoans, postedRecoveryCounts = new Map() }) {
  const existingBySource = new Map();
  for (const loan of existingLoans || []) {
    const sourceReference = sourceReferenceFromNotes(loan.notes);
    if (!sourceReference) continue;
    const key = sourceReference.toUpperCase();
    if (!existingBySource.has(key)) existingBySource.set(key, []);
    existingBySource.get(key).push(loan);
  }

  return (rows || []).map((row) => {
    const errors = [...(row.errors || [])];
    const warnings = [...(row.warnings || [])];
    const input = row.input;
    const sourceReference = String(input?.sourceReference || row.display?.sourceReference || "").trim();
    const matches = sourceReference ? (existingBySource.get(sourceReference.toUpperCase()) || []) : [];
    const loan = matches.length === 1 ? matches[0] : null;

    if (!sourceReference) errors.push("Source Reference is required for an opening-balance correction.");
    if (sourceReference && matches.length === 0) errors.push("No previously imported CHRiS loan matches this Source Reference.");
    if (matches.length > 1) errors.push("Source Reference matches more than one existing loan; correction is blocked until the duplicate is resolved.");

    if (loan && input) {
      const identityChecks = [
        [String(loan.employeeId), String(input.employeeId), "Employee"],
        [String(loan.purpose || ""), String(input.purpose || ""), "Loan Type"],
        [money(loan.principalAmount), money(input.principalAmount), "Principal Amount"],
        [money(loan.installmentAmount), money(input.installmentAmount), "Monthly Installment"],
        [dateText(loan.applicationDate), String(input.applicationDate || ""), "Application Date"],
        [dateText(loan.approvedDate), String(input.approvedDate || ""), "Approved Date"],
        [dateText(loan.disbursedDate), String(input.disbursedDate || ""), "Disbursed Date"],
        [dateText(loan.recoveryStartDate), String(input.recoveryStartDate || ""), "Recovery Start Date"],
      ];
      for (const [existingValue, correctedValue, label] of identityChecks) {
        if (String(existingValue) !== String(correctedValue)) {
          errors.push(`${label} differs from the already imported loan. Opening-balance correction may change balances only.`);
        }
      }
      if (!CORRECTABLE_STATUSES.has(String(loan.status || ""))) {
        errors.push(`Existing loan status ${loan.status || "(blank)"} is not eligible for opening-balance correction.`);
      }
    }

    const oldOutstanding = loan ? money(loan.outstandingAmount) : null;
    const newOutstanding = input ? money(input.outstandingAmount) : null;
    const principalAmount = input ? money(input.principalAmount) : (loan ? money(loan.principalAmount) : null);
    const oldRecovered = loan ? money(principalAmount - oldOutstanding) : null;
    const newRecovered = input ? money(principalAmount - newOutstanding) : null;
    const balanceChanged = Boolean(loan && input && Math.abs(oldOutstanding - newOutstanding) > 0.009);

    if (loan && balanceChanged && Number(postedRecoveryCounts.get(loan.id) || 0) > 0) {
      errors.push("A CHRiS approved-payroll loan recovery has already posted. Opening balance can no longer be replaced through bulk correction.");
    }

    const changed = Boolean(loan && input && errors.length === 0 && balanceChanged);
    const noChange = Boolean(loan && input && errors.length === 0 && !balanceChanged);

    return {
      rowNumber: row.rowNumber,
      valid: errors.length === 0,
      action: errors.length ? "BLOCKED" : changed ? "CORRECT" : "NO_CHANGE",
      errors,
      warnings,
      loanId: loan?.id || null,
      loanNumber: loan?.loanNumber || null,
      sourceReference: sourceReference || null,
      employeeNumber: input?.employeeNumber || row.display?.employeeNumber || "",
      employeeName: input?.employeeName || row.display?.employeeName || "",
      oldOutstanding,
      newOutstanding,
      oldRecovered,
      newRecovered,
      existingStatus: loan?.status || null,
      targetStatus: input?.outstandingAmount === 0 ? "COMPLETED" : (loan?.status === "PAUSED" ? "PAUSED" : "ACTIVE"),
      changed,
      noChange,
    };
  });
}

async function prepareOpeningBalanceCorrections({ organizationId, rows, prismaClient = prisma }) {
  const existingLoans = await prismaClient.$queryRawUnsafe(
    `SELECT "id","loanNumber","employeeId","purpose","principalAmount","outstandingAmount","installmentAmount",
            "applicationDate","approvedDate","disbursedDate","recoveryStartDate","status","notes"
       FROM "payroll_loans"
      WHERE "organizationId"=$1`,
    organizationId
  );
  const recoveryRows = await prismaClient.$queryRawUnsafe(
    `SELECT "loanId", COUNT(*)::int AS "count"
       FROM "payroll_loan_recoveries"
      WHERE "organizationId"=$1 AND "status"='POSTED'
      GROUP BY "loanId"`,
    organizationId
  );
  const postedRecoveryCounts = new Map(recoveryRows.map((row) => [row.loanId, Number(row.count || 0)]));
  return buildCorrectionPlan({ rows, existingLoans, postedRecoveryCounts });
}

async function applyOpeningBalanceCorrections({ organizationId, actorUserId, plan, prismaClient = prisma }) {
  if (!Array.isArray(plan) || !plan.length) throw correctionError("NO_LOAN_CORRECTION_ROWS", "There are no correction rows to apply.");
  const blocked = plan.filter((row) => !row.valid || row.action === "BLOCKED");
  if (blocked.length) {
    throw correctionError("LOAN_OPENING_CORRECTION_BLOCKED", "Opening-balance correction is blocked until every row passes validation.", 409, {
      blockedRows: blocked.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })),
    });
  }

  const corrections = plan.filter((row) => row.action === "CORRECT");
  return prismaClient.$transaction(async (tx) => {
    const applied = [];
    for (const row of corrections) {
      const recoveryCheck = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "count"
           FROM "payroll_loan_recoveries"
          WHERE "organizationId"=$1 AND "loanId"=$2 AND "status"='POSTED'`,
        organizationId,
        row.loanId
      );
      if (Number(recoveryCheck[0]?.count || 0) > 0) {
        throw correctionError("LOAN_RECOVERY_HISTORY_LOCKED", `Loan ${row.loanNumber} received an approved-payroll recovery after preview. Revalidate before correcting.`, 409);
      }

      const currentRows = await tx.$queryRawUnsafe(
        `SELECT "outstandingAmount","principalAmount","status"
           FROM "payroll_loans"
          WHERE "organizationId"=$1 AND "id"=$2
          FOR UPDATE`,
        organizationId,
        row.loanId
      );
      const current = currentRows[0];
      if (!current) throw correctionError("LOAN_NOT_FOUND", `Loan ${row.loanNumber} is no longer available.`, 404);
      const currentOutstanding = money(current.outstandingAmount);
      if (Math.abs(currentOutstanding - money(row.oldOutstanding)) > 0.009) {
        throw correctionError("LOAN_OPENING_BALANCE_CHANGED", `Loan ${row.loanNumber} changed after preview. Revalidate the workbook before correcting.`, 409);
      }

      const targetStatus = money(row.newOutstanding) === 0 ? "COMPLETED" : (current.status === "PAUSED" ? "PAUSED" : "ACTIVE");
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_loans"
            SET "outstandingAmount"=$1,"status"=$2,"updatedAt"=NOW()
          WHERE "organizationId"=$3 AND "id"=$4`,
        money(row.newOutstanding),
        targetStatus,
        organizationId,
        row.loanId
      );

      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: actorUserId || null,
          entityType: "PayrollLoan",
          entityId: row.loanId,
          action: "LOAN_OPENING_BALANCE_CORRECTED",
          oldValue: {
            outstandingAmount: money(row.oldOutstanding),
            openingRecoveredAmount: money(row.oldRecovered),
            status: current.status,
          },
          newValue: {
            outstandingAmount: money(row.newOutstanding),
            openingRecoveredAmount: money(row.newRecovered),
            status: targetStatus,
            sourceReference: row.sourceReference,
          },
          reason: "Controlled correction of imported opening loan balance before any CHRiS approved-payroll recovery",
        },
      });

      applied.push({
        rowNumber: row.rowNumber,
        loanId: row.loanId,
        loanNumber: row.loanNumber,
        employeeNumber: row.employeeNumber,
        sourceReference: row.sourceReference,
        oldOutstanding: money(row.oldOutstanding),
        newOutstanding: money(row.newOutstanding),
        oldRecovered: money(row.oldRecovered),
        newRecovered: money(row.newRecovered),
        status: targetStatus,
      });
    }

    let payrollDraftFreshness = { markedRuns: 0, runIds: [] };
    if (applied.length) {
      payrollDraftFreshness = await markDraftRunsRecalculationRequired({
        organizationId,
        actorUserId,
        reason: "Imported opening loan balances were corrected after payroll draft calculation.",
        prismaClient: tx,
      });
    }

    return {
      applied,
      corrected: applied.length,
      unchanged: plan.filter((row) => row.action === "NO_CHANGE").length,
      total: plan.length,
      payrollDraftFreshness,
    };
  });
}

module.exports = {
  CORRECTABLE_STATUSES,
  parseCorrectionWorkbook,
  sourceReferenceFromNotes,
  buildCorrectionPlan,
  prepareOpeningBalanceCorrections,
  applyOpeningBalanceCorrections,
};
