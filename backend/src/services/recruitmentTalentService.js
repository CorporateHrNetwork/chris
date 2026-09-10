const crypto = require("crypto");
const prisma = require("../config/prisma");

const ACTIVE_STAGES = new Set(["APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "OFFER"]);
const TERMINAL_STAGES = new Set(["HIRED", "REJECTED", "WITHDRAWN", "TALENT_POOL"]);
const MANUAL_STAGE_TRANSITIONS = {
  APPLIED: new Set(["SCREENING", "WITHDRAWN"]),
  SCREENING: new Set(["SHORTLISTED", "REJECTED", "WITHDRAWN", "TALENT_POOL"]),
  SHORTLISTED: new Set(["INTERVIEW", "REJECTED", "WITHDRAWN", "TALENT_POOL"]),
  INTERVIEW: new Set(["REJECTED", "WITHDRAWN", "TALENT_POOL"]),
  OFFER: new Set(["WITHDRAWN", "TALENT_POOL"]),
};

function talentError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function email(value) {
  return text(value).toLowerCase();
}

function positiveMoney(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw talentError("INVALID_OFFER_AMOUNT", `${label} must be greater than zero.`);
  }
  return Math.round(amount * 100) / 100;
}

function score(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw talentError("INVALID_INTERVIEW_SCORE", "Interview score must be between 0 and 100.");
  }
  return Math.round(number * 100) / 100;
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw talentError("INVALID_RECRUITMENT_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw talentError("INVALID_RECRUITMENT_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function instant(value, label) {
  const raw = text(value);
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) {
    throw talentError("INVALID_RECRUITMENT_DATETIME", `${label} must be a valid date and time.`);
  }
  return parsed.toISOString();
}

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function isoInstant(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function audit(client, { organizationId, actorUserId, entityType, entityId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType,
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function nextNumber(client, table, prefix, organizationId) {
  const year = new Date().getFullYear();
  const allowed = new Set([
    "recruitment_candidate_counters",
    "recruitment_application_counters",
    "recruitment_offer_counters",
  ]);
  if (!allowed.has(table)) throw new Error("Unsupported recruitment counter table.");
  const rows = await client.$queryRawUnsafe(
    `INSERT INTO "${table}" ("organizationId","year","nextValue","updatedAt")
     VALUES ($1,$2,2,CURRENT_TIMESTAMP)
     ON CONFLICT ("organizationId","year")
     DO UPDATE SET "nextValue"="${table}"."nextValue" + 1,
                   "updatedAt"=CURRENT_TIMESTAMP
     RETURNING "nextValue"`,
    organizationId,
    year
  );
  const sequence = Number(rows[0]?.nextValue || 2) - 1;
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

function mapCandidate(row) {
  if (!row) return null;
  return {
    ...row,
    applicationCount: Number(row.applicationCount || 0),
    privacyConsent: Boolean(row.privacyConsent),
    privacyConsentAt: isoInstant(row.privacyConsentAt),
  };
}

function mapApplication(row) {
  if (!row) return null;
  return {
    ...row,
    appliedAt: isoInstant(row.appliedAt),
    closedAt: isoInstant(row.closedAt),
    vacancyClosingDate: isoDate(row.vacancyClosingDate),
  };
}

function mapInterview(row) {
  if (!row) return null;
  return {
    ...row,
    roundNumber: Number(row.roundNumber || 0),
    overallScore: row.overallScore === null || row.overallScore === undefined ? null : Number(row.overallScore),
    scheduledAt: isoInstant(row.scheduledAt),
  };
}

function mapOffer(row, includeCompensation = true) {
  if (!row) return null;
  return {
    ...row,
    grossMonthly: includeCompensation ? Number(row.grossMonthly || 0) : null,
    compensationRestricted: !includeCompensation,
    proposedStartDate: isoDate(row.proposedStartDate),
    expiryDate: isoDate(row.expiryDate),
    approvedAt: isoInstant(row.approvedAt),
    issuedAt: isoInstant(row.issuedAt),
    respondedAt: isoInstant(row.respondedAt),
  };
}

async function visibleCandidate({ client, organizationId, candidateId, scopeLocationId = null, forUpdate = false }) {
  const params = [organizationId, text(candidateId)];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND EXISTS (
      SELECT 1 FROM "recruitment_applications" a
       WHERE a."organizationId"=c."organizationId" AND a."candidateId"=c."id" AND a."locationId"=$${params.length}
    )`;
  }
  const rows = await client.$queryRawUnsafe(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM "recruitment_applications" a
              WHERE a."organizationId"=c."organizationId" AND a."candidateId"=c."id") AS "applicationCount"
       FROM "recruitment_candidates" c
      WHERE c."organizationId"=$1 AND c."id"=$2${scope}
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    ...params
  );
  return mapCandidate(rows[0] || null);
}

async function listCandidates({ organizationId, scopeLocationId = null, search = null, prismaClient = prisma }) {
  const params = [organizationId];
  let where = `WHERE c."organizationId"=$1`;
  if (scopeLocationId) {
    params.push(scopeLocationId);
    where += ` AND EXISTS (
      SELECT 1 FROM "recruitment_applications" a0
       WHERE a0."organizationId"=c."organizationId" AND a0."candidateId"=c."id" AND a0."locationId"=$${params.length}
    )`;
  }
  if (text(search)) {
    params.push(`%${text(search).toLowerCase()}%`);
    where += ` AND (LOWER(c."candidateNumber") LIKE $${params.length} OR LOWER(c."firstName") LIKE $${params.length}
                   OR LOWER(c."lastName") LIKE $${params.length} OR LOWER(c."email") LIKE $${params.length}
                   OR LOWER(COALESCE(c."phone",'')) LIKE $${params.length})`;
  }
  const scopedApp = scopeLocationId ? ` AND a."locationId"=$2` : "";
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM "recruitment_applications" a
              WHERE a."organizationId"=c."organizationId" AND a."candidateId"=c."id"${scopedApp}) AS "applicationCount"
       FROM "recruitment_candidates" c
       ${where}
       ORDER BY c."createdAt" DESC`,
    ...params
  );
  return rows.map(mapCandidate);
}

async function listPublishedVacancies({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND v."locationId"=$${params.length}`;
  }
  return prismaClient.$queryRawUnsafe(
    `SELECT v."id",v."vacancyNumber",v."title",v."openings",v."locationId",v."employmentType",
            v."closingDate",l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_vacancies" v
       JOIN "organization_locations" l ON l."organizationId"=v."organizationId" AND l."id"=v."locationId"
      WHERE v."organizationId"=$1 AND v."status"='PUBLISHED'
        AND (v."closingDate" IS NULL OR v."closingDate">=CURRENT_DATE)${scope}
      ORDER BY v."createdAt" DESC`,
    ...params
  );
}

async function getApplication({ organizationId, applicationId, scopeLocationId = null, prismaClient = prisma, forUpdate = false }) {
  const params = [organizationId, text(applicationId)];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND a."locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT a.*,
            c."candidateNumber",c."firstName",c."lastName",c."email",c."phone",c."talentPoolStatus",
            v."vacancyNumber",v."title" AS "vacancyTitle",v."status" AS "vacancyStatus",v."closingDate" AS "vacancyClosingDate",
            l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_applications" a
       JOIN "recruitment_candidates" c ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       JOIN "recruitment_vacancies" v ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       JOIN "organization_locations" l ON l."organizationId"=a."organizationId" AND l."id"=a."locationId"
      WHERE a."organizationId"=$1 AND a."id"=$2${scope}
      LIMIT 1${forUpdate ? " FOR UPDATE OF a" : ""}`,
    ...params
  );
  return mapApplication(rows[0] || null);
}

async function listApplications({ organizationId, scopeLocationId = null, stage = null, prismaClient = prisma }) {
  const params = [organizationId];
  let where = `WHERE a."organizationId"=$1`;
  if (scopeLocationId) {
    params.push(scopeLocationId);
    where += ` AND a."locationId"=$${params.length}`;
  }
  if (text(stage)) {
    params.push(text(stage).toUpperCase());
    where += ` AND a."stage"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT a.*,
            c."candidateNumber",c."firstName",c."lastName",c."email",c."phone",c."talentPoolStatus",
            v."vacancyNumber",v."title" AS "vacancyTitle",v."status" AS "vacancyStatus",v."closingDate" AS "vacancyClosingDate",
            l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_applications" a
       JOIN "recruitment_candidates" c ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       JOIN "recruitment_vacancies" v ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       JOIN "organization_locations" l ON l."organizationId"=a."organizationId" AND l."id"=a."locationId"
       ${where}
       ORDER BY a."updatedAt" DESC,a."createdAt" DESC`,
    ...params
  );
  return rows.map(mapApplication);
}

async function appendStageHistory(client, { organizationId, applicationId, actorUserId, fromStage, toStage, reason }) {
  await client.$executeRawUnsafe(
    `INSERT INTO "recruitment_application_stage_history"
      ("id","organizationId","applicationId","fromStage","toStage","reason","actorUserId")
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    crypto.randomUUID(), organizationId, applicationId, fromStage || null, toStage, text(reason) || null, actorUserId || null
  );
}

async function transitionApplicationInTx(client, { organizationId, application, actorUserId, nextStage, reason, system = false }) {
  const target = text(nextStage).toUpperCase();
  if (!application) throw talentError("APPLICATION_NOT_FOUND", "Application not found.", 404);
  if (application.status === "CLOSED") {
    throw talentError("APPLICATION_CLOSED", "This application is already closed.", 409);
  }
  if (!system) {
    const allowed = MANUAL_STAGE_TRANSITIONS[application.stage] || new Set();
    if (!allowed.has(target)) {
      throw talentError(
        "INVALID_APPLICATION_STAGE_TRANSITION",
        `Application cannot move from ${application.stage} to ${target} through the manual ATS action.`,
        409
      );
    }
  }
  if ((target === "REJECTED" || target === "WITHDRAWN") && !text(reason)) {
    throw talentError("APPLICATION_STAGE_REASON_REQUIRED", `${target} requires a reason.`);
  }
  const terminal = TERMINAL_STAGES.has(target);
  await client.$executeRawUnsafe(
    `UPDATE "recruitment_applications"
        SET "stage"=$3,"status"=$4,
            "closedAt"=${terminal ? "CURRENT_TIMESTAMP" : "NULL"},
            "closedReason"=$5,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2`,
    organizationId,
    application.id,
    target,
    terminal ? "CLOSED" : "ACTIVE",
    terminal ? text(reason) || target : null
  );
  await appendStageHistory(client, {
    organizationId,
    applicationId: application.id,
    actorUserId,
    fromStage: application.stage,
    toStage: target,
    reason,
  });
  if (target === "TALENT_POOL") {
    await client.$executeRawUnsafe(
      `UPDATE "recruitment_candidates" SET "talentPoolStatus"='AVAILABLE',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      application.candidateId
    );
  }
  return getApplication({ organizationId, applicationId: application.id, prismaClient: client });
}

async function createCandidateApplication({ organizationId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const vacancyId = text(input?.vacancyId);
    if (!vacancyId) throw talentError("PUBLISHED_VACANCY_REQUIRED", "Select a published vacancy.");
    const params = [organizationId, vacancyId];
    let scope = "";
    if (scopeLocationId) {
      params.push(scopeLocationId);
      scope = ` AND v."locationId"=$${params.length}`;
    }
    const vacancies = await tx.$queryRawUnsafe(
      `SELECT v.* FROM "recruitment_vacancies" v
        WHERE v."organizationId"=$1 AND v."id"=$2${scope}
        LIMIT 1 FOR UPDATE`,
      ...params
    );
    const vacancy = vacancies[0];
    if (!vacancy) throw talentError("VACANCY_NOT_FOUND", "Published vacancy not found in the permitted operating context.", 404);
    if (vacancy.status !== "PUBLISHED") {
      throw talentError("VACANCY_NOT_PUBLISHED", "Candidates can only be attached to a published vacancy.", 409);
    }
    if (vacancy.closingDate && isoDate(vacancy.closingDate) < new Date().toISOString().slice(0, 10)) {
      throw talentError("VACANCY_CLOSED_TO_APPLICATIONS", "This vacancy has passed its closing date.", 409);
    }

    let candidate;
    const existingCandidateId = text(input?.candidateId);
    if (existingCandidateId) {
      candidate = await visibleCandidate({ client: tx, organizationId, candidateId: existingCandidateId, scopeLocationId });
      if (!candidate) {
        throw talentError("CANDIDATE_NOT_AVAILABLE_IN_SCOPE", "Existing candidate is not available in this operating context.", 404);
      }
    } else {
      const firstName = text(input?.firstName);
      const lastName = text(input?.lastName);
      const candidateEmail = email(input?.email);
      if (!firstName || !lastName || !candidateEmail) {
        throw talentError("CANDIDATE_IDENTITY_REQUIRED", "First Name, Last Name and Email are required.");
      }
      if (!input?.privacyConsent) {
        throw talentError("CANDIDATE_PRIVACY_CONSENT_REQUIRED", "Candidate privacy/data-processing consent must be recorded before creating the profile.", 409);
      }
      const duplicates = await tx.$queryRawUnsafe(
        `SELECT "id","candidateNumber" FROM "recruitment_candidates"
          WHERE "organizationId"=$1 AND LOWER("email")=$2 LIMIT 1`,
        organizationId,
        candidateEmail
      );
      if (duplicates.length) {
        throw talentError(
          "CANDIDATE_EMAIL_EXISTS",
          "A candidate profile with this email already exists. Reuse the existing candidate from Head Office or the permitted branch context.",
          409,
          { candidateNumber: duplicates[0].candidateNumber }
        );
      }
      const id = crypto.randomUUID();
      const candidateNumber = await nextNumber(tx, "recruitment_candidate_counters", "CAN", organizationId);
      await tx.$executeRawUnsafe(
        `INSERT INTO "recruitment_candidates"
          ("id","organizationId","candidateNumber","firstName","lastName","email","phone","alternatePhone","source",
           "city","state","country","cvFileName","cvReference","privacyConsent","privacyConsentAt","createdByUserId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,CURRENT_TIMESTAMP,$15)`,
        id,
        organizationId,
        candidateNumber,
        firstName,
        lastName,
        candidateEmail,
        text(input?.phone) || null,
        text(input?.alternatePhone) || null,
        text(input?.source).toUpperCase() || "DIRECT",
        text(input?.city) || null,
        text(input?.state) || null,
        text(input?.country) || "Nigeria",
        text(input?.cvFileName) || null,
        text(input?.cvReference) || null,
        actorUserId || null
      );
      candidate = await visibleCandidate({ client: tx, organizationId, candidateId: id });
      await audit(tx, {
        organizationId,
        actorUserId,
        entityType: "RecruitmentCandidate",
        entityId: id,
        action: "RECRUITMENT_CANDIDATE_CREATED",
        newValue: candidate,
        reason: `Candidate profile created for ${vacancy.vacancyNumber}.`,
      });
    }

    const duplicates = await tx.$queryRawUnsafe(
      `SELECT "id","applicationNumber" FROM "recruitment_applications"
        WHERE "organizationId"=$1 AND "candidateId"=$2 AND "vacancyId"=$3 LIMIT 1`,
      organizationId,
      candidate.id,
      vacancy.id
    );
    if (duplicates.length) {
      throw talentError("DUPLICATE_CANDIDATE_APPLICATION", "This candidate already has an application for the selected vacancy.", 409);
    }
    const appId = crypto.randomUUID();
    const applicationNumber = await nextNumber(tx, "recruitment_application_counters", "APP", organizationId);
    await tx.$executeRawUnsafe(
      `INSERT INTO "recruitment_applications"
        ("id","organizationId","applicationNumber","candidateId","vacancyId","locationId","stage","status","coverNote","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,'APPLIED','ACTIVE',$7,$8)`,
      appId,
      organizationId,
      applicationNumber,
      candidate.id,
      vacancy.id,
      vacancy.locationId,
      text(input?.coverNote) || null,
      actorUserId || null
    );
    await appendStageHistory(tx, {
      organizationId,
      applicationId: appId,
      actorUserId,
      fromStage: null,
      toStage: "APPLIED",
      reason: "Application created.",
    });
    const application = await getApplication({ organizationId, applicationId: appId, prismaClient: tx });
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentApplication",
      entityId: appId,
      action: "RECRUITMENT_APPLICATION_CREATED",
      newValue: application,
      reason: `Application created for ${vacancy.vacancyNumber}.`,
    });
    return { candidate, application };
  });
}

