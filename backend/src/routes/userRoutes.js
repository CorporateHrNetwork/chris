const express = require("express");
const bcrypt = require("bcryptjs");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);

const BLOCKED_EMPLOYEE_STATUSES = ["TERMINATED", "RESIGNED", "RETIRED", "INACTIVE"];
const LOCATION_SCOPES = new Set(["ALL_LOCATIONS", "ASSIGNED_LOCATIONS"]);

const userSelect = {
  id: true,
  employeeId: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  locationScope: true,
  createdAt: true,
  updatedAt: true,
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
      locationId: true,
      location: {
        select: { id: true, name: true, code: true, type: true, city: true, state: true, isActive: true },
      },
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  },
  userRoles: {
    select: {
      role: {
        select: { id: true, name: true, description: true, isSystemRole: true },
      },
    },
  },
  userLocations: {
    select: {
      location: {
        select: { id: true, name: true, code: true, type: true, city: true, state: true, isActive: true },
      },
    },
    orderBy: { createdAt: "asc" },
  },
};

function formatUser(user) {
  return {
    id: user.id,
    employeeId: user.employeeId || null,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    locationScope: user.locationScope,
    assignedLocations: (user.userLocations || []).map((item) => item.location).filter(Boolean),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    employee: user.employee || null,
    roles: (user.userRoles || []).map((userRole) => userRole.role),
  };
}

function accessSummary(user) {
  return {
    locationScope: user?.locationScope || null,
    locationIds: (user?.userLocations || []).map((item) => item.location?.id || item.locationId).filter(Boolean),
    roleIds: (user?.userRoles || []).map((item) => item.role?.id || item.roleId).filter(Boolean),
    roleNames: (user?.userRoles || []).map((item) => item.role?.name).filter(Boolean),
    isActive: user?.isActive ?? null,
  };
}

function sendKnownError(res, error, fallback) {
  const code = error?.code || error?.message;
  const statusByCode = {
    USER_NOT_FOUND: 404,
    EMPLOYEE_NOT_FOUND: 404,
    INVALID_LOCATION_SCOPE: 400,
    ASSIGNED_LOCATION_REQUIRED: 400,
    INVALID_LOCATION_ASSIGNMENT: 400,
    ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE: 409,
    INVALID_ROLE_ASSIGNMENT: 400,
    EMPLOYEE_LOCATION_REQUIRED: 409,
  };
  const messages = {
    INVALID_LOCATION_SCOPE: "Select a valid CHRIS location access scope.",
    ASSIGNED_LOCATION_REQUIRED: "Select at least one organization location for restricted access.",
    INVALID_LOCATION_ASSIGNMENT: "One or more selected locations are inactive or do not belong to this organization.",
    ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE: "For ZERMATT, HEAD OFFICE is the consolidated company context and cannot be assigned as a restricted branch. Assign Abuja, Lagos or PHC instead.",
    INVALID_ROLE_ASSIGNMENT: "One or more selected roles are invalid for this organization.",
    EMPLOYEE_LOCATION_REQUIRED: "This employee must have a current work location before branch-restricted CHRIS access can be created.",
  };
  return res.status(statusByCode[code] || 500).json({
    status: "error",
    code: code || "USER_ACCESS_FAILED",
    message: messages[code] || error?.message || fallback,
    details: error?.details || undefined,
  });
}

async function validateRoles(tx, organizationId, roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    const error = new Error("Assign at least one role to the user.");
    error.code = "INVALID_ROLE_ASSIGNMENT";
    throw error;
  }
  const uniqueRoleIds = [...new Set(roleIds.map(String))];
  const roles = await tx.role.findMany({
    where: { organizationId, id: { in: uniqueRoleIds } },
    select: { id: true, name: true },
  });
  if (roles.length !== uniqueRoleIds.length) {
    const error = new Error("INVALID_ROLE_ASSIGNMENT");
    error.code = "INVALID_ROLE_ASSIGNMENT";
    throw error;
  }
  return { roleIds: uniqueRoleIds, roles };
}

