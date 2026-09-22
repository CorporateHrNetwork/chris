const prisma = require("../config/prisma");
const crypto = require("crypto");

const RULE_FIELDS = [
  "eligibilityRules", "entitlementRules", "serviceBands", "balanceRules",
  "requestRules", "approvalWorkflow", "lifecycleRules", "payrollRules",
  "attendanceRules", "calendarRules", "documentationRules", "overlapRules",
  "coverageRules",
];

const NIGERIA_JURISDICTIONS = [
  ["NG-FEDERAL", "Nigeria — Federal"],
  ...[
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
    "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
    "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
    "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun",
    "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
    "Yobe", "Zamfara",
  ].map((state) => [
    `NG-${state.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    `${state} State, Nigeria`,
  ]),
  ["NG-FCT", "Federal Capital Territory, Nigeria"],
].map(([value, label]) => ({ value, label }));

const POLICY_NAME_OPTIONS = {
  ANNUAL: ["Standard Annual Leave", "Executive Annual Leave", "Custom Policy"],
  SICK: ["Standard Sick Leave", "Extended Sick Leave", "Custom Policy"],
  UNPAID: ["Standard Unpaid Leave", "Extended Unpaid Leave", "Custom Policy"],
  MATERNITY: ["Maternity Leave", "Enhanced Maternity Leave", "Custom Policy"],
  PATERNITY: ["Paternity / Partner Leave", "Enhanced Partner Leave", "Custom Policy"],
  DEFAULT: ["Standard Policy", "Custom Policy"],
};

const CHRIS_RECOMMENDED_DEFAULTS = {
  ANNUAL: { value: 20, unit: "WORKING_DAYS", legalMinimum: false },
  SICK: { value: 12, unit: "WORKING_DAYS", legalMinimum: false },
  UNPAID: { value: 5, unit: "WORKING_DAYS", legalMinimum: false },
};

function isNigeria(country) {
  return ["NG", "NGA", "NIGERIA"].includes(String(country || "").trim().toUpperCase());
}

function validateJurisdiction(country, jurisdiction) {
  const value = String(jurisdiction || "").trim();
  if (!value) return null;
  if (isNigeria(country)) {
    const allowed = new Set(["NG", ...NIGERIA_JURISDICTIONS.map((item) => item.value)]);
    if (!allowed.has(value.toUpperCase())) throw new Error("INVALID_POLICY_JURISDICTION");
  } else if (/^NG(?:-|$)/i.test(value)) {
    throw new Error("INVALID_POLICY_JURISDICTION");
  }
  if (value.length > 120) throw new Error("INVALID_POLICY_JURISDICTION");
  return value;
}

function cleanCode(value) {
  const code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  if (!code) throw new Error("POLICY_CODE_REQUIRED");
  return code;
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function previewPolicy(policy) {
  const entitlement = asObject(policy.entitlementRules);
  const balance = asObject(policy.balanceRules);
  const request = asObject(policy.requestRules);
  const payroll = asObject(policy.payrollRules);
  const lines = [
    policy.name,
    "",
    "Eligible employees receive " + (entitlement.value ?? policy.entitlementDays) + " " +
      String(entitlement.unit || "working days").toLowerCase().replaceAll("_", " ") + " " +
      String(entitlement.frequency || "annually").toLowerCase().replaceAll("_", " ") + ".",
    "Pay treatment: " + String(payroll.treatment || "configurable").toLowerCase().replaceAll("_", " ") + ".",
  ];
  if (entitlement.accrual && entitlement.accrual !== "NONE") {
    lines.push("Entitlement accrues " + String(entitlement.accrual).toLowerCase().replaceAll("_", " ") + ".");
  }
  if (balance.carryoverAllowed) {
    lines.push("Up to " + (balance.maximumCarryover ?? "the configured maximum") + " unused units may be carried forward.");
  }
  if (request.minimumNotice) lines.push("Requests normally require " + request.minimumNotice + " working days advance notice.");
  return lines.join("\n");
}

async function assessCompliance(tx, data) {
  if (!data.jurisdiction || !data.category) {
    return { complianceStatus: "CUSTOM_NOT_ASSESSED", complianceNotes: "No applicable compliance floor was selected." };
  }
  const floor = await tx.leaveComplianceFloor.findFirst({
    where: {
      jurisdiction: data.jurisdiction,
      ruleCategory: { in: [String(data.category).toUpperCase(), String(data.code).toUpperCase(), String(data.code).toUpperCase() + "_LEAVE"] },
      isActive: true,
      effectiveFrom: { lte: new Date(data.effectiveFrom) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(data.effectiveFrom) } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!floor || floor.minimumEntitlement == null) {
    return { complianceStatus: "CUSTOM_NOT_ASSESSED", complianceNotes: "No matching backend compliance floor; HR/legal review required." };
  }
  const configured = Number(asObject(data.entitlementRules).value ?? data.entitlementDays);
  if (configured < Number(floor.minimumEntitlement)) {
    return { complianceStatus: "BELOW_STATUTORY_FLOOR", complianceNotes: "Configured entitlement is below the matching registry floor. Confirm applicability with qualified advisers." };
  }
  return { complianceStatus: "COMPLIANT", complianceNotes: "Meets the matching registry floor. This control is not legal advice." };
}

function legacyProjection(input) {
  const entitlement = asObject(input.entitlementRules);
  const balance = asObject(input.balanceRules);
  const request = asObject(input.requestRules);
  const accrualMap = { MONTHLY: "MONTHLY", NONE: "NONE", FRONT_LOADED: "ANNUAL", DAILY: "ANNUAL", ANNIVERSARY_BASED: "ANNUAL" };
  return {
    entitlementDays: Number(input.entitlementDays ?? entitlement.value ?? 0),
    accrualMethod: input.accrualMethod || accrualMap[entitlement.accrual] || "ANNUAL",
    accrualRate: input.accrualRate ?? null,
    minimumServiceDays: Number(input.minimumServiceDays ?? asObject(input.eligibilityRules).minimumServiceDays ?? 0),
    serviceBasis: input.serviceBasis || "CURRENT_EPISODE",
    allowCarryForward: Boolean(input.allowCarryForward ?? balance.carryoverAllowed),
    maxCarryForwardDays: input.maxCarryForwardDays ?? balance.maximumCarryover ?? null,
    allowNegativeBalance: Boolean(input.allowNegativeBalance ?? balance.negativeBalanceAllowed),
    maxNegativeDays: input.maxNegativeDays ?? balance.maximumNegativeBalance ?? null,
    noticeDays: Number(input.noticeDays ?? request.minimumNotice ?? 0),
  };
}

async function ensureLeaveType(tx, organizationId, template, requestedLeaveTypeId) {
  if (requestedLeaveTypeId) {
    const type = await tx.leaveType.findFirst({ where: { id: requestedLeaveTypeId, organizationId } });
    if (!type) throw new Error("LEAVE_TYPE_NOT_FOUND");
    return type;
  }
  const existing = await tx.leaveType.findFirst({ where: { organizationId, code: template.code } });
  if (existing) return existing;
  const config = template.configuration;
  return tx.leaveType.create({
    data: {
      organizationId,
      name: template.name,
      code: template.code,
      description: template.description,
      unit: asObject(config.entitlementRules).unit === "HOURS" ? "HOURS" : "DAYS",
      isPaid: asObject(config.payrollRules).treatment !== "UNPAID",
      requiresAttachment: Boolean(asObject(config.requestRules).attachmentRequired),
      allowsHalfDay: Boolean(asObject(config.requestRules).halfDayAllowed),
    },
  });
}

function buildPolicyData(input, actorUserId) {
  const effectiveFrom = new Date(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && effectiveTo < effectiveFrom)) throw new Error("INVALID_POLICY_DATES");
  const status = String(input.status || "DRAFT").toUpperCase();
  if (!["DRAFT", "ACTIVE", "SUSPENDED", "RETIRED"].includes(status)) throw new Error("INVALID_POLICY_STATUS");
  const data = {
    leaveTypeId: input.leaveTypeId,
    name: String(input.name || "").trim(),
    code: cleanCode(input.code),
    description: input.description || null,
    category: input.category || null,
    jurisdiction: input.jurisdiction || null,
    status,
    origin: input.origin || "ORGANIZATION",
    versionGroupId: input.versionGroupId || crypto.randomUUID(),
    versionNumber: Number(input.versionNumber || 1),
    changeReason: input.changeReason || null,
    sourceTemplateCode: input.sourceTemplateCode || null,
    createdByUserId: actorUserId,
    approvedByUserId: status === "ACTIVE" ? actorUserId : null,
    approvedAt: status === "ACTIVE" ? new Date() : null,
    effectiveFrom,
    effectiveTo,
    isActive: status === "ACTIVE",
    previewText: input.previewText || null,
    ...legacyProjection(input),
  };
  if (!data.name) throw new Error("POLICY_NAME_REQUIRED");
  for (const field of RULE_FIELDS) data[field] = input[field] ?? (field === "serviceBands" ? [] : {});
  data.previewText = data.previewText || previewPolicy(data);
  return data;
}

async function generatePolicyCode(tx, organizationId, input, leaveType) {
  if (String(input.code || "").trim()) return cleanCode(input.code);
  if (!String(input.name || "").trim()) throw new Error("POLICY_NAME_REQUIRED");
  const typePart = cleanCode(leaveType.code || leaveType.name).slice(0, 18);
  const namePart = cleanCode(input.name).slice(0, 28);
  const base = `${typePart}_${namePart}`.replace(/_+/g, "_").replace(/^_|_$/g, "");
  const matches = await tx.leavePolicy.findMany({
    where: { organizationId, code: { startsWith: base } },
    select: { code: true },
  });
  const occupied = new Set(matches.map((item) => item.code));
  if (!occupied.has(base)) return base;
  let suffix = 2;
  while (occupied.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

async function listPolicyWorkspace({ organizationId }) {
  const [organization, templates, policies, complianceFloors] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { country: true } }),
    prisma.leavePolicyTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.leavePolicy.findMany({
      where: { organizationId },
      include: { leaveType: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
    }),
    prisma.leaveComplianceFloor.findMany({ where: { isActive: true }, orderBy: [{ jurisdiction: "asc" }, { ruleCategory: "asc" }] }),
  ]);
  const nigeriaOrganization = isNigeria(organization?.country);
  return {
    templates,
    policies,
    complianceFloors,
    organization: { country: organization?.country || null },
    jurisdictionOptions: nigeriaOrganization ? NIGERIA_JURISDICTIONS : [],
    defaultJurisdiction: nigeriaOrganization ? "NG-FEDERAL" : (organization?.country || ""),
    policyNameOptions: POLICY_NAME_OPTIONS,
    recommendedDefaults: CHRIS_RECOMMENDED_DEFAULTS,
    recommendationNotice: "CHRIS recommended defaults are configurable starting points, not universal statutory entitlements.",
  };
}

async function createPolicy({ organizationId, actorUserId, input }) {
  return prisma.$transaction(async (tx) => {
    const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, organizationId } });
    if (!type) throw new Error("LEAVE_TYPE_NOT_FOUND");
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
    const normalizedInput = {
      ...input,
      code: await generatePolicyCode(tx, organizationId, input, type),
      jurisdiction: validateJurisdiction(organization?.country, input.jurisdiction),
    };
    const data = buildPolicyData(normalizedInput, actorUserId);
    const assessment = await assessCompliance(tx, data);
    const policy = await tx.leavePolicy.create({ data: { organizationId, ...data, ...assessment }, include: { leaveType: true } });
    await tx.leavePolicyAudit.create({ data: { organizationId, leavePolicyId: policy.id, actorUserId, action: "CREATED", newValue: snapshot(policy), reason: data.changeReason } });
    return policy;
  });
}

async function adoptTemplate({ organizationId, actorUserId, templateCode, mode, overrides = {} }) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.leavePolicyTemplate.findUnique({ where: { code: cleanCode(templateCode) } });
    if (!template || !template.isActive) throw new Error("POLICY_TEMPLATE_NOT_FOUND");
    const isClone = String(mode).toUpperCase() === "CLONE";
    if (!isClone) {
      const existing = await tx.leavePolicy.findFirst({ where: { organizationId, sourceTemplateCode: template.code, status: "ACTIVE", isActive: true }, include: { leaveType: true }, orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }] });
      if (existing) return existing;
    }
    const leaveType = await ensureLeaveType(tx, organizationId, template, overrides.leaveTypeId);
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
    const config = template.configuration;
    const input = {
      ...config,
      ...overrides,
      leaveTypeId: leaveType.id,
      name: overrides.name || template.name,
      code: overrides.code || (isClone ? template.code + "_CUSTOM_" + crypto.randomUUID().slice(0, 8).toUpperCase() : template.code),
      description: overrides.description || template.description,
      category: overrides.category || template.category,
      jurisdiction: validateJurisdiction(
        organization?.country,
        overrides.jurisdiction ?? (isNigeria(organization?.country) ? (template.jurisdiction || "NG-FEDERAL") : (organization?.country || null))
      ),
      status: isClone ? "DRAFT" : "ACTIVE",
      origin: isClone ? "CLONED_TEMPLATE" : "CHRIS_TEMPLATE",
      sourceTemplateCode: template.code,
      effectiveFrom: overrides.effectiveFrom || new Date(),
      changeReason: overrides.changeReason || (isClone ? "Cloned from CHRIS template" : "Activated CHRIS recommended policy"),
    };
    const data = buildPolicyData(input, actorUserId);
    const assessment = await assessCompliance(tx, data);
    const policy = await tx.leavePolicy.create({ data: { organizationId, ...data, ...assessment }, include: { leaveType: true } });
    await tx.leavePolicyAudit.create({ data: { organizationId, leavePolicyId: policy.id, actorUserId, action: isClone ? "CLONED" : "ACTIVATED", newValue: snapshot(policy), reason: data.changeReason } });
    return policy;
  });
}

async function changePolicyStatus({ organizationId, actorUserId, policyId, status, reason }) {
  const nextStatus = String(status || "").toUpperCase();
  if (!["ACTIVE", "SUSPENDED", "RETIRED"].includes(nextStatus)) throw new Error("INVALID_POLICY_STATUS");
  return prisma.$transaction(async (tx) => {
    const current = await tx.leavePolicy.findFirst({ where: { id: policyId, organizationId } });
    if (!current) throw new Error("LEAVE_POLICY_NOT_FOUND");
    if (current.status === "RETIRED") throw new Error("RETIRED_POLICY_IMMUTABLE");
    const assessment = nextStatus === "ACTIVE" ? await assessCompliance(tx, current) : {};
    const policy = await tx.leavePolicy.update({
      where: { id: current.id },
      data: { status: nextStatus, isActive: nextStatus === "ACTIVE", approvedByUserId: nextStatus === "ACTIVE" ? actorUserId : current.approvedByUserId, approvedAt: nextStatus === "ACTIVE" ? new Date() : current.approvedAt, ...assessment },
    });
    await tx.leavePolicyAudit.create({ data: { organizationId, leavePolicyId: policy.id, actorUserId, action: nextStatus === "ACTIVE" ? "ACTIVATED" : nextStatus, previousValue: snapshot(current), newValue: snapshot(policy), reason } });
    return policy;
  });
}

async function createPolicyVersion({ organizationId, actorUserId, policyId, input }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.leavePolicy.findFirst({ where: { id: policyId, organizationId } });
    if (!current) throw new Error("LEAVE_POLICY_NOT_FOUND");
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
    const nextInput = { ...snapshot(current), ...input, jurisdiction: validateJurisdiction(organization?.country, input.jurisdiction ?? current.jurisdiction), leaveTypeId: input.leaveTypeId || current.leaveTypeId, code: current.code || input.code, versionGroupId: current.versionGroupId || current.id, versionNumber: current.versionNumber + 1, origin: current.origin, effectiveFrom: input.effectiveFrom, changeReason: input.changeReason };
    const data = buildPolicyData(nextInput, actorUserId);
    if (data.effectiveFrom <= current.effectiveFrom) throw new Error("POLICY_VERSION_DATE_INVALID");
    await tx.leavePolicy.update({ where: { id: current.id }, data: { effectiveTo: new Date(data.effectiveFrom.getTime() - 1), isActive: false, status: "RETIRED" } });
    const assessment = await assessCompliance(tx, data);
    const policy = await tx.leavePolicy.create({ data: { organizationId, ...data, ...assessment }, include: { leaveType: true } });
    await tx.leavePolicyAudit.create({ data: { organizationId, leavePolicyId: policy.id, actorUserId, action: "CHANGED", previousValue: snapshot(current), newValue: snapshot(policy), reason: data.changeReason } });
    return policy;
  });
}

module.exports = {
  RULE_FIELDS,
  NIGERIA_JURISDICTIONS,
  POLICY_NAME_OPTIONS,
  CHRIS_RECOMMENDED_DEFAULTS,
  previewPolicy,
  legacyProjection,
  listPolicyWorkspace,
  createPolicy,
  adoptTemplate,
  changePolicyStatus,
  createPolicyVersion,
};
