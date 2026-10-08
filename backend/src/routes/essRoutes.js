const express = require("express");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../config/prisma");
const { requireEssAuth } = require("../middleware/authMiddleware");

const router = express.Router();

const ESS_EMPLOYEE_STATUSES = new Set(["ACTIVE", "PROBATION", "LEAVE"]);

function invalidCredentials(res) {
  return res.status(401).json({
    status: "error",
    message: "Invalid employee login credentials.",
  });
}

/*
============================================================
EMPLOYEE SELF-SERVICE LOGIN
============================================================
This is intentionally separate from the CHRiS administration login.
Only an active CHRiS user account that is linked to an employee record
may receive an ESS token.
*/
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;
    const organizationSlug = String(req.body?.organizationSlug || "").trim().toLowerCase();

    if (!email || !password || !organizationSlug) {
      return invalidCredentials(res);
    }

    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, slug: true, name: true, status: true, logoUrl: true },
    });

    if (!organization || organization.status !== "ACTIVE") {
      return invalidCredentials(res);
    }

    const user = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email,
        isActive: true,
        employeeId: { not: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (!user || !user.employee || !ESS_EMPLOYEE_STATUSES.has(user.employee.status)) {
      return invalidCredentials(res);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return invalidCredentials(res);
    }

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: organization.id,
        accessType: "ESS",
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    return res.status(200).json({
      status: "success",
      message: "Employee portal login successful.",
      data: {
        token,
        employee: {
          employeeNumber: user.employee.employeeNumber,
          firstName: user.employee.firstName,
          middleName: user.employee.middleName,
          lastName: user.employee.lastName,
          email: user.employee.email || user.email,
          status: user.employee.status,
        },
        organization: {
          name: organization.name,
          slug: organization.slug,
          logoUrl: organization.logoUrl,
        },
      },
    });
  } catch (error) {
    console.error("ESS login error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to complete employee portal login.",
    });
  }
});

/*
============================================================
CURRENT EMPLOYEE PROFILE
============================================================
The employee ID is taken only from the authenticated ESS token.
There is deliberately no employeeId/employeeNumber route parameter.
Changing the browser URL therefore cannot select another employee.
*/
router.get("/me", requireEssAuth, async (req, res) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: {
        id: req.essAuth.employeeId,
        organizationId: req.essAuth.organizationId,
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
        employmentType: true,
        hireDate: true,
        confirmationDate: true,
        exitDate: true,
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true, city: true, state: true } },
        costCentre: { select: { id: true, name: true, code: true } },
      },
    });

    if (!employee || !ESS_EMPLOYEE_STATUSES.has(employee.status)) {
      return res.status(403).json({
        status: "error",
        code: "ESS_EMPLOYEE_ACCESS_REVOKED",
        message: "Employee portal access is no longer available for this account.",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: req.essAuth.userId,
        organizationId: req.essAuth.organizationId,
        isActive: true,
      },
      select: { email: true },
    });

    return res.status(200).json({
      status: "success",
      data: {
        employee: {
          ...employee,
          email: employee.email || user?.email || null,
        },
        organization: {
          id: req.essAuth.organizationId,
          name: req.essAuth.organization.name,
          slug: req.essAuth.organization.slug,
          logoUrl: req.essAuth.organization.logoUrl,
          timezone: req.essAuth.organization.timezone,
          currency: req.essAuth.organization.currency,
        },
      },
    });
  } catch (error) {
    console.error("ESS profile error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to load your employee profile.",
    });
  }
});

