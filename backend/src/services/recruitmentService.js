const crypto = require("crypto");
const prisma = require("../config/prisma");

const EDITABLE_STATUSES = new Set(["DRAFT", "RETURNED"]);
const SUBMITTABLE_STATUSES = new Set(["DRAFT", "RETURNED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "RETURNED", "PENDING_APPROVAL"]);

function recruitmentError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function dateOnly(value, label, { required = false } = {}) {
  const raw = text(value);
  if (!raw) {
    if (required) throw recruitmentError("RECRUITMENT_DATE_REQUIRED", `${label} is required.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw recruitmentError("INVALID_RECRUITMENT_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw recruitmentError("INVALID_RECRUITMENT_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw recruitmentError("INVALID_REQUISITION_HEADCOUNT", `${label} must be a whole number greater than zero.`);
  }
  return number;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    requestedHeadcount: Number(row.requestedHeadcount || 0),
    targetStartDate: isoDate(row.targetStartDate),
  };
}

async function writeAudit(prismaClient, {
  organizationId,
  actorUserId,
  entityId,
  action,
  previousValue,
  newValue,
  reason,
}) {
  await prismaClient.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "RecruitmentJobRequisition",
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function resolveDesignation(prismaClient, organizationId, designationId) {
  const id = text(designationId);
  if (!id) {
    throw recruitmentError("DESIGNATION_REQUIRED", "Select a controlled CHRiS designation for this requisition.");
  }
  const designation = await prismaClient.designation.findFirst({
    where: { id, organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      departmentId: true,
      department: { select: { id: true, name: true, code: true, isActive: true } },
    },
  });
  if (!designation) {
    throw recruitmentError("DESIGNATION_NOT_FOUND", "The selected designation is not active in this organization.", 404);
  }
  if (designation.department && designation.department.isActive === false) {
    throw recruitmentError("DESIGNATION_DEPARTMENT_INACTIVE", "The selected designation belongs to an inactive department.", 409);
  }
  return designation;
}

async function resolveLocation(prismaClient, organizationId, locationId) {
  const id = text(locationId);
  if (!id) {
    throw recruitmentError("REQUISITION_LOCATION_REQUIRED", "Select the branch or operating location requesting this role.");
  }
  const location = await prismaClient.organizationLocation.findFirst({
    where: {
      id,
      organizationId,
      isActive: true,
      type: { in: ["BRANCH", "OFFICE", "SITE"] },
    },
    select: { id: true, name: true, code: true, type: true },
  });
  if (!location) {
    throw recruitmentError("REQUISITION_LOCATION_NOT_FOUND", "The selected operating location is not active in this organization.", 404);
  }
  return location;
}

async function nextRequisitionNumber(prismaClient, organizationId) {
  const year = new Date().getFullYear();
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "recruitment_requisition_counters" ("organizationId","year","nextValue","updatedAt")
     VALUES ($1,$2,2,CURRENT_TIMESTAMP)
     ON CONFLICT ("organizationId","year")
     DO UPDATE SET "nextValue"="recruitment_requisition_counters"."nextValue" + 1,
                   "updatedAt"=CURRENT_TIMESTAMP
     RETURNING "nextValue"`,
    organizationId,
    year
  );
  const sequence = Number(rows[0]?.nextValue || 2) - 1;
  return `REQ-${year}-${String(sequence).padStart(4, "0")}`;
}

function locationClause(scopeLocationId, startIndex = 2) {
  return scopeLocationId ? ` AND r."locationId"=$${startIndex}` : "";
}

async function listRequisitions({ organizationId, scopeLocationId = null, status = null, prismaClient = prisma }) {
  const params = [organizationId];
  let where = `WHERE r."organizationId"=$1`;
  if (scopeLocationId) {
    params.push(scopeLocationId);
    where += ` AND r."locationId"=$${params.length}`;
  }
  if (status) {
    params.push(text(status).toUpperCase());
    where += ` AND r."status"=$${params.length}`;
  }

  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT r.*,
            l."name" AS "locationName", l."code" AS "locationCode",
            d."name" AS "departmentName", d."code" AS "departmentCode",
            g."name" AS "designationName", g."code" AS "designationCode",
            CONCAT_WS(' ',cu."firstName",cu."lastName") AS "createdByName",
            CONCAT_WS(' ',su."firstName",su."lastName") AS "submittedByName",
            CONCAT_WS(' ',du."firstName",du."lastName") AS "decidedByName"
       FROM "recruitment_job_requisitions" r
       JOIN "organization_locations" l ON l."id"=r."locationId" AND l."organizationId"=r."organizationId"
       LEFT JOIN "departments" d ON d."id"=r."departmentId" AND d."organizationId"=r."organizationId"
       JOIN "designations" g ON g."id"=r."designationId" AND g."organizationId"=r."organizationId"
       LEFT JOIN "users" cu ON cu."id"=r."createdByUserId"
       LEFT JOIN "users" su ON su."id"=r."submittedByUserId"
       LEFT JOIN "users" du ON du."id"=r."decidedByUserId"
       ${where}
       ORDER BY r."createdAt" DESC`,
    ...params
  );
  return rows.map(mapRow);
}

async function getRequisition({ organizationId, requisitionId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId, text(requisitionId)];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND r."locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT r.*,
            l."name" AS "locationName", l."code" AS "locationCode",
            d."name" AS "departmentName", d."code" AS "departmentCode",
            g."name" AS "designationName", g."code" AS "designationCode",
            CONCAT_WS(' ',cu."firstName",cu."lastName") AS "createdByName",
            CONCAT_WS(' ',su."firstName",su."lastName") AS "submittedByName",
            CONCAT_WS(' ',du."firstName",du."lastName") AS "decidedByName"
       FROM "recruitment_job_requisitions" r
       JOIN "organization_locations" l ON l."id"=r."locationId" AND l."organizationId"=r."organizationId"
       LEFT JOIN "departments" d ON d."id"=r."departmentId" AND d."organizationId"=r."organizationId"
       JOIN "designations" g ON g."id"=r."designationId" AND g."organizationId"=r."organizationId"
       LEFT JOIN "users" cu ON cu."id"=r."createdByUserId"
       LEFT JOIN "users" su ON su."id"=r."submittedByUserId"
       LEFT JOIN "users" du ON du."id"=r."decidedByUserId"
      WHERE r."organizationId"=$1 AND r."id"=$2${scope}
      LIMIT 1`,
    ...params
  );
  return mapRow(rows[0] || null);
}

async function getSummary({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND "locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT
       COUNT(*)::int AS "totalRequisitions",
       COUNT(*) FILTER (WHERE "status"='DRAFT')::int AS "draft",
       COUNT(*) FILTER (WHERE "status"='PENDING_APPROVAL')::int AS "pendingApproval",
       COUNT(*) FILTER (WHERE "status"='RETURNED')::int AS "returned",
       COUNT(*) FILTER (WHERE "status"='OPEN')::int AS "openRequisitions",
       COUNT(*) FILTER (WHERE "status"='CLOSED')::int AS "closed",
       COALESCE(SUM("requestedHeadcount") FILTER (WHERE "status"='OPEN'),0)::int AS "openHeadcount"
     FROM "recruitment_job_requisitions"
     WHERE "organizationId"=$1${scope}`,
    ...params
  );
  const row = rows[0] || {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
}

async function createRequisition({ organizationId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const requestedLocationId = scopeLocationId || text(input?.locationId);
    if (scopeLocationId && input?.locationId && text(input.locationId) !== scopeLocationId) {
      throw recruitmentError("REQUISITION_OUTSIDE_ACTIVE_BRANCH", "A branch user can only create requisitions for the active branch.", 403);
    }
    const [location, designation] = await Promise.all([
      resolveLocation(tx, organizationId, requestedLocationId),
      resolveDesignation(tx, organizationId, input?.designationId),
    ]);
    const employmentType = text(input?.employmentType);
    const reason = text(input?.reason);
    const requestedHeadcount = positiveInteger(input?.requestedHeadcount || 1, "Requested Headcount");
    const targetStartDate = dateOnly(input?.targetStartDate, "Target Start Date");
    if (!employmentType) throw recruitmentError("EMPLOYMENT_TYPE_REQUIRED", "Employment Type is required.");
    if (!reason) throw recruitmentError("REQUISITION_REASON_REQUIRED", "Business justification / reason is required.");

    const id = crypto.randomUUID();
    const requisitionNumber = await nextRequisitionNumber(tx, organizationId);
    await tx.$executeRawUnsafe(
      `INSERT INTO "recruitment_job_requisitions"
        ("id","organizationId","requisitionNumber","locationId","departmentId","designationId","title","employmentType","requestedHeadcount","reason","targetStartDate","status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,'DRAFT',$12)`,
      id,
      organizationId,
      requisitionNumber,
      location.id,
      designation.departmentId || null,
      designation.id,
      designation.name,
      employmentType,
      requestedHeadcount,
      reason,
      targetStartDate,
      actorUserId || null
    );
    const created = await getRequisition({ organizationId, requisitionId: id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: id,
      action: "RECRUITMENT_REQUISITION_CREATED",
      newValue: created,
      reason,
    });
    return created;
  });
}

async function updateRequisition({ organizationId, requisitionId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getRequisition({ organizationId, requisitionId, scopeLocationId, prismaClient: tx });
    if (!previous) throw recruitmentError("REQUISITION_NOT_FOUND", "Job requisition not found in the permitted operating context.", 404);
    if (!EDITABLE_STATUSES.has(previous.status)) {
      throw recruitmentError("REQUISITION_NOT_EDITABLE", `A ${previous.status} requisition cannot be edited.`, 409);
    }
    const designation = await resolveDesignation(tx, organizationId, input?.designationId || previous.designationId);
    const employmentType = text(input?.employmentType || previous.employmentType);
    const reason = text(input?.reason || previous.reason);
    const requestedHeadcount = positiveInteger(input?.requestedHeadcount || previous.requestedHeadcount, "Requested Headcount");
    const targetStartDate = input?.targetStartDate === undefined
      ? previous.targetStartDate
      : dateOnly(input.targetStartDate, "Target Start Date");
    if (!employmentType) throw recruitmentError("EMPLOYMENT_TYPE_REQUIRED", "Employment Type is required.");
    if (!reason) throw recruitmentError("REQUISITION_REASON_REQUIRED", "Business justification / reason is required.");

    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_job_requisitions"
          SET "departmentId"=$3,"designationId"=$4,"title"=$5,"employmentType"=$6,
              "requestedHeadcount"=$7,"reason"=$8,"targetStartDate"=$9::date,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      designation.departmentId || null,
      designation.id,
      designation.name,
      employmentType,
      requestedHeadcount,
      reason,
      targetStartDate
    );
    const updated = await getRequisition({ organizationId, requisitionId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action: "RECRUITMENT_REQUISITION_UPDATED",
      previousValue: previous,
      newValue: updated,
      reason: "Job requisition details updated before approval.",
    });
    return updated;
  });
}

