const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../config/prisma");
const { requireEssAuth } = require("../middleware/authMiddleware");

const router = express.Router();

const ESS_EMPLOYEE_STATUSES = new Set(["ACTIVE", "PROBATION", "LEAVE"]);

function invalidCredentials(res) {
  return res.status(401).json({
    status: "error",
    message: "Invalid employee login credentials.",
  });
}

/*
============================================================
EMPLOYEE SELF-SERVICE LOGIN
============================================================
This is intentionally separate from the CHRiS administration login.
Only an active CHRiS user account that is linked to an employee record
may receive an ESS token.
*/
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;
    const organizationSlug = String(req.body?.organizationSlug || "").trim().toLowerCase();

    if (!email || !password || !organizationSlug) {
      return invalidCredentials(res);
    }

    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, slug: true, name: true, status: true, logoUrl: true },
    });

    if (!organization || organization.status !== "ACTIVE") {
      return invalidCredentials(res);
    }

    const user = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email,
        isActive: true,
        employeeId: { not: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (!user || !user.employee || !ESS_EMPLOYEE_STATUSES.has(user.employee.status)) {
      return invalidCredentials(res);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return invalidCredentials(res);
    }

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: organization.id,
        accessType: "ESS",
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    return res.status(200).json({
      status: "success",
      message: "Employee portal login successful.",
      data: {
        token,
        employee: {
          employeeNumber: user.employee.employeeNumber,
          firstName: user.employee.firstName,
          middleName: user.employee.middleName,
          lastName: user.employee.lastName,
          email: user.employee.email || user.email,
          status: user.employee.status,
        },
        organization: {
          name: organization.name,
          slug: organization.slug,
          logoUrl: organization.logoUrl,
        },
      },
    });
  } catch (error) {
    console.error("ESS login error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to complete employee portal login.",
    });
  }
});

/*
============================================================
CURRENT EMPLOYEE PROFILE
============================================================
The employee ID is taken only from the authenticated ESS token.
There is deliberately no employeeId/employeeNumber route parameter.
Changing the browser URL therefore cannot select another employee.
*/
router.get("/me", requireEssAuth, async (req, res) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: {
        id: req.essAuth.employeeId,
        organizationId: req.essAuth.organizationId,
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        status: true,
        employmentType: true,
        hireDate: true,
        confirmationDate: true,
        exitDate: true,
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true, city: true, state: true } },
        costCentre: { select: { id: true, name: true, code: true } },
      },
    });

    if (!employee || !ESS_EMPLOYEE_STATUSES.has(employee.status)) {
      return res.status(403).json({
        status: "error",
        code: "ESS_EMPLOYEE_ACCESS_REVOKED",
        message: "Employee portal access is no longer available for this account.",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: req.essAuth.userId,
        organizationId: req.essAuth.organizationId,
        isActive: true,
      },
      select: { email: true },
    });

    return res.status(200).json({
      status: "success",
      data: {
        employee: {
          ...employee,
          email: employee.email || user?.email || null,
        },
        organization: {
          id: req.essAuth.organizationId,
          name: req.essAuth.organization.name,
          slug: req.essAuth.organization.slug,
          logoUrl: req.essAuth.organization.logoUrl,
          timezone: req.essAuth.organization.timezone,
          currency: req.essAuth.organization.currency,
        },
      },
    });
  } catch (error) {
    console.error("ESS profile error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to load your employee profile.",
    });
  }
});

module.exports = router;