async function validateLocationAccess(tx, {
  organizationId,
  organizationSlug,
  locationScope,
  locationIds,
}) {
  const scope = String(locationScope || "").trim().toUpperCase();
  if (!LOCATION_SCOPES.has(scope)) {
    const error = new Error("INVALID_LOCATION_SCOPE");
    error.code = "INVALID_LOCATION_SCOPE";
    throw error;
  }
  if (scope === "ALL_LOCATIONS") {
    return { locationScope: scope, locationIds: [], locations: [] };
  }
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    const error = new Error("ASSIGNED_LOCATION_REQUIRED");
    error.code = "ASSIGNED_LOCATION_REQUIRED";
    throw error;
  }
  const uniqueLocationIds = [...new Set(locationIds.map(String))];
  const locations = await tx.organizationLocation.findMany({
    where: { organizationId, id: { in: uniqueLocationIds }, isActive: true },
    select: { id: true, name: true, code: true, type: true, city: true, state: true },
  });
  if (locations.length !== uniqueLocationIds.length) {
    const error = new Error("INVALID_LOCATION_ASSIGNMENT");
    error.code = "INVALID_LOCATION_ASSIGNMENT";
    throw error;
  }
  if (
    organizationSlug === "zermatt-liquor-limited" &&
    locations.some((location) => String(location.type).toUpperCase() === "HEAD_OFFICE")
  ) {
    const error = new Error("ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE");
    error.code = "ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE";
    throw error;
  }
  return { locationScope: scope, locationIds: uniqueLocationIds, locations };
}

async function replaceUserAccess(tx, {
  organizationId,
  userId,
  roleIds,
  locationScope,
  locationIds,
}) {
  await tx.user.update({ where: { id: userId }, data: { locationScope } });
  await tx.userRole.deleteMany({ where: { userId } });
  await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
  await tx.userLocation.deleteMany({ where: { userId } });
  if (locationScope === "ASSIGNED_LOCATIONS") {
    await tx.userLocation.createMany({
      data: locationIds.map((locationId) => ({ organizationId, userId, locationId })),
    });
  }
}

router.get("/", requirePermission("users.view"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.auth.organizationId },
      select: userSelect,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    });
    return res.status(200).json({ status: "success", results: users.length, data: users.map(formatUser) });
  } catch (error) {
    console.error("User fetch error:", error);
    return res.status(500).json({ status: "error", message: "Unable to fetch CHRIS users." });
  }
});

