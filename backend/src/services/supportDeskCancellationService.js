const { getTicket, getMessages } = require("./supportDeskService");

const CANCELLABLE_UNATTENDED_STATUSES = new Set(["NEW", "TRIAGED"]);

function normalize(value) {
  return String(value || "").trim();
}

function cancellationError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function getCancellationEligibility(prisma, {
  organizationId,
  ticketNumber,
  requesterUserId,
}) {
  const ticket = await getTicket(prisma, { organizationId, ticketNumber });
  if (!ticket || ticket.requesterUserId !== requesterUserId) {
    throw cancellationError("SUPPORT_TICKET_NOT_FOUND", "Support request not found.", 404);
  }

  if (!CANCELLABLE_UNATTENDED_STATUSES.has(ticket.status)) {
    return {
      allowed: false,
      reason: "SUPPORT_REQUEST_ALREADY_ATTENDED",
      message: "This support request has already been attended to and can no longer be cancelled by the requester.",
      ticket,
    };
  }

  const [ticketEvents, messages] = await Promise.all([
    prisma.organizationAudit.findMany({
      where: {
        organizationId,
        entityType: "SupportTicket",
        entityId: ticketNumber,
      },
      orderBy: { createdAt: "asc" },
    }),
    getMessages(prisma, { organizationId, ticketNumber }),
  ]);

  const handledBySupport = ticketEvents.slice(1).some((event) =>
    event.actorUserId && event.actorUserId !== requesterUserId
  );
  const supportResponded = messages.some((message) => message.direction === "OUTBOUND");
  const operationallyTakenUp = Boolean(
    ticket.assignedEngineer ||
    ticket.githubIssueNumber ||
    ticket.githubIssueUrl ||
    ticket.engineeringEscalatedAt ||
    ticket.engineeringEscalationPending
  );

  if (handledBySupport || supportResponded || operationallyTakenUp) {
    return {
      allowed: false,
      reason: "SUPPORT_REQUEST_ALREADY_ATTENDED",
      message: "This support request has already been taken up by Support and can no longer be cancelled by the requester.",
      ticket,
    };
  }

  return { allowed: true, reason: null, message: null, ticket };
}

async function cancelRequesterTicket(prisma, {
  organizationId,
  ticketNumber,
  requesterUserId,
  actorUserId,
  reason,
}) {
  const cancellationReason = normalize(reason);
  if (!cancellationReason) {
    throw cancellationError(
      "SUPPORT_CANCELLATION_REASON_REQUIRED",
      "Enter a reason for cancelling the support request.",
      400
    );
  }

  const eligibility = await getCancellationEligibility(prisma, {
    organizationId,
    ticketNumber,
    requesterUserId,
  });
  if (!eligibility.allowed) {
    throw cancellationError(eligibility.reason, eligibility.message, 409);
  }

  const now = new Date().toISOString();
  const patch = {
    status: "CANCELLED",
    cancelledAt: now,
    cancelledByUserId: requesterUserId,
    cancellationReason,
    closedAt: now,
  };

  await prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || requesterUserId,
      entityType: "SupportTicket",
      entityId: ticketNumber,
      action: "SUPPORT_TICKET_CANCELLED_BY_REQUESTER",
      previousValue: eligibility.ticket,
      newValue: patch,
      reason: cancellationReason,
    },
  });

  await prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || requesterUserId,
      entityType: "SupportMessage",
      entityId: ticketNumber,
      action: "SUPPORT_MESSAGE_RECORDED",
      newValue: {
        direction: "INBOUND",
        channel: "CHRIS_CLIENT_PORTAL",
        sender: "Requester",
        body: `Support request cancelled by requester. Reason: ${cancellationReason}`,
        sourceMessageId: null,
        visibility: "CLIENT",
      },
      reason: "Requester cancellation record",
    },
  });

  return {
    ticket: { ...eligibility.ticket, ...patch },
    cancellation: {
      cancelledAt: now,
      cancelledByUserId: requesterUserId,
      reason: cancellationReason,
    },
  };
}

module.exports = {
  CANCELLABLE_UNATTENDED_STATUSES,
  getCancellationEligibility,
  cancelRequesterTicket,
};