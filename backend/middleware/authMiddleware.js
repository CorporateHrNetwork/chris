const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required.",
      });
    }

    const token = authorization.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        organizationId: decoded.organizationId,
        isActive: true,
      },
      include: {
        organization: true,
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
        message: "User account is unavailable.",
      });
    }

    if (user.organization.status !== "ACTIVE") {
      return res.status(403).json({
        status: "error",
        message: "Organization access is currently unavailable.",
      });
    }

    req.auth = {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      organization: user.organization,
      roles: user.userRoles.map(
        (userRole) => userRole.role.name
      ),
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Your session is invalid or has expired.",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Unable to authenticate request.",
    });
  }
}

module.exports = {
  requireAuth,
};