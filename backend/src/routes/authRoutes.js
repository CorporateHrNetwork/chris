const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../config/prisma");
const {
  requireAuth,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
  LOGIN
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
        message: "Invalid login credentials.",
      });
    }

    if (organization.status !== "ACTIVE") {
      return res.status(403).json({
        status: "error",
        message:
          "This organization is currently unavailable.",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email: email.trim().toLowerCase(),
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
        message: "Invalid login credentials.",
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
        message: "Invalid login credentials.",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: organization.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:
          process.env.JWT_EXPIRES_IN || "8h",
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
          firstName: user.firstName,
          lastName: user.lastName,

          roles: user.userRoles.map(
            (userRole) => userRole.role.name
          ),
        },

        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          timezone: organization.timezone,
          currency: organization.currency,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to complete login.",
    });
  }
});

/*
  CURRENT AUTHENTICATED USER
*/
router.get("/me", requireAuth, async (req, res) => {
  return res.status(200).json({
    status: "success",
    data: {
      userId: req.auth.userId,
      email: req.auth.email,
      roles: req.auth.roles,

      organization: {
        id: req.auth.organization.id,
        name: req.auth.organization.name,
        slug: req.auth.organization.slug,
        timezone:
          req.auth.organization.timezone,
        currency:
          req.auth.organization.currency,
      },
    },
  });
});

module.exports = router;