async function updateCandidate({ organizationId, candidateId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await visibleCandidate({ client: tx, organizationId, candidateId, scopeLocationId, forUpdate: true });
    if (!previous) throw talentError("CANDIDATE_NOT_FOUND", "Candidate not found in the permitted operating context.", 404);
    if (scopeLocationId) {
      const outside = await tx.$queryRawUnsafe(
        `SELECT 1 FROM "recruitment_applications"
          WHERE "organizationId"=$1 AND "candidateId"=$2 AND "locationId"<>$3 LIMIT 1`,
        organizationId,
        previous.id,
        scopeLocationId
      );
      if (outside.length) {
        throw talentError("HEAD_OFFICE_REQUIRED_FOR_SHARED_CANDIDATE", "This candidate has applications across branches. Update the master profile from HEAD OFFICE.", 409);
      }
    }
    const nextEmail = input?.email === undefined ? previous.email : email(input.email);
    const firstName = input?.firstName === undefined ? previous.firstName : text(input.firstName);
    const lastName = input?.lastName === undefined ? previous.lastName : text(input.lastName);
    if (!nextEmail || !firstName || !lastName) throw talentError("CANDIDATE_IDENTITY_REQUIRED", "First Name, Last Name and Email are required.");
    const collision = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "recruitment_candidates"
        WHERE "organizationId"=$1 AND LOWER("email")=$2 AND "id"<>$3 LIMIT 1`,
      organizationId,
      nextEmail,
      previous.id
    );
    if (collision.length) throw talentError("CANDIDATE_EMAIL_EXISTS", "Another candidate already uses this email address.", 409);
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_candidates" SET
          "firstName"=$3,"lastName"=$4,"email"=$5,"phone"=$6,"alternatePhone"=$7,"source"=$8,
          "city"=$9,"state"=$10,"country"=$11,"cvFileName"=$12,"cvReference"=$13,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      firstName,
      lastName,
      nextEmail,
      input?.phone === undefined ? previous.phone : text(input.phone) || null,
      input?.alternatePhone === undefined ? previous.alternatePhone : text(input.alternatePhone) || null,
      input?.source === undefined ? previous.source : text(input.source).toUpperCase() || "DIRECT",
      input?.city === undefined ? previous.city : text(input.city) || null,
      input?.state === undefined ? previous.state : text(input.state) || null,
      input?.country === undefined ? previous.country : text(input.country) || "Nigeria",
      input?.cvFileName === undefined ? previous.cvFileName : text(input.cvFileName) || null,
      input?.cvReference === undefined ? previous.cvReference : text(input.cvReference) || null
    );
    const updated = await visibleCandidate({ client: tx, organizationId, candidateId: previous.id, scopeLocationId });
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentCandidate",
      entityId: previous.id,
      action: "RECRUITMENT_CANDIDATE_UPDATED",
      previousValue: previous,
      newValue: updated,
      reason: text(input?.reason) || "Candidate profile updated.",
    });
    return updated;
  });
}

async function transitionApplication({ organizationId, applicationId, actorUserId, scopeLocationId = null, nextStage, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const application = await getApplication({ organizationId, applicationId, scopeLocationId, prismaClient: tx, forUpdate: true });
    if (!application) throw talentError("APPLICATION_NOT_FOUND", "Application not found in the permitted operating context.", 404);
    const updated = await transitionApplicationInTx(tx, { organizationId, application, actorUserId, nextStage, reason });
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentApplication",
      entityId: application.id,
      action: "RECRUITMENT_APPLICATION_STAGE_CHANGED",
      previousValue: application,
      newValue: updated,
      reason,
    });
    return updated;
  });
}

async function listStageHistory({ organizationId, applicationId, scopeLocationId = null, prismaClient = prisma }) {
  const application = await getApplication({ organizationId, applicationId, scopeLocationId, prismaClient });
  if (!application) throw talentError("APPLICATION_NOT_FOUND", "Application not found in the permitted operating context.", 404);
  return prismaClient.$queryRawUnsafe(
    `SELECT h.*,CONCAT_WS(' ',u."firstName",u."lastName") AS "actorName"
       FROM "recruitment_application_stage_history" h
       LEFT JOIN "users" u ON u."id"=h."actorUserId"
      WHERE h."organizationId"=$1 AND h."applicationId"=$2
      ORDER BY h."createdAt" ASC`,
    organizationId,
    application.id
  );
}

async function listInterviews({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND i."locationId"=$${params.length}`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT i.*,a."applicationNumber",a."stage" AS "applicationStage",
            c."candidateNumber",c."firstName",c."lastName",v."vacancyNumber",v."title" AS "vacancyTitle",
            l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_interviews" i
       JOIN "recruitment_applications" a ON a."organizationId"=i."organizationId" AND a."id"=i."applicationId"
       JOIN "recruitment_candidates" c ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       JOIN "recruitment_vacancies" v ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       JOIN "organization_locations" l ON l."organizationId"=i."organizationId" AND l."id"=i."locationId"
      WHERE i."organizationId"=$1${scope}
      ORDER BY i."scheduledAt" DESC`,
    ...params
  );
  return rows.map(mapInterview);
}

async function createInterview({ organizationId, applicationId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const application = await getApplication({ organizationId, applicationId, scopeLocationId, prismaClient: tx, forUpdate: true });
    if (!application) throw talentError("APPLICATION_NOT_FOUND", "Application not found in the permitted operating context.", 404);
    if (!new Set(["SHORTLISTED", "INTERVIEW"]).has(application.stage) || application.status !== "ACTIVE") {
      throw talentError("APPLICATION_NOT_INTERVIEW_READY", "Only active shortlisted/interview-stage applications can be scheduled.", 409);
    }
    const scheduledAt = instant(input?.scheduledAt, "Interview Schedule");
    const title = text(input?.title) || "Interview";
    const mode = text(input?.mode).toUpperCase() || "IN_PERSON";
    if (!new Set(["IN_PERSON", "VIRTUAL", "PHONE"]).has(mode)) throw talentError("INVALID_INTERVIEW_MODE", "Interview mode is invalid.");
    const maxRows = await tx.$queryRawUnsafe(
      `SELECT COALESCE(MAX("roundNumber"),0)::int AS "maxRound" FROM "recruitment_interviews"
        WHERE "organizationId"=$1 AND "applicationId"=$2`,
      organizationId,
      application.id
    );
    const roundNumber = Number(maxRows[0]?.maxRound || 0) + 1;
    const id = crypto.randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "recruitment_interviews"
        ("id","organizationId","applicationId","locationId","roundNumber","title","scheduledAt","mode","venueOrLink","panel","status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,'SCHEDULED',$11)`,
      id, organizationId, application.id, application.locationId, roundNumber, title, scheduledAt, mode,
      text(input?.venueOrLink) || null, text(input?.panel) || null, actorUserId || null
    );
    let current = application;
    if (application.stage === "SHORTLISTED") {
      current = await transitionApplicationInTx(tx, {
        organizationId,
        application,
        actorUserId,
        nextStage: "INTERVIEW",
        reason: `Interview round ${roundNumber} scheduled.`,
        system: true,
      });
    }
    const rows = await tx.$queryRawUnsafe(`SELECT * FROM "recruitment_interviews" WHERE "id"=$1 LIMIT 1`, id);
    const interview = mapInterview(rows[0]);
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentInterview",
      entityId: id,
      action: "RECRUITMENT_INTERVIEW_SCHEDULED",
      newValue: interview,
      reason: `Interview round ${roundNumber} scheduled for ${current.applicationNumber}.`,
    });
    return interview;
  });
}

