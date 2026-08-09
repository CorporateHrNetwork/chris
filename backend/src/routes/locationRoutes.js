const express = require("express");

const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
VALID LOCATION TYPES
============================================================
*/

const LOCATION_TYPES = [
  "HEAD_OFFICE",
  "BRANCH",
  "OFFICE",
  "SITE",
];

/*
============================================================
HELPERS
============================================================
*/

function normalizeOptionalText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized || null;
}

function normalizeCode(value) {
  const normalized =
    normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  return normalized.toUpperCase();
}

function formatLocation(location) {
  return {
    id: location.id,

    organizationId:
      location.organizationId,

    name: location.name,

    code: location.code,

    type: location.type,

    addressLine1:
      location.addressLine1,

    addressLine2:
      location.addressLine2,

    city: location.city,

    state: location.state,

    country: location.country,

    phone: location.phone,

    email: location.email,

    isActive: location.isActive,

    employeeCount:
      location._count?.employees ??
      0,

    assignedUserCount:
      location._count
        ?.userLocations ??
      0,

    createdAt:
      location.createdAt,

    updatedAt:
      location.updatedAt,
  };
}

/*
============================================================
AUTHENTICATION
============================================================
*/

router.use(requireAuth);

/*
============================================================
GET ALL ORGANIZATION LOCATIONS
============================================================
*/

router.get(
  "/",
  requirePermission(
    "settings.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const locations =
        await prisma.organizationLocation.findMany({
          where: {
            organizationId,
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },

          orderBy: [
            {
              type: "asc",
            },
            {
              name: "asc",
            },
          ],
        });

      return res
        .status(200)
        .json({
          status: "success",

          results:
            locations.length,

          data:
            locations.map(
              formatLocation
            ),
        });
    } catch (error) {
      console.error(
        "Location fetch error:",
        error
      );

      return res
        .status(500)
        .json({
          status: "error",

          message:
            "Unable to fetch CHRIS organization locations.",
        });
    }
  }
);

/*
============================================================
GET ONE ORGANIZATION LOCATION
============================================================
*/

router.get(
  "/:locationId",
  requirePermission(
    "settings.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        locationId,
      } = req.params;

      const location =
        await prisma.organizationLocation.findFirst({
          where: {
            id: locationId,

            organizationId,
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },
        });

      if (!location) {
        return res
          .status(404)
          .json({
            status: "error",

            message:
              "CHRIS location not found.",
          });
      }

      return res
        .status(200)
        .json({
          status: "success",

          data:
            formatLocation(
              location
            ),
        });
    } catch (error) {
      console.error(
        "Location detail error:",
        error
      );

      return res
        .status(500)
        .json({
          status: "error",

          message:
            "Unable to fetch CHRIS location details.",
        });
    }
  }
);

/*
============================================================
CREATE ORGANIZATION LOCATION
============================================================
*/

