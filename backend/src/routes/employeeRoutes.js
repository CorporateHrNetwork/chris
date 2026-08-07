const express = require("express");
const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
EMPLOYEE ROUTES
============================================================

All employee routes require authentication.

Tenant isolation:
The organization is obtained from the authenticated CHRIS
user through req.auth.organizationId.

Authorization:
Each route also requires the appropriate employee permission.
*/

router.use(requireAuth);

/*
============================================================
GET ALL EMPLOYEES
Permission: employees.view
============================================================
*/
router.get(
  "/",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const employees =
        await prisma.employee.findMany({
          where: {
            organizationId,
          },

          include: {
            department: true,
            designation: true,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      return res.status(200).json({
        status: "success",
        results: employees.length,
        data: employees,
      });
    } catch (error) {
      console.error(
        "Employee fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch employees.",
      });
    }
  }
);

/*
============================================================
GET ONE EMPLOYEE BY EMPLOYEE NUMBER
Permission: employees.view
============================================================
*/
router.get(
  "/:employeeNumber",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const employee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },

          include: {
            department: true,
            designation: true,
          },
        });

      if (!employee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      return res.status(200).json({
        status: "success",
        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee profile fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch employee profile.",
      });
    }
  }
);

/*
============================================================
UPDATE EMPLOYEE
Permission: employees.update
============================================================
*/
router.put(
  "/:employeeNumber",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        name,
        department,
        designation,
        email,
        phone,
        status,
        hireDate,
        confirmationDate,
        exitDate,
      } = req.body;

      if (
        !name?.trim() ||
        !department?.trim() ||
        !designation?.trim() ||
        !email?.trim() ||
        !phone?.trim()
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Please complete all required employee fields.",
        });
      }

      const existingEmployee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },
        });

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const duplicateEmail =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            email:
              normalizedEmail,

            NOT: {
              id:
                existingEmployee.id,
            },
          },
        });

      if (duplicateEmail) {
        return res.status(409).json({
          status: "error",

          message:
            "Another employee already uses this email address.",
        });
      }

      const nameParts =
        name
          .trim()
          .split(/\s+/);

      if (
        nameParts.length < 2
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Please enter at least a first and last name.",
        });
      }

      const firstName =
        nameParts[0];

      const lastName =
        nameParts[
          nameParts.length - 1
        ];

      const middleName =
        nameParts.length > 2
          ? nameParts
              .slice(1, -1)
              .join(" ")
          : null;

      const departmentRecord =
        await prisma.department.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                department.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              department.trim(),
          },
        });

      const designationRecord =
        await prisma.designation.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                designation.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              designation.trim(),
          },
        });

      const statusMap = {
        Active: "ACTIVE",
        Probation: "PROBATION",
        Leave: "LEAVE",
        Suspended: "SUSPENDED",
        Terminated: "TERMINATED",
        Resigned: "RESIGNED",
        Retired: "RETIRED",
        Inactive: "INACTIVE",
      };

      const employee =
        await prisma.employee.update({
          where: {
            id:
              existingEmployee.id,
          },

          data: {
            departmentId:
              departmentRecord.id,

            designationId:
              designationRecord.id,

            firstName,
            middleName,
            lastName,

            email:
              normalizedEmail,

            phone:
              phone.trim(),

            status:
              statusMap[status] ||
              existingEmployee.status,

            hireDate:
              hireDate
                ? new Date(
                    hireDate
                  )
                : null,

            confirmationDate:
              confirmationDate
                ? new Date(
                    confirmationDate
                  )
                : null,

            exitDate:
              exitDate
                ? new Date(
                    exitDate
                  )
                : null,
          },

          include: {
            department: true,
            designation: true,
          },
        });

      return res.status(200).json({
        status: "success",

        message:
          "Employee updated successfully.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee update error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to update employee.",
      });
    }
  }
);

/*
============================================================
CREATE EMPLOYEE
Permission: employees.create
============================================================
*/
router.post(
  "/",
  requirePermission(
    "employees.create"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        name,
        department,
        designation,
        email,
        phone,
        status = "Active",
      } = req.body;

      if (
        !name?.trim() ||
        !department?.trim() ||
        !designation?.trim() ||
        !email?.trim() ||
        !phone?.trim()
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Please complete all required employee fields.",
        });
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const duplicateEmail =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            email:
              normalizedEmail,
          },
        });

      if (duplicateEmail) {
        return res.status(409).json({
          status: "error",

          message:
            "An employee with this email address already exists.",
        });
      }

      const nameParts =
        name
          .trim()
          .split(/\s+/);

      if (
        nameParts.length < 2
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Please enter at least the employee's first and last name.",
        });
      }

      const firstName =
        nameParts[0];

      const lastName =
        nameParts[
          nameParts.length - 1
        ];

      const middleName =
        nameParts.length > 2
          ? nameParts
              .slice(1, -1)
              .join(" ")
          : null;

      const departmentRecord =
        await prisma.department.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                department.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              department.trim(),
          },
        });

      const designationRecord =
        await prisma.designation.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                designation.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              designation.trim(),
          },
        });

      /*
      --------------------------------------------------------
      GENERATE NEXT EMPLOYEE NUMBER
      --------------------------------------------------------
      */

      const latestEmployee =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            employeeNumber: {
              startsWith: "CHR",
            },
          },

          orderBy: {
            employeeNumber:
              "desc",
          },

          select: {
            employeeNumber: true,
          },
        });

      let nextNumber = 1;

      if (
        latestEmployee?.employeeNumber
      ) {
        const numericPart =
          Number(
            latestEmployee.employeeNumber.replace(
              /\D/g,
              ""
            )
          );

        if (
          Number.isFinite(
            numericPart
          )
        ) {
          nextNumber =
            numericPart + 1;
        }
      }

      const employeeNumber =
        `CHR${String(
          nextNumber
        ).padStart(6, "0")}`;

      const statusMap = {
        Active: "ACTIVE",
        Probation: "PROBATION",
        Leave: "LEAVE",
        Suspended: "SUSPENDED",
        Terminated: "TERMINATED",
        Resigned: "RESIGNED",
        Retired: "RETIRED",
        Inactive: "INACTIVE",
      };

      const employee =
        await prisma.employee.create({
          data: {
            organizationId,

            departmentId:
              departmentRecord.id,

            designationId:
              designationRecord.id,

            employeeNumber,

            firstName,
            middleName,
            lastName,

            email:
              normalizedEmail,

            phone:
              phone.trim(),

            status:
              statusMap[status] ||
              "ACTIVE",
          },

          include: {
            department: true,
            designation: true,
          },
        });

      return res.status(201).json({
        status: "success",

        message:
          "Employee created successfully.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee creation error:",
        error
      );

      if (
        error.code === "P2002"
      ) {
        return res.status(409).json({
          status: "error",

          message:
            "The employee could not be created because a unique employee record already exists.",
        });
      }

      return res.status(500).json({
        status: "error",

        message:
          "Unable to create employee.",
      });
    }
  }
);

module.exports = router;