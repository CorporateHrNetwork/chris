const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const prisma = require("../config/prisma");

const EMAIL_FROM = process.env.RESEND_FROM_EMAIL;
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://chris.crnetwork.com.ng").replace(/\\/$/, "");

async function sendTransactionalEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY || !EMAIL_FROM) {
    throw new Error("Resend email is not configured (RESEND_API_KEY and RESEND_FROM_EMAIL are required).");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend delivery failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

function escapeEmailHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

const {
  requireAuth,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
LOGIN
============================================================
*/
router.post("/activate-employee", async (req, res) => {
  const genericResponse = { status: "success", message: "If the details match an eligible employee record, an activation link will be sent to the registered email address." };
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const employeeNumber = String(req.body?.employeeNumber || "").trim();
    const organizationSlug = String(req.body?.organizationSlug || "").trim().toLowerCase();
    if (!email || !employeeNumber || !organizationSlug) return res.status(200).json(genericResponse);
    const organization = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (!organization || organization.status !== "ACTIVE") return res.status(200).json(genericResponse);
    const employee = await prisma.employee.findFirst({
      where: { organizationId: organization.id, employeeNumber, email: { equals: email, mode: "insensitive" }, status: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
      select: { id: true, firstName: true, lastName: true, email: true, status: true, user: { select: { id: true, email: true, isActive: true } } },
    });
    if (!employee || !employee.email) return res.status(200).json(genericResponse);
    let user = employee.user;
    if (user && (!user.isActive || String(user.email).toLowerCase() !== email)) return res.status(200).json(genericResponse);
    if (!user) {
      const emailCollision = await prisma.user.findFirst({ where: { organizationId: organization.id, email }, select: { id: true } });
      if (emailCollision) return res.status(200).json(genericResponse);
      user = await prisma.user.create({
        data: { organizationId: organization.id, employeeId: employee.id, email, firstName: employee.firstName, lastName: employee.lastName, passwordHash: await bcrypt.hash(crypto.randomBytes(48).toString("hex"), 12), isActive: true },
        select: { id: true, email: true, isActive: true },
      });
    }
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    const link = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}&organization=${encodeURIComponent(organization.slug)}&mode=activation&portal=ess`;
    try {
      await sendTransactionalEmail({
        to: email, subject: "Activate your CHRiS Employee Self-Service account",
        text: `Hello ${employee.firstName || "there"},\\n\\nUse this secure link within 30 minutes to create your CHRiS ESS password: ${link}\\n\\nIf you did not request this, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;color:#173326;line-height:1.6"><h2>Activate your CHRiS employee account</h2><p>Hello ${escapeEmailHtml(employee.firstName || "there")},</p><p>Use this link within 30 minutes to create your password and access your personal Employee Self-Service portal.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#087A43;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Activate my account</a></p><p>If you did not request this, ignore this email.</p></div>`,
      });
    } catch (mailError) { console.error("CHRiS activation email delivery error:", mailError.message); }
    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("ESS activation request error:", error);
    return res.status(200).json(genericResponse);
  }
});

