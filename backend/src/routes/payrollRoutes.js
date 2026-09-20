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
const {
  validateNigeriaPayrollApproval,
} = require("../services/payrollApprovalComplianceService");
const {
  isZermatt,
  isHeadHr,
} = require("../services/zermattHrFinancialAccessService");
const variablePayroll = require("../services/zermattVariablePayrollService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");

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

function requireZermattHeadHrPayrollAuthority(req, res, next) {
  if (!isZermatt(req) || isHeadHr(req)) return next();
  return res.status(403).json({
    status: "error",
    code: "ZERMATT_HEAD_HR_PAYROLL_AUTHORITY_REQUIRED",
    message: "ZERMATT payroll preparation, processing, execution and approval are restricted to the Head of HR.",
  });
}

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


function rentReliefTemplateBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["CHRiS PAYE Rent Relief Bulk Import"],
      ["Complete one employee per row. Employee Number is preferred; exact Employee Name can be used when Employee Number is unavailable."],
      ["Required fields: Tax Year, Annual Rent Paid and Evidence / Document Reference."],
      ["Imported rows are always saved as PENDING_VERIFICATION. Bulk upload never bypasses HR evidence review."],
      ["A VERIFIED rent-relief record is immutable and cannot be overwritten by bulk upload."],
      ["CHRiS calculates eligible relief from the active payroll policy and uses it in PAYE only after verification."],
      ["After successful import, any existing draft payroll is marked for recalculation."],
    ]),
    "Instructions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Employee No", "Employee Name", "Tax Year", "Annual Rent Paid", "Evidence / Document Reference", "Notes"],
      ["ZLL000001", "Jane Mary Doe", 2026, 1200000, "ZLL-RR-2026-0001", "Rent relief evidence submitted for HR verification."],
    ]),
    "Rent Relief"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function normalizeEmployeeMatchName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