async function completeInterview({ organizationId, interviewId, actorUserId, scopeLocationId = null, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const params = [organizationId, text(interviewId)];
    let scope = "";
    if (scopeLocationId) { params.push(scopeLocationId); scope = ` AND "locationId"=$${params.length}`; }
    const rows = await tx.$queryRawUnsafe(
      `SELECT * FROM "recruitment_interviews" WHERE "organizationId"=$1 AND "id"=$2${scope} LIMIT 1 FOR UPDATE`,
      ...params
    );
    const previous = mapInterview(rows[0]);
    if (!previous) throw talentError("INTERVIEW_NOT_FOUND", "Interview not found in the permitted operating context.", 404);
    if (previous.status !== "SCHEDULED") throw talentError("INTERVIEW_NOT_COMPLETABLE", "Only a scheduled interview can be completed.", 409);
    const recommendation = text(input?.recommendation).toUpperCase();
    if (!new Set(["PROCEED", "HOLD", "REJECT"]).has(recommendation)) {
      throw talentError("INTERVIEW_RECOMMENDATION_REQUIRED", "Recommendation must be PROCEED, HOLD or REJECT.");
    }
    const overallScore = score(input?.overallScore);
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_interviews" SET "status"='COMPLETED',"overallScore"=$3,"recommendation"=$4,"notes"=$5,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId, previous.id, overallScore, recommendation, text(input?.notes) || null
    );
    const updatedRows = await tx.$queryRawUnsafe(`SELECT * FROM "recruitment_interviews" WHERE "id"=$1 LIMIT 1`, previous.id);
    const updated = mapInterview(updatedRows[0]);
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentInterview",
      entityId: previous.id,
      action: "RECRUITMENT_INTERVIEW_COMPLETED",
      previousValue: previous,
      newValue: updated,
      reason: text(input?.notes) || recommendation,
    });
    return updated;
  });
}

