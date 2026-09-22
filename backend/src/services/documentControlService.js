const crypto = require("node:crypto");

const RECORD_ENTITY = "DocumentControlRecord";
const REQUEST_ENTITY = "DocumentRequest";
const RECORD_KINDS = new Set(["EMPLOYEE_DOCUMENT", "HR_DOCUMENT", "COMPANY_POLICY", "TEMPLATE", "CATEGORY"]);
const DEFAULT_CATEGORIES = [
  "Employment & Contract",
  "Identity & Personal",
  "Statutory & Compliance",
  "Payroll & Compensation",
  "Leave & Attendance",
  "Performance & Development",
  "Discipline & Employee Relations",
  "Health, Safety & Security",
  "Training & Certification",
  "Exit & Clearance",
  "Company Policy",
  "Operational SOP",
];

function text(value) { return String(value || "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
function error(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function materialize(events) {
  const rows = new Map();
  for (const event of events) {
    const prior = rows.get(event.entityId) || {};
    rows.set(event.entityId, {
      ...prior,
      ...(event.newValue || {}),
      id: event.entityId,
      createdAt: prior.createdAt || event.createdAt,
      updatedAt: event.createdAt,
      lastActorUserId: event.actorUserId || null,
    });
  }
  return Array.from(rows.values());
}

function expiryState(record, now = new Date()) {
  if (!record.expiryDate) return "NO_EXPIRY";
  const expiry = new Date(record.expiryDate);
  if (Number.isNaN(expiry.getTime())) return "NO_EXPIRY";
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "EXPIRED";
  if (diffDays <= 30) return "DUE_30_DAYS";
  if (diffDays <= 90) return "DUE_90_DAYS";
  return "VALID";
}

async function listRecords(prisma, organizationId) {
  const events = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: RECORD_ENTITY },
    orderBy: { createdAt: "asc" },
  });
  return materialize(events).map((row) => ({ ...row, expiryState: expiryState(row) }));
}

async function listRequests(prisma, organizationId) {
  const events = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: REQUEST_ENTITY },
    orderBy: { createdAt: "asc" },
  });
  return materialize(events);
}

async function createRecord(prisma, { organizationId, actorUserId, input }) {
  const kind = upper(input.kind);
  if (!RECORD_KINDS.has(kind)) throw error("DOCUMENT_KIND_INVALID", "Select a valid document record type.");
  const title = text(input.title);
  if (!title) throw error("DOCUMENT_TITLE_REQUIRED", "Document title is required.");
  if (kind === "EMPLOYEE_DOCUMENT" && !text(input.employeeNumber)) {
    throw error("EMPLOYEE_NUMBER_REQUIRED", "Employee documents must be linked to an employee number.");
  }
  const recordId = id("DOC");
  const now = new Date().toISOString();
  const record = {
    kind,
    title,
    description: text(input.description) || null,
    category: text(input.category) || null,
    employeeNumber: upper(input.employeeNumber) || null,
    reference: text(input.reference) || null,
    sourceUrl: text(input.sourceUrl) || null,
    issuedDate: isoDate(input.issuedDate),
    expiryDate: isoDate(input.expiryDate),
    status: upper(input.status) || "ACTIVE",
    owner: text(input.owner) || null,
    version: text(input.version) || null,
    confidentiality: upper(input.confidentiality) || "INTERNAL",
    notes: text(input.notes) || null,
    createdAt: now,
    createdByUserId: actorUserId || null,
  };
  await prisma.organizationAudit.create({ data: {
    organizationId, actorUserId: actorUserId || null, entityType: RECORD_ENTITY, entityId: recordId,
    action: "DOCUMENT_RECORD_CREATED", newValue: record, reason: `Created ${kind.toLowerCase().replaceAll("_", " ")}`,
  }});
  return { id: recordId, ...record, expiryState: expiryState(record) };
}

