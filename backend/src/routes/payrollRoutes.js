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
const { synchronizePayrollAuthorityFromMappings } = require("../services/employeePayrollAuthoritySyncService");

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
      const data = await getPayrollReadiness({
        organizationId: req.auth.organizationId,
        periodId: req.query?.periodId || null,
      });
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
    let payrollDraftFreshness = null;
    if (String(req.body?.decision || "").trim().toUpperCase() === "VERIFY") {
      payrollDraftFreshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `Verified rent relief for ${data?.employeeId || "employee"} changed PAYE inputs; draft payroll must be recalculated.`,
      });
    }
    return res.json({ status: "success", data: { relief: data, payrollDraftFreshness } });
  } catch (error) {
    return sendError(res, error, "Unable to decide rent relief declaration.");
  }
});


router.post(
  "/tax-reliefs/bulk/verify",
  requirePermission("payroll.manage"),
  requireZermattHeadHrPayrollAuthority,
  async (req, res) => {
    try {
      const data = await nigeriaPayroll.bulkVerifyRentReliefs({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reliefIds: req.body?.reliefIds,
        notes: req.body?.notes,
      });

      const payrollDraftFreshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `${data.verified} rent-relief record(s) were bulk verified; draft PAYE must be recalculated.`,
      });

      return res.json({
        status: "success",
        message: `${data.verified} rent-relief record(s) verified successfully.`,
        data: {
          ...data,
          payrollDraftFreshness,
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to bulk verify rent relief.");
    }
  }
);


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

      return res.status(207).json({
        status: "success",
        message: `${imported} rent-relief record(s) imported as PENDING_VERIFICATION. ${failed} row(s) failed.`,
        data: {
          results,
          imported,
          failed,
          total: results.length,
          payrollDraftFreshness: null,
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
    await synchronizePayrollAuthorityFromMappings({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
    });

    const readiness = await getPayrollReadiness({
      organizationId: req.auth.organizationId,
      periodId: req.body?.periodId || null,
    });
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



function payrollObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function payrollSection(sectionData, ...keys) {
  const root = payrollObject(sectionData);
  for (const key of keys) {
    const value = root?.[key];
    if (value && typeof value === "object") return value;
  }
  return {};
}

function payrollComponentKey(item, prefix) {
  const code = String(item?.code || "").trim();
  const name = String(item?.name || "").trim();
  return prefix + ":" + (code || name || "OTHER").toUpperCase();
}

function payrollComponentLabel(item, prefix) {
  const code = String(item?.code || "").trim();
  const name = String(item?.name || "").trim();
  const value = [code, name].filter(Boolean).join(" — ") || "Other";
  return prefix + " · " + value;
}

function payrollPrettyLabel(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function payrollBranchLabel(meta = {}) {
  const code = String(meta.branchCode || "").trim().toUpperCase();
  const name = String(meta.branch || "").trim();
  const upper = name.toUpperCase();
  if (code === "HO" || code === "ABJ" || upper.includes("ABUJA") || upper.includes("HEAD OFFICE")) return "Abuja";
  if (code === "LAG" || upper.includes("LAGOS")) return "Lagos";
  if (code === "PHC" || upper.includes("PORT HARCOURT") || /(^|\s)PHC(\s|$)/.test(upper)) return "PHC";
  return name || code || "Unassigned";
}

function payrollBranchRank(branch) {
  const value = String(branch || "").toUpperCase();
  if (value === "ABUJA") return 0;
  if (value === "LAGOS") return 1;
  if (value === "PHC") return 2;
  return 3;
}

function payrollSheetName(value, used) {
  const base = String(value || "Branch")
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 27) || "Branch";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) candidate = (base.slice(0, 24) + " " + index++).slice(0, 31);
  used.add(candidate);
  return candidate;
}

function payrollVisualBar(value, maximum, width = 28) {
  const amount = Number(value || 0);
  const max = Number(maximum || 0);
  if (!(max > 0) || !(amount > 0)) return "";
  const blocks = Math.max(1, Math.min(width, Math.round((amount / max) * width)));
  return "█".repeat(blocks);
}

function payrollWorkbookModel(lines, employeeMeta) {
  const structureKeys = new Set();
  const allowanceLabels = new Map();
  const deductionLabels = new Map();

  for (const line of lines) {
    const details = line.details || {};
    for (const key of Object.keys(details.salaryStructure || {})) {
      if (String(key).toLowerCase() !== "basic") structureKeys.add(key);
    }
    for (const item of details.customAllowances || []) {
      allowanceLabels.set(payrollComponentKey(item, "ALW"), payrollComponentLabel(item, "Allowance"));
    }
    for (const item of details.customDeductions || []) {
      deductionLabels.set(payrollComponentKey(item, "DED"), payrollComponentLabel(item, "Deduction"));
    }
  }

  const structuredColumns = [...structureKeys].sort().map((key) => ({ key, label: payrollPrettyLabel(key) }));
  const allowanceColumns = [...allowanceLabels.entries()].sort((a,b) => a[1].localeCompare(b[1])).map(([key,label]) => ({ key,label }));
  const deductionColumns = [...deductionLabels.entries()].sort((a,b) => a[1].localeCompare(b[1])).map(([key,label]) => ({ key,label }));

  const headers = [
    "Employee No", "Employee Name", "Designation", "Employment Type", "Branch", "Email",
    "Bank", "Account Name", "Account Number",
    "PFA", "Pension PIN", "TIN", "PAYE State",
    "Basic",
    ...structuredColumns.map((item) => item.label),
    ...allowanceColumns.map((item) => item.label),
    "Total Allowances", "Gross Pay",
    "PAYE", "Employee Pension", "Employer Pension", "Total Pension", "NHF",
    "NSITF Employer", "ITF Employer",
    ...deductionColumns.map((item) => item.label),
    "Payroll Deductions", "Salary Advance", "Loan Recovery", "Leave Allowance", "Net Pay",
  ];

  const rows = lines.map((line) => {
    const details = line.details || {};
    const statutory = details.statutory || {};
    const structure = details.salaryStructure || {};
    const meta = employeeMeta.get(line.employeeId) || {};
    const allowanceValues = new Map((details.customAllowances || []).map((item) => [payrollComponentKey(item, "ALW"), Number(item.value || 0)]));
    const deductionValues = new Map((details.customDeductions || []).map((item) => [payrollComponentKey(item, "DED"), Number(item.value || 0)]));
    const employeePension = Number(statutory.employeePension || 0);
    const employerPension = Number(statutory.employerPension || 0);

    return {
      employeeId: line.employeeId,
      branch: payrollBranchLabel(meta),
      cells: [
        line.employeeNumber,
        line.employeeName,
        meta.designation || "",
        meta.employmentType || "",
        payrollBranchLabel(meta),
        meta.email || "",
        meta.bankName || "",
        meta.accountName || "",
        meta.accountNumber || "",
        meta.pensionPfa || "",
        meta.pensionPin || "",
        meta.taxIdentificationNumber || "",
        meta.payeState || "",
        Number(structure.basic ?? line.baseSalary ?? 0),
        ...structuredColumns.map((item) => Number(structure[item.key] || 0)),
        ...allowanceColumns.map((item) => Number(allowanceValues.get(item.key) || 0)),
        Number(line.allowances || 0),
        Number(line.grossPay || 0),
        Number(statutory.payeTax || 0),
        employeePension,
        employerPension,
        employeePension + employerPension,
        Number(statutory.nhfEmployee || 0),
        Number(statutory.nsitfEmployer || 0),
        Number(statutory.itfEmployerAccrual || 0),
        ...deductionColumns.map((item) => Number(deductionValues.get(item.key) || 0)),
        Number(line.deductions || 0),
        Number(line.advanceRecovery || 0),
        Number(line.loanRecovery ?? details.loanRecoveryTotal ?? 0),
        Number(details.leaveAllowance?.amount || 0),
        Number(line.netPreview || 0),
      ],
      line,
      meta,
    };
  });

  return { headers, rows, structuredColumns, allowanceColumns, deductionColumns };
}

function payrollAppendRegisterSheet(workbook, sheetName, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => row.cells)]);
  sheet["!cols"] = headers.map((header) => ({
    wch: /Name|Designation|PFA|Allowance|Deduction/.test(header) ? 24 :
      /Account|PIN|TIN|Employee No|Email/.test(header) ? 20 : 16,
  }));
  if (rows.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function payrollExternalWorkbook({ organization, run, lines, employeeMeta, stage }) {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.CalcPr = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };
  const isApproved = stage === "APPROVED_PAYOUT";
  const title = isApproved
    ? "CHRiS Approved Payroll — External Approval & Payout Pack"
    : "CHRiS Draft Payroll — External HR Review Pack";
  const controlLabel = isApproved
    ? "APPROVED IN CHRiS — EXTERNAL APPROVAL / PAYOUT HANDOFF"
    : "PRE-APPROVAL REVIEW — NOT FOR PAYOUT";

  const model = payrollWorkbookModel(lines, employeeMeta);
  const total = (selector) => model.rows.reduce((sum, row) => sum + Number(selector(row) || 0), 0);
  const headerIndex = Object.fromEntries(model.headers.map((header, index) => [header, index]));
  const totalByHeader = (header) => {
    const index = headerIndex[header];
    return index == null ? 0 : model.rows.reduce((sum, row) => sum + Number(row.cells[index] || 0), 0);
  };

  const branchGroups = new Map();
  for (const row of model.rows) {
    const current = branchGroups.get(row.branch) || [];
    current.push(row);
    branchGroups.set(row.branch, current);
  }
  const branches = [...branchGroups.keys()].sort((a,b) => payrollBranchRank(a) - payrollBranchRank(b) || a.localeCompare(b));

  const gross = totalByHeader("Gross Pay");
  const net = totalByHeader("Net Pay");
  const paye = totalByHeader("PAYE");
  const employeePension = totalByHeader("Employee Pension");
  const employerPension = totalByHeader("Employer Pension");
  const nhf = totalByHeader("NHF");
  const nsitf = totalByHeader("NSITF Employer");
  const itf = totalByHeader("ITF Employer");
  const payrollDeductions = totalByHeader("Payroll Deductions");
  const advances = totalByHeader("Salary Advance");
  const loans = totalByHeader("Loan Recovery");
  const employerStatutory = employerPension + nsitf + itf;
  const totalEmployerCost = gross + employerStatutory;

  const dataEndRow = model.rows.length + 1;
  const payrollRegisterSheet = "Payroll Register";
  const payrollRange = (header) => {
    const index = headerIndex[header];
    if (index == null || !model.rows.length) return null;
    const column = XLSX.utils.encode_col(index);
    return `'${payrollRegisterSheet}'!$${column}$2:$${column}$${dataEndRow}`;
  };
  const employeeNumberRange = payrollRange("Employee No");
  const branchRange = payrollRange("Branch");
  const selectedSumFormula = (header) => {
    const range = payrollRange(header);
    if (!range || !branchRange) return null;
    return `IF($B$9="ALL",SUM(${range}),SUMIF(${branchRange},$B$9,${range}))`;
  };
  const formulaCell = (formula, value = 0, type = "n") =>
    formula ? { t: type, f: formula, v: type === "n" ? Number(value || 0) : String(value || "") } : value;

  const branchSheetNames = new Map();
  const reservedSheetNames = new Set(["Payroll Dashboard", "Workflow Control", "Payroll Register"]);
  for (const branch of branches) {
    branchSheetNames.set(branch, payrollSheetName("Branch - " + branch, reservedSheetNames));
  }

  const branchStats = branches.map((branch) => {
    const rows = branchGroups.get(branch) || [];
    const sumHeader = (header) => {
      const index = headerIndex[header];
      return rows.reduce((sum, row) => sum + Number(row.cells[index] || 0), 0);
    };
    return {
      branch,
      headcount: rows.length,
      gross: sumHeader("Gross Pay"),
      net: sumHeader("Net Pay"),
      paye: sumHeader("PAYE"),
      employeePension: sumHeader("Employee Pension"),
      employerPension: sumHeader("Employer Pension"),
    };
  });

  const selectedEmployerStatutoryFormula = [
    selectedSumFormula("Employer Pension"),
    selectedSumFormula("NSITF Employer"),
    selectedSumFormula("ITF Employer"),
  ].filter(Boolean).join("+");
  const selectedTotalEmployerCostFormula = [
    selectedSumFormula("Gross Pay"),
    selectedEmployerStatutoryFormula,
  ].filter(Boolean).join("+");
  const selectedHeadcountFormula = employeeNumberRange && branchRange
    ? `IF($B$9="ALL",COUNTA(${employeeNumberRange}),COUNTIF(${branchRange},$B$9))`
    : null;

  const selectedKpis = [
    ["Employee Headcount", formulaCell(selectedHeadcountFormula, model.rows.length), "count"],
    ["Gross Payroll", formulaCell(selectedSumFormula("Gross Pay"), gross), "money"],
    ["Net Payroll", formulaCell(selectedSumFormula("Net Pay"), net), "money"],
    ["PAYE", formulaCell(selectedSumFormula("PAYE"), paye), "money"],
    ["Employee Pension", formulaCell(selectedSumFormula("Employee Pension"), employeePension), "money"],
    ["Employer Pension", formulaCell(selectedSumFormula("Employer Pension"), employerPension), "money"],
    ["Total Pension", formulaCell(
      [selectedSumFormula("Employee Pension"), selectedSumFormula("Employer Pension")].filter(Boolean).join("+"),
      employeePension + employerPension
    ), "money"],
    ["Payroll Deductions", formulaCell(selectedSumFormula("Payroll Deductions"), payrollDeductions), "money"],
    ["Salary Advances", formulaCell(selectedSumFormula("Salary Advance"), advances), "money"],
    ["Loan Recoveries", formulaCell(selectedSumFormula("Loan Recovery"), loans), "money"],
    ["Employer Statutory Cost", formulaCell(selectedEmployerStatutoryFormula, employerStatutory), "money"],
    ["Total Employer Cost", formulaCell(selectedTotalEmployerCostFormula, totalEmployerCost), "money"],
  ];

  const dashboardRows = [
    ["CHRiS PAYROLL DASHBOARD & KPI REPORT"],
    ["Organization", organization.legalName || organization.name || ""],
    ["Payroll Period", run.periodCode || ""],
    ["Run Status", run.status || ""],
    ["Control", controlLabel],
    ["Generated At", new Date().toISOString()],
    [],
    ["INTERACTIVE DASHBOARD CONTROLS"],
    ["Branch Focus", "ALL", "Edit B9: enter ALL or an exact branch name from the Branch Payroll Comparison table below."],
    ["Active View", formulaCell('"Viewing: "&B9', "Viewing: ALL", "s"), "KPI and statutory values recalculate when the workbook opens in Excel."],
    [],
    ["SELECTED BRANCH KPI VIEW"],
    ["KPI", "Value", "Quick Link"],
  ];

  const selectedKpiRows = [];
  for (const [label, value, kind] of selectedKpis) {
    const rowIndex = dashboardRows.length;
    dashboardRows.push([label, value, "Open Payroll Register"]);
    selectedKpiRows.push({ rowIndex, kind });
  }

  dashboardRows.push([], ["BRANCH PAYROLL COMPARISON"]);
  const branchHeaderRowIndex = dashboardRows.length;
  dashboardRows.push([
    "Branch", "Headcount", "Gross Payroll", "Net Payroll", "PAYE",
    "Employee Pension", "Employer Pension", "Gross Visual", "Open Branch Sheet"
  ]);

  const maxBranchGross = Math.max(...branchStats.map((row) => row.gross), 1);
  const branchDashboardLinks = [];
  for (const stat of branchStats) {
    const rowIndex = dashboardRows.length;
    dashboardRows.push([
      stat.branch, stat.headcount, stat.gross, stat.net, stat.paye,
      stat.employeePension, stat.employerPension, payrollVisualBar(stat.gross, maxBranchGross), "Open Branch Sheet",
    ]);
    branchDashboardLinks.push({ rowIndex, branch: stat.branch });
  }

  dashboardRows.push([], ["STATUTORY COST COMPOSITION — SELECTED VIEW"]);
  const statutoryHeaderRowIndex = dashboardRows.length;
  dashboardRows.push(["Statutory Item", "Amount", "Visual"]);
  const statutoryMix = [
    ["PAYE", "PAYE", paye],
    ["Employee Pension", "Employee Pension", employeePension],
    ["Employer Pension", "Employer Pension", employerPension],
    ["NHF", "NHF", nhf],
    ["NSITF Employer", "NSITF Employer", nsitf],
    ["ITF Employer", "ITF Employer", itf],
  ];
  const maxStatutory = Math.max(...statutoryMix.map(([, , value]) => value), 1);
  const statutoryDashboardRows = [];
  for (const [label, header, value] of statutoryMix) {
    const rowIndex = dashboardRows.length;
    dashboardRows.push([label, formulaCell(selectedSumFormula(header), value), payrollVisualBar(value, maxStatutory)]);
    statutoryDashboardRows.push({ rowIndex, value });
  }

  dashboardRows.push(
    [],
    ["HOW TO USE THIS DASHBOARD"],
    ["1", "Change Branch Focus in B9 to ALL or a branch name to recalculate the selected-view KPIs and statutory composition."],
    ["2", "Use the filter arrows in Payroll Register and each branch register to drill into employees, components and statutory values."],
    ["3", "Click Open Payroll Register or Open Branch Sheet links to move directly to the supporting detail."],
    ["4", "The Branch Payroll Comparison table can be filtered and sorted independently without changing payroll data."],
  );

  const dashboard = XLSX.utils.aoa_to_sheet(dashboardRows);
  dashboard["!cols"] = [
    { wch: 30 }, { wch: 22 }, { wch: 38 }, { wch: 20 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 22 },
  ];

  if (branchStats.length) {
    dashboard["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: branchHeaderRowIndex, c: 0 },
        e: { r: branchHeaderRowIndex + branchStats.length, c: 8 },
      }),
    };
  }

  if (dashboard.B9) {
    dashboard.B9.c = [{
      a: "CHRiS",
      t: branches.length
        ? `Enter ALL or one exact branch name: ${branches.join(", ")}`
        : "Enter ALL. No branch-specific payroll rows are available in this export.",
    }];
  }

  for (const { rowIndex, kind } of selectedKpiRows) {
    const valueCell = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });
    const linkCell = XLSX.utils.encode_cell({ r: rowIndex, c: 2 });
    if (dashboard[valueCell]) dashboard[valueCell].z = kind === "count" ? "0" : "#,##0.00";
    if (dashboard[linkCell]) {
      dashboard[linkCell].l = { Target: "#'Payroll Register'!A1", Tooltip: "Open the consolidated payroll register" };
    }
  }

  for (const { rowIndex, branch } of branchDashboardLinks) {
    const branchCell = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
    const linkCell = XLSX.utils.encode_cell({ r: rowIndex, c: 8 });
    const branchSheet = branchSheetNames.get(branch);
    if (dashboard[branchCell] && branchSheet) {
      dashboard[branchCell].l = { Target: `#'${branchSheet}'!A1`, Tooltip: `Open ${branch} payroll register` };
    }
    if (dashboard[linkCell] && branchSheet) {
      dashboard[linkCell].l = { Target: `#'${branchSheet}'!A1`, Tooltip: `Open ${branch} payroll register` };
    }
    for (let column = 2; column <= 6; column += 1) {
      const amountCell = XLSX.utils.encode_cell({ r: rowIndex, c: column });
      if (dashboard[amountCell]) dashboard[amountCell].z = "#,##0.00";
    }
  }

  const statutoryAmountStart = statutoryHeaderRowIndex + 1;
  const statutoryAmountEnd = statutoryHeaderRowIndex + statutoryDashboardRows.length;
  for (const { rowIndex, value } of statutoryDashboardRows) {
    const amountCell = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });
    const visualCell = XLSX.utils.encode_cell({ r: rowIndex, c: 2 });
    const excelRow = rowIndex + 1;
    if (dashboard[amountCell]) dashboard[amountCell].z = "#,##0.00";
    if (dashboard[visualCell] && statutoryDashboardRows.length) {
      dashboard[visualCell] = {
        t: "s",
        f: `IF(B${excelRow}<=0,"",REPT("█",MAX(1,ROUND(B${excelRow}/MAX($B$${statutoryAmountStart + 1}:$B$${statutoryAmountEnd + 1})*28,0))))`,
        v: payrollVisualBar(value, maxStatutory),
      };
    }
  }

  XLSX.utils.book_append_sheet(workbook, dashboard, "Payroll Dashboard");

  const control = XLSX.utils.aoa_to_sheet([
    [title],
    ["Organization", organization.legalName || organization.name || ""],
    ["Payroll Period", run.periodCode || ""],
    ["CHRiS Run Status", run.status || ""],
    ["Export Control", controlLabel],
    ["Exported At", new Date().toISOString()],
    [],
    ["Purpose"],
    [isApproved
      ? "Final CHRiS-approved payroll export for external auditor/management approval evidence and Accounts & Finance payout processing outside CHRiS."
      : "Pre-approval payroll export for external HR Head investigation, verification, exception review and correction feedback before CHRiS approval, including employee bank/account and statutory details for verification."],
    [],
    ["Workbook Contents"],
    ["Payroll Dashboard, consolidated Payroll Register, separate branch payroll sheets, full statutory identifiers and contributions, all configured allowance/deduction components, and workflow-specific review/payout sheets."],
    [],
    ["Governance"],
    [isApproved
      ? "This export does not create external approval events inside CHRiS. External auditor confirmation, GM approval and payout remain outside CHRiS."
      : "This workbook is not an approved payroll and must not be used for payout. Any findings must be corrected in CHRiS and the payroll recalculated before submission/approval."],
  ]);
  control["!cols"] = [{ wch: 28 }, { wch: 118 }];
  XLSX.utils.book_append_sheet(workbook, control, "Workflow Control");

  payrollAppendRegisterSheet(workbook, "Payroll Register", model.headers, model.rows);

  for (const branch of branches) {
    const branchSheetName = branchSheetNames.get(branch);
    payrollAppendRegisterSheet(workbook, branchSheetName, model.headers, branchGroups.get(branch) || []);
  }

  const statutoryHeaders = [
    "Employee No", "Employee Name", "Branch", "PFA", "Pension PIN", "TIN", "PAYE State",
    "Pensionable Base", "Employee Pension Rate", "Employee Pension",
    "Employer Pension Rate", "Employer Pension", "Total Pension", "PAYE",
    "NHF", "NSITF Employer", "ITF Employer"
  ];
  const statutoryRows = model.rows.map((row) => {
    const statutory = row.line.details?.statutory || {};
    return [
      row.line.employeeNumber,
      row.line.employeeName,
      row.branch,
      row.meta.pensionPfa || "",
      row.meta.pensionPin || "",
      row.meta.taxIdentificationNumber || "",
      row.meta.payeState || "",
      Number(statutory.pensionableBase || 0),
      Number(statutory.employeePensionRate || 0),
      Number(statutory.employeePension || 0),
      Number(statutory.employerPensionRate || 0),
      Number(statutory.employerPension || 0),
      Number(statutory.employeePension || 0) + Number(statutory.employerPension || 0),
      Number(statutory.payeTax || 0),
      Number(statutory.nhfEmployee || 0),
      Number(statutory.nsitfEmployer || 0),
      Number(statutory.itfEmployerAccrual || 0),
    ];
  });
  const statutorySheet = XLSX.utils.aoa_to_sheet([statutoryHeaders, ...statutoryRows]);
  statutorySheet["!cols"] = statutoryHeaders.map((header) => ({ wch: /Name|PFA/.test(header) ? 26 : 18 }));
  XLSX.utils.book_append_sheet(workbook, statutorySheet, "Statutory Register");

  if (!isApproved) {
    const reviewRows = [
      ["Draft Payroll External HR Review / Investigation"],
      ["Control", "PRE-APPROVAL — NOT FOR PAYOUT"],
      ["Payroll Period", run.periodCode || ""],
      ["CHRiS Status", run.status || ""],
      [],
      ["Review Field", "External HR Head / Reviewer Entry"],
      ["Investigation / Verification Result", ""],
      ["Exceptions Identified", ""],
      ["Employees / Lines Requiring Correction", ""],
      ["Payroll / Bank / Statutory Details Requiring Correction", ""],
      ["Corrective Action Required", ""],
      ["Reviewer Name", ""],
      ["Review Date", ""],
      ["Review Reference", ""],
      [],
      ["Instruction", "Verify payroll figures, allowances/deductions, bank/account details, PAYE, employee/employer pension, PFA/PIN/TIN and other statutory details. Return findings to the CHRiS payroll owner. Corrections must be made in CHRiS, payroll recalculated, reviewed and approved before any payout workflow begins."],
    ];
    const reviewSheet = XLSX.utils.aoa_to_sheet(reviewRows);
    reviewSheet["!cols"] = [{ wch: 44 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(workbook, reviewSheet, "External HR Review");
  } else {
    const paymentRows = [[
      "Employee No", "Employee Name", "Branch", "Bank", "Account Name", "Account Number", "Net Pay", "Payout Status", "Payment Reference"
    ]];
    for (const row of model.rows) {
      paymentRows.push([
        row.line.employeeNumber,
        row.line.employeeName,
        row.branch,
        row.meta.bankName || "",
        row.meta.accountName || "",
        row.meta.accountNumber || "",
        Number(row.line.netPreview || 0),
        "",
        "",
      ]);
    }
    const paymentSheet = XLSX.utils.aoa_to_sheet(paymentRows);
    paymentSheet["!cols"] = [
      { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 28 },
      { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(workbook, paymentSheet, "Payment Register");

    const handoff = XLSX.utils.aoa_to_sheet([
      ["ZERMATT Payroll External Approval & Payout Handoff"],
      ["CHRiS Internal Payroll Authority", "Head of HR prepares, processes/executes and approves payroll inside CHRiS."],
      ["External Auditor", "Confirms the approved payroll and management reports outside CHRiS."],
      ["General Manager", "Provides final business approval outside CHRiS after auditor confirmation."],
      ["Accounts & Finance", "Processes payout using the Payment Register after required external approvals."],
      [],
      ["Evidence Field", "Reference / Date / Notes"],
      ["External Auditor Confirmation", ""],
      ["GM Approval", ""],
      ["Accounts & Finance Payout", ""],
      ["Bank / Payment Batch Reference", ""],
      [],
      ["Control", "This workbook is an export/handoff from an APPROVED CHRiS payroll. External confirmation, GM approval and payout remain outside CHRiS and do not create additional CHRiS payroll approval events."],
    ]);
    handoff["!cols"] = [{ wch: 36 }, { wch: 96 }];
    XLSX.utils.book_append_sheet(workbook, handoff, "External Handoff");
  }

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellFormula: true });
}

async function payrollExportContext(organizationId, runId, { includePaymentDetails = false } = {}) {
  const runs = await payroll.listRuns({ organizationId });
  const run = runs.find((item) => item.id === runId);
  if (!run) throw payroll.operationalError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);

  const lines = await payroll.listRunLines({ organizationId, runId });
  const employeeSelect = {
    id: true,
    email: true,
    employmentType: true,
    designation: { select: { name: true } },
    location: { select: { name: true, code: true } },
    onboardings: {
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { sectionData: true },
    },
  };

  const employees = await prisma.employee.findMany({
    where: { organizationId, id: { in: lines.map((line) => line.employeeId) } },
    select: employeeSelect,
  });

  const employeeMeta = new Map(employees.map((employee) => {
    const sectionData = employee.onboardings?.[0]?.sectionData || {};
    const payment = includePaymentDetails
      ? payrollSection(sectionData, "payment-details", "paymentDetails")
      : {};
    const statutory = payrollSection(sectionData, "statutory-details", "statutoryDetails");
    return [employee.id, {
      designation: employee.designation?.name || "",
      employmentType: employee.employmentType || "",
      branch: employee.location?.name || employee.location?.code || "Unassigned",
      branchCode: employee.location?.code || "",
      email: employee.email || "",
      bankName: includePaymentDetails ? String(payment.bankName || "").trim() : "",
      accountName: includePaymentDetails ? String(payment.accountName || "").trim() : "",
      accountNumber: includePaymentDetails ? String(payment.accountNumber || "").trim() : "",
      pensionPfa: String(statutory.pensionPfa || "").trim(),
      pensionPin: String(statutory.pensionPin || "").trim(),
      taxIdentificationNumber: String(statutory.taxIdentificationNumber || "").trim(),
      payeState: String(statutory.payeState || "").trim(),
    }];
  }));

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, legalName: true },
  });

  return { run, lines, employeeMeta, organization: organization || {} };
}