async function cancelInterview({ organizationId, interviewId, actorUserId, scopeLocationId = null, reason, prismaClient = prisma }) {
  if (!text(reason)) throw talentError("INTERVIEW_CANCELLATION_REASON_REQUIRED", "Interview cancellation requires a reason.");
  return prismaClient.$transaction(async (tx) => {
    const params = [organizationId, text(interviewId)];
    let scope = "";
    if (scopeLocationId) { params.push(scopeLocationId); scope = ` AND "locationId"=$${params.length}`; }
    const rows = await tx.$queryRawUnsafe(
      `SELECT * FROM "recruitment_interviews" WHERE "organizationId"=$1 AND "id"=$2${scope} LIMIT 1 FOR UPDATE`,
      ...params
    );
    const previous = mapInterview(rows[0]);
    if (!previous) throw talentError("INTERVIEW_NOT_FOUND", "Interview not found in the permitted operating context.", 404);
    if (previous.status !== "SCHEDULED") throw talentError("INTERVIEW_NOT_CANCELLABLE", "Only a scheduled interview can be cancelled.", 409);
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_interviews" SET "status"='CANCELLED',"notes"=$3,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId, previous.id, text(reason)
    );
    const updatedRows = await tx.$queryRawUnsafe(`SELECT * FROM "recruitment_interviews" WHERE "id"=$1 LIMIT 1`, previous.id);
    const updated = mapInterview(updatedRows[0]);
    await audit(tx, { organizationId, actorUserId, entityType: "RecruitmentInterview", entityId: previous.id, action: "RECRUITMENT_INTERVIEW_CANCELLED", previousValue: previous, newValue: updated, reason });
    return updated;
  });
}

