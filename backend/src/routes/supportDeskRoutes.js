const crypto = require("crypto");
const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  createTicket,
  listTickets,
  getTicket,
  getMessages,
  addMessage,
  updateTicket,
  escalateToEngineering,
  sendWhatsAppText,
} = require("../services/supportDeskService");

const router = express.Router();

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

router.use(requireAuth);
router.use(requirePermission("settings.view"));

router.get("/summary", async (req, res) => {
  try {
    const tickets = await listTickets(prisma, { organizationId: req.auth.organizationId, limit: 500 });
    const openStatuses = new Set(["NEW", "TRIAGED", "AWAITING_CLIENT", "ASSIGNED", "IN_PROGRESS", "FIX_READY", "DEPLOYED", "CLIENT_VALIDATION", "ESCALATED", "BLOCKED", "REOPENED"]);
    const summary = {
      total: tickets.length,
      open: tickets.filter((ticket) => openStatuses.has(ticket.status)).length,
      p1: tickets.filter((ticket) => ticket.severity === "P1_CRITICAL" && openStatuses.has(ticket.status)).length,
      p2: tickets.filter((ticket) => ticket.severity === "P2_HIGH" && openStatuses.has(ticket.status)).length,
      awaitingClient: tickets.filter((ticket) => ticket.status === "AWAITING_CLIENT" || ticket.status === "CLIENT_VALIDATION").length,
      engineering: tickets.filter((ticket) => ticket.status === "ESCALATED" || ticket.status === "IN_PROGRESS" || ticket.status === "FIX_READY").length,
      resolved: tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED").length,
    };
    return res.json({ status: "success", data: summary });
  } catch (error) {
    console.error("Support Desk summary error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load Support Desk summary." });
  }
});

router.get("/tickets", async (req, res) => {
  try {
    const tickets = await listTickets(prisma, { organizationId: req.auth.organizationId, limit: req.query.limit });
    return res.json({ status: "success", results: tickets.length, data: tickets });
  } catch (error) {
    console.error("Support Desk ticket list error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load Support Desk tickets." });
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const result = await createTicket(prisma, {
      ...req.body,
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      channel: req.body?.channel || "CHRIS",
    });
    return res.status(201).json({ status: "success", data: result });
  } catch (error) {
    console.error("Support Desk create ticket error:", error);
    return res.status(400).json({ status: "error", message: "Unable to create Support Desk ticket.", code: error.message });
  }
});

router.get("/tickets/:ticketNumber", async (req, res) => {
  const ticket = await getTicket(prisma, { organizationId: req.auth.organizationId, ticketNumber: req.params.ticketNumber });
  if (!ticket) return res.status(404).json({ status: "error", message: "Support ticket not found." });
  const messages = await getMessages(prisma, { organizationId: req.auth.organizationId, ticketNumber: req.params.ticketNumber });
  return res.json({ status: "success", data: { ticket, messages } });
});

router.patch("/tickets/:ticketNumber", async (req, res) => {
  try {
    const result = await updateTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      patch: req.body?.patch || req.body,
      reason: req.body?.reason,
      clientValidated: req.body?.clientValidated,
    });
    return res.json({ status: "success", data: result });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to update Support Desk ticket.", code: error.message });
  }
});

router.post("/tickets/:ticketNumber/messages", async (req, res) => {
  try {
    await addMessage(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      actorUserId: req.auth.userId,
      direction: req.body?.direction || "OUTBOUND",
      channel: req.body?.channel || "CHRIS",
      sender: req.body?.sender || "CHRiS Support Desk",
      body: req.body?.body,
    });
    return res.status(201).json({ status: "success" });
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Unable to record Support Desk message." });
  }
});

router.post("/tickets/:ticketNumber/escalate", async (req, res) => {
  try {
    const result = await escalateToEngineering(prisma, {
      organizationId: req.auth.organizationId,
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