router.get("/eligible-employees", requirePermission("users.manage"), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        organizationId: req.auth.organizationId,
        status: { notIn: BLOCKED_EMPLOYEE_STATUSES },
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        locationId: true,
        location: { select: { id: true, name: true, code: true, type: true, isActive: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        user: { select: { id: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const data = employees.filter((employee) => !employee.user && Boolean(employee.email?.trim()));
    return res.status(200).json({ status: "success", results: data.length, data });
  } catch (error) {
    console.error("Eligible employee fetch error:", error);
    return res.status(500).json({ status: "error", message: "Unable to fetch employees eligible for CHRIS access." });
  }
});

router.post("/", requirePermission("users.manage"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const { employeeId, temporaryPassword, roleIds } = req.body || {};
    if (!employeeId || !temporaryPassword) {
      return res.status(400).json({ status: "error", message: "Employee and temporary password are required." });
    }
    if (typeof temporaryPassword !== "string" || temporaryPassword.length < 10) {
      return res.status(400).json({ status: "error", message: "Temporary password must contain at least 10 characters." });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, slug: true },
    });
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        locationId: true,
        location: { select: { id: true, type: true, isActive: true } },
        user: { select: { id: true } },
      },
    });
    if (!employee) return res.status(404).json({ status: "error", message: "Employee record not found for this organization." });
    if (BLOCKED_EMPLOYEE_STATUSES.includes(employee.status)) {
      return res.status(400).json({ status: "error", message: `A CHRIS account cannot be created for an employee with ${employee.status.toLowerCase()} status.` });
    }
    if (!employee.email?.trim()) {
      return res.status(400).json({ status: "error", message: "This employee does not have an email address. Add an employee email before creating CHRIS access." });
    }
    if (employee.user) return res.status(409).json({ status: "error", message: "This employee already has a CHRIS user account." });

    const normalizedEmail = employee.email.trim().toLowerCase();
    const duplicate = await prisma.user.findFirst({ where: { organizationId, email: normalizedEmail }, select: { id: true } });
    if (duplicate) return res.status(409).json({ status: "error", message: "A CHRIS user with this employee's email address already exists." });

    const explicitScope = req.body?.locationScope !== undefined;
    let requestedScope = explicitScope ? req.body.locationScope : "ASSIGNED_LOCATIONS";
    let requestedLocationIds = explicitScope
      ? req.body?.locationIds
      : employee.locationId
        ? [employee.locationId]
        : [];
    if (!explicitScope && !employee.locationId) {
      const error = new Error("EMPLOYEE_LOCATION_REQUIRED");
      error.code = "EMPLOYEE_LOCATION_REQUIRED";
      throw error;
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = await prisma.$transaction(async (tx) => {
      const roles = await validateRoles(tx, organizationId, roleIds);
      const access = await validateLocationAccess(tx, {
        organizationId,
        organizationSlug: organization?.slug,
        locationScope: requestedScope,
        locationIds: requestedLocationIds,
      });
      const created = await tx.user.create({
        data: {
          organizationId,
          employeeId: employee.id,
          email: normalizedEmail,
          firstName: employee.firstName,
          lastName: employee.lastName,
          passwordHash,
          isActive: true,
          locationScope: access.locationScope,
          userRoles: { create: roles.roleIds.map((roleId) => ({ roleId })) },
          userLocations: access.locationScope === "ASSIGNED_LOCATIONS"
            ? { create: access.locationIds.map((locationId) => ({ organizationId, locationId })) }
            : undefined,
        },
        select: userSelect,
      });
      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: req.auth.userId,
          entityType: "User",
          entityId: created.id,
          action: "CHRIS_USER_CREATED",
          previousValue: null,
          newValue: accessSummary(created),
          reason: "CHRIS user access created from employee master record",
        },
      });
      return created;
    });

    return res.status(201).json({
      status: "success",
      message: user.locationScope === "ASSIGNED_LOCATIONS"
        ? "CHRIS user account created with branch-restricted access."
        : "CHRIS user account created with organization-wide access.",
      data: formatUser(user),
    });
  } catch (error) {
    console.error("User creation error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ status: "error", message: "This employee already has a CHRIS user account, or the employee email is already assigned to another CHRIS user." });
    }
    return sendKnownError(res, error, "Unable to create CHRIS user.");
  }
});

