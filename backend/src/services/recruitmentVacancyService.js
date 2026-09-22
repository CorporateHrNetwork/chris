const crypto = require("crypto");
const prisma = require("../config/prisma");

function vacancyError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw vacancyError("INVALID_VACANCY_OPENINGS", `${label} must be a whole number greater than zero.`);
  }
  return number;
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw vacancyError("INVALID_VACANCY_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw vacancyError("INVALID_VACANCY_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function mapVacancy(row) {
  if (!row) return null;
  return {
    ...row,
    openings: Number(row.openings || 0),
    requestedHeadcount: Number(row.requestedHeadcount || 0),
    openingDate: isoDate(row.openingDate),
    closingDate: isoDate(row.closingDate),
  };
}

async function writeAudit(client, {
  organizationId,
  actorUserId,
  entityId,
  action,
  previousValue,
  newValue,
  reason,
}) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "RecruitmentVacancy",
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function nextVacancyNumber(client, organizationId) {
  const year = new Date().getFullYear();
  const rows = await client.$queryRawUnsafe(
    `INSERT INTO "recruitment_vacancy_counters" ("organizationId","year","nextValue","updatedAt")
     VALUES ($1,$2,2,CURRENT_TIMESTAMP)
     ON CONFLICT ("organizationId","year")
     DO UPDATE SET "nextValue"="recruitment_vacancy_counters"."nextValue" + 1,
                   "updatedAt"=CURRENT_TIMESTAMP
     RETURNING "nextValue"`,
    organizationId,
    year
  );
  const sequence = Number(rows[0]?.nextValue || 2) - 1;
  return `VAC-${year}-${String(sequence).padStart(4, "0")}`;
}

async function getVacancy({ organizationId, vacancyId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId, text(vacancyId)];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND v."locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT v.*,
            r."requisitionNumber", r."requestedHeadcount",
            l."name" AS "locationName", l."code" AS "locationCode",
            d."name" AS "departmentName", d."code" AS "departmentCode",
            g."name" AS "designationName", g."code" AS "designationCode"
       FROM "recruitment_vacancies" v
       JOIN "recruitment_job_requisitions" r ON r."id"=v."requisitionId" AND r."organizationId"=v."organizationId"
       JOIN "organization_locations" l ON l."id"=v."locationId" AND l."organizationId"=v."organizationId"
       LEFT JOIN "departments" d ON d."id"=v."departmentId" AND d."organizationId"=v."organizationId"
       JOIN "designations" g ON g."id"=v."designationId" AND g."organizationId"=v."organizationId"
      WHERE v."organizationId"=$1 AND v."id"=$2${scope}
      LIMIT 1`,
    ...params
  );
  return mapVacancy(rows[0] || null);
}

async function listVacancies({ organizationId, scopeLocationId = null, status = null, prismaClient = prisma }) {
  const params = [organizationId];
  let where = `WHERE v."organizationId"=$1`;
  if (scopeLocationId) {
    params.push(scopeLocationId);
    where += ` AND v."locationId"=$${params.length}`;
  }
  if (status) {
    params.push(text(status).toUpperCase());
    where += ` AND v."status"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT v.*,
            r."requisitionNumber", r."requestedHeadcount",
            l."name" AS "locationName", l."code" AS "locationCode",
            d."name" AS "departmentName", d."code" AS "departmentCode",
            g."name" AS "designationName", g."code" AS "designationCode"
       FROM "recruitment_vacancies" v
       JOIN "recruitment_job_requisitions" r ON r."id"=v."requisitionId" AND r."organizationId"=v."organizationId"
       JOIN "organization_locations" l ON l."id"=v."locationId" AND l."organizationId"=v."organizationId"
       LEFT JOIN "departments" d ON d."id"=v."departmentId" AND d."organizationId"=v."organizationId"
       JOIN "designations" g ON g."id"=v."designationId" AND g."organizationId"=v."organizationId"
       ${where}
       ORDER BY v."createdAt" DESC`,
    ...params
  );
  return rows.map(mapVacancy);
}

async function listEligibleRequisitions({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND r."locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT r."id", r."requisitionNumber", r."title", r."employmentType", r."requestedHeadcount",
            r."locationId", r."departmentId", r."designationId",
            l."name" AS "locationName", l."code" AS "locationCode",
            d."name" AS "departmentName", g."name" AS "designationName"
       FROM "recruitment_job_requisitions" r
       JOIN "organization_locations" l ON l."id"=r."locationId" AND l."organizationId"=r."organizationId"
       LEFT JOIN "departments" d ON d."id"=r."departmentId" AND d."organizationId"=r."organizationId"
       JOIN "designations" g ON g."id"=r."designationId" AND g."organizationId"=r."organizationId"
       LEFT JOIN "recruitment_vacancies" v ON v."organizationId"=r."organizationId" AND v."requisitionId"=r."id"
      WHERE r."organizationId"=$1
        AND r."status"='OPEN'
        AND v."id" IS NULL${scope}
      ORDER BY r."createdAt" DESC`,
    ...params
  );
  return rows.map((row) => ({ ...row, requestedHeadcount: Number(row.requestedHeadcount || 0) }));
}

