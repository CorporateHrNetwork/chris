const express = require("express");
const fs = require("fs");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const { getEmployeeLeaveLedger } = require("../services/employeeLeaveLedgerService");
const { getEosbStatement } = require("../services/eosbService");

const router = express.Router();
router.use(requireAuth);

function essError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function resolveSelf(req) {
  if (req.auth?.organization?.slug !== "zermatt-liquor-limited") {
    throw essError("ESS_NOT_ENABLED", "Employee Self Service is currently enabled for Zermatt Liquor Limited.", 403);
  }
  if (!req.auth?.employeeId) {
    throw essError(
      "ESS_EMPLOYEE_LINK_REQUIRED",
      "This CHRiS user account is not linked to an employee record. Contact HR to link the account.",
      403
    );
  }
  const employee = await prisma.employee.findFirst({
    where: {
      id: req.auth.employeeId,
      organizationId: req.auth.organizationId,
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      phone: true,
      gender: true,
      status: true,
      hireDate: true,
      confirmationDate: true,
      employmentType: true,
      department: { select: { id: true, code: true, name: true } },
      designation: { select: { id: true, code: true, name: true, employmentLevel: { select: { code: true, name: true, levelNumber: true } } } },
      location: { select: { id: true, code: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
      employmentEpisodes: {
        where: { endDate: null },
        orderBy: [{ sequenceNumber: "desc" }],
        take: 1,
        select: { startDate: true, sequenceNumber: true },
      },
      lineManagerAssignments: {
        where: { effectiveTo: null },
        take: 1,
        select: {
          manager: {
            select: {
              employeeNumber: true,
              firstName: true,
              middleName: true,
              lastName: true,
              designation: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!employee) {
    throw essError("ESS_EMPLOYEE_NOT_FOUND", "The employee linked to this user account is unavailable.", 404);
  }
  return employee;
}

function fullName(row) {
  return [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ");
}

function sendError(res, error, fallback) {
  return res.status(error.statusCode || 500).json({
    status: "error",
    code: error.code || "ESS_ERROR",
    message: error.message || fallback,
  });
}

function lagosMonthDay() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${month}-${day}`;
}

function birthdayPhotoDataUrl(row) {
  const mimeType = String(row?.photoMimeType || "").trim().toLowerCase();
  const storagePath = String(row?.photoStoragePath || "").trim();
  if (!mimeType.startsWith("image/") || !storagePath || !fs.existsSync(storagePath)) return null;
  try {
    const buffer = fs.readFileSync(storagePath);
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

router.get("/overview", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const year = Math.max(2026, Number(req.query?.year || new Date().getFullYear()));
    const [payslips, relief] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT
            l."id",l."runId",l."currency",l."baseSalary",l."allowances",l."deductions",
            l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",l."details",
            r."status" AS "runStatus",r."approvedAt",
            p."code" AS "periodCode",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate"
           FROM payroll_run_lines l
           JOIN payroll_runs r
             ON r."id"=l."runId" AND r."organizationId"=l."organizationId"
           JOIN payroll_periods p
             ON p."id"=r."periodId" AND p."organizationId"=r."organizationId"
          WHERE l."organizationId"=$1
            AND l."employeeId"=$2
            AND r."status"='APPROVED'
          ORDER BY p."periodStart" DESC,r."approvedAt" DESC`,
        req.auth.organizationId,
        employee.id
      ),
      prisma.$queryRawUnsafe(
        `SELECT "taxYear","annualDeclaredAmount","eligibleReliefAmount","status","evidenceReference","updatedAt"
           FROM payroll_tax_reliefs
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "reliefType"='RENT' AND "taxYear"=$3
          LIMIT 1`,
        req.auth.organizationId,
        employee.id,
        year
      ),
    ]);

    const manager = employee.lineManagerAssignments?.[0]?.manager || null;
    return res.json({
      status: "success",
      data: {
        identity: {
          employeeNumber: employee.employeeNumber,
          name: fullName(employee),
          email: employee.email,
          phone: employee.phone,
          gender: employee.gender,
          status: employee.status,
        },
        employment: {
          hireDate: employee.hireDate,
          currentServiceStartDate: employee.employmentEpisodes?.[0]?.startDate || employee.hireDate,
          confirmationDate: employee.confirmationDate,
          employmentType: employee.employmentType,
          department: employee.department,
          designation: employee.designation ? {
            id: employee.designation.id,
            code: employee.designation.code,
            name: employee.designation.name,
          } : null,
          employmentLevel: employee.designation?.employmentLevel || null,
          location: employee.location,
          costCentre: employee.costCentre,
          lineManager: manager ? {
            employeeNumber: manager.employeeNumber,
            name: fullName(manager),
            designation: manager.designation?.name || null,
          } : null,
        },
        payroll: {
          approvedPayslipCount: payslips.length,
          latestPayslip: payslips[0] || null,
          rentRelief: relief[0] || null,
        },
        training: {
          connected: false,
          message: "Training Self Service will populate from the employee learning register when the CHRiS learning workflow is activated.",
          assigned: [],
          completed: [],
        },
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to load Employee Self Service.");
  }
});

router.get("/birthdays", async (req, res) => {
  try {
    await resolveSelf(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
          e."id",e."employeeNumber",e."firstName",e."middleName",e."lastName",
          loc."name" AS "locationName",des."name" AS "designationName",
          onboarding."dateOfBirth",
          photo."storagePath" AS "photoStoragePath",photo."mimeType" AS "photoMimeType"
         FROM "employees" e
         LEFT JOIN "organization_locations" loc
           ON loc."id"=e."locationId" AND loc."organizationId"=e."organizationId"
         LEFT JOIN "designations" des
           ON des."id"=e."designationId" AND des."organizationId"=e."organizationId"
         LEFT JOIN LATERAL (
           SELECT eo."sectionData"->'personal-details'->>'dateOfBirth' AS "dateOfBirth"
             FROM "employee_onboardings" eo
            WHERE eo."organizationId"=e."organizationId" AND eo."employeeId"=e."id"
            ORDER BY eo."updatedAt" DESC
            LIMIT 1
         ) onboarding ON TRUE
         LEFT JOIN LATERAL (
           SELECT ed."storagePath",ed."mimeType"
             FROM "employee_documents" ed
            WHERE ed."organizationId"=e."organizationId"
              AND ed."employeeId"=e."id"
              AND ed."category"='PASSPORT_PHOTO'
            ORDER BY ed."createdAt" DESC
            LIMIT 1
         ) photo ON TRUE
        WHERE e."organizationId"=$1
          AND e."status" IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')
        ORDER BY e."firstName",e."lastName"`,
      req.auth.organizationId
    );

    const today = lagosMonthDay();
    const birthdays = rows
      .filter((row) => {
        const raw = String(row.dateOfBirth || "").slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw.slice(5) === today;
      })
      .map((row) => ({
        employeeNumber: row.employeeNumber,
        name: fullName(row),
        designation: row.designationName || null,
        location: row.locationName || null,
        birthday: today,
        photoDataUrl: birthdayPhotoDataUrl(row),
      }));

    return res.json({
      status: "success",
      data: birthdays,
      timezone: "Africa/Lagos",
    });
  } catch (error) {
    return sendError(res, error, "Unable to load today's employee birthdays.");
  }
});

router.get("/payslips", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
          l."id",l."runId",l."currency",l."baseSalary",l."allowances",l."deductions",
          l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",l."details",
          r."status" AS "runStatus",r."approvedAt",
          p."code" AS "periodCode",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate"
         FROM payroll_run_lines l
         JOIN payroll_runs r
           ON r."id"=l."runId" AND r."organizationId"=l."organizationId"
         JOIN payroll_periods p
           ON p."id"=r."periodId" AND p."organizationId"=r."organizationId"
        WHERE l."organizationId"=$1
          AND l."employeeId"=$2
          AND r."status"='APPROVED'
        ORDER BY p."periodStart" DESC,r."approvedAt" DESC`,
      req.auth.organizationId,
      employee.id
    );
    return res.json({ status: "success", data: rows });
  } catch (error) {
    return sendError(res, error, "Unable to load your payslips.");
  }
});

router.get("/leave", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const data = await getEmployeeLeaveLedger({
      organizationId: req.auth.organizationId,
      employeeNumber: employee.employeeNumber,
      leavePolicyId: req.query?.leavePolicyId || null,
      leaveYear: req.query?.leaveYear || new Date().getFullYear(),
      proposedUnits: 0,
    });
    // Employee-scoped endpoint returns only the employee's own leave record.
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load your leave ledger.");
  }
});

router.get("/news", async (req, res) => {
  try {
    await resolveSelf(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","category","title","summary","body","isPinned","publishAt","expireAt","createdAt"
         FROM "internal_news_posts"
        WHERE "organizationId"=$1
          AND "status"='PUBLISHED'
          AND ("publishAt" IS NULL OR "publishAt" <= CURRENT_TIMESTAMP)
          AND ("expireAt" IS NULL OR "expireAt" > CURRENT_TIMESTAMP)
        ORDER BY "isPinned" DESC,COALESCE("publishAt","createdAt") DESC,"createdAt" DESC`,
      req.auth.organizationId
    );
    return res.json({ status: "success", data: rows });
  } catch (error) {
    return sendError(res, error, "Unable to load employee news.");
  }
});

router.get("/gratuity", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const statement = await getEosbStatement({
      organizationId: req.auth.organizationId,
      employeeNumber: employee.employeeNumber,
      asOf: req.query?.asOf || new Date(),
    });
    if (!statement.service?.twelveCalendarMonthsCompleted) {
      return res.json({
        status: "success",
        data: {
          eligibleForEmployeeView: false,
          serviceStartDate: statement.service?.serviceStartDate || null,
          calculationDate: statement.service?.calculationDate || null,
          message: "Your Gratuity Account becomes visible after 12 completed calendar months of employment.",
        },
      });
    }
    return res.json({
      status: "success",
      data: {
        eligibleForEmployeeView: true,
        policy: statement.policy,
        service: statement.service,
        salary: statement.salary,
        eosb: statement.eosb,
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to load your Gratuity Account.");
  }
});

module.exports = router;
