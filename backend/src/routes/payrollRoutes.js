const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  getPayrollReadiness,
} = require("../services/payrollReadinessService");
const payroll = require("../services/payrollOperationsService");
const nigeriaPayroll = require("../services/nigeriaPayrollComplianceService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const name = String(file.originalname || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return callback(new Error("Upload an Excel .xlsx or .xls file."));
    }
    callback(null, true);
  },
});

router.use(requireAuth);

function sendError(res, error, fallback = "Payroll operation failed.") {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Payroll operation error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

router.get(
  "/readiness",
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const data = await getPayrollReadiness({ organizationId: req.auth.organizationId });
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to load payroll readiness.");
    }
  }
);

router.get("/compliance-policy", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await nigeriaPayroll.getCompliancePolicy({ organizationId: req.auth.organizationId }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll compliance policy.");
  }
});

router.get("/tax-reliefs", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await nigeriaPayroll.listTaxReliefs({
        organizationId: req.auth.organizationId,
        taxYear: req.query?.taxYear || null,
      }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll tax reliefs.");
  }
});

router.post("/tax-reliefs/rent", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await nigeriaPayroll.declareRentRelief({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to record rent relief declaration.");
  }
});

router.patch("/tax-reliefs/:id/decision", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await nigeriaPayroll.decideRentRelief({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reliefId: req.params.id,
      decision: req.body?.decision,
      notes: req.body?.notes,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to decide rent relief declaration.");
  }
});

router.get("/periods", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listPeriods({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll periods.");
  }
});

router.post("/periods", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.createPeriod({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create payroll period.");
  }
});

router.patch("/periods/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.updatePeriodStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      periodId: req.params.id,
      status: req.body?.status,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update payroll period.");
  }
});

router.get("/salary-rates", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listSalaryRates({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load salary rates.");
  }
});

router.post("/salary-rates", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.saveSalaryRate({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to save salary rate.");
  }
});

router.patch("/salary-rates/:id/retire", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.retireSalaryRate({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      rateId: req.params.id,
      effectiveTo: req.body?.effectiveTo,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to retire salary rate.");
  }
});

function salaryTemplateBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["CHRiS Salary Rates Bulk Import"],
      ["One employee per row. Employee Number must already exist in CHRiS."],
      ["Monthly Gross Salary is the authoritative monthly gross compensation amount."],
      ["For ZERMATT, CHRiS splits gross into Basic 57%, Housing 11%, Transport 10%, Meal 9%, Medical 8%, Utility 5%."],
      ["Effective From must use YYYY-MM-DD. Effective To is optional."],
      ["Existing overlapping active rates are rejected rather than silently overwritten."],
    ]),
    "Instructions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Employee No", "Monthly Gross Salary", "Currency", "Effective From", "Effective To", "Reason"],
      ["ZLL000001", 450000, "NGN", "2026-09-01", "", "Release-1 opening salary authority"],
    ]),
    "Salary Rates"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

router.get("/salary-rates/template", requirePermission("payroll.manage"), async (req, res) => {
  res.setHeader("Content-Disposition", 'attachment; filename="CHRIS_Salary_Rates_Bulk_Template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(salaryTemplateBuffer());
});

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCell(row, names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const match = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(name));
    if (match) return String(match[1] ?? "").trim();
  }
  return "";
}

async function prepareSalaryWorkbook(organizationId, buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => String(name).trim().toLowerCase() === "salary rates") || workbook.SheetNames[0];
  if (!sheetName) throw payroll.operationalError("EMPTY_WORKBOOK", "The workbook does not contain a worksheet.");
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  const employees = await prisma.employee.findMany({
    where: { organizationId },
    select: { employeeNumber: true, firstName: true, middleName: true, lastName: true },
  });
  const employeeMap = new Map(employees.map((row) => [row.employeeNumber.toUpperCase(), row]));

  return sourceRows.map((row, index) => {
    const employeeNumber = getCell(row, ["Employee No", "Employee Number", "Employee ID"]).toUpperCase();
    const amountRaw = getCell(row, ["Monthly Gross Salary", "Gross Salary", "Monthly Gross"]);
    const currency = (getCell(row, ["Currency"]) || "NGN").toUpperCase();
    const effectiveFrom = getCell(row, ["Effective From", "Start Date"]);
    const effectiveTo = getCell(row, ["Effective To", "End Date"]);
    const reason = getCell(row, ["Reason", "Notes"]);
    const employee = employeeMap.get(employeeNumber);
    const amount = Number(String(amountRaw).replace(/,/g, ""));
    const errors = [];
    if (!employeeNumber || !employee) errors.push("Employee Number was not found in this organization.");
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Monthly Gross Salary must be greater than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.push("Effective From must use YYYY-MM-DD.");
    if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) errors.push("Effective To must use YYYY-MM-DD when supplied.");
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) errors.push("Effective To cannot be earlier than Effective From.");
    return {
      rowNumber: index + 2,
      valid: errors.length === 0,
      errors,
      input: errors.length ? null : { employeeNumber, amount, currency, effectiveFrom, effectiveTo, reason },
      display: {
        employeeNumber,
        employeeName: employee ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ") : "",
        amount: Number.isFinite(amount) ? amount : amountRaw,
        currency,
        effectiveFrom,
        effectiveTo,
      },
    };
  });
}

