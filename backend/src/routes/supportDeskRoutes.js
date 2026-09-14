const crypto = require("crypto");
const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  createTicket,
  listAllTickets,
  listRequesterTickets,
  getTicket,
  getMessages,
  addMessage,
  updateTicket,
  escalateToEngineering,
  sendWhatsAppText,
} = require("../services/supportDeskService");

const router = express.Router();
const OPEN_STATUSES = new Set([
  "NEW", "TRIAGED", "AWAITING_CLIENT", "ASSIGNED", "IN_PROGRESS", "FIX_READY",
  "DEPLOYED", "CLIENT_VALIDATION", "ESCALATED", "BLOCKED", "REOPENED",
]);

function verifyWhatsAppSignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = String(req.get("x-hub-signature-256") || "");
  if (!signature.startsWith("sha256=")) return false;
  const raw = req.rawBody;
  if (!raw) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractWhatsAppMessage(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const contact = value?.contacts?.[0];
  if (!message) return null;
  const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || "";
  return {
    sourceMessageId: message.id,
    from: message.from,
    contactName: contact?.profile?.name || null,
    type: message.type,
    text,
  };
}

function supportSummary(tickets) {
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => OPEN_STATUSES.has(ticket.status)).length,
    p1: tickets.filter((ticket) => ticket.severity === "P1_CRITICAL" && OPEN_STATUSES.has(ticket.status)).length,
    p2: tickets.filter((ticket) => ticket.severity === "P2_HIGH" && OPEN_STATUSES.has(ticket.status)).length,
    awaitingClient: tickets.filter((ticket) => ticket.status === "AWAITING_CLIENT" || ticket.status === "CLIENT_VALIDATION").length,
    engineering: tickets.filter((ticket) => ["ESCALATED", "IN_PROGRESS", "FIX_READY"].includes(ticket.status)).length,
    resolved: tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED").length,
    clients: new Set(tickets.map((ticket) => ticket.organizationId)).size,
  };
}

async function requireRequesterTicket(req, res, next) {
  try {
    const ticket = await getTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
    });
    if (!ticket || ticket.requesterUserId !== req.auth.userId) {
      return res.status(404).json({ status: "error", message: "Support request not found." });
    }
    req.supportTicket = ticket;
    return next();
  } catch (error) {
    return next(error);
  }
}

function internalOrganizationId(req) {
  return String(req.body?.organizationId || req.query?.organizationId || "").trim();
}

/* Official WhatsApp Business Platform webhook. */
router.get("/whatsapp/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (verifyToken && mode === "subscribe" && token === verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post("/whatsapp/webhook", async (req, res) => {
  try {
    if (!verifyWhatsAppSignature(req)) return res.sendStatus(401);
    const inbound = extractWhatsAppMessage(req.body);
    if (!inbound || !inbound.text) return res.sendStatus(200);

    const slug = process.env.SUPPORT_PILOT_ORGANIZATION_SLUG || "zermatt-liquor-limited";
    const organization = await prisma.organization.findFirst({ where: { slug, status: "ACTIVE" } });
    if (!organization) {
      console.error("CHRiS Support Desk WhatsApp organization not found:", slug);
      return res.sendStatus(200);
    }

    const result = await createTicket(prisma, {
      organization,
      organizationId: organization.id,
      channel: "WHATSAPP",
      contactName: inbound.contactName,
      contactPhone: inbound.from,
      description: inbound.text,
      sourceMessageId: inbound.sourceMessageId,
    });

    sendWhatsAppText({ to: inbound.from, body: `${result.clientResponse}\n\nCase: ${result.ticket.ticketNumber}` })
      .catch((error) => console.error("CHRiS Support Desk WhatsApp reply error:", error));

    return res.sendStatus(200);
  } catch (error) {
    console.error("CHRiS Support Desk WhatsApp webhook error:", error);
    return res.sendStatus(200);
  }
});

