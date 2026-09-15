const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const { cancelRequesterTicket } = require("../services/supportDeskCancellationService");

const router = express.Router();
router.use(requireAuth);

router.post("/client/tickets/:ticketNumber/cancel", async (req, res) => {
  try {
    const result = await cancelRequesterTicket(prisma, {
      organizationId: req.auth.organizationId,
      ticketNumber: req.params.ticketNumber,
      requesterUserId: req.auth.userId,
      actorUserId: req.auth.userId,
      reason: req.body?.reason,
    });
    return res.json({
      status: "success",
      message: "Support request cancelled. The cancellation remains in the Support Desk audit trail.",
      data: result,
    });
  } catch (error) {
    if (error?.code) {
      return res.status(error.statusCode || 400).json({
        status: "error",
        code: error.code,
        message: error.message,
      });
    }
    console.error("Client support cancellation error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to cancel this support request.",
    });
  }
});

module.exports = router;