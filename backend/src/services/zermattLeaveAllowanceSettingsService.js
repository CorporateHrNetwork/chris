const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  ratePercent: 10,
  qualifyingServiceYears: 1,
  salaryBasis: "BASIC_MONTHLY_SALARY",
  paymentTiming: "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE",
  taxTreatment: "AFTER_TAX_NON_TAXABLE",
  payslipLabel: "Leave Allowance",
});

function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const rate = Number(input.ratePercent ?? base.ratePercent);
  const label = String(input.payslipLabel ?? base.payslipLabel).trim();
  return {
    enabled: input.enabled === undefined ? Boolean(base.enabled) : Boolean(input.enabled),
    ratePercent: Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : base.ratePercent,
    qualifyingServiceYears: 1,
    salaryBasis: "BASIC_MONTHLY_SALARY",
    paymentTiming: "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE",
    taxTreatment: "AFTER_TAX_NON_TAXABLE",
    payslipLabel: label || "Leave Allowance",
  };
}

async function getSettings(prisma, organizationId) {
  const latest = await prisma.organizationAudit.findFirst({
    where: {
      organizationId,
      entityType: "ZermattLeaveAllowanceSettings",
      entityId: "CURRENT",
      action: "ZERMATT_LEAVE_ALLOWANCE_SETTINGS_UPDATED",
    },
    orderBy: { createdAt: "desc" },
  });
  return normalizeSettings(latest?.newValue || {}, DEFAULT_SETTINGS);
}

async function updateSettings(prisma, { organizationId, actorUserId, settings, reason }) {
  const previous = await getSettings(prisma, organizationId);
  const next = normalizeSettings(settings, previous);
  await prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "ZermattLeaveAllowanceSettings",
      entityId: "CURRENT",
      action: "ZERMATT_LEAVE_ALLOWANCE_SETTINGS_UPDATED",
      previousValue: previous,
      newValue: next,
      reason: String(reason || "Leave Allowance settings updated").trim(),
    },
  });
  return next;
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings, getSettings, updateSettings };
