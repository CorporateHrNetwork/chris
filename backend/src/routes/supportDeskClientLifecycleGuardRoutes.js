const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const { getTicket } = require("../services/supportDeskService");

const router = express.Router();
const CLIENT_MESSAGE_BLOCKED_STATUSES = new Set(["CANCELLED", "CLOSED", "RESOLVED"]);

// Lifecycle guard only. The existing Support Desk route remains authoritative
// for actually recording the message. Calling next() here intentionally passes
// control to supportDeskRoutes after the requester/state checks succeed.
router.post("/client/tickets/:ticketNumber/messages", requireAuth, async (req, res, next) => {
  try {
    const ticket = await getTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
    });
    if (!ticket || ticket.requesterUserId !== req.auth.userId) {
      return res.status(404).json({ status: "error", message: "Support request not found." });
    }
    if (CLIENT_MESSAGE_BLOCKED_STATUSES.has(ticket.status)) {
      return res.status(409).json({
        status: "error",
        code: "SUPPORT_CASE_MESSAGE_BLOCKED",
        message: ticket.status === "CANCELLED"
          ? "This support request was cancelled. Submit a new request if assistance is still required."
          : "Reopen this support request before adding another message.",
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