router.get("/dashboard", requireEssAuth, async (req,res) => {
  try {
    const orgId=req.essAuth.organizationId,eid=req.essAuth.employeeId;
    const employee=await prisma.employee.findFirst({where:{id:eid,organizationId:orgId},select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,email:true,phone:true,gender:true,status:true,employmentType:true,hireDate:true,confirmationDate:true,exitDate:true,nationalIdentificationNumber:true,department:{select:{id:true,name:true,code:true}},designation:{select:{id:true,name:true,code:true,employmentLevel:{select:{levelNumber:true,code:true,name:true}}}},location:{select:{id:true,name:true,code:true,city:true,state:true}},costCentre:{select:{id:true,name:true,code:true}},employmentEpisodes:{where:{endDate:null},orderBy:{sequenceNumber:"desc"},take:1,select:{startDate:true,sequenceNumber:true}},lineManagerAssignments:{where:{effectiveTo:null},take:1,select:{manager:{select:{employeeNumber:true,firstName:true,middleName:true,lastName:true,designation:{select:{name:true}}}}}}}});
    if(!employee||!ESS_EMPLOYEE_STATUSES.has(employee.status))return res.status(403).json({status:"error",code:"ESS_EMPLOYEE_ACCESS_REVOKED",message:"Employee portal access is no longer available for this account."});
    const [onboardingRows,documents,statutory,attendance,payslips,leaveBalances,cycles,gratuityRows,newsRows,birthdayRows,anniversaryRows]=await Promise.all([
      prisma.$queryRawUnsafe('SELECT eo."id",eo."completionPercent",eo."currentStage",eo."status",eo."sectionProgress",eo."sectionData",t."sections" AS "templateSections",eo."updatedAt" FROM "employee_onboardings" eo JOIN "onboarding_workflow_templates" t ON t."id"=eo."templateId" AND t."organizationId"=eo."organizationId" WHERE eo."organizationId"=$1 AND eo."employeeId"=$2 ORDER BY eo."updatedAt" DESC LIMIT 1',orgId,eid),
      prisma.$queryRawUnsafe('SELECT "id","category","originalName","mimeType","sizeBytes","createdAt" FROM "employee_documents" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC',orgId,eid),
      prisma.$queryRawUnsafe('SELECT "id","obligationType","periodYear","periodMonth","currency","assessableBase","employeeAmount","employerAmount","totalLiability","amountRemitted","status","dueDate" FROM "statutory_obligations" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "periodYear" DESC,"periodMonth" DESC,"obligationType"',orgId,eid),
      prisma.$queryRawUnsafe('SELECT "id","attendanceDate","clockIn","clockOut","status","lateMinutes","overtimeMinutes","source" FROM "attendance_records" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "attendanceDate" DESC LIMIT 60',orgId,eid),
      prisma.$queryRawUnsafe('SELECT l."id",l."runId",l."currency",l."baseSalary",l."allowances",l."deductions",l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",l."details",r."status" AS "runStatus",r."approvedAt",p."code" AS "periodCode",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate" FROM payroll_run_lines l JOIN payroll_runs r ON r."id"=l."runId" AND r."organizationId"=l."organizationId" JOIN payroll_periods p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId" WHERE l."organizationId"=$1 AND l."employeeId"=$2 AND r."status"=\'APPROVED\' ORDER BY p."periodStart" DESC,r."approvedAt" DESC',orgId,eid),
      prisma.$queryRawUnsafe('SELECT lb."id",lb."leaveYear",lb."openingBalance",lb."accrued",lb."carriedForward",lb."used",lb."adjusted",lt."name" AS "leaveType" FROM "leave_balances" lb JOIN "leave_types" lt ON lt."id"=lb."leaveTypeId" AND lt."organizationId"=lb."organizationId" WHERE lb."organizationId"=$1 AND lb."employeeId"=$2 ORDER BY lb."leaveYear" DESC,lt."name"',orgId,eid),
      prisma.$queryRawUnsafe('SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 ORDER BY "year" DESC,"quarter" DESC LIMIT 4',orgId),
      prisma.$queryRawUnsafe('SELECT "id","currency","gratuitySeverance","grossPayable","netSettlement","amountPaid","status","approvedAt","paidAt","updatedAt" FROM "exit_settlements" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status" IN (\'APPROVED\',\'PAYMENT_PENDING\',\'PARTIALLY_PAID\',\'PAID\') ORDER BY "updatedAt" DESC LIMIT 1',orgId,eid),
      prisma.$queryRawUnsafe('SELECT n."id",n."category",n."title",n."summary",n."body",n."status",n."isPinned",n."publishAt",n."expireAt",n."attachmentFileName",n."attachmentMimeType",n."attachmentSize" FROM "internal_news_posts" n WHERE n."organizationId"=$1 AND n."status"=\'PUBLISHED\' AND (n."publishAt" IS NULL OR n."publishAt"<=CURRENT_TIMESTAMP) AND (n."expireAt" IS NULL OR n."expireAt">=CURRENT_TIMESTAMP) ORDER BY n."isPinned" DESC,COALESCE(n."publishAt",n."createdAt") DESC LIMIT 100',orgId),
      prisma.$queryRawUnsafe('SELECT e."id",e."employeeNumber",e."firstName",e."middleName",e."lastName",e."hireDate",d."name" AS "designation",(eo."sectionData"->\'personal-details\'->>\'dateOfBirth\') AS "dateOfBirth" FROM "employees" e LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId" LEFT JOIN LATERAL (SELECT "sectionData" FROM "employee_onboardings" WHERE "organizationId"=$1 AND "employeeId"=e."id" ORDER BY "updatedAt" DESC LIMIT 1) eo ON TRUE WHERE e."organizationId"=$1 AND e."status" IN (\'ACTIVE\',\'PROBATION\',\'LEAVE\') AND (eo."sectionData"->\'personal-details\'->>\'dateOfBirth\') IS NOT NULL AND (eo."sectionData"->\'personal-details\'->>\'dateOfBirth\') ~ \'^[0-9]{4}-[0-9]{2}-[0-9]{2}\' AND EXTRACT(MONTH FROM (eo."sectionData"->\'personal-details\'->>\'dateOfBirth\')::date)=EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM (eo."sectionData"->\'personal-details\'->>\'dateOfBirth\')::date)=EXTRACT(DAY FROM CURRENT_DATE) ORDER BY e."firstName",e."lastName"',orgId),
      prisma.$queryRawUnsafe('SELECT e."id",e."employeeNumber",e."firstName",e."middleName",e."lastName",e."hireDate",d."name" AS "designation" FROM "employees" e LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."status" IN (\'ACTIVE\',\'PROBATION\',\'LEAVE\') AND e."hireDate" IS NOT NULL AND e."hireDate" < CURRENT_DATE AND EXTRACT(MONTH FROM e."hireDate")=EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM e."hireDate")=EXTRACT(DAY FROM CURRENT_DATE) ORDER BY e."firstName",e."lastName"',orgId)
    ]);
    const onboarding=onboardingRows[0]||null,sectionData=onboarding?.sectionData||{},personalDetails=sectionData["personal-details"]||{},approvedGratuity=gratuityRows[0]||null,performance=[],news=newsRows||[],birthdays=birthdayRows||[],workAnniversaries=anniversaryRows||[];
    const salaryRows=await prisma.$queryRawUnsafe('SELECT l."grossPay",l."currency",p."periodEnd" FROM payroll_run_lines l JOIN payroll_runs r ON r."id"=l."runId" AND r."organizationId"=l."organizationId" AND r."status"=\'APPROVED\' JOIN payroll_periods p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId" WHERE l."organizationId"=$1 AND l."employeeId"=$2 ORDER BY p."periodEnd" DESC,r."approvedAt" DESC LIMIT 1',orgId,eid);
    const grossMonthly=Number(salaryRows[0]?.grossPay||approvedGratuity?.finalSalary||0);
    const salaryCurrency=salaryRows[0]?.currency||approvedGratuity?.currency||"NGN";
    const serviceStart=employee.hireDate||employee.employmentEpisodes?.[0]?.startDate||null;
    const today=new Date();
    const startDate=serviceStart?new Date(serviceStart):null;
    const serviceDays=startDate?Math.max(0,Math.floor((Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth(),startDate.getUTCDate()))/86400000)):0;
    const serviceMonths=serviceDays/30;
    const liveGratuity=serviceStart&&grossMonthly>0?grossMonthly*(serviceDays/30)*0.075:0;
    const gratuity=approvedGratuity?{...approvedGratuity,serviceStartDate:serviceStart,serviceDays,equivalentMonths:serviceMonths,grossMonthly,calculationRule:"Gross Monthly Salary × (Actual Days in Service ÷ 30) × 7.5%",amountAsOfToday:liveGratuity,currency:approvedGratuity.currency||salaryCurrency}:{currency:salaryCurrency,serviceStartDate:serviceStart,serviceDays,equivalentMonths:serviceMonths,grossMonthly,calculationRule:"Gross Monthly Salary × (Actual Days in Service ÷ 30) × 7.5%",amountAsOfToday:liveGratuity,status:"ACCRUING"};
    for(const cycle of cycles){
      const kpis=await prisma.$queryRawUnsafe('SELECT "id","title","objective","measurement","target","weight","source","version","status","approvedAt" FROM "chris_performance_kpis" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 ORDER BY "createdAt"',orgId,eid,cycle.id);
      const assessments=await prisma.$queryRawUnsafe('SELECT "id","selfAssessment","managerAssessment","finalRating","improvementNotes","status","submittedAt","managerReviewedAt" FROM "chris_performance_assessments" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 LIMIT 1',orgId,eid,cycle.id);
      const promotion=assessments[0]?await prisma.$queryRawUnsafe('SELECT "status","lrtStatus","hrRecommendation","leadershipRecommendation" FROM "chris_promotion_pipeline" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "assessmentId"=$3 LIMIT 1',orgId,eid,assessments[0].id):[];
      const pip=assessments[0]?await prisma.$queryRawUnsafe('SELECT "id","improvementAreas","startDate","targetDate","status","notes" FROM "chris_pips" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "assessmentId"=$3 LIMIT 1',orgId,eid,assessments[0].id):[];
      performance.push({cycle,kpis:kpis.filter(k=>k.status==="APPROVED"),assessment:assessments[0]||null,promotionPipeline:promotion[0]||null,pip:pip[0]||null});
    }
    const manager=employee.lineManagerAssignments?.[0]?.manager||null;
    return res.json({status:"success",data:{profile:{...employee,name:[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(" "),employmentLevel:employee.designation?.employmentLevel||null,lineManager:manager?{employeeNumber:manager.employeeNumber,name:[manager.firstName,manager.middleName,manager.lastName].filter(Boolean).join(" "),designation:manager.designation?.name||null}:null},news,birthdays,workAnniversaries,onboarding:onboarding?{id:onboarding.id,completionPercent:Number(onboarding.completionPercent||0),currentStage:onboarding.currentStage,status:onboarding.status,sectionProgress:onboarding.sectionProgress||{},sections:onboarding.templateSections||[],data:sectionData,documents}:{completionPercent:0,currentStage:null,status:"NOT_STARTED",sectionProgress:{},sections:[],data:{},documents:[]},statutory:{registered:sectionData["statutory-details"]||{},obligations:statutory},payment:sectionData["payment-details"]||{},payroll:{payslips,latestPayslip:payslips[0]||null},leaveBalances,attendance,performance,gratuity,birthday:{dateOfBirth:personalDetails.dateOfBirth||null}}});
  }catch(error){console.error("ESS dashboard error:",error);return res.status(500).json({status:"error",message:"Unable to load your employee portal dashboard."});}
});

