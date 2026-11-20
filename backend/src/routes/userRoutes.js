const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

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
  accessSuspendedAt: true,
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
    accessSuspendedAt: user.accessSuspendedAt || null,
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
            // organizationId is supplied implicitly by the nested User relation.
            // Prisma's nested create input therefore accepts locationId only.
            ? { create: access.locationIds.map((locationId) => ({ locationId })) }
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

router.post("/ess/provision-bulk", requirePermission("users.manage"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, slug: true },
    });
    if (organization?.slug !== "zermatt-liquor-limited") {
      return res.status(403).json({ status: "error", code: "ESS_PROVISIONING_NOT_ENABLED", message: "Bulk ESS provisioning is currently enabled for Zermatt Liquor Limited." });
    }

    const role = await prisma.role.findFirst({
      where: { organizationId, name: "Employee Self Service" },
      select: { id: true, name: true },
    });
    if (!role) {
      return res.status(409).json({ status: "error", code: "ESS_ROLE_REQUIRED", message: "Employee Self Service role is not configured." });
    }

    const employees = await prisma.employee.findMany({
      where: {
        organizationId,
        status: { in: ["ACTIVE","PROBATION","LEAVE","SUSPENDED"] },
        email: { not: null },
        user: null,
      },
      select: {
        id: true, employeeNumber: true, firstName: true, lastName: true,
        email: true, locationId: true,
      },
      orderBy: { employeeNumber: "asc" },
    });

    const appOrigin = String(req.headers.origin || process.env.CHRIS_APP_URL || "").replace(/\/$/,"");
    const results = [];
    for (const employee of employees) {
      const email = String(employee.email || "").trim().toLowerCase();
      if (!email) continue;
      try {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const lockedPassword = crypto.randomBytes(48).toString("hex");
        const passwordHash = await bcrypt.hash(lockedPassword, 12);

        const created = await prisma.$transaction(async (tx) => {
          const duplicate = await tx.user.findFirst({ where: { organizationId, email }, select: { id: true } });
          if (duplicate) throw Object.assign(new Error("Email already belongs to a CHRiS user."), { code: "DUPLICATE_USER_EMAIL" });

          const user = await tx.user.create({
            data: {
              organizationId,
              employeeId: employee.id,
              email,
              firstName: employee.firstName,
              lastName: employee.lastName,
              passwordHash,
              isActive: true,
              locationScope: employee.locationId ? "ASSIGNED_LOCATIONS" : "ALL_LOCATIONS",
              userRoles: { create: [{ roleId: role.id }] },
              userLocations: employee.locationId ? { create: [{ locationId: employee.locationId }] } : undefined,
            },
            select: { id: true, email: true },
          });

          await tx.passwordResetToken.create({
            data: { userId: user.id, tokenHash, expiresAt },
          });
          await tx.organizationAudit.create({
            data: {
              organizationId,
              actorUserId: req.auth.userId || null,
              entityType: "User",
              entityId: user.id,
              action: "ESS_USER_PROVISIONED",
              newValue: { employeeId: employee.id, employeeNumber: employee.employeeNumber, email, role: role.name },
              reason: "Bulk Zermatt Employee Self Service provisioning",
            },
          });
          return user;
        });

        results.push({
          success: true,
          userId: created.id,
          employeeNumber: employee.employeeNumber,
          employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(" "),
          email,
          activationExpiresAt: expiresAt,
          activationUrl: appOrigin ? `${appOrigin}/reset-password?token=${rawToken}&activation=1` : `/reset-password?token=${rawToken}&activation=1`,
        });
      } catch (error) {
        results.push({
          success: false,
          employeeNumber: employee.employeeNumber,
          email,
          code: error.code || "ESS_PROVISION_FAILED",
          message: error.message || "Unable to provision employee ESS account.",
        });
      }
    }

    const provisioned = results.filter((row) => row.success).length;
    return res.status(results.some((row) => !row.success) ? 207 : 201).json({
      status: "success",
      message: `${provisioned} Employee Self Service account(s) provisioned. Activation links expire after 72 hours and are returned only in this response.`,
      data: {
        eligible: employees.length,
        provisioned,
        failed: results.length - provisioned,
        results,
      },
    });
  } catch (error) {
    console.error("ESS bulk provisioning error:", error);
    return res.status(500).json({ status: "error", message: "Unable to bulk provision Employee Self Service accounts." });
  }
});