/* ========================================================================
   CLIENT TENANT SUPPORT AREA — every authenticated user can raise and view
   only support requests created by their own CHRiS user account.
   ======================================================================== */
router.get("/client/summary", requireAuth, async (req, res) => {
  try {
    const tickets = await listRequesterTickets(prisma, {
      organizationId: req.auth.organizationId,
      requesterUserId: req.auth.userId,
      limit: 500,
    });
    return res.json({ status: "success", data: supportSummary(tickets) });
  } catch (error) {
    console.error("Client support summary error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load your support summary." });
  }
});

router.get("/client/tickets", requireAuth, async (req, res) => {
  try {
    const tickets = await listRequesterTickets(prisma, {
      organizationId: req.auth.organizationId,
      requesterUserId: req.auth.userId,
      limit: req.query.limit,
    });
    return res.json({ status: "success", results: tickets.length, data: tickets });
  } catch (error) {
    console.error("Client support ticket list error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load your support requests." });
  }
});

router.post("/client/tickets", requireAuth, async (req, res) => {
  try {
    const result = await createTicket(prisma, {
      ...req.body,
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      requesterUserId: req.auth.userId,
      contactEmail: req.auth.email,
      contactName: req.body?.contactName || req.auth.email,
      channel: "CHRIS_CLIENT_PORTAL",
    });
    return res.status(201).json({ status: "success", data: result });
  } catch (error) {
    console.error("Client support request create error:", error);
    return res.status(400).json({ status: "error", message: "Unable to create your support request.", code: error.message });
  }
});

router.get("/client/tickets/:ticketNumber", requireAuth, requireRequesterTicket, async (req, res) => {
  const messages = await getMessages(prisma, {
    organizationId: req.auth.organizationId,
    ticketNumber: req.params.ticketNumber,
    clientVisibleOnly: true,
  });
  return res.json({ status: "success", data: { ticket: req.supportTicket, messages } });
});

router.post("/client/tickets/:ticketNumber/messages", requireAuth, requireRequesterTicket, async (req, res) => {
  try {
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ status: "error", message: "Message is required." });
    await addMessage(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      direction: "INBOUND",
      channel: "CHRIS_CLIENT_PORTAL",
      sender: req.auth.email,
      body,
      visibility: "CLIENT",
    });
    return res.status(201).json({ status: "success" });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to add your message." });
  }
});

router.post("/client/tickets/:ticketNumber/validate", requireAuth, requireRequesterTicket, async (req, res) => {
  try {
    if (req.supportTicket.status !== "CLIENT_VALIDATION") {
      return res.status(409).json({ status: "error", message: "This case is not awaiting client validation." });
    }
    const result = await updateTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      patch: { status: "CLIENT_VALIDATION" },
      reason: "Client confirmed resolution",
      clientValidated: true,
    });
    return res.json({ status: "success", data: result });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to validate this support request." });
  }
});

router.post("/client/tickets/:ticketNumber/reopen", requireAuth, requireRequesterTicket, async (req, res) => {
  try {
    if (!["RESOLVED", "CLOSED"].includes(req.supportTicket.status)) {
      return res.status(409).json({ status: "error", message: "Only resolved or closed cases can be reopened." });
    }
    const result = await updateTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      patch: { status: "REOPENED" },
      reason: String(req.body?.reason || "Client reopened the case").trim(),
    });
    return res.json({ status: "success", data: result });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to reopen this support request." });
  }
});

/* ========================================================================
   INTERNAL CORPORATE RESOURCES NETWORK SUPPORT OPERATIONS.
   These permissions are platform-only and must never be assignable through
   tenant role administration.
   ======================================================================== */
router.get("/internal/access", requireAuth, requirePermission("support.internal.view"), (req, res) => {
  return res.json({
    status: "success",
    data: {
      canView: true,
      canManage: req.auth.permissions.includes("support.internal.manage"),
      canEscalate: req.auth.permissions.includes("support.engineering.escalate"),
    },
  });
});