async function prepareRentReliefWorkbook(organizationId, buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName =
    workbook.SheetNames.find((name) => ["rent relief", "rent relief template", "tax evidence register"].includes(String(name).trim().toLowerCase())) ||
    workbook.SheetNames[0];
  if (!sheetName) throw payroll.operationalError("EMPTY_WORKBOOK", "The workbook does not contain a worksheet.");

  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  const employees = await prisma.employee.findMany({
    where: { organizationId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
    orderBy: { employeeNumber: "asc" },
  });

  const employeeByNumber = new Map(
    employees.map((row) => [String(row.employeeNumber || "").trim().toUpperCase(), row])
  );
  const employeesByName = new Map();
  for (const employee of employees) {
    const fullName = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
    const key = normalizeEmployeeMatchName(fullName);
    if (!key) continue;
    const current = employeesByName.get(key) || [];
    current.push(employee);
    employeesByName.set(key, current);
  }

  const existingRows = await prisma.$queryRawUnsafe(
    `SELECT "employeeId","taxYear","status"
       FROM "payroll_tax_reliefs"
      WHERE "organizationId"=$1 AND "reliefType"='RENT'`,
    organizationId
  );
  const existingByEmployeeYear = new Map(
    existingRows.map((row) => [`${row.employeeId}:${Number(row.taxYear)}`, row])
  );

  const seenEmployeeYears = new Set();
  const parsedRows = sourceRows.map((row, index) => {
    const employeeNumberInput = getCell(row, [
      "Employee No",
      "Employee Number",
      "Employee Number*",
      "Employee ID",
    ]).toUpperCase();
    const employeeNameInput = getCell(row, [
      "Employee Name",
      "Employee Name*",
      "Name",
    ]);
    const taxYearRaw = getCell(row, ["Tax Year", "Tax Year*"]);
    const annualRentRaw = getCell(row, [
      "Annual Rent Paid",
      "Annual Rent Paid (₦)",
      "Annual Rent Paid (₦)*",
      "Annual Rent Paid*",
      "Annual Rent",
    ]);
    const evidenceReference = getCell(row, [
      "Evidence / Document Reference",
      "Evidence / Document Reference*",
      "Evidence Reference",
      "Document Reference",
    ]);
    const notes = getCell(row, [
      "Notes",
      "Verification Notes",
      "Verification Notes / HR Notes",
      "Remarks",
    ]);

    const errors = [];
    let employee = employeeNumberInput ? employeeByNumber.get(employeeNumberInput) : null;

    if (!employee && !employeeNumberInput && employeeNameInput) {
      const matches = employeesByName.get(normalizeEmployeeMatchName(employeeNameInput)) || [];
      if (matches.length === 1) employee = matches[0];
      else if (matches.length > 1) errors.push("Employee Name matches more than one CHRiS employee. Add Employee Number.");
    }

    if (!employee) {
      errors.push(
        employeeNumberInput
          ? "Employee Number was not found in this organization."
          : "Employee could not be matched. Add Employee Number or an exact CHRiS Employee Name."
      );
    }

    const taxYear = Number(String(taxYearRaw || "").replace(/,/g, ""));
    if (!Number.isInteger(taxYear) || taxYear < 2026) errors.push("Tax Year must be 2026 or later.");

    const annualRentPaid = Number(String(annualRentRaw || "").replace(/[₦,\s]/g, ""));
    if (annualRentRaw === "" || !Number.isFinite(annualRentPaid) || annualRentPaid < 0) {
      errors.push("Annual Rent Paid is required and must be zero or greater.");
    }

    if (!evidenceReference) errors.push("Evidence / Document Reference is required for bulk rent relief.");

    if (employee && Number.isInteger(taxYear)) {
      const employeeYearKey = `${employee.id}:${taxYear}`;
      if (seenEmployeeYears.has(employeeYearKey)) {
        errors.push("This employee and tax year appear more than once in the workbook.");
      } else {
        seenEmployeeYears.add(employeeYearKey);
      }
      if (existingByEmployeeYear.get(employeeYearKey)?.status === "VERIFIED") {
        errors.push("A VERIFIED rent-relief record already exists and cannot be overwritten.");
      }
    }

    return {
      rowNumber: index + 2,
      employee,
      taxYear,
      annualRentPaid,
      evidenceReference,
      notes,
      errors,
    };
  });

  const taxYears = [...new Set(parsedRows.filter((row) => Number.isInteger(row.taxYear) && row.taxYear >= 2026).map((row) => row.taxYear))];
  const policyPairs = await Promise.all(
    taxYears.map(async (taxYear) => [
      taxYear,
      await nigeriaPayroll.getActivePolicy({
        organizationId,
        asOf: `${taxYear}-12-31`,
      }),
    ])
  );
  const policyByYear = new Map(policyPairs);

  return parsedRows.map((row) => {
    const errors = [...row.errors];
    const policy = policyByYear.get(row.taxYear);
    if (Number.isInteger(row.taxYear) && row.taxYear >= 2026 && !policy) {
      errors.push(`No active Nigeria payroll policy covers tax year ${row.taxYear}.`);
    }
    const rate = Number(policy?.payeRules?.rentReliefRate ?? 20);
    const cap = Number(policy?.payeRules?.rentReliefCap ?? 500000);
    const eligibleRelief = Number.isFinite(row.annualRentPaid)
      ? Math.min(cap, Math.round((row.annualRentPaid * rate / 100) * 100) / 100)
      : 0;
    const employeeName = row.employee
      ? [row.employee.firstName, row.employee.middleName, row.employee.lastName].filter(Boolean).join(" ")
      : "";

    return {
      rowNumber: row.rowNumber,
      valid: errors.length === 0,
      errors,
      input: errors.length
        ? null
        : {
            employeeNumber: row.employee.employeeNumber,
            taxYear: row.taxYear,
            annualRentPaid: row.annualRentPaid,
            evidenceReference: row.evidenceReference,
            notes: row.notes || "Bulk rent relief import — pending HR verification.",
          },
      display: {
        employeeNumber: row.employee?.employeeNumber || "",
        employeeName: employeeName || "",
        taxYear: row.taxYear || "",
        annualRentPaid: Number.isFinite(row.annualRentPaid) ? row.annualRentPaid : "",
        eligibleRelief,
        evidenceReference: row.evidenceReference,
        status: "PENDING_VERIFICATION",
      },
    };
  });
}

router.get(
  "/tax-reliefs/rent/template",
  requirePermission("payroll.manage"),
  requireZermattHeadHrPayrollAuthority,
  async (req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="CHRIS_PAYE_Rent_Relief_Bulk_Template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(rentReliefTemplateBuffer());
  }
);

router.post(
  "/tax-reliefs/rent/bulk/preview",
  requirePermission("payroll.manage"),
  requireZermattHeadHrPayrollAuthority,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to validate.");
      const rows = await prepareRentReliefWorkbook(req.auth.organizationId, req.file.buffer);
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
      return sendError(res, error, "Unable to validate rent relief workbook.");
    }
  }
);

