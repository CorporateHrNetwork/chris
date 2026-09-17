const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cancelRequesterTicket,
  getCancellationEligibility,
} = require("../src/services/supportDeskCancellationService");

function fakePrisma(seedEvents) {
  const events = seedEvents.map((event, index) => ({
    id: event.id || `event-${index + 1}`,
    createdAt: event.createdAt || new Date(Date.UTC(2026, 8, 15, 10, index, 0)),
    ...event,
  }));

  return {
    events,
    organizationAudit: {
      async findMany({ where, orderBy }) {
        const rows = events.filter((event) =>
          (!where.organizationId || event.organizationId === where.organizationId) &&
          (!where.entityType || event.entityType === where.entityType) &&
          (!where.entityId || event.entityId === where.entityId)
        );
        if (orderBy?.createdAt === "asc") return [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return rows;
      },
      async create({ data }) {
        const row = {
          id: `event-${events.length + 1}`,
          createdAt: new Date(Date.UTC(2026, 8, 15, 11, events.length, 0)),
          ...data,
        };
        events.push(row);
        return row;
      },
    },
  };
}

function createdTicket({ status = "NEW", requesterUserId = "user-1", extra = {} } = {}) {
  return {
    organizationId: "org-1",
    entityType: "SupportTicket",
    entityId: "CHR-SD-ZLL-20260915-ABC123",
    actorUserId: requesterUserId,
    action: "SUPPORT_TICKET_CREATED",
    newValue: {
      ticketNumber: "CHR-SD-ZLL-20260915-ABC123",
      organizationId: "org-1",
      requesterUserId,
      status,
      subject: "Payroll query",
      ...extra,
    },
  };
}

function inboundRequesterMessage() {
  return {
    organizationId: "org-1",
    entityType: "SupportMessage",
    entityId: "CHR-SD-ZLL-20260915-ABC123",
    actorUserId: "user-1",
    action: "SUPPORT_MESSAGE_RECORDED",
    newValue: {
      direction: "INBOUND",
      channel: "CHRIS_CLIENT_PORTAL",
      sender: "user@example.com",
      body: "Please assist.",
      visibility: "CLIENT",
    },
  };
}

test("requester may cancel an unattended auto-triaged request and cancellation is audited", async () => {
  const prisma = fakePrisma([
    createdTicket({ status: "TRIAGED" }),
    inboundRequesterMessage(),
  ]);

  const result = await cancelRequesterTicket(prisma, {
    organizationId: "org-1",
    ticketNumber: "CHR-SD-ZLL-20260915-ABC123",
    requesterUserId: "user-1",
    actorUserId: "user-1",
    reason: "Issue resolved locally before Support attended.",
  });

  assert.equal(result.ticket.status, "CANCELLED");
  assert.equal(result.ticket.cancellationReason, "Issue resolved locally before Support attended.");
  assert.ok(result.ticket.cancelledAt);
  assert.equal(
    prisma.events.some((event) => event.action === "SUPPORT_TICKET_CANCELLED_BY_REQUESTER"),
    true
  );
});

test("requester cannot cancel a request after Support status has progressed", async () => {
  const prisma = fakePrisma([createdTicket({ status: "ASSIGNED" })]);

  const eligibility = await getCancellationEligibility(prisma, {
    organizationId: "org-1",
    ticketNumber: "CHR-SD-ZLL-20260915-ABC123",
    requesterUserId: "user-1",
  });

  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.reason, "SUPPORT_REQUEST_ALREADY_ATTENDED");
});

test("requester cannot cancel a TRIAGED request after Support has replied", async () => {
  const prisma = fakePrisma([
    createdTicket({ status: "TRIAGED" }),
    inboundRequesterMessage(),
    {
      organizationId: "org-1",
      entityType: "SupportMessage",
      entityId: "CHR-SD-ZLL-20260915-ABC123",
      actorUserId: "support-user",
      action: "SUPPORT_MESSAGE_RECORDED",
      newValue: {
        direction: "OUTBOUND",
        channel: "CHRIS_INTERNAL",
        sender: "CHRiS Support Desk",
        body: "We are reviewing this case.",
        visibility: "CLIENT",
      },
    },
  ]);

  await assert.rejects(
    cancelRequesterTicket(prisma, {
      organizationId: "org-1",
      ticketNumber: "CHR-SD-ZLL-20260915-ABC123",
      requesterUserId: "user-1",
      actorUserId: "user-1",
      reason: "Cancel please",
    }),
    (error) => error.code === "SUPPORT_REQUEST_ALREADY_ATTENDED"
  );
});