router.get("/internal/summary", requireAuth, requirePermission("support.internal.view"), async (req, res) => {
  try {
    const tickets = await listAllTickets(prisma, {
      limit: 5000,
      organizationId: req.query.organizationId || undefined,
    });
    return res.json({ status: "success", data: supportSummary(tickets) });
  } catch (error) {
    console.error("Internal Support Desk summary error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load Support Desk summary." });
  }
});

router.get("/internal/tickets", requireAuth, requirePermission("support.internal.view"), async (req, res) => {
  try {
    const tickets = await listAllTickets(prisma, {
      limit: req.query.limit,
      organizationId: req.query.organizationId || undefined,
    });
    return res.json({ status: "success", results: tickets.length, data: tickets });
  } catch (error) {
    console.error("Internal Support Desk ticket list error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load Support Desk tickets." });
  }
});

router.post("/internal/tickets", requireAuth, requirePermission("support.internal.manage"), async (req, res) => {
  try {
    const organizationId = internalOrganizationId(req);
    if (!organizationId) return res.status(400).json({ status: "error", message: "Client organization is required." });
    const result = await createTicket(prisma, {
      ...req.body,
      organizationId,
      actorUserId: req.auth.userId,
      channel: req.body?.channel || "CHRIS_INTERNAL",
    });
    return res.status(201).json({ status: "success", data: result });
  } catch (error) {
    console.error("Internal Support Desk create ticket error:", error);
    return res.status(400).json({ status: "error", message: "Unable to create Support Desk ticket.", code: error.message });
  }
});

router.get("/internal/tickets/:ticketNumber", requireAuth, requirePermission("support.internal.view"), async (req, res) => {
  const organizationId = internalOrganizationId(req);
  if (!organizationId) return res.status(400).json({ status: "error", message: "Client organization is required." });
  const ticket = await getTicket(prisma, { organizationId, ticketNumber: req.params.ticketNumber });
  if (!ticket) return res.status(404).json({ status: "error", message: "Support ticket not found." });
  const messages = await getMessages(prisma, { organizationId, ticketNumber: req.params.ticketNumber });
  return res.json({ status: "success", data: { ticket, messages } });
});

router.patch("/internal/tickets/:ticketNumber", requireAuth, requirePermission("support.internal.manage"), async (req, res) => {
  try {
    const organizationId = internalOrganizationId(req);
    if (!organizationId) return res.status(400).json({ status: "error", message: "Client organization is required." });
    const result = await updateTicket(prisma, {
      organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      patch: req.body?.patch || {},
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data: result });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to update Support Desk ticket.", code: error.message });
  }
});

router.post("/internal/tickets/:ticketNumber/messages", requireAuth, requirePermission("support.internal.manage"), async (req, res) => {
  try {
    const organizationId = internalOrganizationId(req);
    if (!organizationId) return res.status(400).json({ status: "error", message: "Client organization is required." });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ status: "error", message: "Message is required." });
    await addMessage(prisma, {
      organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      direction: req.body?.direction || "OUTBOUND",
      channel: req.body?.channel || "CHRIS_INTERNAL",
      sender: req.body?.sender || "CHRiS Support Desk",
      body,
      visibility: req.body?.visibility === "INTERNAL" ? "INTERNAL" : "CLIENT",
    });
    return res.status(201).json({ status: "success" });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to record Support Desk message." });
  }
});

router.post("/internal/tickets/:ticketNumber/escalate", requireAuth, requirePermission("support.engineering.escalate"), async (req, res) => {
  try {
    const organizationId = internalOrganizationId(req);
    if (!organizationId) return res.status(400).json({ status: "error", message: "Client organization is required." });
    const result = await escalateToEngineering(prisma, {
      organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
    });
    return res.json({ status: "success", data: result });
  } catch (error) {
    console.error("Support Desk engineering escalation error:", error);
    return res.status(502).json({ status: "error", message: "Unable to complete engineering escalation.", code: error.message });
  }
});

module.exports = router;
