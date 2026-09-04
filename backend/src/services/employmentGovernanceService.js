const crypto = require("crypto");

const CONTRACT_STATES = [
  "APPLICANT",
  "SELECTED",
  "OFFER_APPROVED",
  "OFFER_ISSUED",
  "OFFER_ACCEPTED",
  "PRE_EMPLOYMENT_CONDITIONS_PENDING",
  "CONDITIONS_SATISFIED",
  "APPOINTED",
  "COMMENCEMENT_PENDING",
  "ACTIVE",
  "OFFER_DECLINED",
  "OFFER_EXPIRED",
  "OFFER_WITHDRAWN",
  "APPOINTMENT_CANCELLED",
];

const CONTRACT_TRANSITIONS = {
  APPLICANT: ["SELECTED"],
  SELECTED: ["OFFER_APPROVED", "OFFER_WITHDRAWN"],
  OFFER_APPROVED: ["OFFER_ISSUED", "OFFER_WITHDRAWN"],
  OFFER_ISSUED: ["OFFER_ACCEPTED", "OFFER_DECLINED", "OFFER_EXPIRED", "OFFER_WITHDRAWN"],
  OFFER_ACCEPTED: ["PRE_EMPLOYMENT_CONDITIONS_PENDING", "CONDITIONS_SATISFIED", "APPOINTED"],
  PRE_EMPLOYMENT_CONDITIONS_PENDING: ["CONDITIONS_SATISFIED", "OFFER_WITHDRAWN"],
  CONDITIONS_SATISFIED: ["APPOINTED", "OFFER_WITHDRAWN"],
  APPOINTED: ["COMMENCEMENT_PENDING", "APPOINTMENT_CANCELLED"],
  COMMENCEMENT_PENDING: ["ACTIVE", "APPOINTMENT_CANCELLED"],
  ACTIVE: [],
  OFFER_DECLINED: [],
  OFFER_EXPIRED: [],
  OFFER_WITHDRAWN: [],
  APPOINTMENT_CANCELLED: [],
};

const VERIFICATION_STATUSES = [
  "VERIFIED",
  "UNVERIFIED",
  "VERIFICATION_PENDING",
  "SERVICE_UNAVAILABLE",
  "MISMATCH",
  "MANUAL_REVIEW",
];

const DISCIPLINARY_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "AWAITING_EMPLOYEE_RESPONSE",
  "HEARING",
  "FINDINGS_PENDING",
  "DECISION_PENDING",
  "CLOSED",
];

function requiredString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeOptional(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function parseDate(value, label = "Date") {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} is invalid.`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function hashJson(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}

function maskIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

async function resolveEmployee(prisma, organizationId, employeeNumber) {
  if (!employeeNumber) return null;
  return prisma.employee.findFirst({
    where: {
      organizationId,
      employeeNumber: String(employeeNumber).trim(),
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      status: true,
    },
  });
}

async function createContractLifecycle(prisma, input) {
  const {
    organizationId,
    actorUserId,
    employeeNumber,
    firstName,
    lastName,
    email,
    initialState = "APPLICANT",
    authority,
    reason,
  } = input;

  if (!CONTRACT_STATES.includes(initialState)) {
    const error = new Error("Invalid employment contract lifecycle state.");
    error.statusCode = 400;
    throw error;
  }

  const employee = await resolveEmployee(prisma, organizationId, employeeNumber);
  const lifecycle = await prisma.$transaction(async (tx) => {
    const referenceCode = `ECL-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const record = await tx.employmentContractLifecycle.create({
      data: {
        organizationId,
        employeeId: employee?.id || null,
        referenceCode,
        firstName: requiredString(firstName || employee?.firstName, "First name"),
        lastName: requiredString(lastName || employee?.lastName, "Last name"),
        email: normalizeOptional(email || employee?.email),
        currentState: initialState,
        createdByUserId: actorUserId || null,
      },
    });

    await tx.employmentContractTransition.create({
      data: {
        organizationId,
        lifecycleId: record.id,
        fromState: null,
        toState: initialState,
        effectiveDate: new Date(),
        actorUserId: actorUserId || null,
        authority: normalizeOptional(authority) || "Lifecycle record created",
        reason: normalizeOptional(reason),
      },
    });
    return record;
  });

  return lifecycle;
}