// One-time recovery links are delivered only to the registered work email.
// No plaintext password or reset link is disclosed to an administrator.
router.post("/:userId/send-password-recovery", requirePermission("users.manage"), async (req,res) => {
  try {
    const portal = String(req.body?.portal || "").toLowerCase();
    if (!["admin","ess"].includes(portal)) return res.status(400).json({status:"error",message:"Select CHRiS Staff Login or ESS."});
    if (req.params.userId === req.auth.userId) return res.status(400).json({status:"error",message:"Use your own password recovery form."});
    const target = await prisma.user.findFirst({
      where:{id:req.params.userId,organizationId:req.auth.organizationId},
      select:{id:true,email:true,firstName:true,isActive:true,accessSuspendedAt:true,employeeId:true,
        employee:{select:{status:true,email:true}}}
    });
    if (!target) return res.status(404).json({status:"error",message:"CHRiS user not found."});
    if (!target.isActive || target.accessSuspendedAt) return res.status(409).json({status:"error",message:"Reactivate or resume the account before sending a recovery link."});
    if (portal==="ess" && (!target.employeeId || !["ACTIVE","PROBATION","LEAVE"].includes(target.employee?.status))) {
      return res.status(409).json({status:"error",message:"ESS recovery requires a linked eligible employee."});
    }
    const recipient=String(target.employee?.email || target.email || "").trim().toLowerCase();
    if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return res.status(422).json({status:"error",message:"A valid registered work email is required."});
    const organization=req.auth.organization;
    const frontend = String(process.env.FRONTEND_URL || "https://chris.crnetwork.com.ng").replace(/\/$/,"");
    const token=crypto.randomBytes(32).toString("hex");
    const hash=crypto.createHash("sha256").update(token).digest("hex");
    const resetUrl=frontend+"/reset-password?token="+encodeURIComponent(token)+"&organization="+encodeURIComponent(organization.slug)+"&portal="+portal;
    await prisma.$transaction(async tx=>{
      await tx.passwordResetToken.deleteMany({where:{userId:target.id,portal,usedAt:null}});
      await tx.passwordResetToken.create({data:{userId:target.id,portal,tokenHash:hash,expiresAt:new Date(Date.now()+15*60*1000)}});
    });
    try {
      await require("../services/chrisUserRecoveryMailer").sendRecoveryMail({
        to:recipient, firstName:target.firstName || "colleague",portal,resetUrl
      });
    } catch(error) {
      await prisma.passwordResetToken.deleteMany({where:{tokenHash:hash}});
      console.error("CHRiS recovery email delivery:",error.message);
      return res.status(503).json({status:"error",message:"Unable to deliver password recovery email. Check mail service and registered work email."});
    }
    await prisma.organizationAudit.create({data:{
      organizationId:req.auth.organizationId,actorUserId:req.auth.userId,
      entityType:"User",entityId:target.id,action:"USER_PORTAL_RECOVERY_ISSUED",
      newValue:{portal,recipient,expiresInMinutes:15},
      reason:String(req.body?.reason || "Authorized account recovery").trim(),
    }});
    return res.json({status:"success",message:(portal==="ess"?"ESS":"CHRiS staff login")+" recovery link sent to the registered work email. Expires in 15 minutes."});
  } catch(error) {
    console.error("Admin user recovery:",error);
    return res.status(500).json({status:"error",message:"Unable to issue account recovery link."});
  }
});