router.post(
  "/tax-reliefs/rent/bulk/import",
  requirePermission("payroll.manage"),
  requireZermattHeadHrPayrollAuthority,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to import.");
      const rows = await prepareRentReliefWorkbook(req.auth.organizationId, req.file.buffer);
      const results = [];

      for (const row of rows) {
        if (!row.valid) {
          results.push({ rowNumber: row.rowNumber, success: false, employee: row.display, errors: row.errors });
          continue;
        }
        try {
          const saved = await nigeriaPayroll.declareRentRelief({
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            input: row.input,
          });
          results.push({ rowNumber: row.rowNumber, success: true, employee: saved, errors: [] });
        } catch (error) {
          results.push({
            rowNumber: row.rowNumber,
            success: false,
            employee: row.display,
            errors: [error.message || "Unable to save rent relief."],
          });
        }
      }

      const imported = results.filter((row) => row.success).length;
      const failed = results.length - imported;
      let payrollDraftFreshness = null;
      if (imported > 0) {
        payrollDraftFreshness = await markDraftRunsRecalculationRequired({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          reason: `${imported} rent-relief record(s) were imported; draft PAYE must be recalculated after verification changes.`,
        });
      }

      return res.status(207).json({
        status: "success",
        message: `${imported} rent-relief record(s) imported for verification. ${failed} row(s) failed.`,
        data: {
          results,
          imported,
          failed,
          total: results.length,
          payrollDraftFreshness,
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to import rent relief workbook.");
    }
  }
);

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

async function assertPayrollInputEmployeeScope(req, employeeNumber) {
  const normalized = String(employeeNumber || "").trim().toUpperCase();
  if (!normalized) throw payroll.operationalError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  const employee = await prisma.employee.findFirst({
    where: { organizationId: req.auth.organizationId, employeeNumber: normalized },
    select: { id: true, employeeNumber: true, locationId: true },
  });
  if (!employee) throw payroll.operationalError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  if (req.auth?.activeLocationId && employee.locationId !== req.auth.activeLocationId) {
    throw payroll.operationalError("PAYROLL_INPUT_ACTIVE_BRANCH_MISMATCH", "The selected employee does not belong to the active branch.", 403);
  }
  if (req.auth?.locationScope !== "ALL_LOCATIONS") {
    const allowed = new Set((req.auth?.availableLocations || []).map((location) => location.id).filter(Boolean));
    if (!employee.locationId || !allowed.has(employee.locationId)) {
      throw payroll.operationalError("PAYROLL_INPUT_LOCATION_ACCESS_DENIED", "The selected employee is outside your assigned branch/location scope.", 403);
    }
  }
  return employee;
}

router.get("/variable-components", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await variablePayroll.listVariableComponents({
      organizationId: req.auth.organizationId,
      kind: req.query?.kind,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load variable payroll component catalogue.");
  }
});

router.post("/variable-components", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await variablePayroll.createVariableComponent({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      kind: req.body?.kind,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create payroll component.");
  }
});

router.get("/variable-inputs", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await variablePayroll.listVariableInputs({
      organizationId: req.auth.organizationId,
      kind: req.query?.kind || null,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load variable payroll inputs.");
  }
});

router.post("/variable-inputs", requirePermission("payroll.manage"), async (req, res) => {
  try {
    await assertPayrollInputEmployeeScope(req, req.body?.employeeNumber);
    const data = await variablePayroll.createVariableInput({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `${req.body?.componentCode || "Variable payroll input"} changed for ${req.body?.employeeNumber || "employee"}; draft payroll must be recalculated.`,
    });
    return res.status(201).json({
      status: "success",
      message: "Payroll input saved. Any existing draft payroll is marked for recalculation.",
      data: { input: data, payrollDraftFreshness: freshness },
    });
  } catch (error) {
    return sendError(res, error, "Unable to save payroll input.");
  }
});

router.get("/deduction-plans", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await variablePayroll.listDeductionPlans({ organizationId: req.auth.organizationId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load recurring deduction schedules.");
  }
});

router.post("/deduction-plans", requirePermission("payroll.manage"), async (req, res) => {
  try {
    await assertPayrollInputEmployeeScope(req, req.body?.employeeNumber);
    const data = await variablePayroll.createDeductionPlan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Recurring deduction ${req.body?.componentCode || ""} was scheduled for ${req.body?.employeeNumber || "employee"}; affected draft payroll must be recalculated.`,
    });
    return res.status(201).json({
      status: "success",
      message: "Recurring deduction schedule created. It will stop automatically after the final mapped payroll month.",
      data: { plan: data, payrollDraftFreshness: freshness },
    });
  } catch (error) {
    return sendError(res, error, "Unable to create recurring deduction schedule.");
  }
});

function variableInputTemplateBuffer(kind) {
  const normalizedKind = String(kind || "ALLOWANCE").trim().toUpperCase() === "DEDUCTION" ? "DEDUCTION" : "ALLOWANCE";
  const workbook = XLSX.utils.book_new();
  const instructions = normalizedKind === "DEDUCTION"
    ? [
        ["CHRiS Variable Deductions Bulk Import"],
        ["Use ONE_TIME for a deduction that applies only to one payroll period."],
        ["Use RECURRING for a finite installment plan. Enter Total Amount and either Number of Installments or Installment Amount."],
        ["Recurring schedules begin from Start Payroll Period and automatically stop after the final installment month."],
        ["Component Code must exist in the Other Deductions catalogue."],
      ]
    : [
        ["CHRiS Variable Allowances Bulk Import"],
        ["Allowances are payroll-period inputs."],
        ["For Bonus and Previous Payroll Short-pay enter Amount."],
        ["For Previous Month Outstanding, Public Holiday and Extra Day Overtime enter Quantity as days."],
        ["For Extra Hour Overtime enter Quantity as hours. CHRiS uses Gross/208 × Hours × 1.25."],
        ["Component Code must exist in the Other Allowances catalogue."],
      ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), "Instructions");
  const headers = [
    "Employee No", "Kind", "Component Code", "Frequency", "Payroll Period", "Amount", "Quantity",
    "Reference Payroll Period", "Total Amount", "Schedule By", "Number of Installments",
    "Installment Amount", "Start Payroll Period", "Reference", "Remarks"
  ];
  const examples = normalizedKind === "DEDUCTION"
    ? [
        ["ZLL000001", "DEDUCTION", "DED-BBSB", "RECURRING", "", "", "", "", 30000, "INSTALLMENT_COUNT", 3, "", "2026-09", "BBS-001", "September to November"],
        ["ZLL000002", "DEDUCTION", "DED-ZSB", "ONE_TIME", "2026-09", 12500, "", "", "", "", "", "", "", "ZSB-001", "September sales bill"],
      ]
    : [
        ["ZLL000001", "ALLOWANCE", "ALW-PH", "ONE_TIME", "2026-09", "", 1, "", "", "", "", "", "", "PH-SEP", "1 public holiday worked"],
        ["ZLL000002", "ALLOWANCE", "ALW-EHOT", "ONE_TIME", "2026-09", "", 4, "", "", "", "", "", "", "OT-SEP", "4 extra hours"],
        ["ZLL000003", "ALLOWANCE", "ALW-PMO", "ONE_TIME", "2026-09", "", 2, "2026-08", "", "", "", "", "", "PMO-AUG", "2 regular work days outstanding"],
      ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...examples]), "Payroll Inputs");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

router.get("/variable-inputs/template", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const kind = String(req.query?.kind || "ALLOWANCE").trim().toUpperCase() === "DEDUCTION" ? "DEDUCTION" : "ALLOWANCE";
    res.setHeader("Content-Disposition", `attachment; filename="CHRiS_${kind === "DEDUCTION" ? "Deductions" : "Allowances"}_Bulk_Input_Template.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(variableInputTemplateBuffer(kind));
  } catch (error) {
    return sendError(res, error, "Unable to generate payroll input template.");
  }
});

function parseMoneyCell(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : NaN;
}

async function prepareVariableInputWorkbook(req, buffer, requestedKind) {
  const kind = String(requestedKind || "").trim().toUpperCase();
  if (!["ALLOWANCE", "DEDUCTION"].includes(kind)) throw payroll.operationalError("INVALID_COMPONENT_KIND", "Bulk upload kind must be ALLOWANCE or DEDUCTION.");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => String(name).trim().toLowerCase() === "payroll inputs") || workbook.SheetNames[0];
  if (!sheetName) throw payroll.operationalError("EMPTY_WORKBOOK", "The workbook does not contain a worksheet.");
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  const [components, periods, employees] = await Promise.all([
    variablePayroll.listVariableComponents({ organizationId: req.auth.organizationId, kind }),
    payroll.listPeriods({ organizationId: req.auth.organizationId }),
    prisma.employee.findMany({
      where: { organizationId: req.auth.organizationId },
      select: { employeeNumber: true, firstName: true, middleName: true, lastName: true, locationId: true },
    }),
  ]);
  const componentMap = new Map(components.map((row) => [String(row.code).toUpperCase(), row]));
  const periodMap = new Map();
  for (const period of periods) {
    periodMap.set(String(period.id), period);
    periodMap.set(String(period.code).toUpperCase(), period);
    const startMonth = String(period.periodStart || "").slice(0, 7);
    if (startMonth) periodMap.set(startMonth.toUpperCase(), period);
  }
  const employeeMap = new Map(employees.map((row) => [String(row.employeeNumber).toUpperCase(), row]));
  const allowedLocations = new Set((req.auth?.availableLocations || []).map((location) => location.id).filter(Boolean));

  return sourceRows.map((row, index) => {
    const employeeNumber = getCell(row, ["Employee No", "Employee Number", "Employee ID"]).toUpperCase();
    const rowKind = (getCell(row, ["Kind"]) || kind).toUpperCase();
    const componentCode = getCell(row, ["Component Code", "Code"]).toUpperCase();
    const frequency = (getCell(row, ["Frequency"]) || "ONE_TIME").toUpperCase().replace(/[ -]+/g, "_");
    const payrollPeriodRaw = getCell(row, ["Payroll Period", "Period"]);
    const referencePeriodRaw = getCell(row, ["Reference Payroll Period", "Reference Period"]);
    const startPeriodRaw = getCell(row, ["Start Payroll Period", "Start Period"]) || payrollPeriodRaw;
    const amount = parseMoneyCell(getCell(row, ["Amount"]));
    const quantity = parseMoneyCell(getCell(row, ["Quantity", "Days", "Hours"]));
    const totalAmount = parseMoneyCell(getCell(row, ["Total Amount", "Total Deduction"]));
    const scheduleMethodRaw = (getCell(row, ["Schedule By", "Schedule Method"]) || "INSTALLMENT_COUNT").toUpperCase().replace(/[ -]+/g, "_");
    const scheduleMethod = scheduleMethodRaw === "AMOUNT_PER_INSTALLMENT" ? "INSTALLMENT_AMOUNT" : scheduleMethodRaw;
    const installmentCountRaw = parseMoneyCell(getCell(row, ["Number of Installments", "Installments"]));
    const installmentAmount = parseMoneyCell(getCell(row, ["Installment Amount", "Amount Per Installment"]));
    const reference = getCell(row, ["Reference", "External Reference"]);
    const remarks = getCell(row, ["Remarks", "Notes"]);
    const employee = employeeMap.get(employeeNumber);
    const component = componentMap.get(componentCode);
    const payrollPeriod = periodMap.get(String(payrollPeriodRaw).toUpperCase());
    const referencePayrollPeriod = referencePeriodRaw ? periodMap.get(String(referencePeriodRaw).toUpperCase()) : null;
    const startPayrollPeriod = periodMap.get(String(startPeriodRaw).toUpperCase());
    const errors = [];

    if (!employee) errors.push("Employee Number was not found.");
    if (employee && req.auth?.activeLocationId && employee.locationId !== req.auth.activeLocationId) errors.push("Employee is outside the active branch.");
    if (employee && req.auth?.locationScope !== "ALL_LOCATIONS" && (!employee.locationId || !allowedLocations.has(employee.locationId))) errors.push("Employee is outside your assigned branch/location scope.");
    if (rowKind !== kind) errors.push(`Kind must be ${kind}.`);
    if (!component) errors.push("Component Code was not found in the active catalogue.");
    if (!["ONE_TIME", "RECURRING"].includes(frequency)) errors.push("Frequency must be ONE_TIME or RECURRING.");
    if (kind === "ALLOWANCE" && frequency === "RECURRING") errors.push("Allowance bulk inputs are payroll-period entries; use ONE_TIME.");
    if (frequency === "ONE_TIME") {
      if (!payrollPeriod) errors.push("Payroll Period was not found.");
      if (component?.calculationType === "ENTERED_AMOUNT" && !(amount > 0)) errors.push("Amount must be greater than zero.");
      if (component && component.calculationType !== "ENTERED_AMOUNT" && !(quantity > 0)) errors.push("Quantity must be greater than zero.");
    } else {
      if (!startPayrollPeriod) errors.push("Start Payroll Period was not found.");
      if (component && component.installmentEligible !== true) errors.push("Selected deduction is not configured for installments.");
      if (!(totalAmount > 0)) errors.push("Total Amount must be greater than zero.");
      if (!["INSTALLMENT_COUNT", "INSTALLMENT_AMOUNT"].includes(scheduleMethod)) errors.push("Schedule By must be INSTALLMENT_COUNT or INSTALLMENT_AMOUNT.");
      if (scheduleMethod === "INSTALLMENT_COUNT" && !(Number.isInteger(installmentCountRaw) && installmentCountRaw > 0)) errors.push("Number of Installments must be a positive whole number.");
      if (scheduleMethod === "INSTALLMENT_AMOUNT" && !(installmentAmount > 0)) errors.push("Installment Amount must be greater than zero.");
    }
    if (referencePeriodRaw && !referencePayrollPeriod) errors.push("Reference Payroll Period was not found.");

    let schedulePreview = null;
    if (!errors.length && frequency === "RECURRING") {
      const start = new Date(`${String(startPayrollPeriod.periodStart).slice(0, 10)}T00:00:00.000Z`);
      schedulePreview = variablePayroll.buildInstallmentSchedule({
        totalAmount,
        scheduleMethod,
        installmentCount: installmentCountRaw,
        installmentAmount,
        startYear: start.getUTCFullYear(),
        startMonth: start.getUTCMonth() + 1,
      });
    }

    const input = errors.length ? null : frequency === "RECURRING"
      ? {
          employeeNumber,
          componentCode,
          totalAmount,
          scheduleMethod,
          installmentCount: installmentCountRaw,
          installmentAmount,
          startPayrollPeriodId: startPayrollPeriod.id,
          reference,
          remarks,
        }
      : {
          employeeNumber,
          kind,
          componentCode,
          payrollPeriodId: payrollPeriod.id,
          amount,
          quantity,
          referencePayrollPeriodId: referencePayrollPeriod?.id || null,
          reference,
          remarks,
        };
    return {
      rowNumber: index + 2,
      valid: errors.length === 0,
      errors,
      input,
      frequency,
      display: {
        employeeNumber,
        employeeName: employee ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ") : "",
        componentCode,
        componentName: component?.name || "",
        payrollPeriod: payrollPeriod?.code || payrollPeriodRaw,
        startPayrollPeriod: startPayrollPeriod?.code || startPeriodRaw,
        amount,
        quantity,
        totalAmount,
        schedule: schedulePreview?.schedule || [],
      },
    };
  });
}