router.post("/salary-rates/bulk/preview", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to validate.");
    const rows = await prepareSalaryWorkbook(req.auth.organizationId, req.file.buffer);
    return res.json({
      status: "success",
      data: {
        rows,
        totalRows: rows.length,
        validRows: rows.filter((row) => row.valid).length,
        invalidRows: rows.filter((row) => !row.valid).length,
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to validate salary rates workbook.");
  }
});

router.post("/salary-rates/bulk/import", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to import.");
    const rows = await prepareSalaryWorkbook(req.auth.organizationId, req.file.buffer);
    const results = [];
    for (const row of rows) {
      if (!row.valid) {
        results.push({ rowNumber: row.rowNumber, success: false, employee: row.display, errors: row.errors });
        continue;
      }
      try {
        const created = await payroll.saveSalaryRate({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          input: row.input,
        });
        results.push({ rowNumber: row.rowNumber, success: true, employee: created, errors: [] });
      } catch (error) {
        results.push({ rowNumber: row.rowNumber, success: false, employee: row.display, errors: [error.message || "Unable to save salary rate."] });
      }
    }
    return res.status(207).json({
      status: "success",
      message: "Salary rate import completed with row-level results.",
      data: {
        results,
        created: results.filter((row) => row.success).length,
        failed: results.filter((row) => !row.success).length,
        total: results.length,
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to import salary rates.");
  }
});

for (const [path, kind] of [["allowances", "ALLOWANCE"], ["deductions", "DEDUCTION"]]) {
  router.get(`/${path}`, requirePermission("payroll.view"), async (req, res) => {
    try {
      return res.json({ status: "success", data: await payroll.listComponents({ organizationId: req.auth.organizationId, kind }) });
    } catch (error) {
      return sendError(res, error, `Unable to load ${path}.`);
    }
  });
  router.post(`/${path}`, requirePermission("payroll.manage"), async (req, res) => {
    try {
      const data = await payroll.saveComponent({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        kind,
        input: req.body || {},
      });
      return res.status(201).json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, `Unable to save ${kind.toLowerCase()}.`);
    }
  });
}

router.patch("/components/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.updateComponentStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      componentId: req.params.id,
      status: req.body?.status,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update payroll component.");
  }
});

router.get("/salary-advances", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listSalaryAdvances({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load salary advances.");
  }
});

router.post("/salary-advances", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.createSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create salary advance.");
  }
});

router.patch("/salary-advances/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.updateSalaryAdvanceStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      advanceId: req.params.id,
      status: req.body?.status,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update salary advance.");
  }
});

router.get("/paid-leave", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await payroll.listPaidLeave({ organizationId: req.auth.organizationId, periodId: req.query?.periodId || null }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to load paid leave payroll inputs.");
  }
});

router.get("/runs", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listRuns({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll runs.");
  }
});

router.get("/runs/:id/lines", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listRunLines({ organizationId: req.auth.organizationId, runId: req.params.id }) });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll run lines.");
  }
});

router.post("/runs/draft", requirePermission("payroll.process"), async (req, res) => {
  try {
    const readiness = await getPayrollReadiness({ organizationId: req.auth.organizationId });
    if (!readiness.executionEnabled) {
      const incompleteEmployees = (readiness.employees || [])
        .filter((employee) => !employee.readyForExecution)
        .slice(0, 25)
        .map((employee) => ({ employeeNumber: employee.employeeNumber, blockers: employee.blockers }));
      throw payroll.operationalError(
        "PAYROLL_EXECUTION_READINESS_INCOMPLETE",
        `${Math.max(0, Number(readiness.summary?.currentEmployees || 0) - Number(readiness.summary?.readyForExecution || 0))} current employee(s) are not ready for draft payroll execution.`,
        409,
        { employees: incompleteEmployees }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: req.auth.organizationId },
      select: { country: true, slug: true },
    });
    const isNigeriaPayroll = String(organization?.country || "").trim().toLowerCase() === "nigeria" || organization?.slug === "zermatt-liquor-limited";
    const data = isNigeriaPayroll
      ? await nigeriaPayroll.executeNigeriaDraftPayroll({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          periodId: req.body?.periodId,
        })
      : await payroll.executeDraftPayroll({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          periodId: req.body?.periodId,
        });

    return res.status(201).json({
      status: "success",
      message: isNigeriaPayroll
        ? "Draft payroll calculated with the effective Nigeria PAYE/pension policy. No payment instruction has been posted."
        : "Draft payroll calculated. No payment instruction has been posted.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to calculate draft payroll.");
  }
});

router.post("/runs/:id/submit", requirePermission("payroll.process"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await payroll.submitPayrollRun({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        runId: req.params.id,
        notes: req.body?.notes,
      }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to submit payroll run.");
  }
});

router.post("/runs/:id/decision", requirePermission("payroll.manage"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await payroll.decidePayrollRun({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        runId: req.params.id,
        decision: req.body?.decision,
        statutoryReviewed: req.body?.statutoryReviewed === true,
        notes: req.body?.notes,
      }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to decide payroll run.");
  }
});

router.get("/approvals", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({ status: "success", data: await payroll.listApprovals({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll approvals.");
  }
});

router.get("/payslips", requirePermission("payroll.view"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await payroll.listRunLines({ organizationId: req.auth.organizationId, runId: req.query?.runId || null }),
      control: "Payslips reflect the payroll-run calculation and approval state. Bank/payment transmission remains a separate controlled process.",
    });
  } catch (error) {
    return sendError(res, error, "Unable to load payslips.");
  }
});

module.exports = router;