router.patch("/:userId/suspension", requirePermission("users.manage"), async (req,res)=>{
  try {
    const suspend=req.body?.suspended;
    const reason=String(req.body?.reason || "").trim();
    if(typeof suspend !== "boolean") return res.status(400).json({status:"error",message:"Suspension status must be true or false."});
    if(reason.length<8) return res.status(400).json({status:"error",message:"Provide an audit reason of at least eight characters."});
    if(req.params.userId===req.auth.userId) return res.status(403).json({status:"error",message:"You cannot suspend or resume your own account."});
    const existing=await prisma.user.findFirst({where:{id:req.params.userId,organizationId:req.auth.organizationId},
      select:{id:true,isActive:true,accessSuspendedAt:true,employee:{select:{status:true}}}});
    if(!existing) return res.status(404).json({status:"error",message:"User not found."});
    if(!existing.isActive) return res.status(409).json({status:"error",message:"Deactivated accounts must be reactivated through the activation action."});
    if(!suspend && existing.employee && BLOCKED_EMPLOYEE_STATUSES.includes(existing.employee.status)) {
      return res.status(409).json({status:"error",message:"The linked employee is not eligible for active access."});
    }
    const user=await prisma.$transaction(async tx=>{
      const updated=await tx.user.update({where:{id:existing.id},data:{accessSuspendedAt:suspend?new Date():null},select:userSelect});
      if(suspend) await tx.passwordResetToken.deleteMany({where:{userId:existing.id,usedAt:null}});
      await tx.organizationAudit.create({data:{organizationId:req.auth.organizationId,actorUserId:req.auth.userId,
        entityType:"User",entityId:existing.id,action:suspend?"CHRIS_USER_ACCESS_SUSPENDED":"CHRIS_USER_ACCESS_RESUMED",
        previousValue:{accessSuspendedAt:existing.accessSuspendedAt},newValue:{accessSuspendedAt:updated.accessSuspendedAt},reason}});
      return updated;
    });
    return res.json({status:"success",message:suspend?"Staff and ESS access suspended.":"Staff and ESS access resumed.",data:formatUser(user)});
  }catch(error){console.error("User suspension:",error);return res.status(500).json({status:"error",message:"Unable to change user suspension."});}
});

router.post("/:userId/reset-password", requirePermission("users.manage"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const { userId } = req.params;
    const temporaryPassword = String(req.body?.temporaryPassword || "");

    if (userId === req.auth.userId) {
      return res.status(400).json({ status: "error", message: "Use your own account security settings to change your password." });
    }
    if (temporaryPassword.length < 10) {
      return res.status(400).json({ status: "error", message: "Temporary password must contain at least 10 characters." });
    }

    const existingUser = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
    });
    if (!existingUser) {
      return res.status(404).json({ status: "error", message: "CHRIS user not found." });
    }
    if (!existingUser.isActive) {
      return res.status(409).json({ status: "error", message: "Reactivate this CHRIS user before resetting the password." });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId, usedAt: null, portal: "admin" },
      });
      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: req.auth.userId,
          entityType: "User",
          entityId: userId,
          action: "CHRIS_PASSWORD_ADMIN_RESET",
          previousValue: null,
          newValue: { regularChrisPasswordReset: true, essPasswordChanged: false },
          reason: String(req.body?.reason || "Administrator issued a temporary regular CHRIS password").trim(),
        },
      });
    });

    return res.status(200).json({
      status: "success",
      message: "Regular CHRIS password reset successfully. Employee Self Service password was not changed.",
      data: { userId: existingUser.id },
    });
  } catch (error) {
    console.error("Admin CHRIS password reset error:", error);
    return res.status(500).json({ status: "error", message: "Unable to reset the regular CHRIS password." });
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
      if (!isActive) await tx.passwordResetToken.deleteMany({where:{userId,usedAt:null}});
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