async function listOffers({ organizationId, scopeLocationId = null, includeCompensation = true, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) { params.push(scopeLocationId); scope = ` AND o."locationId"=$${params.length}`; }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT o.*,a."applicationNumber",a."stage" AS "applicationStage",
            c."candidateNumber",c."firstName",c."lastName",c."email",
            v."vacancyNumber",v."title" AS "vacancyTitle",l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_offers" o
       JOIN "recruitment_applications" a ON a."organizationId"=o."organizationId" AND a."id"=o."applicationId"
       JOIN "recruitment_candidates" c ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       JOIN "recruitment_vacancies" v ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       JOIN "organization_locations" l ON l."organizationId"=o."organizationId" AND l."id"=o."locationId"
      WHERE o."organizationId"=$1${scope}
      ORDER BY o."createdAt" DESC`,
    ...params
  );
  return rows.map((row) => mapOffer(row, includeCompensation));
}

async function getOffer({ organizationId, offerId, scopeLocationId = null, includeCompensation = true, prismaClient = prisma, forUpdate = false }) {
  const params = [organizationId, text(offerId)];
  let scope = "";
  if (scopeLocationId) { params.push(scopeLocationId); scope = ` AND o."locationId"=$${params.length}`; }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT o.*,a."applicationNumber",a."stage" AS "applicationStage",a."candidateId",
            c."candidateNumber",c."firstName",c."lastName",c."email",
            v."vacancyNumber",v."title" AS "vacancyTitle",l."name" AS "locationName",l."code" AS "locationCode"
       FROM "recruitment_offers" o
       JOIN "recruitment_applications" a ON a."organizationId"=o."organizationId" AND a."id"=o."applicationId"
       JOIN "recruitment_candidates" c ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       JOIN "recruitment_vacancies" v ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       JOIN "organization_locations" l ON l."organizationId"=o."organizationId" AND l."id"=o."locationId"
      WHERE o."organizationId"=$1 AND o."id"=$2${scope}
      LIMIT 1${forUpdate ? " FOR UPDATE OF o" : ""}`,
    ...params
  );
  return mapOffer(rows[0] || null, includeCompensation);
}

