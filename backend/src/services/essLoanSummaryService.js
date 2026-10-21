const month = value => value ? new Date(value).toISOString().slice(0, 7) : null;

function summarizeLoanProfile(profile) {
  const loan = profile.loan;
  const deductions = profile.amortizationSchedule.filter(row =>
    ['PAID', 'EXCEPTION'].includes(row.status) && Number(row.amountPaid) > 0
  );
  return {
    id: loan.id,
    loanNumber: loan.loanNumber,
    status: loan.status,
    currency: 'NGN',
    loanAmount: loan.principalAmount,
    monthlyInstallment: loan.installmentAmount,
    totalPaid: loan.recoveredAmount,
    balance: loan.outstandingAmount,
    expectedFinalDeductionMonth: month(loan.expectedFinalInstallmentDate),
    lastRecordedDeductionMonth: deductions.length ? month(deductions[deductions.length - 1].dueDate) : null,
  };
}

async function getEmployeeLoanSummary(prisma, { organizationId, employeeId }, getProfile) {
  if (!organizationId || !employeeId) throw Object.assign(new Error('Employee session required.'), { statusCode: 403 });
  const readProfile = getProfile || (args => require('./loanProfileService').getLoanProfile(args));
  // Scope comes only from the authenticated ESS session, never request selectors.
  const loans = await prisma.$queryRawUnsafe(`SELECT "id" FROM "payroll_loans"
    WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status" IN ('ACTIVE','PAUSED','COMPLETED')
    ORDER BY "createdAt" DESC`, organizationId, employeeId);
  const rows = [];
  for (const { id } of loans) {
    const profile = await readProfile({ organizationId, loanId: id, prismaClient: prisma });
    if (profile.loan.employeeId !== employeeId) throw Object.assign(new Error('Loan ownership changed. Refresh your loan summary.'), { statusCode: 409 });
    rows.push(summarizeLoanProfile(profile));
  }
  return rows;
}

module.exports = { getEmployeeLoanSummary, summarizeLoanProfile };