router.get("/payslips/:id/download",requireEssAuth,async(req,res)=>{
  try{
    const rows=await prisma.$queryRawUnsafe('SELECT l."employeeNumber",l."employeeName",l."currency",l."baseSalary",l."allowances",l."deductions",l."advanceRecovery",l."loanRecovery",l."grossPay",l."netPreview",l."statutoryStatus",p."name" AS "periodName",p."periodStart",p."periodEnd",p."payDate" FROM payroll_run_lines l JOIN payroll_runs r ON r."id"=l."runId" AND r."organizationId"=l."organizationId" AND r."status"=\'APPROVED\' JOIN payroll_periods p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId" WHERE l."organizationId"=$1 AND l."employeeId"=$2 AND l."id"=$3 LIMIT 1',req.essAuth.organizationId,req.essAuth.employeeId,req.params.id);
    const row=rows[0];if(!row)return res.status(404).json({status:"error",message:"Payslip not found."});
    const lines=[["CHRiS Employee Payslip"],["Employee",row.employeeName||row.employeeNumber],["Employee Number",row.employeeNumber],["Pay Period",row.periodName||""],["Period Start",row.periodStart||""],["Period End",row.periodEnd||""],["Pay Date",row.payDate||""],["Currency",row.currency||"NGN"],[],["Earnings / Salary","Amount"],["Basic Salary",row.baseSalary||0],["Allowances",row.allowances||0],["Gross Pay",row.grossPay||0],[],["Deductions / Recoveries","Amount"],["Deductions",row.deductions||0],["Advance Recovery",row.advanceRecovery||0],["Loan Recovery",row.loanRecovery||0],["Gross Pay",row.grossPay||0],["Net Pay",row.netPreview||0],["Statutory Status",row.statutoryStatus||""]];
    const csv=lines.map(line=>line.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n"),safe=String(row.periodName||"Payslip").replace(/[^A-Za-z0-9_-]+/g,"_");
    res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition","attachment; filename=\"CHRiS_"+safe+"_Payslip.csv\"");return res.send(csv);
  }catch(error){return res.status(500).json({status:"error",message:"Unable to download your payslip."});}
});