async function createOffer({ organizationId, applicationId, actorUserId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const application = await getApplication({ organizationId, applicationId, prismaClient: tx, forUpdate: true });
    if (!application) throw talentError("APPLICATION_NOT_FOUND", "Application not found.", 404);
    if (application.stage !== "INTERVIEW" || application.status !== "ACTIVE") {
      throw talentError("APPLICATION_NOT_OFFER_READY", "An offer can only be prepared for an active interview-stage application.", 409);
    }
    const completed = await tx.$queryRawUnsafe(
      `SELECT 1 FROM "recruitment_interviews" WHERE "organizationId"=$1 AND "applicationId"=$2 AND "status"='COMPLETED' LIMIT 1`,
      organizationId,
      application.id
    );
    if (!completed.length) throw talentError("COMPLETED_INTERVIEW_REQUIRED", "Complete at least one interview before preparing an offer.", 409);
    const existing = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "recruitment_offers" WHERE "organizationId"=$1 AND "applicationId"=$2 LIMIT 1`,
      organizationId,
      application.id
    );
    if (existing.length) throw talentError("OFFER_ALREADY_EXISTS", "This application already has an offer record.", 409);
    const grossMonthly = positiveMoney(input?.grossMonthly, "Gross Monthly Pay");
    const proposedStartDate = dateOnly(input?.proposedStartDate, "Proposed Start Date");
    const expiryDate = dateOnly(input?.expiryDate, "Offer Expiry Date");
    if (expiryDate && proposedStartDate && expiryDate > proposedStartDate) {
      throw talentError("INVALID_OFFER_DATE_RANGE", "Offer Expiry Date cannot be later than Proposed Start Date.");
    }
    const id = crypto.randomUUID();
    const offerNumber = await nextNumber(tx, "recruitment_offer_counters", "OFF", organizationId);
    await tx.$executeRawUnsafe(
      `INSERT INTO "recruitment_offers"
        ("id","organizationId","offerNumber","applicationId","locationId","currency","grossMonthly","proposedStartDate","expiryDate","notes","status","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,'DRAFT',$11)`,
      id, organizationId, offerNumber, application.id, application.locationId,
      text(input?.currency).toUpperCase() || "NGN", grossMonthly, proposedStartDate, expiryDate,
      text(input?.notes) || null, actorUserId || null
    );
    const offer = await getOffer({ organizationId, offerId: id, prismaClient: tx });
    await audit(tx, { organizationId, actorUserId, entityType: "RecruitmentOffer", entityId: id, action: "RECRUITMENT_OFFER_CREATED", newValue: offer, reason: `Offer prepared for ${application.applicationNumber}.` });
    return offer;
  });
}

