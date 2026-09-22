const prisma = require("../config/prisma");
const {
  buildCorrectionPlan: buildStrictCorrectionPlan,
  sourceReferenceFromNotes,
} = require("./loanOpeningBalanceCorrectionService");

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dateText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function normalizedText(value) {
  return String(value || "").trim().toUpperCase();
}

function exactLegacyIdentityMatches(loan, input) {
  if (!loan || !input) return false;
  return (
    String(loan.employeeId || "") === String(input.employeeId || "") &&
    normalizedText(loan.purpose) === normalizedText(input.purpose) &&
    money(loan.principalAmount) === money(input.principalAmount) &&
    money(loan.installmentAmount) === money(input.installmentAmount) &&
    dateText(loan.applicationDate) === String(input.applicationDate || "") &&
    dateText(loan.approvedDate) === String(input.approvedDate || "") &&
    dateText(loan.disbursedDate) === String(input.disbursedDate || "") &&
    dateText(loan.recoveryStartDate) === String(input.recoveryStartDate || "")
  );
}

function buildCorrectionPlanWithLegacyFallback({ rows, existingLoans, postedRecoveryCounts = new Map() }) {
  const strictPlan = buildStrictCorrectionPlan({ rows, existingLoans, postedRecoveryCounts });

  return strictPlan.map((plannedRow, index) => {
    const row = rows[index];
    const input = row?.input;
    const sourceReference = String(input?.sourceReference || row?.display?.sourceReference || "").trim();
    const missingReferenceMatch = (plannedRow.errors || []).includes(
      "No previously imported CHRiS loan matches this Source Reference."
    );

    if (!missingReferenceMatch || !sourceReference || !input) {
      return {
        ...plannedRow,
        matchMethod: plannedRow.loanId ? "SOURCE_REFERENCE" : null,
      };
    }

    // Fallback is intentionally limited to existing loans that do not already carry a different
    // Source Reference. This prevents a corrected workbook from hijacking another imported loan.
    const candidates = (existingLoans || []).filter((loan) => (
      !sourceReferenceFromNotes(loan.notes) && exactLegacyIdentityMatches(loan, input)
    ));

    if (candidates.length === 0) {
      return { ...plannedRow, matchMethod: null };
    }

    if (candidates.length > 1) {
      const errors = (plannedRow.errors || []).filter((item) => (
        item !== "No previously imported CHRiS loan matches this Source Reference."
      ));
      errors.push(
        "More than one legacy CHRiS loan matches the exact employee, loan terms and governing dates. Correction remains blocked until the duplicate is resolved."
      );
      return {
        ...plannedRow,
        valid: false,
        action: "BLOCKED",
        errors,
        matchMethod: "AMBIGUOUS_LEGACY_IDENTITY",
      };
    }

    const candidate = candidates[0];
    const syntheticNotes = [candidate.notes, `Source Reference: ${sourceReference}`]
      .filter(Boolean)
      .join(" | ");
    const reconciled = buildStrictCorrectionPlan({
      rows: [row],
      existingLoans: [{ ...candidate, notes: syntheticNotes }],
      postedRecoveryCounts,
    })[0];

    return {
      ...reconciled,
      matchMethod: "EXACT_LEGACY_IDENTITY",
      warnings: [
        ...(reconciled.warnings || []),
        "Existing legacy loan had no stored Source Reference. CHRiS matched it uniquely by employee, loan type, principal, installment and governing dates; no second loan will be created.",
      ],
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
  const postedRecoveryCounts = new Map(
    recoveryRows.map((row) => [row.loanId, Number(row.count || 0)])
  );
  return buildCorrectionPlanWithLegacyFallback({ rows, existingLoans, postedRecoveryCounts });
}

module.exports = {
  exactLegacyIdentityMatches,
  buildCorrectionPlanWithLegacyFallback,
  prepareOpeningBalanceCorrections,
};