router.post(
  "/",
  requirePermission(
    "settings.manage"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        name,
        code,
        type,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        phone,
        email,
      } = req.body;

      const normalizedName =
        normalizeOptionalText(
          name
        );

      const normalizedCode =
        normalizeCode(
          code
        );

      const normalizedType =
        normalizeOptionalText(
          type
        ) || "BRANCH";

      if (!normalizedName) {
        return res
          .status(400)
          .json({
            status: "error",

            message:
              "Location name is required.",
          });
      }

      if (
        !LOCATION_TYPES.includes(
          normalizedType
        )
      ) {
        return res
          .status(400)
          .json({
            status: "error",

            message:
              "Invalid location type.",
          });
      }

      /*
      ----------------------------------------------------------
      PREVENT DUPLICATE LOCATION NAME
      ----------------------------------------------------------
      */

      const existingName =
        await prisma.organizationLocation.findFirst({
          where: {
            organizationId,

            name: {
              equals:
                normalizedName,

              mode:
                "insensitive",
            },
          },

          select: {
            id: true,
          },
        });

      if (existingName) {
        return res
          .status(409)
          .json({
            status: "error",

            message:
              "A location with this name already exists.",
          });
      }

      /*
      ----------------------------------------------------------
      PREVENT DUPLICATE LOCATION CODE
      ----------------------------------------------------------
      */

      if (normalizedCode) {
        const existingCode =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              code:
                normalizedCode,
            },

            select: {
              id: true,
            },
          });

        if (existingCode) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                "A location with this code already exists.",
            });
        }
      }

      /*
      ----------------------------------------------------------
      ONLY ONE ACTIVE HEAD OFFICE PER ORGANIZATION
      ----------------------------------------------------------
      */

      if (
        normalizedType ===
        "HEAD_OFFICE"
      ) {
        const existingHeadOffice =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              type:
                "HEAD_OFFICE",

              isActive:
                true,
            },

            select: {
              id: true,
              name: true,
            },
          });

        if (existingHeadOffice) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                `This organization already has an active Head Office: ${existingHeadOffice.name}.`,
            });
        }
      }

      const location =
        await prisma.organizationLocation.create({
          data: {
            organizationId,

            name:
              normalizedName,

            code:
              normalizedCode,

            type:
              normalizedType,

            addressLine1:
              normalizeOptionalText(
                addressLine1
              ),

            addressLine2:
              normalizeOptionalText(
                addressLine2
              ),

            city:
              normalizeOptionalText(
                city
              ),

            state:
              normalizeOptionalText(
                state
              ),

            country:
              normalizeOptionalText(
                country
              ),

            phone:
              normalizeOptionalText(
                phone
              ),

            email:
              normalizeOptionalText(
                email
              ),

            isActive:
              true,
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },
        });

      return res
        .status(201)
        .json({
          status: "success",

          message:
            "CHRIS location created successfully.",

          data:
            formatLocation(
              location
            ),
        });
    } catch (error) {
      console.error(
        "Location create error:",
        error
      );

      return res
        .status(500)
        .json({
          status: "error",

          message:
            "Unable to create CHRIS location.",
        });
    }
  }
);

/*
============================================================
UPDATE ORGANIZATION LOCATION
============================================================
*/

router.put(
  "/:locationId",
  requirePermission(
    "settings.manage"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        locationId,
      } = req.params;

      const existingLocation =
        await prisma.organizationLocation.findFirst({
          where: {
            id: locationId,

            organizationId,
          },
        });

      if (!existingLocation) {
        return res
          .status(404)
          .json({
            status: "error",

            message:
              "CHRIS location not found.",
          });
      }

      const {
        name,
        code,
        type,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        phone,
        email,
      } = req.body;

      const normalizedName =
        normalizeOptionalText(
          name
        );

      const normalizedCode =
        normalizeCode(
          code
        );

      const normalizedType =
        normalizeOptionalText(
          type
        );

      if (!normalizedName) {
        return res
          .status(400)
          .json({
            status: "error",

            message:
              "Location name is required.",
          });
      }

      if (
        !normalizedType ||
        !LOCATION_TYPES.includes(
          normalizedType
        )
      ) {
        return res
          .status(400)
          .json({
            status: "error",

            message:
              "Invalid location type.",
          });
      }

      /*
      ----------------------------------------------------------
      DUPLICATE NAME CHECK
      ----------------------------------------------------------
      */

      const duplicateName =
        await prisma.organizationLocation.findFirst({
          where: {
            organizationId,

            id: {
              not:
                existingLocation.id,
            },

            name: {
              equals:
                normalizedName,

              mode:
                "insensitive",
            },
          },

          select: {
            id: true,
          },
        });

      if (duplicateName) {
        return res
          .status(409)
          .json({
            status: "error",

            message:
              "A location with this name already exists.",
          });
      }

      /*
      ----------------------------------------------------------
      DUPLICATE CODE CHECK
      ----------------------------------------------------------
      */

      if (normalizedCode) {
        const duplicateCode =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              id: {
                not:
                  existingLocation.id,
              },

              code:
                normalizedCode,
            },

            select: {
              id: true,
            },
          });

        if (duplicateCode) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                "A location with this code already exists.",
            });
        }
      }

      /*
      ----------------------------------------------------------
      HEAD OFFICE SAFEGUARD
      ----------------------------------------------------------
      */

      if (
        normalizedType ===
          "HEAD_OFFICE" &&
        existingLocation.type !==
          "HEAD_OFFICE"
      ) {
        const existingHeadOffice =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              type:
                "HEAD_OFFICE",

              isActive:
                true,

              id: {
                not:
                  existingLocation.id,
              },
            },

            select: {
              id: true,
              name: true,
            },
          });

        if (existingHeadOffice) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                `This organization already has an active Head Office: ${existingHeadOffice.name}.`,
            });
        }
      }

      const location =
        await prisma.organizationLocation.update({
          where: {
            id:
              existingLocation.id,
          },

          data: {
            name:
              normalizedName,

            code:
              normalizedCode,

            type:
              normalizedType,

            addressLine1:
              normalizeOptionalText(
                addressLine1
              ),

            addressLine2:
              normalizeOptionalText(
                addressLine2
              ),

            city:
              normalizeOptionalText(
                city
              ),

            state:
              normalizeOptionalText(
                state
              ),

            country:
              normalizeOptionalText(
                country
              ),

            phone:
              normalizeOptionalText(
                phone
              ),

            email:
              normalizeOptionalText(
                email
              ),
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },
        });

      return res
        .status(200)
        .json({
          status: "success",

          message:
            "CHRIS location updated successfully.",

          data:
            formatLocation(
              location
            ),
        });
    } catch (error) {
      console.error(
        "Location update error:",
        error
      );

      return res
        .status(500)
        .json({
          status: "error",

          message:
            "Unable to update CHRIS location.",
        });
    }
  }
);

