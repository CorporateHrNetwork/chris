const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const PLATFORM_ORGANIZATION_SLUG = "corporatehr-network";
const PLATFORM_ONLY_PERMISSION_PREFIXES = ["support.internal.", "support.engineering."];
const ESS_EMPLOYEE_STATUSES = new Set(["ACTIVE", "PROBATION", "LEAVE"]);

function isPlatformOnlyPermission(permission) {
  const key = String(permission || "");
  return PLATFORM_ONLY_PERMISSION_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function permissionAllowedForOrganization(req, permission) {
  if (!isPlatformOnlyPermission(permission)) return true;
  return req.auth?.organization?.slug === PLATFORM_ORGANIZATION_SLUG;
}

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Authentication required." });
    }
    const token = authorization.split(" ")[1];
    if (!token) return res.status(401).json({ status: "error", message: "Authentication required." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.accessType === "ESS") {
      return res.status(401).json({
        status: "error",
        code: "ESS_SESSION_NOT_ALLOWED",
        message: "This session is restricted to the employee portal.",
      });
    }

    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, organizationId: decoded.organizationId, isActive: true },
      include: {
        organization: true,
        userLocations: { include: { location: true } },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return res.status(401).json({ status: "error", message: "User account is unavailable." });
    if (user.organization.status !== "ACTIVE") {
      return res.status(403).json({ status: "error", message: "Organization access is currently unavailable." });
    }

    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissionSet = new Set();
    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissionSet.add(rolePermission.permission.key);
      }
    }

    let requestedLocationId = String(req.headers["x-chris-location-id"] || "").trim() || null;
    const activeLocations = user.userLocations
      .map((item) => item.location)
      .filter((location) => location && location.isActive !== false);
    let availableLocations = activeLocations;
    if (user.locationScope === "ALL_LOCATIONS") {
      availableLocations = await prisma.organizationLocation.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });
    }

    const requestedLocation = requestedLocationId
      ? availableLocations.find((location) => location.id === requestedLocationId) || null
      : null;

    if (requestedLocationId && !requestedLocation) {
      return res.status(403).json({
        status: "error",
        code: "LOCATION_SCOPE_FORBIDDEN",
        message: "You do not have access to the selected CHRiS branch/location.",
      });
    }

    if (
      user.organization?.slug === "zermatt-liquor-limited" &&
      String(requestedLocation?.type || "").toUpperCase() === "HEAD_OFFICE"
    ) {
      requestedLocationId = null;
    }

    const consolidatedOrganization =
      user.locationScope === "ALL_LOCATIONS" && !requestedLocationId;

    req.auth = {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      organization: user.organization,
      roles,
      permissions: Array.from(permissionSet),
      locationScope: user.locationScope,
      availableLocations: availableLocations.map((location) => ({
        id: location.id,
        name: location.name,
        code: location.code,
        type: location.type,
        city: location.city,
        state: location.state,
      })),
      activeLocationId: requestedLocationId,
      consolidatedOrganization,
      consolidatedHeadOffice: consolidatedOrganization,
    };

    if (user.locationScope === "ASSIGNED_LOCATIONS" && !requestedLocationId && availableLocations.length === 1) {
      req.auth.activeLocationId = availableLocations[0].id;
      req.auth.consolidatedOrganization = false;
      req.auth.consolidatedHeadOffice = false;
    }

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ status: "error", message: "Your session is invalid or has expired." });
    }
    return res.status(500).json({ status: "error", message: "Unable to authenticate request." });
  }
}

async function requireEssAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Employee portal authentication required." });
    }

    const token = authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ status: "error", message: "Employee portal authentication required." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.accessType !== "ESS") {
      return res.status(401).json({
        status: "error",
        code: "ESS_SESSION_REQUIRED",
        message: "An employee portal session is required.",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        organizationId: decoded.organizationId,
        isActive: true,
        employeeId: { not: null },
      },
      include: {
        organization: true,
        employee: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!user || !user.employee || !ESS_EMPLOYEE_STATUSES.has(user.employee.status)) {
      return res.status(403).json({
        status: "error",
        code: "ESS_ACCESS_REVOKED",
        message: "Employee portal access is unavailable for this account.",
      });
    }

    if (user.organization.status !== "ACTIVE") {
      return res.status(403).json({
        status: "error",
        message: "Organization access is currently unavailable.",
      });
    }

    req.essAuth = {
      userId: user.id,
      organizationId: user.organizationId,
      employeeId: user.employee.id,
      email: user.email,
      organization: user.organization,
    };

    next();
  } catch (error) {
    console.error("ESS authentication error:", error);
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "error",
        message: "Your employee portal session is invalid or has expired.",
      });
    }
    return res.status(500).json({
      status: "error",
      message: "Unable to authenticate employee portal request.",
    });
  }
}

function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
    const userPermissions = req.auth.permissions || [];
    const platformPermissionRequested = requiredPermissions.some(isPlatformOnlyPermission);
    if (platformPermissionRequested && req.auth.organization?.slug !== PLATFORM_ORGANIZATION_SLUG) {
      return res.status(403).json({
        status: "error",
        code: "PLATFORM_PERMISSION_FORBIDDEN",
        message: "This action is restricted to Corporate Resources Network platform operations.",
      });
    }
    const hasPermission = requiredPermissions.every(
      (permission) => permissionAllowedForOrganization(req, permission) && userPermissions.includes(permission)
    );
    if (!hasPermission) return res.status(403).json({ status: "error", message: "You do not have permission to perform this action." });
    next();
  };
}

function requireAnyPermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
    const userPermissions = req.auth.permissions || [];
    const hasPermission = requiredPermissions.some(
      (permission) => permissionAllowedForOrganization(req, permission) && userPermissions.includes(permission)
    );
    if (!hasPermission) return res.status(403).json({ status: "error", message: "You do not have permission to perform this action." });
    next();
  };
}

function requireRole(...requiredRoles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
    const userRoles = req.auth.roles || [];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) return res.status(403).json({ status: "error", message: "You do not have the required role to perform this action." });
    next();
  };
}

module.exports = { requireAuth, requireEssAuth, requirePermission, requireAnyPermission, requireRole };