async function updateRecord(prisma, { organizationId, actorUserId, recordId, input }) {
  const records = await listRecords(prisma, organizationId);
  const current = records.find((row) => row.id === recordId);
  if (!current) throw error("DOCUMENT_NOT_FOUND", "Document record not found.", 404);
  const patch = {};
  for (const field of ["title", "description", "category", "reference", "sourceUrl", "owner", "version", "notes"]) {
    if (Object.prototype.hasOwnProperty.call(input, field)) patch[field] = text(input[field]) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "status")) patch.status = upper(input.status) || current.status;
  if (Object.prototype.hasOwnProperty.call(input, "confidentiality")) patch.confidentiality = upper(input.confidentiality) || current.confidentiality;
  if (Object.prototype.hasOwnProperty.call(input, "issuedDate")) patch.issuedDate = isoDate(input.issuedDate);
  if (Object.prototype.hasOwnProperty.call(input, "expiryDate")) patch.expiryDate = isoDate(input.expiryDate);
  await prisma.organizationAudit.create({ data: {
    organizationId, actorUserId: actorUserId || null, entityType: RECORD_ENTITY, entityId: recordId,
    action: "DOCUMENT_RECORD_UPDATED", previousValue: current, newValue: patch, reason: text(input.reason) || "Document record updated",
  }});
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  return { ...updated, expiryState: expiryState(updated) };
}

async function createRequest(prisma, { organizationId, actorUserId, input }) {
  const title = text(input.title);
  if (!title) throw error("DOCUMENT_REQUEST_TITLE_REQUIRED", "Request title is required.");
  const requestId = id("DREQ");
  const now = new Date().toISOString();
  const request = {
    title,
    description: text(input.description) || null,
    employeeNumber: upper(input.employeeNumber) || null,
    requestedFrom: text(input.requestedFrom) || null,
    dueDate: isoDate(input.dueDate),
    priority: upper(input.priority) || "NORMAL",
    status: "OPEN",
    requestedAt: now,
    requestedByUserId: actorUserId || null,
  };
  await prisma.organizationAudit.create({ data: {
    organizationId, actorUserId: actorUserId || null, entityType: REQUEST_ENTITY, entityId: requestId,
    action: "DOCUMENT_REQUEST_CREATED", newValue: request, reason: "Document request created",
  }});
  return { id: requestId, ...request };
}

async function updateRequestStatus(prisma, { organizationId, actorUserId, requestId, status, note }) {
  const requests = await listRequests(prisma, organizationId);
  const current = requests.find((row) => row.id === requestId);
  if (!current) throw error("DOCUMENT_REQUEST_NOT_FOUND", "Document request not found.", 404);
  const nextStatus = upper(status);
  if (!["OPEN", "IN_PROGRESS", "FULFILLED", "CANCELLED"].includes(nextStatus)) {
    throw error("DOCUMENT_REQUEST_STATUS_INVALID", "Invalid document request status.");
  }
  const patch = { status: nextStatus, statusNote: text(note) || null, statusChangedAt: new Date().toISOString() };
  await prisma.organizationAudit.create({ data: {
    organizationId, actorUserId: actorUserId || null, entityType: REQUEST_ENTITY, entityId: requestId,
    action: "DOCUMENT_REQUEST_STATUS_UPDATED", previousValue: current, newValue: patch, reason: text(note) || `Document request moved to ${nextStatus}`,
  }});
  return { ...current, ...patch };
}

async function getOverview(prisma, organizationId) {
  const [records, requests] = await Promise.all([listRecords(prisma, organizationId), listRequests(prisma, organizationId)]);
  const categories = new Set(DEFAULT_CATEGORIES);
  records.filter((row) => row.kind === "CATEGORY").forEach((row) => categories.add(row.title));
  records.forEach((row) => { if (row.category) categories.add(row.category); });
  const expiry = records.filter((row) => !["CATEGORY", "TEMPLATE"].includes(row.kind) && row.expiryDate)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return {
    records,
    requests,
    categories: Array.from(categories).sort(),
    expiry,
    summary: {
      employeeDocuments: records.filter((r) => r.kind === "EMPLOYEE_DOCUMENT" && r.status !== "ARCHIVED").length,
      hrDocuments: records.filter((r) => r.kind === "HR_DOCUMENT" && r.status !== "ARCHIVED").length,
      companyPolicies: records.filter((r) => r.kind === "COMPANY_POLICY" && r.status !== "ARCHIVED").length,
      templates: records.filter((r) => r.kind === "TEMPLATE" && r.status !== "ARCHIVED").length,
      expiringSoon: expiry.filter((r) => ["DUE_30_DAYS", "DUE_90_DAYS"].includes(r.expiryState)).length,
      expired: expiry.filter((r) => r.expiryState === "EXPIRED").length,
      openRequests: requests.filter((r) => ["OPEN", "IN_PROGRESS"].includes(r.status)).length,
    },
  };
}

module.exports = { RECORD_KINDS, DEFAULT_CATEGORIES, listRecords, listRequests, createRecord, updateRecord, createRequest, updateRequestStatus, getOverview, expiryState };
