const {
  DISCIPLINARY_STATUSES,
} = require("./employmentGovernanceService");

const DISCIPLINARY_TRANSITIONS = {
  OPEN: ["INVESTIGATING"],
  INVESTIGATING: ["AWAITING_EMPLOYEE_RESPONSE"],
  AWAITING_EMPLOYEE_RESPONSE: ["HEARING"],
  HEARING: ["FINDINGS_PENDING"],
  FINDINGS_PENDING: ["DECISION_PENDING"],
  DECISION_PENDING: ["CLOSED"],
  CLOSED: [],
};

function normalizedOptional(value) {
  const text = String(value || "").trim();
  return text || null;
}

function governanceError(message, statusCode = 400, code = "DISCIPLINARY_GOVERNANCE_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function transitionDisciplinaryCase(prisma, input) {
  const organizationId = input.organizationId;
  const caseId = input.caseId;
  const toStatus = String(input.status || "").trim();

  if (!DISCIPLINARY_STATUSES.includes(toStatus)) {
    throw governanceError(
      "Invalid disciplinary case status.",
      400,
      "INVALID_DISCIPLINARY_STATUS"
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.disciplinaryCase.findFirst({
      where: {
        id: caseId,
        organizationId,
      },
    });

    if (!existing) {
      throw governanceError(
        "Disciplinary case not found.",
        404,
        "DISCIPLINARY_CASE_NOT_FOUND"
      );
    }

    if (existing.status === toStatus) {
      throw governanceError(
        `Disciplinary case is already ${toStatus}.`,
        409,
        "DISCIPLINARY_STATUS_UNCHANGED"
      );
    }

    const allowed = DISCIPLINARY_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(toStatus)) {
      throw governanceError(
        `Transition from ${existing.status} to ${toStatus} is not permitted. Complete the intervening disciplinary process stages first.`,
        409,
        "DISCIPLINARY_TRANSITION_NOT_PERMITTED"
      );
    }

    const outcome =
      input.outcome === undefined
        ? existing.outcome
        : normalizedOptional(input.outcome);

    if (toStatus === "CLOSED" && !outcome) {
      throw governanceError(
        "A decision outcome is required before closing a disciplinary case.",
        409,
        "DISCIPLINARY_OUTCOME_REQUIRED"
      );
    }

    const updated = await tx.disciplinaryCase.update({
      where: { id: existing.id },
      data: {
        status: toStatus,
        outcome,
        decidedAt:
          toStatus === "CLOSED"
            ? existing.decidedAt || new Date()
            : existing.decidedAt,
      },
    });

    await tx.disciplinaryProcessEvent.create({
      data: {
        organizationId,
        disciplinaryCaseId: existing.id,
        eventType: "CASE_STATUS_CHANGED",
        occurredAt: new Date(),
        actorUserId: input.actorUserId || null,
        notes: normalizedOptional(input.reason),
        metadata: {
          fromStatus: existing.status,
          toStatus,
          outcome,
        },
      },
    });

    return updated;
  });
}

module.exports = {
  DISCIPLINARY_TRANSITIONS,
  transitionDisciplinaryCase,
};
