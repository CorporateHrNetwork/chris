const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const prisma = require("../config/prisma");

const {
  requireAuth,
} = require("../middleware/authMiddleware");

const router = express.Router();

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

      return res.status(200).json({
        ...genericResponse,

        /*
          DEVELOPMENT ONLY.
        */
        data: {
          resetToken: rawToken,
          expiresAt,
        },
      });
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

          organization: {
            id:
              req.auth.organization.id,

            name:
              req.auth.organization.name,

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