async function transition({
  organizationId,
  requisitionId,
  actorUserId,
  scopeLocationId = null,
  expectedStatuses,
  nextStatus,
  action,
  notes,
  setSubmitted = false,
  setDecision = false,
  setClosed = false,
  prismaClient = prisma,
}) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getRequisition({ organizationId, requisitionId, scopeLocationId, prismaClient: tx });
    if (!previous) throw recruitmentError("REQUISITION_NOT_FOUND", "Job requisition not found in the permitted operating context.", 404);
    if (!expectedStatuses.has(previous.status)) {
      throw recruitmentError("INVALID_REQUISITION_TRANSITION", `Requisition cannot move from ${previous.status} to ${nextStatus}.`, 409);
    }

    const sets = ['"status"=$3', '"updatedAt"=CURRENT_TIMESTAMP'];
    const params = [organizationId, previous.id, nextStatus];
    if (setSubmitted) {
      params.push(actorUserId || null);
      sets.push(`"submittedByUserId"=$${params.length}`, '"submittedAt"=CURRENT_TIMESTAMP');
    }
    if (setDecision) {
      params.push(actorUserId || null);
      sets.push(`"decidedByUserId"=$${params.length}`, '"decidedAt"=CURRENT_TIMESTAMP');
      params.push(text(notes) || null);
      sets.push(`"decisionNotes"=$${params.length}`);
    }
    if (setClosed) {
      params.push(actorUserId || null);
      sets.push(`"closedByUserId"=$${params.length}`, '"closedAt"=CURRENT_TIMESTAMP');
    }
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_job_requisitions" SET ${sets.join(",")} WHERE "organizationId"=$1 AND "id"=$2`,
      ...params
    );
    const updated = await getRequisition({ organizationId, requisitionId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action,
      previousValue: previous,
      newValue: updated,
      reason: notes || `${previous.status} → ${nextStatus}`,
    });
    return updated;
  });
}

