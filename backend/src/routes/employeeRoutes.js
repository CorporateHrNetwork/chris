const express = require("express");
const prisma = require("../config/prisma");

const router = express.Router();

const DEV_ORGANIZATION_SLUG = "corporatehr-network";

/*
  GET ALL EMPLOYEES

  Temporary tenant resolution:
  Until authentication is implemented, CHRIS uses the seeded
  CorporateHr Network organization as the development tenant.

  This will later be replaced by authenticated tenant context.
*/
router.get("/", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: {
        slug: DEV_ORGANIZATION_SLUG,
      },
    });

    if (!organization) {
      return res.status(404).json({
        status: "error",
        message: "Development organization not found.",
      });
    }

    const employees = await prisma.employee.findMany({
      where: {
        organizationId: organization.id,
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
    console.error("Employee fetch error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch employees.",
    });
  }
});

/*
  GET ONE EMPLOYEE PROFILE BY EMPLOYEE NUMBER
*/
router.get("/:employeeNumber", async (req, res) => {
  try {
    const { employeeNumber } = req.params;

    const organization = await prisma.organization.findUnique({
      where: {
        slug: DEV_ORGANIZATION_SLUG,
      },
    });

    if (!organization) {
      return res.status(404).json({
        status: "error",
        message: "Development organization not found.",
      });
    }

    const employee = await prisma.employee.findFirst({
      where: {
        organizationId: organization.id,
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
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      data: employee,
    });
  } catch (error) {
    console.error("Employee profile fetch error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch employee profile.",
    });
  }
});

/*
  CREATE EMPLOYEE
*/
router.post("/", async (req, res) => {
  try {
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
        message: "Please complete all required employee fields.",
      });
    }

    const organization = await prisma.organization.findUnique({
      where: {
        slug: DEV_ORGANIZATION_SLUG,
      },
    });

    if (!organization) {
      return res.status(404).json({
        status: "error",
        message: "Development organization not found.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const duplicateEmail = await prisma.employee.findFirst({
      where: {
        organizationId: organization.id,
        email: normalizedEmail,
      },
    });

    if (duplicateEmail) {
      return res.status(409).json({
        status: "error",
        message: "An employee with this email address already exists.",
      });
    }

    const nameParts = name.trim().split(/\s+/);

    if (nameParts.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Please enter at least the employee's first and last name.",
      });
    }

    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    const middleName =
      nameParts.length > 2
        ? nameParts.slice(1, -1).join(" ")
        : null;

    const departmentRecord = await prisma.department.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: department.trim(),
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: department.trim(),
      },
    });

    const designationRecord = await prisma.designation.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: designation.trim(),
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: designation.trim(),
      },
    });

    const latestEmployee = await prisma.employee.findFirst({
      where: {
        organizationId: organization.id,
        employeeNumber: {
          startsWith: "CHR",
        },
      },
      orderBy: {
        employeeNumber: "desc",
      },
      select: {
        employeeNumber: true,
      },
    });

    let nextNumber = 1;

    if (latestEmployee?.employeeNumber) {
      const numericPart = Number(
        latestEmployee.employeeNumber.replace(/\D/g, "")
      );

      if (Number.isFinite(numericPart)) {
        nextNumber = numericPart + 1;
      }
    }

    const employeeNumber = `CHR${String(nextNumber).padStart(6, "0")}`;

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

    const employee = await prisma.employee.create({
      data: {
        organizationId: organization.id,
        departmentId: departmentRecord.id,
        designationId: designationRecord.id,

        employeeNumber,

        firstName,
        middleName,
        lastName,

        email: normalizedEmail,
        phone: phone.trim(),

        status: statusMap[status] || "ACTIVE",
      },
      include: {
        department: true,
        designation: true,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Employee created successfully.",
      data: employee,
    });
  } catch (error) {
    console.error("Employee creation error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        status: "error",
        message:
          "The employee could not be created because a unique employee record already exists.",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Unable to create employee.",
    });
  }
});

module.exports = router;