async function transitionOffer({ organizationId, offerId, actorUserId, action, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const previous = await getOffer({ organizationId, offerId, prismaClient: tx, forUpdate: true });
    if (!previous) throw talentError("OFFER_NOT_FOUND", "Offer not found.", 404);
    const normalized = text(action).toUpperCase();
    const transitions = {
      SUBMIT: { from: "DRAFT", to: "PENDING_APPROVAL" },
      APPROVE: { from: "PENDING_APPROVAL", to: "APPROVED" },
      ISSUE: { from: "APPROVED", to: "ISSUED" },
      ACCEPT: { from: "ISSUED", to: "ACCEPTED" },
      DECLINE: { from: "ISSUED", to: "DECLINED" },
      WITHDRAW: { from: null, to: "WITHDRAWN" },
    };
    const rule = transitions[normalized];
    if (!rule) throw talentError("INVALID_OFFER_ACTION", "Unsupported offer action.");
    if (normalized === "WITHDRAW") {
      if (!new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED"]).has(previous.status)) {
        throw talentError("OFFER_NOT_WITHDRAWABLE", `A ${previous.status} offer cannot be withdrawn.`, 409);
      }
      if (!text(reason)) throw talentError("OFFER_WITHDRAWAL_REASON_REQUIRED", "Offer withdrawal requires a reason.");
    } else if (previous.status !== rule.from) {
      throw talentError("INVALID_OFFER_TRANSITION", `Offer cannot move from ${previous.status} using ${normalized}.`, 409);
    }
    const sets = ['"status"=$3', '"updatedAt"=CURRENT_TIMESTAMP'];
    const params = [organizationId, previous.id, rule.to];
    if (normalized === "APPROVE") {
      params.push(actorUserId || null); sets.push(`"approvedByUserId"=$${params.length}`); sets.push('"approvedAt"=CURRENT_TIMESTAMP');
    }
    if (normalized === "ISSUE") {
      params.push(actorUserId || null); sets.push(`"issuedByUserId"=$${params.length}`); sets.push('"issuedAt"=CURRENT_TIMESTAMP');
    }
    if (normalized === "ACCEPT" || normalized === "DECLINE") sets.push('"respondedAt"=CURRENT_TIMESTAMP');
    if (normalized === "WITHDRAW" && text(reason)) {
      params.push(text(reason)); sets.push(`"notes"=COALESCE("notes",'') || CASE WHEN COALESCE("notes",'')='' THEN '' ELSE E'\n' END || $${params.length}`);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_offers" SET ${sets.join(",")} WHERE "organizationId"=$1 AND "id"=$2`,
      ...params
    );

    const application = await getApplication({ organizationId, applicationId: previous.applicationId, prismaClient: tx, forUpdate: true });
    if (normalized === "ISSUE" && application.stage === "INTERVIEW" && application.status === "ACTIVE") {
      await transitionApplicationInTx(tx, { organizationId, application, actorUserId, nextStage: "OFFER", reason: `Offer ${previous.offerNumber} issued.`, system: true });
    } else if (normalized === "ACCEPT") {
      if (application.stage !== "OFFER" || application.status !== "ACTIVE") throw talentError("APPLICATION_NOT_AT_OFFER_STAGE", "Application is not at the Offer stage.", 409);
      await transitionApplicationInTx(tx, { organizationId, application, actorUserId, nextStage: "HIRED", reason: `Offer ${previous.offerNumber} accepted.`, system: true });
    } else if (normalized === "DECLINE") {
      if (application.stage === "OFFER" && application.status === "ACTIVE") {
        await transitionApplicationInTx(tx, { organizationId, application, actorUserId, nextStage: "REJECTED", reason: `Offer ${previous.offerNumber} declined.`, system: true });
      }
    } else if (normalized === "WITHDRAW" && previous.status === "ISSUED") {
      if (application.stage === "OFFER" && application.status === "ACTIVE") {
        await transitionApplicationInTx(tx, { organizationId, application, actorUserId, nextStage: "REJECTED", reason: `Offer ${previous.offerNumber} withdrawn: ${text(reason)}`, system: true });
      }
    }

    const updated = await getOffer({ organizationId, offerId: previous.id, prismaClient: tx });
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "RecruitmentOffer",
      entityId: previous.id,
      action: `RECRUITMENT_OFFER_${normalized}`,
      previousValue: previous,
      newValue: updated,
      reason: text(reason) || normalized,
    });
    return updated;
  });
}