async function auditPayrollExport({ organizationId, actorUserId, run, action, stage }) {
  await prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollRun",
      entityId: run.id,
      action,
      previousValue: { status: run.status, periodCode: run.periodCode },
      newValue: { exportStage: stage, exportedAt: new Date().toISOString() },
      reason: stage === "APPROVED_PAYOUT"
        ? "Approved payroll exported for external approval and payout workflow."
        : "Pre-approval payroll exported for external HR investigation and verification.",
    },
  });
}

router.get("/runs/:id/draft-review.xlsx", requirePermission("payroll.view"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
  try {
    const context = await payrollExportContext(req.auth.organizationId, req.params.id, { includePaymentDetails: true });
    if (!["DRAFT", "REJECTED", "SUBMITTED"].includes(context.run.status)) {
      throw payroll.operationalError(
        "PAYROLL_DRAFT_REVIEW_REQUIRES_PREAPPROVAL_STATUS",
        "Draft review export is available only before CHRiS payroll approval.",
        409
      );
    }
    const buffer = payrollExternalWorkbook({
      ...context,
      stage: "DRAFT_REVIEW",
    });
    await auditPayrollExport({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      run: context.run,
      action: "PAYROLL_DRAFT_REVIEW_EXPORTED",
      stage: "DRAFT_REVIEW",
    });
    const safePeriod = String(context.run.periodCode || "Payroll").replace(/[^A-Za-z0-9_-]+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="CHRiS_${safePeriod}_Draft_Payroll_External_HR_Review.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Unable to export draft payroll review pack.");
  }
});