router.get("/documents/:id/download",requireEssAuth,async(req,res)=>{
  try{
    const rows=await prisma.$queryRawUnsafe('SELECT "originalName","mimeType","sizeBytes","storagePath" FROM "employee_documents" WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3 LIMIT 1',req.params.id,req.essAuth.organizationId,req.essAuth.employeeId,);
    const row=rows[0];if(!row||!row.storagePath||!fs.existsSync(row.storagePath))return res.status(404).json({status:"error",message:"Document is not available for download."});
    const safe=String(row.originalName||"CHRiS_Document").replace(/[\\/\r\n"]/g,"_");res.setHeader("Content-Type",row.mimeType||"application/octet-stream");res.setHeader("Content-Length",String(row.sizeBytes||fs.statSync(row.storagePath).size));res.setHeader("Content-Disposition",'attachment; filename="'+safe+'"');return fs.createReadStream(row.storagePath).pipe(res);
  }catch(error){return res.status(500).json({status:"error",message:"Unable to download your document."});}
});

router.post("/performance/self-assessment",requireEssAuth,async(req,res)=>{
  try{
    const cycleId=String(req.body?.cycleId||"").trim();if(!cycleId)return res.status(400).json({status:"error",message:"Performance cycle is required."});
    const orgId=req.essAuth.organizationId,eid=req.essAuth.employeeId;
    const cycle=(await prisma.$queryRawUnsafe('SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',orgId,cycleId))[0];if(!cycle)return res.status(404).json({status:"error",message:"Performance cycle not found."});
    const kpis=await prisma.$queryRawUnsafe('SELECT "id" FROM "chris_performance_kpis" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 AND "status"=\'APPROVED\'',orgId,eid,cycleId);if(!kpis.length)return res.status(422).json({status:"error",message:"Your approved objectives have not yet been published for this cycle."});
    const assessment=req.body?.assessment&&typeof req.body.assessment==="object"?req.body.assessment:{};
    const row=(await prisma.$queryRawUnsafe('INSERT INTO "chris_performance_assessments" ("id","organizationId","employeeId","cycleId","selfAssessment","status","submittedAt") VALUES (gen_random_uuid(),$1,$2,$3,$4::jsonb,\'MANAGER_APPROVAL_PENDING\',CURRENT_TIMESTAMP) ON CONFLICT ("organizationId","employeeId","cycleId") DO UPDATE SET "selfAssessment"=EXCLUDED."selfAssessment","status"=\'MANAGER_APPROVAL_PENDING\',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP RETURNING *',orgId,eid,cycleId,JSON.stringify(assessment)))[0];
    return res.json({status:"success",message:"Self-assessment submitted to your line manager.",data:row});
  }catch(error){return res.status(500).json({status:"error",message:"Unable to submit your self-assessment."});}
});

module.exports = router;