async function getSummary({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND "locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "status"='DRAFT')::int AS "draft",
            COUNT(*) FILTER (WHERE "status"='PUBLISHED')::int AS "published",
            COUNT(*) FILTER (WHERE "status"='CLOSED')::int AS "closed",
            COUNT(*) FILTER (WHERE "status"='CANCELLED')::int AS "cancelled",
            COALESCE(SUM("openings") FILTER (WHERE "status"='PUBLISHED'),0)::int AS "publishedOpenings"
       FROM "recruitment_vacancies"
      WHERE "organizationId"=$1${scope}`,
    ...params
  );
  const row = rows[0] || {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
}

async function createVacancy({ organizationId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const requisitionId = text(input?.requisitionId);
    if (!requisitionId) {
      throw vacancyError("REQUISITION_REQUIRED_FOR_VACANCY", "Select an approved/open job requisition.");
    }
    const reqParams = [organizationId, requisitionId];
    let scope = "";
    if (scopeLocationId) {
      reqParams.push(scopeLocationId);
      scope = ` AND r."locationId"=$${reqParams.length}`;
    }
    const reqRows = await tx.$queryRawUnsafe(
      `SELECT r.* FROM "recruitment_job_requisitions" r
        WHERE r."organizationId"=$1 AND r."id"=$2${scope}
        LIMIT 1 FOR UPDATE`,
      ...reqParams
    );
    const requisition = reqRows[0];
    if (!requisition) {
      throw vacancyError("REQUISITION_NOT_FOUND", "Approved requisition not found in the permitted operating context.", 404);
    }
    if (requisition.status !== "OPEN") {
      throw vacancyError("REQUISITION_NOT_OPEN", "A vacancy can only be created from an approved/open requisition.", 409);
    }
    const existingRows = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "recruitment_vacancies" WHERE "organizationId"=$1 AND "requisitionId"=$2 LIMIT 1`,
      organizationId,
      requisitionId
    );
    if (existingRows.length) {
      throw vacancyError("VACANCY_ALREADY_EXISTS", "This requisition already has a vacancy record.", 409);
    }

    const openings = positiveInteger(input?.openings || requisition.requestedHeadcount, "Vacancy Openings");
    if (openings > Number(requisition.requestedHeadcount || 0)) {
      throw vacancyError(
        "VACANCY_OPENINGS_EXCEED_REQUISITION",
        "Vacancy openings cannot exceed the approved requisition headcount.",
        409
      );
    }
    const title = text(input?.title) || text(requisition.title);
    const summary = text(input?.summary);
    const responsibilities = text(input?.responsibilities) || null;
    const requirements = text(input?.requirements);
    const openingDate = dateOnly(input?.openingDate, "Opening Date");
    const closingDate = dateOnly(input?.closingDate, "Closing Date");
    if (!summary) throw vacancyError("VACANCY_SUMMARY_REQUIRED", "Vacancy summary is required.");
    if (!requirements) throw vacancyError("VACANCY_REQUIREMENTS_REQUIRED", "Vacancy requirements are required.");
    if (openingDate && closingDate && closingDate < openingDate) {
      throw vacancyError("INVALID_VACANCY_DATE_RANGE", "Closing Date cannot be earlier than Opening Date.");
    }

    const id = crypto.randomUUID();
    const vacancyNumber = await nextVacancyNumber(tx, organizationId);
    await tx.$executeRawUnsafe(
      `INSERT INTO "recruitment_vacancies"
       ("id","organizationId","vacancyNumber","requisitionId","locationId","departmentId","designationId",
        "title","employmentType","openings","summary","responsibilities","requirements","openingDate","closingDate",
        "status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15::date,'DRAFT',$16)`,
      id,
      organizationId,
      vacancyNumber,
      requisition.id,
      requisition.locationId,
      requisition.departmentId || null,
      requisition.designationId,
      title,
      requisition.employmentType,
      openings,
      summary,
      responsibilities,
      requirements,
      openingDate,
      closingDate,
      actorUserId || null
    );
    const created = await getVacancy({ organizationId, vacancyId: id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: id,
      action: "RECRUITMENT_VACANCY_CREATED",
      newValue: created,
      reason: `Created from ${requisition.requisitionNumber}.`,
    });
    return created;
  });
}

