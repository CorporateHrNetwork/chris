const express = require("express");
const prisma = require("../config/prisma");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        department: true,
        designation: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      status: "success",
      results: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error("Employee fetch error:", error);

    res.status(500).json({
      status: "error",
      message: "Unable to fetch employees",
    });
  }
});

module.exports = router;