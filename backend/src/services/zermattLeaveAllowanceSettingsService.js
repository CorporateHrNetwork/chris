const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  policyMode: "REFERENCE_IMPORT",
  automaticCalculation: false,
  salaryBasis: "LAST_DECEMBER_GROSS",
  paymentTiming: "ARREARS",
  taxTreatment: "AFTER_TAX_NON_TAXABLE",
  payslipLabel: "Leave Allowance",
});

function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const label = String(input.payslipLabel ?? base.payslipLabel).trim();
  return {
    enabled: input.enabled === undefined ? Boolean(base.enabled) : Boolean(input.enabled),
    policyMode: "REFERENCE_IMPORT",
    automaticCalculation: false,
    salaryBasis: "LAST_DECEMBER_GROSS",
    paymentTiming: "ARREARS",
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
