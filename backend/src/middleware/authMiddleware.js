const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Authentication required." });
    }
    const token = authorization.split(" ")[1];
    if (!token) return res.status(401).json({ status: "error", message: "Authentication required." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

    const requestedLocationId = String(req.headers["x-chris-location-id"] || "").trim() || null;
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
    if (requestedLocationId && !availableLocations.some((location) => location.id === requestedLocationId)) {
      return res.status(403).json({
        status: "error",
        code: "LOCATION_SCOPE_FORBIDDEN",
        message: "You do not have access to the selected CHRiS branch/location.",
      });
    }

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
      // Null activeLocationId means consolidated Head Office / organization-wide context
      // and is only valid for ALL_LOCATIONS users.
      consolidatedHeadOffice: user.locationScope === "ALL_LOCATIONS" && !requestedLocationId,
    };

    if (user.locationScope === "ASSIGNED_LOCATIONS" && !requestedLocationId && availableLocations.length === 1) {
      req.auth.activeLocationId = availableLocations[0].id;
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

function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
    const userPermissions = req.auth.permissions || [];
    const hasPermission = requiredPermissions.every((permission) => userPermissions.includes(permission));
    if (!hasPermission) return res.status(403).json({ status: "error", message: "You do not have permission to perform this action." });
    next();
  };
}

function requireAnyPermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
    const userPermissions = req.auth.permissions || [];
    const hasPermission = requiredPermissions.some((permission) => userPermissions.includes(permission));
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

module.exports = { requireAuth, requirePermission, requireAnyPermission, requireRole };
