// Repayment terms are derived client-side for the authorized HR recording preview.
// The loan API continues to receive the existing installmentAmount field and remains
// authoritative for posted payroll recoveries and repayment history.
export const MAX_REPAYMENT_MONTHS = 600;

export function deriveLoanRepaymentTerms(balanceValue, mode, installmentValue, monthsValue) {
  const balanceNumber = Number(balanceValue);
  if (!Number.isFinite(balanceNumber) || balanceNumber <= 0) return null;
  const balanceCents = Math.round(balanceNumber * 100);
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 1) {
    return { invalidReason: "Enter a valid loan balance in naira and kobo." };
  }

  let installmentCents;
  let requestedMonths = null;
  if (mode === "MONTHS") {
    const monthsString = String(monthsValue ?? "").trim();
    if (!monthsString) return null;
    if (!/^[1-9]\d*$/.test(monthsString)) {
      return { invalidReason: "Enter a whole number of repayment months." };
    }
    requestedMonths = Number(monthsString);
    if (!Number.isSafeInteger(requestedMonths) || requestedMonths > MAX_REPAYMENT_MONTHS) {
      return { invalidReason: `Repayment duration must be between 1 and ${MAX_REPAYMENT_MONTHS} months.` };
    }
    installmentCents = Math.ceil(balanceCents / requestedMonths);
  } else {
    if (String(installmentValue ?? "").trim() === "") return null;
    const installmentNumber = Number(installmentValue);
    if (!Number.isFinite(installmentNumber) || installmentNumber <= 0) {
      return { invalidReason: "Enter a positive monthly instalment." };
    }
    installmentCents = Math.round(installmentNumber * 100);
    if (!Number.isSafeInteger(installmentCents) || installmentCents < 1) {
      return { invalidReason: "Monthly instalment must be at least ₦0.01." };
    }
  }

  const installmentCount = Math.ceil(balanceCents / installmentCents);
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_REPAYMENT_MONTHS) {
    return { invalidReason: `Set terms that complete repayment within ${MAX_REPAYMENT_MONTHS} months.` };
  }
  // With a uniform normal instalment and a smaller final one, very small
  // balances cannot support every requested duration at kobo precision.
  if (requestedMonths !== null && installmentCount !== requestedMonths) {
    return {
      invalidReason: "That exact repayment duration is not possible using equal monthly instalments rounded to kobo. Select fewer months.",
    };
  }
  const finalCents = balanceCents - installmentCents * (installmentCount - 1);
  if (finalCents <= 0 || finalCents > installmentCents) {
    return { invalidReason: "CHRiS could not produce a valid final repayment instalment." };
  }
  return {
    installmentAmount: (installmentCents / 100).toFixed(2),
    installmentCount,
    finalInstallment: finalCents / 100,
  };
}
