const express = require("express");
const prisma = require("../config/prisma");
const { hashInviteToken } = require("../services/employeeDataOperationsService");

const router = express.Router();

function effectiveStatus(invite) {
  if (
    ["PENDING", "OPENED"].includes(invite.status) &&
    invite.expiresAt < new Date()
  ) {
    return "EXPIRED";
  }
  return invite.status;
}

router.get("/:token", async (req, res) => {
  const tokenHash = hashInviteToken(String(req.params.token || ""));
  const invite = await prisma.employeeSelfOnboardingInvite.findUnique({
    where: { tokenHash },
    include: {
      organization: {
        select: { id: true, name: true, logoUrl: true },
      },
    },
  });
  if (!invite) {
    return res.status(404).json({
      status: "error",
      message: "This employee invitation is invalid.",
    });
  }

  const status = effectiveStatus(invite);
  if (status === "PENDING" && !invite.openedAt) {
    await prisma.employeeSelfOnboardingInvite.update({
      where: { id: invite.id },
      data: { status: "OPENED", openedAt: new Date() },
    });
  }

  return res.json({
    status: "success",
    data: {
      id: invite.id,
      recipientEmail: invite.recipientEmail,
      status: status === "PENDING" ? "OPENED" : status,
      expiresAt: invite.expiresAt,
      organization: invite.organization,
    },
  });
});

router.post("/:token/submit", async (req, res) => {
  const tokenHash = hashInviteToken(String(req.params.token || ""));
  const invite = await prisma.employeeSelfOnboardingInvite.findUnique({
    where: { tokenHash },
  });
  if (!invite) {
    return res.status(404).json({ status: "error", message: "This employee invitation is invalid." });
  }
  if (invite.expiresAt < new Date()) {
    return res.status(410).json({ status: "error", message: "This employee invitation has expired." });
  }
  if (["REVOKED", "COMPLETED"].includes(invite.status)) {
    return res.status(409).json({ status: "error", message: "This employee invitation is no longer active." });
  }

  const fullName = String(req.body?.fullName || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const gender = String(req.body?.gender || "").trim().toUpperCase();
  const nin = String(req.body?.nationalIdentificationNumber || "").replace(/\D/g, "");

  if (fullName.split(/\s+/).filter(Boolean).length < 2 || !phone) {
    return res.status(400).json({
      status: "error",
      message: "Enter your full name and phone number.",
    });
  }
  if (!["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(gender)) {
    return res.status(400).json({ status: "error", message: "Select a valid gender." });
  }
  if (nin && nin.length !== 11) {
    return res.status(400).json({ status: "error", message: "NIN must contain 11 digits." });
  }

  const updated = await prisma.employeeSelfOnboardingInvite.update({
    where: { id: invite.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedData: {
        fullName,
        phone,
        gender,
        nationalIdentificationNumber: nin || "",
      },
    },
  });

  return res.json({
    status: "success",
    message: "Your details were submitted securely for HR review.",
    data: { id: updated.id, status: updated.status },
  });
});

module.exports = router;