router.put("/:userId", requirePermission("users.manage"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const { userId } = req.params;
    const { firstName, lastName, email, roleIds } = req.body || {};
    if (userId === req.auth.userId) {
      return res.status(400).json({ status: "error", message: "You cannot change your own role or location assignments from User Management." });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, slug: true },
    });
    const existingUser = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: userSelect,
    });
    if (!existingUser) return res.status(404).json({ status: "error", message: "CHRIS user not found." });

    let identityUpdate = {};
    if (existingUser.employeeId) {
      const employee = existingUser.employee;
      if (!employee) return res.status(409).json({ status: "error", message: "The Employee record linked to this CHRIS account is unavailable." });
      if (!employee.email?.trim()) return res.status(400).json({ status: "error", message: "The linked employee does not have an email address." });
      const canonicalEmail = employee.email.trim().toLowerCase();
      const duplicateEmail = await prisma.user.findFirst({
        where: { organizationId, email: canonicalEmail, NOT: { id: userId } },
        select: { id: true },
      });
      if (duplicateEmail) return res.status(409).json({ status: "error", message: "Another CHRIS user already uses the linked employee's email address." });
      identityUpdate = { firstName: employee.firstName, lastName: employee.lastName, email: canonicalEmail };
    } else {
      if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
        return res.status(400).json({ status: "error", message: "First name, last name and email are required for an unlinked Administrator account." });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const duplicateEmail = await prisma.user.findFirst({
        where: { organizationId, email: normalizedEmail, NOT: { id: userId } },
        select: { id: true },
      });
      if (duplicateEmail) return res.status(409).json({ status: "error", message: "Another CHRIS user already uses this email address." });
      identityUpdate = { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail };
    }

    const previousAccess = accessSummary(existingUser);
    const updatedUser = await prisma.$transaction(async (tx) => {
      const roles = await validateRoles(tx, organizationId, roleIds);
      const preserveLocations = req.body?.locationScope === undefined;
      const requestedScope = preserveLocations ? existingUser.locationScope : req.body.locationScope;
      const requestedLocationIds = preserveLocations
        ? existingUser.assignedLocations?.map((location) => location.id) || existingUser.userLocations?.map((item) => item.location.id) || []
        : req.body?.locationIds;
      const access = await validateLocationAccess(tx, {
        organizationId,
        organizationSlug: organization?.slug,
        locationScope: requestedScope,
        locationIds: requestedLocationIds,
      });

      await tx.user.update({ where: { id: userId }, data: identityUpdate });
      await replaceUserAccess(tx, {
        organizationId,
        userId,
        roleIds: roles.roleIds,
        locationScope: access.locationScope,
        locationIds: access.locationIds,
      });
      const current = await tx.user.findFirst({ where: { id: userId, organizationId }, select: userSelect });
      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: req.auth.userId,
          entityType: "User",
          entityId: userId,
          action: "CHRIS_USER_ACCESS_UPDATED",
          previousValue: previousAccess,
          newValue: accessSummary(current),
          reason: String(req.body?.reason || "CHRIS role and location access updated").trim(),
        },
      });
      return current;
    });

    return res.status(200).json({
      status: "success",
      message: updatedUser.locationScope === "ASSIGNED_LOCATIONS"
        ? "CHRIS user roles and branch access updated successfully."
        : "CHRIS user roles and organization-wide access updated successfully.",
      data: formatUser(updatedUser),
    });
  } catch (error) {
    console.error("User update error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ status: "error", message: "Unable to update user because the employee or email is already linked to another CHRIS account." });
    }
    return sendKnownError(res, error, "Unable to update CHRIS user.");
  }
});

router.patch("/:userId/status", requirePermission("users.manage"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const { userId } = req.params;
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ status: "error", message: "isActive must be true or false." });
    }
    const existingUser = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, isActive: true, employeeId: true, employee: { select: { id: true, status: true } } },
    });
    if (!existingUser) return res.status(404).json({ status: "error", message: "CHRIS user not found." });
    if (userId === req.auth.userId && isActive === false) {
      return res.status(400).json({ status: "error", message: "You cannot deactivate your own CHRIS account." });
    }
    if (
      isActive === true && existingUser.employeeId && existingUser.employee &&
      BLOCKED_EMPLOYEE_STATUSES.includes(existingUser.employee.status)
    ) {
      return res.status(400).json({
        status: "error",
        message: `This account cannot be activated because the linked employee has ${existingUser.employee.status.toLowerCase()} status.`,
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { isActive }, select: userSelect });
      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: req.auth.userId,
          entityType: "User",
          entityId: userId,
          action: isActive ? "CHRIS_USER_ACTIVATED" : "CHRIS_USER_DEACTIVATED",
          previousValue: { isActive: existingUser.isActive },
          newValue: { isActive },
          reason: String(req.body?.reason || (isActive ? "CHRIS user activated" : "CHRIS user deactivated")).trim(),
        },
      });
      return updated;
    });

    return res.status(200).json({
      status: "success",
      message: isActive ? "CHRIS user activated successfully." : "CHRIS user deactivated successfully.",
      data: formatUser(user),
    });
  } catch (error) {
    console.error("User status update error:", error);
    return res.status(500).json({ status: "error", message: "Unable to update CHRIS user status." });
  }
});

module.exports = router;