async function transitionContractLifecycle(prisma, input) {
  const {
    organizationId,
    lifecycleId,
    actorUserId,
    toState,
    effectiveDate,
    authority,
    reason,
    documentReference,
    employeeNumber,
    metadata,
  } = input;

  if (!CONTRACT_STATES.includes(toState)) {
    const error = new Error("Invalid target employment state.");
    error.statusCode = 400;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.employmentContractLifecycle.findFirst({
      where: { id: lifecycleId, organizationId },
    });
    if (!record) {
      const error = new Error("Employment lifecycle record not found.");
      error.statusCode = 404;
      throw error;
    }

    const allowed = CONTRACT_TRANSITIONS[record.currentState] || [];
    if (!allowed.includes(toState)) {
      const error = new Error(
        `Transition from ${record.currentState} to ${toState} is not permitted.`
      );
      error.statusCode = 409;
      throw error;
    }

    let employeeId = record.employeeId;
    if (employeeNumber) {
      const employee = await resolveEmployee(tx, organizationId, employeeNumber);
      if (!employee) {
        const error = new Error("Linked employee number was not found.");
        error.statusCode = 404;
        throw error;
      }
      employeeId = employee.id;
    }

    if (toState === "ACTIVE" && !employeeId) {
      const error = new Error(
        "Link the lifecycle to an authoritative employee record before activating employment."
      );
      error.statusCode = 409;
      throw error;
    }

    const transition = await tx.employmentContractTransition.create({
      data: {
        organizationId,
        lifecycleId,
        fromState: record.currentState,
        toState,
        effectiveDate: parseDate(effectiveDate, "Effective date"),
        actorUserId: actorUserId || null,
        authority: requiredString(authority, "Authority"),
        reason: normalizeOptional(reason),
        documentReference: normalizeOptional(documentReference),
        metadata: metadata || undefined,
      },
    });

    const updated = await tx.employmentContractLifecycle.update({
      where: { id: record.id },
      data: {
        currentState: toState,
        employeeId,
        effectiveEmploymentDate:
          toState === "ACTIVE"
            ? parseDate(effectiveDate, "Effective employment date")
            : record.effectiveEmploymentDate,
      },
    });

    return { lifecycle: updated, transition };
  });
}

async function addContractDocument(prisma, input) {
  const lifecycle = await prisma.employmentContractLifecycle.findFirst({
    where: { id: input.lifecycleId, organizationId: input.organizationId },
  });
  if (!lifecycle) {
    const error = new Error("Employment lifecycle record not found.");
    error.statusCode = 404;
    throw error;
  }

  const document = await prisma.employmentContractDocument.create({
    data: {
      organizationId: input.organizationId,
      lifecycleId: input.lifecycleId,
      documentType: requiredString(input.documentType, "Document type"),
      documentReference: requiredString(input.documentReference, "Document reference"),
      templateName: normalizeOptional(input.templateName),
      templateVersion: normalizeOptional(input.templateVersion),
      contentHash: normalizeOptional(input.contentHash),
      createdByUserId: input.actorUserId || null,
    },
  });

  await prisma.employmentContractDocumentEvent.create({
    data: {
      organizationId: input.organizationId,
      documentId: document.id,
      eventType: "GENERATED",
      eventAt: new Date(),
      actorUserId: input.actorUserId || null,
      authority: normalizeOptional(input.authority),
      notes: normalizeOptional(input.notes),
    },
  });

  return document;
}

async function addContractDocumentEvent(prisma, input) {
  const document = await prisma.employmentContractDocument.findFirst({
    where: { id: input.documentId, organizationId: input.organizationId },
  });
  if (!document) {
    const error = new Error("Employment document not found.");
    error.statusCode = 404;
    throw error;
  }

  return prisma.employmentContractDocumentEvent.create({
    data: {
      organizationId: input.organizationId,
      documentId: input.documentId,
      eventType: requiredString(input.eventType, "Document event"),
      eventAt: parseDate(input.eventAt, "Event date"),
      actorUserId: input.actorUserId || null,
      authority: normalizeOptional(input.authority),
      notes: normalizeOptional(input.notes),
    },
  });
}

