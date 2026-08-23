const prisma = require("../config/prisma");
const crypto = require("crypto");

const RULE_FIELDS = [
  "eligibilityRules", "entitlementRules", "serviceBands", "balanceRules",
  "requestRules", "approvalWorkflow", "lifecycleRules", "payrollRules",
  "attendanceRules", "calendarRules", "documentationRules", "overlapRules",
  "coverageRules",
];

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

async function listPolicyWorkspace({ organizationId }) {
  const [templates, policies, complianceFloors] = await Promise.all([
    prisma.leavePolicyTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.leavePolicy.findMany({
      where: { organizationId },
      include: { leaveType: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
    }),
    prisma.leaveComplianceFloor.findMany({ where: { isActive: true }, orderBy: [{ jurisdiction: "asc" }, { ruleCategory: "asc" }] }),
  ]);
  return { templates, policies, complianceFloors };
}

async function createPolicy({ organizationId, actorUserId, input }) {
  return prisma.$transaction(async (tx) => {
    const data = buildPolicyData(input, actorUserId);
    const type = await tx.leaveType.findFirst({ where: { id: data.leaveTypeId, organizationId } });
    if (!type) throw new Error("LEAVE_TYPE_NOT_FOUND");
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
    const config = template.configuration;
    const input = {
      ...config,
      ...overrides,
      leaveTypeId: leaveType.id,
      name: overrides.name || template.name,
      code: overrides.code || (isClone ? template.code + "_CUSTOM_" + crypto.randomUUID().slice(0, 8).toUpperCase() : template.code),
      description: overrides.description || template.description,
      category: overrides.category || template.category,
      jurisdiction: overrides.jurisdiction ?? template.jurisdiction,
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
    const nextInput = { ...snapshot(current), ...input, leaveTypeId: input.leaveTypeId || current.leaveTypeId, code: current.code || input.code, versionGroupId: current.versionGroupId || current.id, versionNumber: current.versionNumber + 1, origin: current.origin, effectiveFrom: input.effectiveFrom, changeReason: input.changeReason };
    const data = buildPolicyData(nextInput, actorUserId);
    if (data.effectiveFrom <= current.effectiveFrom) throw new Error("POLICY_VERSION_DATE_INVALID");
    await tx.leavePolicy.update({ where: { id: current.id }, data: { effectiveTo: new Date(data.effectiveFrom.getTime() - 1), isActive: false, status: "RETIRED" } });
    const assessment = await assessCompliance(tx, data);
    const policy = await tx.leavePolicy.create({ data: { organizationId, ...data, ...assessment }, include: { leaveType: true } });
    await tx.leavePolicyAudit.create({ data: { organizationId, leavePolicyId: policy.id, actorUserId, action: "CHANGED", previousValue: snapshot(current), newValue: snapshot(policy), reason: data.changeReason } });
    return policy;
  });
}

module.exports = { RULE_FIELDS, previewPolicy, legacyProjection, listPolicyWorkspace, createPolicy, adoptTemplate, changePolicyStatus, createPolicyVersion };