async function updateVacancy({ organizationId, vacancyId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getVacancy({ organizationId, vacancyId, scopeLocationId, prismaClient: tx });
    if (!previous) throw vacancyError("VACANCY_NOT_FOUND", "Vacancy not found in the permitted operating context.", 404);
    if (previous.status !== "DRAFT") {
      throw vacancyError("VACANCY_NOT_EDITABLE", "Only a Draft vacancy can be edited.", 409);
    }
    const openings = positiveInteger(input?.openings ?? previous.openings, "Vacancy Openings");
    if (openings > Number(previous.requestedHeadcount || 0)) {
      throw vacancyError("VACANCY_OPENINGS_EXCEED_REQUISITION", "Vacancy openings cannot exceed the approved requisition headcount.", 409);
    }
    const title = text(input?.title ?? previous.title);
    const summary = text(input?.summary ?? previous.summary);
    const responsibilities = text(input?.responsibilities ?? previous.responsibilities) || null;
    const requirements = text(input?.requirements ?? previous.requirements);
    const openingDate = input?.openingDate === undefined ? previous.openingDate : dateOnly(input.openingDate, "Opening Date");
    const closingDate = input?.closingDate === undefined ? previous.closingDate : dateOnly(input.closingDate, "Closing Date");
    if (!title) throw vacancyError("VACANCY_TITLE_REQUIRED", "Vacancy title is required.");
    if (!summary) throw vacancyError("VACANCY_SUMMARY_REQUIRED", "Vacancy summary is required.");
    if (!requirements) throw vacancyError("VACANCY_REQUIREMENTS_REQUIRED", "Vacancy requirements are required.");
    if (openingDate && closingDate && closingDate < openingDate) {
      throw vacancyError("INVALID_VACANCY_DATE_RANGE", "Closing Date cannot be earlier than Opening Date.");
    }
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_vacancies"
          SET "title"=$3,"openings"=$4,"summary"=$5,"responsibilities"=$6,"requirements"=$7,
              "openingDate"=$8::date,"closingDate"=$9::date,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      title,
      openings,
      summary,
      responsibilities,
      requirements,
      openingDate,
      closingDate
    );
    const updated = await getVacancy({ organizationId, vacancyId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action: "RECRUITMENT_VACANCY_UPDATED",
      previousValue: previous,
      newValue: updated,
      reason: "Draft vacancy details updated.",
    });
    return updated;
  });
}

async function publishVacancy({ organizationId, vacancyId, actorUserId, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getVacancy({ organizationId, vacancyId, prismaClient: tx });
    if (!previous) throw vacancyError("VACANCY_NOT_FOUND", "Vacancy not found.", 404);
    if (previous.status !== "DRAFT") {
      throw vacancyError("INVALID_VACANCY_TRANSITION", "Only a Draft vacancy can be published.", 409);
    }
    const openingDate = previous.openingDate || new Date().toISOString().slice(0, 10);
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_vacancies"
          SET "status"='PUBLISHED',"openingDate"=$3::date,"publishedByUserId"=$4,
              "publishedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      openingDate,
      actorUserId || null
    );
    const updated = await getVacancy({ organizationId, vacancyId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action: "RECRUITMENT_VACANCY_PUBLISHED",
      previousValue: previous,
      newValue: updated,
      reason: "Vacancy approved for publication by Head Office.",
    });
    return updated;
  });
}

async function closeVacancy({ organizationId, vacancyId, actorUserId, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getVacancy({ organizationId, vacancyId, prismaClient: tx });
    if (!previous) throw vacancyError("VACANCY_NOT_FOUND", "Vacancy not found.", 404);
    if (previous.status !== "PUBLISHED") {
      throw vacancyError("INVALID_VACANCY_TRANSITION", "Only a Published vacancy can be closed.", 409);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_vacancies"
          SET "status"='CLOSED',"closedByUserId"=$3,"closedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      actorUserId || null
    );
    const updated = await getVacancy({ organizationId, vacancyId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action: "RECRUITMENT_VACANCY_CLOSED",
      previousValue: previous,
      newValue: updated,
      reason: text(reason) || "Vacancy closed by Head Office.",
    });
    return updated;
  });
}

async function cancelDraftVacancy({ organizationId, vacancyId, actorUserId, scopeLocationId = null, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getVacancy({ organizationId, vacancyId, scopeLocationId, prismaClient: tx });
    if (!previous) throw vacancyError("VACANCY_NOT_FOUND", "Vacancy not found in the permitted operating context.", 404);
    if (previous.status !== "DRAFT") {
      throw vacancyError("INVALID_VACANCY_TRANSITION", "Only a Draft vacancy can be cancelled from branch context.", 409);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_vacancies"
          SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id
    );
    const updated = await getVacancy({ organizationId, vacancyId: previous.id, prismaClient: tx });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: previous.id,
      action: "RECRUITMENT_VACANCY_CANCELLED",
      previousValue: previous,
      newValue: updated,
      reason: text(reason) || "Draft vacancy cancelled.",
    });
    return updated;
  });
}

module.exports = {
  vacancyError,
  listVacancies,
  getVacancy,
  listEligibleRequisitions,
  getSummary,
  createVacancy,
  updateVacancy,
  publishVacancy,
  closeVacancy,
  cancelDraftVacancy,
};