async function submitRequisition(args) {
  return transition({
    ...args,
    expectedStatuses: SUBMITTABLE_STATUSES,
    nextStatus: "PENDING_APPROVAL",
    action: "RECRUITMENT_REQUISITION_SUBMITTED",
    setSubmitted: true,
  });
}

async function cancelRequisition(args) {
  return transition({
    ...args,
    expectedStatuses: CANCELLABLE_STATUSES,
    nextStatus: "CANCELLED",
    action: "RECRUITMENT_REQUISITION_CANCELLED",
  });
}

async function decideRequisition({ decision, notes, ...args }) {
  const normalized = text(decision).toUpperCase();
  const map = {
    APPROVE: { status: "OPEN", action: "RECRUITMENT_REQUISITION_APPROVED_OPENED" },
    RETURN: { status: "RETURNED", action: "RECRUITMENT_REQUISITION_RETURNED" },
    REJECT: { status: "REJECTED", action: "RECRUITMENT_REQUISITION_REJECTED" },
  };
  if (!map[normalized]) {
    throw recruitmentError("INVALID_REQUISITION_DECISION", "Decision must be APPROVE, RETURN or REJECT.");
  }
  if ((normalized === "RETURN" || normalized === "REJECT") && !text(notes)) {
    throw recruitmentError("REQUISITION_DECISION_NOTES_REQUIRED", `${normalized === "RETURN" ? "Return" : "Rejection"} notes are required.`);
  }
  return transition({
    ...args,
    notes,
    expectedStatuses: new Set(["PENDING_APPROVAL"]),
    nextStatus: map[normalized].status,
    action: map[normalized].action,
    setDecision: true,
  });
}

async function closeRequisition(args) {
  return transition({
    ...args,
    expectedStatuses: new Set(["OPEN"]),
    nextStatus: "CLOSED",
    action: "RECRUITMENT_REQUISITION_CLOSED",
    setClosed: true,
  });
}

module.exports = {
  recruitmentError,
  listRequisitions,
  getRequisition,
  getSummary,
  createRequisition,
  updateRequisition,
  submitRequisition,
  cancelRequisition,
  decideRequisition,
  closeRequisition,
};