/*
============================================================
LOGIN
============================================================
*/
router.post("/login", async (req, res) => {
  try {
    const {
      email,
      password,
      organizationSlug,
    } = req.body;

    if (
      !email?.trim() ||
      !password ||
      !organizationSlug?.trim()
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Email, password and organization are required.",
      });
    }

    const organization =
      await prisma.organization.findUnique({
        where: {
          slug: organizationSlug
            .trim()
            .toLowerCase(),
        },
      });

    if (!organization) {
      return res.status(401).json({
        status: "error",
        message:
          "Invalid login credentials.",
      });
    }

    if (
      organization.status !== "ACTIVE"
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "This organization is currently unavailable.",
      });
    }

    const user =
      await prisma.user.findFirst({
        where: {
          organizationId:
            organization.id,

          email: email
            .trim()
            .toLowerCase(),

          isActive: true,
        },

        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

    if (!user) {
      return res.status(401).json({
        status: "error",
        message:
          "Invalid login credentials.",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!passwordMatches) {
      return res.status(401).json({
        status: "error",
        message:
          "Invalid login credentials.",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId:
          organization.id,
      },

      process.env.JWT_SECRET,

      {
        expiresIn:
          process.env.JWT_EXPIRES_IN ||
          "8h",
      }
    );

    return res.status(200).json({
      status: "success",
      message: "Login successful.",

      data: {
        token,

        user: {
          id: user.id,
          employeeId: user.employeeId || null,
          email: user.email,
          firstName:
            user.firstName,
          lastName:
            user.lastName,

          roles:
            user.userRoles.map(
              (userRole) =>
                userRole.role.name
            ),
        },

        organization: {
          id: organization.id,
          name:
            organization.name,
          slug:
            organization.slug,
          timezone:
            organization.timezone,
          currency:
            organization.currency,
        },
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      status: "error",
      message:
        "Unable to complete login.",
    });
  }
});

/*
============================================================
FORGOT PASSWORD
============================================================
*/
router.post(
  "/forgot-password",
  async (req, res) => {
    try {
      const {
        email,
        organizationSlug,
      } = req.body;

      if (
        !email?.trim() ||
        !organizationSlug?.trim()
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Email and organization are required.",
        });
      }

      const organization =
        await prisma.organization.findUnique({
          where: {
            slug: organizationSlug
              .trim()
              .toLowerCase(),
          },
        });

      const genericResponse = {
        status: "success",

        message:
          "If an active CHRIS account exists for this email, password reset instructions have been prepared.",
      };

      if (
        !organization ||
        organization.status !==
          "ACTIVE"
      ) {
        return res
          .status(200)
          .json(genericResponse);
      }

      const user =
        await prisma.user.findFirst({
          where: {
            organizationId:
              organization.id,

            email: email
              .trim()
              .toLowerCase(),

            isActive: true,
          },
        });

      if (!user) {
        return res
          .status(200)
          .json(genericResponse);
      }

      await prisma.passwordResetToken.deleteMany(
        {
          where: {
            userId: user.id,
            usedAt: null,
          },
        }
      );

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      const tokenHash =
        crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

      const expiresAt =
        new Date(
          Date.now() +
            15 * 60 * 1000
        );

      await prisma.passwordResetToken.create(
        {
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        }
      );

      const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}&organization=${encodeURIComponent(organization.slug)}&portal=ess`;
      try {
        await sendTransactionalEmail({
          to: user.email, subject: "Reset your CHRiS password",
          text: `A password reset was requested for your CHRiS account. Use this link within 15 minutes: ${resetLink}\\n\\nIf you did not request a reset, ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;color:#173326;line-height:1.6"><h2>Reset your CHRiS password</h2><p>A password reset was requested for your CHRiS account.</p><p><a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#087A43;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Reset password</a></p><p>This link expires in 15 minutes. If you did not request a reset, ignore this email.</p></div>`,
        });
      } catch (mailError) { console.error("CHRiS password-reset email delivery error:", mailError.message); }
      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error(
        "Forgot password error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to prepare password reset.",
      });
    }
  }
);

/*
============================================================
RESET PASSWORD
============================================================
*/
router.post(
  "/reset-password",
  async (req, res) => {
    try {
      const {
        token,
        newPassword,
        confirmPassword,
      } = req.body;

      if (
        !token ||
        !newPassword ||
        !confirmPassword
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Reset token and both password fields are required.",
        });
      }

      if (
        newPassword !==
        confirmPassword
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "The new passwords do not match.",
        });
      }

      if (
        newPassword.length < 10
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Password must contain at least 10 characters.",
        });
      }

      const tokenHash =
        crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

      const resetRecord =
        await prisma.passwordResetToken.findUnique(
          {
            where: {
              tokenHash,
            },

            include: {
              user: true,
            },
          }
        );

      if (
        !resetRecord ||
        resetRecord.usedAt ||
        resetRecord.expiresAt <=
          new Date() ||
        !resetRecord.user.isActive
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "This password reset link is invalid or has expired.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      await prisma.$transaction([
        prisma.user.update({
          where: {
            id: resetRecord.userId,
          },

          data: {
            passwordHash,
          },
        }),

        prisma.passwordResetToken.update(
          {
            where: {
              id: resetRecord.id,
            },

            data: {
              usedAt: new Date(),
            },
          }
        ),
      ]);

      return res.status(200).json({
        status: "success",

        message:
          "Password reset successfully. You can now sign in with your new password.",
      });
    } catch (error) {
      console.error(
        "Reset password error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to reset password.",
      });
    }
  }
);

/*
============================================================
CURRENT AUTHENTICATED USER
============================================================
*/
router.get(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await prisma.user.findFirst({
          where: {
            id: req.auth.userId,
            organizationId:
              req.auth.organizationId,
            isActive: true,
          },

          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        });

      if (!user) {
        return res.status(404).json({
          status: "error",
          message:
            "Authenticated user could not be found.",
        });
      }

      return res.status(200).json({
        status: "success",

        data: {
          userId: user.id,
          email: user.email,

          firstName:
            user.firstName,

          lastName:
            user.lastName,

          roles:
            req.auth.roles,

          permissions:
            req.auth.permissions || [],

          locationScope:
            req.auth.locationScope,

          activeLocationId:
            req.auth.activeLocationId || null,

          consolidatedOrganization:
            Boolean(req.auth.consolidatedOrganization),

          consolidatedHeadOffice:
            Boolean(req.auth.consolidatedHeadOffice),

          availableLocations:
            req.auth.availableLocations || [],

          organization: {
            id:
              req.auth.organization.id,

            name:
              req.auth.organization.name,

            legalName:
              req.auth.organization.legalName,

            logoUrl:
              req.auth.organization.logoUrl,

            slug:
              req.auth.organization.slug,

            timezone:
              req.auth.organization.timezone,

            currency:
              req.auth.organization.currency,
          },
        },
      });
    } catch (error) {
      console.error(
        "Current user error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to load current user.",
      });
    }
  }
);

module.exports = router;