router.get("/runs/:id/approved-payout.xlsx", requirePermission("payroll.view"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
  try {
    const context = await payrollExportContext(req.auth.organizationId, req.params.id, { includePaymentDetails: true });
    if (context.run.status !== "APPROVED") {
      throw payroll.operationalError(
        "PAYROLL_APPROVED_PAYOUT_REQUIRES_APPROVAL",
        "Only an APPROVED CHRiS payroll can be exported for external approval and payout.",
        409
      );
    }
    const buffer = payrollExternalWorkbook({
      ...context,
      stage: "APPROVED_PAYOUT",
    });
    await auditPayrollExport({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      run: context.run,
      action: "PAYROLL_APPROVED_PAYOUT_EXPORTED",
      stage: "APPROVED_PAYOUT",
    });
    const safePeriod = String(context.run.periodCode || "Payroll").replace(/[^A-Za-z0-9_-]+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="CHRiS_${safePeriod}_Approved_Payroll_External_Approval_Payout.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Unable to export approved payroll payout pack.");
  }
});

router.get("/runs/:id/audit-pack.xlsx", requirePermission("payroll.view"), requireZermattHeadHrPayrollAuthority, async (req, res) => {
  try {
    const context = await payrollExportContext(req.auth.organizationId, req.params.id, { includePaymentDetails: true });
    if (context.run.status !== "APPROVED") {
      throw payroll.operationalError("PAYROLL_AUDIT_PACK_REQUIRES_APPROVAL", "Only an approved payroll run can be exported for external audit and GM approval.", 409);
    }
    const buffer = payrollExternalWorkbook({
      ...context,
      stage: "APPROVED_PAYOUT",
    });
    await auditPayrollExport({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      run: context.run,
      action: "PAYROLL_AUDIT_PACK_EXPORTED",
      stage: "APPROVED_PAYOUT",
    });
    const safePeriod = String(context.run.periodCode || "Payroll").replace(/[^A-Za-z0-9_-]+/g, "_");
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