router.post("/variable-inputs/bulk/preview", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to validate.");
    const rows = await prepareVariableInputWorkbook(req, req.file.buffer, req.query?.kind);
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
    return sendError(res, error, "Unable to validate payroll-input workbook.");
  }
});

router.post("/variable-inputs/bulk/import", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) throw payroll.operationalError("IMPORT_FILE_REQUIRED", "Select an Excel file to import.");
    const rows = await prepareVariableInputWorkbook(req, req.file.buffer, req.query?.kind);
    const results = [];
    for (const row of rows) {
      if (!row.valid) {
        results.push({ rowNumber: row.rowNumber, success: false, input: row.display, errors: row.errors });
        continue;
      }
      try {
        const created = row.frequency === "RECURRING"
          ? await variablePayroll.createDeductionPlan({
              organizationId: req.auth.organizationId,
              actorUserId: req.auth.userId,
              input: row.input,
              source: "BULK_IMPORT",
            })
          : await variablePayroll.createVariableInput({
              organizationId: req.auth.organizationId,
              actorUserId: req.auth.userId,
              input: row.input,
              source: "BULK_IMPORT",
            });
        results.push({ rowNumber: row.rowNumber, success: true, input: created, errors: [] });
      } catch (error) {
        results.push({ rowNumber: row.rowNumber, success: false, input: row.display, errors: [error.message || "Unable to import row."] });
      }
    }
    const created = results.filter((row) => row.success).length;
    let freshness = null;
    if (created) {
      freshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `${created} payroll allowance/deduction input(s) were imported; affected draft payroll must be recalculated.`,
      });
    }
    return res.status(207).json({
      status: "success",
      message: "Payroll input import completed with row-level results.",
      data: {
        results,
        created,
        failed: results.filter((row) => !row.success).length,
        total: results.length,
        payrollDraftFreshness: freshness,
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to import payroll inputs.");
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

router.post("/runs/draft", requirePermission("payroll.process"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
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

router.post("/runs/:id/submit", requirePermission("payroll.process"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
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

router.post("/runs/:id/decision", requirePermission("payroll.manage"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
  try {
    const decision = String(req.body?.decision || "").trim().toUpperCase();
    let isNigeriaPayroll = false;
    let statutoryCompliance = null;

    if (decision === "APPROVE") {
      const organization = await prisma.organization.findUnique({
        where: { id: req.auth.organizationId },
        select: { country: true, slug: true },
      });
      isNigeriaPayroll = String(organization?.country || "").trim().toLowerCase() === "nigeria" || organization?.slug === "zermatt-liquor-limited";
      if (isNigeriaPayroll) {
        statutoryCompliance = await validateNigeriaPayrollApproval({
          organizationId: req.auth.organizationId,
          runId: req.params.id,
        });
      }
    }

    const data = await payroll.decidePayrollRun({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      runId: req.params.id,
      decision: req.body?.decision,
      statutoryReviewed: req.body?.statutoryReviewed === true,
      statutoryObligationsRequired: isNigeriaPayroll,
      statutoryCompliance,
      notes: req.body?.notes,
    });

    return res.json({
      status: "success",
      message: decision === "APPROVE" && statutoryCompliance?.withheldCount
        ? `Payroll approved. ${statutoryCompliance.withheldCount} employee(s) have statutory remittance items withheld pending completion of required statutory details.`
        : decision === "APPROVE"
          ? "Payroll approved. Statutory liabilities were confirmed for remittance processing."
          : "Payroll decision recorded.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to decide payroll run.");
  }
});


function payrollAuditWorkbook({ organization, run, lines, employeeLocations }) {
  const workbook = XLSX.utils.book_new();
  const headers = [
    "Employee No", "Employee Name", "Branch", "Basic", "Allowances", "Gross Pay",
    "PAYE", "Pension", "Other Deductions", "Salary Advance", "Loan Recovery",
    "Leave Allowance", "Net Pay"
  ];
  const detailRows = lines.map((line) => {
    const statutory = line.details?.statutory || {};
    const leaveAllowance = Number(line.details?.leaveAllowance?.amount || 0);
    const otherDeductions = Number(line.deductions || 0);
    const branch = employeeLocations.get(line.employeeId) || "Unassigned";
    return [
      line.employeeNumber,
      line.employeeName,
      branch,
      Number(line.baseSalary || 0),
      Number(line.allowances || 0),
      Number(line.grossPay || 0),
      Number(statutory.payeTax || 0),
      Number(statutory.employeePension || 0),
      otherDeductions,
      Number(line.advanceRecovery || 0),
      Number(line.loanRecovery || line.details?.loanRecovery || 0),
      leaveAllowance,
      Number(line.netPreview || 0),
    ];
  });
  const register = XLSX.utils.aoa_to_sheet([headers, ...detailRows]);
  register["!cols"] = [
    { wch: 16 }, { wch: 28 }, { wch: 22 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 17 },
  ];
  XLSX.utils.book_append_sheet(workbook, register, "Payroll Register");

  const lastRow = Math.max(2, detailRows.length + 1);
  const summary = XLSX.utils.aoa_to_sheet([
    ["CHRiS Payroll Management Report"],
    ["Organization", organization.legalName || organization.name || ""],
    ["Payroll Period", run.periodCode || ""],
    ["Run Status", run.status || ""],
    ["Approved At", run.approvedAt ? new Date(run.approvedAt).toISOString() : ""],
    [],
    ["KPI", "Value", "Formula-driven Visual"],
    ["Employee Headcount", { f: `COUNTA('Payroll Register'!A2:A${lastRow})` }, ""],
    ["Gross Payroll", { f: `SUM('Payroll Register'!F2:F${lastRow})` }, { f: 'REPT("█",ROUND(B9/MAX($B$9,$B$10,$B$11,$B$12,$B$13)*30,0))' }],
    ["Net Payroll", { f: `SUM('Payroll Register'!M2:M${lastRow})` }, { f: 'REPT("█",ROUND(B10/MAX($B$9,$B$10,$B$11,$B$12,$B$13)*30,0))' }],
    ["PAYE", { f: `SUM('Payroll Register'!G2:G${lastRow})` }, { f: 'REPT("█",ROUND(B11/MAX($B$9,$B$10,$B$11,$B$12,$B$13)*30,0))' }],
    ["Pension", { f: `SUM('Payroll Register'!H2:H${lastRow})` }, { f: 'REPT("█",ROUND(B12/MAX($B$9,$B$10,$B$11,$B$12,$B$13)*30,0))' }],
    ["Loans + Advances", { f: `SUM('Payroll Register'!J2:J${lastRow})+SUM('Payroll Register'!K2:K${lastRow})` }, { f: 'REPT("█",ROUND(B13/MAX($B$9,$B$10,$B$11,$B$12,$B$13)*30,0))' }],
  ]);
  summary["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Management Summary");

  const branches = [...new Set(detailRows.map((row) => row[2]))].sort();
  const branchRows = [["Branch", "Headcount", "Gross Payroll", "Net Payroll"]];
  for (const branch of branches) {
    const rowNumber = branchRows.length + 1;
    branchRows.push([
      branch,
      { f: `COUNTIF('Payroll Register'!C$2:C${lastRow},A${rowNumber})` },
      { f: `SUMIF('Payroll Register'!C$2:C${lastRow},A${rowNumber},'Payroll Register'!F$2:F${lastRow})` },
      { f: `SUMIF('Payroll Register'!C$2:C${lastRow},A${rowNumber},'Payroll Register'!M$2:M${lastRow})` },
    ]);
  }
  const branchSheet = XLSX.utils.aoa_to_sheet(branchRows);
  branchSheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, branchSheet, "Branch Analysis");

  const handoff = XLSX.utils.aoa_to_sheet([
    ["ZERMATT Payroll External Approval Handoff"],
    ["CHRiS Internal Payroll Authority", "Head of HR prepares, processes/executes and approves payroll inside CHRiS."],
    ["External Auditor", "Confirms exported payroll and management reports outside CHRiS."],
    ["General Manager", "Provides final business approval outside CHRiS after auditor confirmation."],
    ["Accounts & Finance", "Processes payout outside CHRiS after GM approval."],
    [],
    ["Evidence Field", "Reference / Date / Notes"],
    ["External Auditor Confirmation", ""],
    ["GM Approval", ""],
    ["Accounts & Finance Payout", ""],
    [],
    ["Control", "This workbook is an audit/export handoff. External confirmation, GM approval and payout do not constitute CHRiS payroll approval events."],
  ]);
  handoff["!cols"] = [{ wch: 34 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, handoff, "External Handoff");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellFormula: true });
}

router.get("/runs/:id/audit-pack.xlsx", requirePermission("payroll.view"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
  try {
    const runs = await payroll.listRuns({ organizationId: req.auth.organizationId });
    const run = runs.find((item) => item.id === req.params.id);
    if (!run) throw payroll.operationalError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);
    if (run.status !== "APPROVED") {
      throw payroll.operationalError("PAYROLL_AUDIT_PACK_REQUIRES_APPROVAL", "Only an approved payroll run can be exported for external audit and GM approval.", 409);
    }
    const lines = await payroll.listRunLines({ organizationId: req.auth.organizationId, runId: req.params.id });
    const employees = await prisma.employee.findMany({
      where: { organizationId: req.auth.organizationId, id: { in: lines.map((line) => line.employeeId) } },
      select: { id: true, location: { select: { name: true, code: true } } },
    });
    const employeeLocations = new Map(employees.map((employee) => [
      employee.id,
      employee.location?.name || employee.location?.code || "Unassigned",
    ]));
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth.organizationId },
      select: { name: true, legalName: true },
    });
    const buffer = payrollAuditWorkbook({ organization: organization || {}, run, lines, employeeLocations });
    const safePeriod = String(run.periodCode || "Payroll").replace(/[^A-Za-z0-9_-]+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="CHRiS_${safePeriod}_Payroll_Audit_Pack.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Unable to export payroll audit pack.");
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