async function createDisciplinaryCase(prisma, input) {
  const employee = await resolveEmployee(prisma, input.organizationId, input.employeeNumber);
  if (!employee) {
    const error = new Error("Employee number was not found.");
    error.statusCode = 404;
    throw error;
  }

  const caseNumber = `ER-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

  return prisma.disciplinaryCase.create({
    data: {
      organizationId: input.organizationId,
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      caseNumber,
      incidentSummary: requiredString(input.incidentSummary, "Incident summary"),
      allegation: requiredString(input.allegation, "Allegation"),
      policyReference: normalizeOptional(input.policyReference),
      policyVersion: normalizeOptional(input.policyVersion),
      status: "OPEN",
      openedAt: parseDate(input.openedAt, "Opened date"),
      createdByUserId: input.actorUserId || null,
    },
  });
}

async function appendDisciplinaryEvidence(prisma, input) {
  return prisma.$transaction(async (tx) => {
    const disciplinaryCase = await tx.disciplinaryCase.findFirst({
      where: { id: input.caseId, organizationId: input.organizationId },
    });
    if (!disciplinaryCase) {
      const error = new Error("Disciplinary case not found.");
      error.statusCode = 404;
      throw error;
    }

    const logicalEvidenceKey =
      normalizeOptional(input.logicalEvidenceKey) || crypto.randomUUID();
    const latest = await tx.disciplinaryEvidenceVersion.findFirst({
      where: {
        organizationId: input.organizationId,
        disciplinaryCaseId: input.caseId,
        logicalEvidenceKey,
      },
      orderBy: { versionNumber: "desc" },
    });
    const versionNumber = (latest?.versionNumber || 0) + 1;
    const content = input.content || null;

    return tx.disciplinaryEvidenceVersion.create({
      data: {
        organizationId: input.organizationId,
        disciplinaryCaseId: input.caseId,
        logicalEvidenceKey,
        category: requiredString(input.category, "Evidence category"),
        versionNumber,
        title: requiredString(input.title, "Evidence title"),
        content: content || undefined,
        documentReference: normalizeOptional(input.documentReference),
        contentHash:
          normalizeOptional(input.contentHash) ||
          hashJson({ content, documentReference: input.documentReference || null }),
        finalizedAt: input.finalized ? new Date() : null,
        createdByUserId: input.actorUserId || null,
      },
    });
  });
}

async function addDisciplinaryProcessEvent(prisma, input) {
  const disciplinaryCase = await prisma.disciplinaryCase.findFirst({
    where: { id: input.caseId, organizationId: input.organizationId },
  });
  if (!disciplinaryCase) {
    const error = new Error("Disciplinary case not found.");
    error.statusCode = 404;
    throw error;
  }
  return prisma.disciplinaryProcessEvent.create({
    data: {
      organizationId: input.organizationId,
      disciplinaryCaseId: input.caseId,
      eventType: requiredString(input.eventType, "Process event"),
      occurredAt: parseDate(input.occurredAt, "Event date"),
      participant: normalizeOptional(input.participant),
      actorUserId: input.actorUserId || null,
      notes: normalizeOptional(input.notes),
      metadata: input.metadata || undefined,
    },
  });
}

async function addExternalProceeding(prisma, input) {
  const disciplinaryCase = await prisma.disciplinaryCase.findFirst({
    where: { id: input.caseId, organizationId: input.organizationId },
  });
  if (!disciplinaryCase) {
    const error = new Error("Disciplinary case not found.");
    error.statusCode = 404;
    throw error;
  }

  // Deliberately no disciplinary-case status mutation here. External outcomes
  // such as ACQUITTED are linked evidence, not automatic HR clearance.
  return prisma.disciplinaryExternalProceeding.create({
    data: {
      organizationId: input.organizationId,
      disciplinaryCaseId: input.caseId,
      proceedingType: requiredString(input.proceedingType, "Proceeding type"),
      authority: requiredString(input.authority, "Authority"),
      referenceNumber: normalizeOptional(input.referenceNumber),
      status: requiredString(input.status || "OPEN", "Proceeding status"),
      outcome: normalizeOptional(input.outcome),
      openedAt: input.openedAt ? parseDate(input.openedAt, "Opened date") : null,
      closedAt: input.closedAt ? parseDate(input.closedAt, "Closed date") : null,
      notes: normalizeOptional(input.notes),
    },
  });
}

async function updateDisciplinaryCase(prisma, input) {
  const existing = await prisma.disciplinaryCase.findFirst({
    where: { id: input.caseId, organizationId: input.organizationId },
  });
  if (!existing) {
    const error = new Error("Disciplinary case not found.");
    error.statusCode = 404;
    throw error;
  }
  if (input.status && !DISCIPLINARY_STATUSES.includes(input.status)) {
    const error = new Error("Invalid disciplinary case status.");
    error.statusCode = 400;
    throw error;
  }
  return prisma.disciplinaryCase.update({
    where: { id: existing.id },
    data: {
      status: input.status || existing.status,
      outcome: input.outcome === undefined ? existing.outcome : normalizeOptional(input.outcome),
      decidedAt:
        input.status === "CLOSED" && !existing.decidedAt
          ? new Date()
          : existing.decidedAt,
    },
  });
}

async function buildEmploymentDecisionEvidencePack(prisma, organizationId, caseId) {
  const disciplinaryCase = await prisma.disciplinaryCase.findFirst({
    where: { id: caseId, organizationId },
  });
  if (!disciplinaryCase) {
    const error = new Error("Disciplinary case not found.");
    error.statusCode = 404;
    throw error;
  }

  const [events, evidence, externalProceedings] = await Promise.all([
    prisma.disciplinaryProcessEvent.findMany({
      where: { organizationId, disciplinaryCaseId: caseId },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.disciplinaryEvidenceVersion.findMany({
      where: { organizationId, disciplinaryCaseId: caseId },
      orderBy: [
        { logicalEvidenceKey: "asc" },
        { versionNumber: "asc" },
      ],
    }),
    prisma.disciplinaryExternalProceeding.findMany({
      where: { organizationId, disciplinaryCaseId: caseId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    case: disciplinaryCase,
    policy: {
      reference: disciplinaryCase.policyReference,
      version: disciplinaryCase.policyVersion,
    },
    processEvents: events,
    evidenceVersions: evidence,
    externalProceedings,
    controlStatement:
      "External criminal, civil or regulatory outcomes are linked but do not automatically determine the internal employment decision.",
  };
}

async function recordVerification(prisma, input) {
  if (!VERIFICATION_STATUSES.includes(input.status)) {
    const error = new Error("Invalid verification status.");
    error.statusCode = 400;
    throw error;
  }
  const employee = await resolveEmployee(prisma, input.organizationId, input.employeeNumber);
  return prisma.externalVerificationRecord.create({
    data: {
      organizationId: input.organizationId,
      employeeId: employee?.id || null,
      subjectReference:
        normalizeOptional(input.subjectReference) || employee?.employeeNumber || null,
      identifierType: requiredString(input.identifierType, "Identifier type"),
      maskedIdentifier: maskIdentifier(input.identifierValue || input.maskedIdentifier),
      provider: requiredString(input.provider, "Verification provider"),
      status: input.status,
      attemptedAt: parseDate(input.attemptedAt, "Attempt date"),
      verifiedAt: input.status === "VERIFIED" ? parseDate(input.verifiedAt, "Verified date") : null,
      nextRetryAt: input.nextRetryAt ? parseDate(input.nextRetryAt, "Next retry date") : null,
      errorCode: normalizeOptional(input.errorCode),
      errorMessage: normalizeOptional(input.errorMessage),
      responseMetadata: input.responseMetadata || undefined,
      createdByUserId: input.actorUserId || null,
    },
  });
}

module.exports = {
  CONTRACT_STATES,
  CONTRACT_TRANSITIONS,
  VERIFICATION_STATUSES,
  DISCIPLINARY_STATUSES,
  createContractLifecycle,
  transitionContractLifecycle,
  addContractDocument,
  addContractDocumentEvent,
  createDisciplinaryCase,
  appendDisciplinaryEvidence,
  addDisciplinaryProcessEvent,
  addExternalProceeding,
  updateDisciplinaryCase,
  buildEmploymentDecisionEvidencePack,
  recordVerification,
};