/*
============================================================
ACTIVATE / DEACTIVATE LOCATION
============================================================
*/

router.patch(
  "/:locationId/status",
  requirePermission(
    "settings.manage"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        locationId,
      } = req.params;

      const {
        isActive,
      } = req.body;

      if (
        typeof isActive !==
        "boolean"
      ) {
        return res
          .status(400)
          .json({
            status: "error",

            message:
              "isActive must be true or false.",
          });
      }

      const location =
        await prisma.organizationLocation.findFirst({
          where: {
            id: locationId,

            organizationId,
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },
        });

      if (!location) {
        return res
          .status(404)
          .json({
            status: "error",

            message:
              "CHRIS location not found.",
          });
      }

      /*
      ----------------------------------------------------------
      PROTECT ACTIVE HEAD OFFICE

      Before a Head Office can be deactivated, another active
      Head Office must exist.

      This prevents an organization from accidentally ending
      up with no operational Head Office.
      ----------------------------------------------------------
      */

      if (
        location.type ===
          "HEAD_OFFICE" &&
        location.isActive &&
        !isActive
      ) {
        const alternateHeadOffice =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              type:
                "HEAD_OFFICE",

              isActive:
                true,

              id: {
                not:
                  location.id,
              },
            },

            select: {
              id: true,
            },
          });

        if (!alternateHeadOffice) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                "The organization's only active Head Office cannot be deactivated.",
            });
        }
      }

      /*
      ----------------------------------------------------------
      REACTIVATING HEAD OFFICE SAFEGUARD
      ----------------------------------------------------------
      */

      if (
        location.type ===
          "HEAD_OFFICE" &&
        !location.isActive &&
        isActive
      ) {
        const activeHeadOffice =
          await prisma.organizationLocation.findFirst({
            where: {
              organizationId,

              type:
                "HEAD_OFFICE",

              isActive:
                true,

              id: {
                not:
                  location.id,
              },
            },

            select: {
              id: true,
              name: true,
            },
          });

        if (activeHeadOffice) {
          return res
            .status(409)
            .json({
              status: "error",

              message:
                `This organization already has an active Head Office: ${activeHeadOffice.name}.`,
            });
        }
      }

      const updatedLocation =
        await prisma.organizationLocation.update({
          where: {
            id:
              location.id,
          },

          data: {
            isActive,
          },

          include: {
            _count: {
              select: {
                employees: true,
                userLocations: true,
              },
            },
          },
        });

      return res
        .status(200)
        .json({
          status: "success",

          message:
            isActive
              ? "CHRIS location activated successfully."
              : "CHRIS location deactivated successfully.",

          data:
            formatLocation(
              updatedLocation
            ),
        });
    } catch (error) {
      console.error(
        "Location status error:",
        error
      );

      return res
        .status(500)
        .json({
          status: "error",

          message:
            "Unable to update CHRIS location status.",
        });
    }
  }
);

module.exports = router;