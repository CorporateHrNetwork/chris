const express = require("express");
const fs = require("fs");
const prisma = require("../config/prisma");
const { requireEssAuth } = require("../middleware/authMiddleware");
const XLSX = require("xlsx");
const { getEmployeeLeaveLedger } = require("../services/employeeLeaveLedgerService");
const { getEosbStatement } = require("../services/eosbService");

const router = express.Router();
function requireEssCompatible(req, res, next) {
  return requireEssAuth(req, res, () => {
    req.auth = { userId: req.essAuth.userId, organizationId: req.essAuth.organizationId, employeeId: req.essAuth.employeeId, organization: req.essAuth.organization };
    return next();
  });
}

router.use(requireEssCompatible);

function essError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function ensureZermattOrganization(req) {
  if (req.auth?.organization?.slug !== "zermatt-liquor-limited") {
    throw essError("ESS_NOT_ENABLED", "Employee Self Service is currently enabled for Zermatt Liquor Limited.", 403);
  }
}

async function resolveSelf(req) {
  ensureZermattOrganization(req);
  let employeeId = req.auth?.employeeId || null;

  if (!employeeId && req.auth?.userId) {
    const user = await prisma.user.findFirst({
      where: { id: req.auth.userId, organizationId: req.auth.organizationId },
      select: { id: true, email: true, employeeId: true },
    });
    employeeId = user?.employeeId || null;

    if (!employeeId && user?.email) {
      const matches = await prisma.$queryRawUnsafe(
        `SELECT e."id",e."employeeNumber"
           FROM "employees" e
          WHERE e."organizationId"=$1
            AND LOWER(COALESCE(e."email",''))=LOWER($2)
            AND e."status" IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')
          ORDER BY e."employeeNumber"
          LIMIT 2`,
        req.auth.organizationId,
        String(user.email).trim()
      );

      if (matches.length === 1) {
        const alreadyLinked = await prisma.user.findFirst({
          where: {
            organizationId: req.auth.organizationId,
            employeeId: matches[0].id,
            NOT: { id: user.id },
          },
          select: { id: true },
        });

        if (!alreadyLinked) {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { employeeId: matches[0].id },
            });
            await tx.organizationAudit.create({
              data: {
                organizationId: req.auth.organizationId,
                actorUserId: user.id,
                entityType: "User",
                entityId: user.id,
                action: "ESS_EMPLOYEE_LINK_AUTO_RECONCILED",
                newValue: {
                  employeeId: matches[0].id,
                  employeeNumber: matches[0].employeeNumber,
                  matchedBy: "work_email",
                },
                reason: "Authenticated Zermatt ESS account reconciled to a unique current employee with the same work email.",
              },
            });
          });
          employeeId = matches[0].id;
          req.auth.employeeId = employeeId;
        }
      }
    }
  }

  if (!employeeId) {
    throw essError(
      "ESS_EMPLOYEE_LINK_REQUIRED",
      "This CHRiS user account is not linked to an employee record. Contact HR to link the account.",
      403
    );
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
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
    ensureZermattOrganization(req);
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
    ensureZermattOrganization(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","category","title","summary","body","isPinned","publishAt","expireAt","createdAt",
              "attachmentFileName","attachmentMimeType","attachmentSize"
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

router.get("/news/:id/attachment", async (req, res) => {
  try {
    ensureZermattOrganization(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "attachmentFileName","attachmentMimeType","attachmentSize","attachmentData"
         FROM "internal_news_posts"
        WHERE "organizationId"=$1
          AND "id"=$2
          AND "status"='PUBLISHED'
          AND ("publishAt" IS NULL OR "publishAt" <= CURRENT_TIMESTAMP)
          AND ("expireAt" IS NULL OR "expireAt" > CURRENT_TIMESTAMP)
        LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    const row = rows[0];
    if (!row || !row.attachmentData) throw essError("NEWS_ATTACHMENT_NOT_FOUND", "This news item has no available attachment.", 404);
    res.setHeader("Content-Type", row.attachmentMimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(row.attachmentSize || row.attachmentData.length));
    const safeName = String(row.attachmentFileName || "news-attachment").replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    return res.send(row.attachmentData);
  } catch (error) {
    return sendError(res, error, "Unable to load employee news attachment.");
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

router.get("/dashboard", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const [onboardingRows, documents, statutory, attendance, payslips, leaveBalances, cycles] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT eo."id",eo."completionPercent",eo."currentStage",eo."status",eo."sectionProgress",eo."sectionData",t."sections" AS "templateSections",eo."updatedAt" FROM "employee_onboardings" eo JOIN "onboarding_workflow_templates" t ON t."id"=eo."templateId" AND t."organizationId"=eo."organizationId" WHERE eo."organizationId"=$1 AND eo."employeeId"=$2 ORDER BY eo."updatedAt" DESC LIMIT 1`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT "id","category","originalName","mimeType","sizeBytes","createdAt" FROM "employee_documents" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT "id","obligationType","periodYear","periodMonth","currency","assessableBase","employeeAmount","employerAmount","totalLiability","amountRemitted","status","dueDate" FROM "statutory_obligations" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "periodYear" DESC,"periodMonth" DESC,"obligationType"`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT "id","attendanceDate","clockIn","clockOut","status","lateMinutes","overtimeMinutes","source" FROM "attendance_records" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "attendanceDate" DESC LIMIT 60`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT l."id",l."runId",l."currency",l."baseSalary",l."allowances",l."deductions",l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",l."details",r."status" AS "runStatus",r."approvedAt",p."code" AS "periodCode",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate" FROM payroll_run_lines l JOIN payroll_runs r ON r."id"=l."runId" AND r."organizationId"=l."organizationId" JOIN payroll_periods p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId" WHERE l."organizationId"=$1 AND l."employeeId"=$2 AND r."status"='APPROVED' ORDER BY p."periodStart" DESC,r."approvedAt" DESC`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT lb."id",lb."leaveYear",lb."openingBalance",lb."accrued",lb."carriedForward",lb."used",lb."adjusted",lt."name" AS "leaveType" FROM "leave_balances" lb JOIN "leave_types" lt ON lt."id"=lb."leaveTypeId" AND lt."organizationId"=lb."organizationId" WHERE lb."organizationId"=$1 AND lb."employeeId"=$2 ORDER BY lb."leaveYear" DESC,lt."name"`, req.auth.organizationId, employee.id),
      prisma.$queryRawUnsafe(`SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 ORDER BY "year" DESC,"quarter" DESC LIMIT 4`, req.auth.organizationId),
    ]);
    const onboarding = onboardingRows[0] || null;
    const performance = [];
    for (const cycle of cycles) {
      const kpis = await prisma.$queryRawUnsafe(`SELECT "id","title","objective","measurement","target","weight","source","version","status","approvedAt" FROM "chris_performance_kpis" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 ORDER BY "createdAt"`, req.auth.organizationId, employee.id, cycle.id);
      const assessments = await prisma.$queryRawUnsafe(`SELECT "id","selfAssessment","managerAssessment","finalRating","improvementNotes","status","submittedAt","managerReviewedAt" FROM "chris_performance_assessments" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 LIMIT 1`, req.auth.organizationId, employee.id, cycle.id);
      const pipeline = assessments[0] ? await prisma.$queryRawUnsafe(`SELECT "status","lrtStatus","hrRecommendation","leadershipRecommendation" FROM "chris_promotion_pipeline" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "assessmentId"=$3 LIMIT 1`, req.auth.organizationId, employee.id, assessments[0].id) : [];
      const pip = assessments[0] ? await prisma.$queryRawUnsafe(`SELECT "id","improvementAreas","startDate","targetDate","status","notes" FROM "chris_pips" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "assessmentId"=$3 LIMIT 1`, req.auth.organizationId, employee.id, assessments[0].id) : [];
      performance.push({ cycle, kpis: kpis.filter(k => k.status === "APPROVED"), assessment: assessments[0] || null, promotionPipeline: pipeline[0] || null, pip: pip[0] || null });
    }
    const sectionData = onboarding?.sectionData || {};
    const manager = employee.lineManagerAssignments?.[0]?.manager || null;
    return res.json({ status:"success", data:{
      profile:{...employee,name:fullName(employee),employmentLevel:employee.designation?.employmentLevel||null,lineManager:manager?{employeeNumber:manager.employeeNumber,name:fullName(manager),designation:manager.designation?.name||null}:null},
      onboarding:onboarding?{id:onboarding.id,completionPercent:Number(onboarding.completionPercent||0),currentStage:onboarding.currentStage,status:onboarding.status,sectionProgress:onboarding.sectionProgress||{},sections:onboarding.templateSections||[],data:sectionData,documents}:{completionPercent:0,currentStage:null,status:"NOT_STARTED",sectionProgress:{},sections:[],data:{},documents:[]},
      statutory:{registered:sectionData["statutory-details"]||{},obligations:statutory},
      payment:sectionData["payment-details"]||{},
      payroll:{payslips,latestPayslip:payslips[0]||null},
      leaveBalances,attendance,performance
    }});
  } catch(error) { console.error("ESS dashboard error:",error); return sendError(res,error,"Unable to load your employee portal dashboard."); }
});

router.get("/payslips/:id/download", async (req,res) => {
  try {
    const employee=await resolveSelf(req);
    const rows=await prisma.$queryRawUnsafe(`SELECT l."id",l."employeeNumber",l."employeeName",l."currency",l."baseSalary",l."allowances",l."deductions",l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",l."details",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate" FROM payroll_run_lines l JOIN payroll_runs r ON r."id"=l."runId" AND r."organizationId"=l."organizationId" AND r."status"='APPROVED' JOIN payroll_periods p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId" WHERE l."organizationId"=$1 AND l."employeeId"=$2 AND l."id"=$3 LIMIT 1`,req.auth.organizationId,employee.id,req.params.id);
    const row=rows[0]; if(!row) return res.status(404).json({status:"error",message:"Payslip not found."});
    const wb=XLSX.utils.book_new(); const summary=[["CHRiS Employee Payslip"],["Employee",row.employeeName||employee.employeeNumber],["Employee Number",row.employeeNumber||employee.employeeNumber],["Pay Period",row.periodName||"—"],["Period Start",row.periodStart||"—"],["Period End",row.periodEnd||"—"],["Pay Date",row.payDate||"—"],["Currency",row.currency||"NGN"],[],["Earnings / Salary","Amount"],["Basic Salary",Number(row.baseSalary||0)],["Allowances",Number(row.allowances||0)],["Gross Pay",Number(row.grossPay||0)],[],["Deductions / Recoveries","Amount"],["Deductions",Number(row.deductions||0)],["Advance Recovery",Number(row.advanceRecovery||0)],["Loan Recovery",Number(row.loanRecovery||0)],["Net Pay",Number(row.netPreview||0)],[],["Statutory Status",row.statutoryStatus||"—"]];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"Payslip");
    const details=row.details&&typeof row.details==="object"?Object.entries(row.details).map(([key,value])=>({Item:key,Value:typeof value==="object"?JSON.stringify(value):value})):[]; if(details.length) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(details),"Details");
    const buffer=XLSX.write(wb,{type:"buffer",bookType:"xlsx"}); const safe=String(row.periodName||"Payslip").replace(/[^A-Za-z0-9_-]+/g,"_");
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition","attachment; filename=\"CHRiS_"+safe+"_Payslip.xlsx\""); return res.send(buffer);
  } catch(error) { return sendError(res,error,"Unable to download your payslip."); }
});

router.post("/performance/self-assessment", async (req,res) => {
  try {
    const employee=await resolveSelf(req); const cycleId=String(req.body?.cycleId||"").trim(); if(!cycleId) return res.status(400).json({status:"error",message:"Performance cycle is required."});
    const cycle=(await prisma.$queryRawUnsafe(`SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,req.auth.organizationId,cycleId))[0]; if(!cycle) return res.status(404).json({status:"error",message:"Performance cycle not found."});
    const kpis=await prisma.$queryRawUnsafe(`SELECT "id" FROM "chris_performance_kpis" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 AND "status"='APPROVED'`,req.auth.organizationId,employee.id,cycleId); if(!kpis.length) return res.status(422).json({status:"error",message:"Your approved objectives have not yet been published for this cycle."});
    const assessment=req.body?.assessment&&typeof req.body.assessment==="object"?req.body.assessment:{};
    const row=(await prisma.$queryRawUnsafe(`INSERT INTO "chris_performance_assessments" ("id","organizationId","employeeId","cycleId","selfAssessment","status","submittedAt") VALUES ($1,$2,$3,$4,$5::jsonb,'MANAGER_APPROVAL_PENDING',CURRENT_TIMESTAMP) ON CONFLICT ("organizationId","employeeId","cycleId") DO UPDATE SET "selfAssessment"=EXCLUDED."selfAssessment","status"='MANAGER_APPROVAL_PENDING',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP RETURNING *`,require("crypto").randomUUID(),req.auth.organizationId,employee.id,cycleId,JSON.stringify(assessment)))[0];
    return res.json({status:"success",message:"Self-assessment submitted to your line manager.",data:row});
  } catch(error) { return sendError(res,error,"Unable to submit your self-assessment."); }
});

router.get("/documents/:id/download", async (req, res) => {
  try {
    const employee = await resolveSelf(req);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "originalName","mimeType","sizeBytes","storagePath" FROM "employee_documents" WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3 LIMIT 1`,
      req.params.id, req.auth.organizationId, employee.id
    );
    const row = rows[0];
    if (!row || !row.storagePath || !fs.existsSync(row.storagePath)) {
      return res.status(404).json({ status:"error", message:"Document is not available for download." });
    }
    const safeName = String(row.originalName || "CHRiS_Document").replace(/[\\/\r\n"]/g,"_");
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(row.sizeBytes || fs.statSync(row.storagePath).size));
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    return fs.createReadStream(row.storagePath).pipe(res);
  } catch(error) {
    return sendError(res,error,"Unable to download your document.");
  }
});

module.exports = router;