async function setTalentPoolStatus({ organizationId, candidateId, actorUserId, scopeLocationId = null, status, notes, prismaClient = prisma }) {
  const target = text(status).toUpperCase();
  if (!new Set(["AVAILABLE", "ARCHIVED", "NONE"]).has(target)) throw talentError("INVALID_TALENT_POOL_STATUS", "Talent Pool status is invalid.");
  return prismaClient.$transaction(async (tx) => {
    const previous = await visibleCandidate({ client: tx, organizationId, candidateId, scopeLocationId, forUpdate: true });
    if (!previous) throw talentError("CANDIDATE_NOT_FOUND", "Candidate not found in the permitted operating context.", 404);
    await tx.$executeRawUnsafe(
      `UPDATE "recruitment_candidates" SET "talentPoolStatus"=$3,"talentPoolNotes"=$4,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      previous.id,
      target,
      text(notes) || null
    );
    const updated = await visibleCandidate({ client: tx, organizationId, candidateId: previous.id, scopeLocationId });
    await audit(tx, { organizationId, actorUserId, entityType: "RecruitmentCandidate", entityId: previous.id, action: "RECRUITMENT_TALENT_POOL_STATUS_CHANGED", previousValue: previous, newValue: updated, reason: text(notes) || target });
    return updated;
  });
}

async function listTalentPool({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let scope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    scope = ` AND EXISTS (SELECT 1 FROM "recruitment_applications" a
      WHERE a."organizationId"=c."organizationId" AND a."candidateId"=c."id" AND a."locationId"=$${params.length})`;
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM "recruitment_applications" a WHERE a."organizationId"=c."organizationId" AND a."candidateId"=c."id") AS "applicationCount"
       FROM "recruitment_candidates" c
      WHERE c."organizationId"=$1 AND c."talentPoolStatus"='AVAILABLE'${scope}
      ORDER BY c."updatedAt" DESC`,
    ...params
  );
  return rows.map(mapCandidate);
}

async function getTalentSummary({ organizationId, scopeLocationId = null, prismaClient = prisma }) {
  const params = [organizationId];
  let appScope = "";
  if (scopeLocationId) {
    params.push(scopeLocationId);
    appScope = ` AND a."locationId"=$${params.length}`;
  }
  const appRows = await prismaClient.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "applications",
            COUNT(DISTINCT a."candidateId")::int AS "candidates",
            COUNT(*) FILTER (WHERE a."stage"='APPLIED')::int AS "applied",
            COUNT(*) FILTER (WHERE a."stage"='SCREENING')::int AS "screening",
            COUNT(*) FILTER (WHERE a."stage"='SHORTLISTED')::int AS "shortlisted",
            COUNT(*) FILTER (WHERE a."stage"='INTERVIEW')::int AS "interview",
            COUNT(*) FILTER (WHERE a."stage"='OFFER')::int AS "offer",
            COUNT(*) FILTER (WHERE a."stage"='HIRED')::int AS "hired",
            COUNT(*) FILTER (WHERE a."stage"='REJECTED')::int AS "rejected",
            COUNT(*) FILTER (WHERE a."stage"='WITHDRAWN')::int AS "withdrawn",
            COUNT(*) FILTER (WHERE a."stage"='TALENT_POOL')::int AS "talentPool"
       FROM "recruitment_applications" a
      WHERE a."organizationId"=$1${appScope}`,
    ...params
  );
  const interviewRows = await prismaClient.$queryRawUnsafe(
    `SELECT COUNT(*) FILTER (WHERE i."status"='SCHEDULED')::int AS "scheduledInterviews",
            COUNT(*) FILTER (WHERE i."status"='COMPLETED')::int AS "completedInterviews"
       FROM "recruitment_interviews" i
      WHERE i."organizationId"=$1${scopeLocationId ? ' AND i."locationId"=$2' : ""}`,
    ...params
  );
  const offerRows = await prismaClient.$queryRawUnsafe(
    `SELECT COUNT(*) FILTER (WHERE o."status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','ISSUED'))::int AS "activeOffers",
            COUNT(*) FILTER (WHERE o."status"='ACCEPTED')::int AS "acceptedOffers"
       FROM "recruitment_offers" o
      WHERE o."organizationId"=$1${scopeLocationId ? ' AND o."locationId"=$2' : ""}`,
    ...params
  );
  const values = { ...(appRows[0] || {}), ...(interviewRows[0] || {}), ...(offerRows[0] || {}) };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value || 0)]));
}

module.exports = {
  ACTIVE_STAGES,
  listCandidates,
  listPublishedVacancies,
  listApplications,
  getApplication,
  createCandidateApplication,
  updateCandidate,
  transitionApplication,
  listStageHistory,
  listInterviews,
  createInterview,
  completeInterview,
  cancelInterview,
  listOffers,
  createOffer,
  transitionOffer,
  listTalentPool,
  setTalentPoolStatus,
  getTalentSummary,
  talentError,
};
