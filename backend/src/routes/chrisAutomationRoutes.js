const express = require("express");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const payroll = require("../services/payrollOperationsService");
const exitSettlement = require("../services/exitSettlementService");

const router = express.Router();
router.use(requireAuth);

const id = () => crypto.randomUUID();
const text = (v) => String(v ?? "").trim();
const isoDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const fallbackKpis = (title = "", department = "") => {
  const t = `${title} ${department}`.toLowerCase();
  if (/(account|finance|audit|treasur)/.test(t)) return [
    ["Financial Accuracy","Maintain accurate and timely financial records.","Error rate / reconciliations","≥98% accuracy",25],
    ["Reporting Timeliness","Deliver required financial reports within agreed deadlines.","On-time submission rate","100% on time",25],
    ["Control Compliance","Maintain compliance with approved financial controls.","Control exceptions","Zero material exceptions",25],
    ["Issue Resolution","Close audit and reconciliation exceptions promptly.","Average days to closure","≤10 working days",25],
  ];
  if (/(sales|commercial|business development|marketing)/.test(t)) return [
    ["Revenue Target","Achieve assigned revenue and volume objectives.","Actual vs target","≥100% of approved target",30],
    ["Customer Growth","Expand and retain the assigned customer portfolio.","New/retained customers","Target agreed by manager",25],
    ["Collections","Support timely collection of customer balances.","Collection performance","≥95% of assigned target",20],
    ["Market Execution","Execute approved commercial activities consistently.","Activity completion rate","≥95%",25],
  ];
  if (/(store|warehouse|logistics|inventory|supply)/.test(t)) return [
    ["Inventory Accuracy","Maintain accurate physical and system inventory.","Stock variance","≤1% variance",30],
    ["Order Fulfilment","Process approved stock movements accurately and promptly.","On-time fulfilment","≥98%",25],
    ["Loss Prevention","Reduce avoidable inventory loss and control exceptions.","Loss/exception rate","Within approved tolerance",25],
    ["Records Compliance","Maintain complete and timely warehouse documentation.","Document completeness","100%",20],
  ];
  if (/(human resource|hr|admin|people)/.test(t)) return [
    ["People Service Delivery","Resolve employee requests accurately and promptly.","SLA compliance","≥95%",25],
    ["Employee Data Integrity","Maintain complete and accurate employee records.","Record completeness","≥99%",25],
    ["HR Compliance","Execute HR processes in accordance with approved policy.","Compliance exceptions","Zero material exceptions",25],
    ["Employee Engagement","Support timely employee communication and engagement initiatives.","Initiative completion","≥95%",25],
  ];
  return [
    ["Role Delivery","Deliver core responsibilities in line with the approved job description.","Objective completion","≥95% of agreed objectives",30],
    ["Quality","Maintain high quality and accuracy in assigned work.","Quality/error rate","≥98% acceptable quality",25],
    ["Timeliness","Complete assigned work within agreed timelines.","On-time completion","≥95%",25],
    ["Compliance & Collaboration","Follow approved procedures and collaborate effectively.","Compliance/feedback","No material breaches; satisfactory feedback",20],
  ];
};

async function aiKpis({ title, department, level }) {
  if (!process.env.OPENAI_API_KEY) return { source: "AI_AGENT_RULESET", kpis: fallbackKpis(title, department) };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_PERFORMANCE_MODEL || "gpt-6-luna",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: `Generate exactly 4 measurable employee KPIs for a Nigerian company's quarterly performance cycle. Role: ${title || "Employee"}. Department: ${department || "General"}. Level: ${level || "Not specified"}. Return JSON only as {"kpis":[{"title":"","objective":"","measurement":"","target":"","weight":25}]}. Do not use employee names or personal data. Weights must total 100.`,
          }],
        }],
        max_output_tokens: 1200,
      }),
    });
    if (!response.ok) throw new Error("OpenAI KPI generation failed.");
    const body = await response.json();
    const raw = body.output_text || body.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text || "";
    const parsed = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, "").trim());
    if (!Array.isArray(parsed.kpis) || parsed.kpis.length < 3) throw new Error("Invalid KPI response.");
    return { source: "AI_AGENT", kpis: parsed.kpis.slice(0, 6) };
  } catch (error) {
    console.warn("Performance AI fallback:", error.message);
    return { source: "AI_AGENT_RULESET_FALLBACK", kpis: fallbackKpis(title, department) };
  }
}

async function ensureCycle(organizationId, year, quarter, actorUserId) {
  const y = Number(year);
  const q = Number(quarter);
  if (!Number.isInteger(y) || !Number.isInteger(q) || q < 1 || q > 4) throw new Error("Valid year and quarter are required.");
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0));
  const existing = await prisma.$queryRawUnsafe(`SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 AND "year"=$2 AND "quarter"=$3 LIMIT 1`, organizationId, y, q);
  if (existing[0]) return existing[0];
  const cycle = (await prisma.$queryRawUnsafe(
    `INSERT INTO "chris_performance_cycles" ("id","organizationId","year","quarter","startDate","endDate","status") VALUES ($1,$2,$3,$4,$5::date,$6::date,'OPEN') RETURNING *`,
    id(), organizationId, y, q, start.toISOString().slice(0,10), end.toISOString().slice(0,10)
  ))[0];
  return cycle;
}

router.get("/settings", requirePermission("settings.view"), async (req,res)=>{
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "chris_automation_settings" WHERE "organizationId"=$1 LIMIT 1`, req.auth.organizationId);
  return res.json({status:"success", data: rows[0] || {organizationId:req.auth.organizationId, essUrl: "/ess", birthdayMessagesEnabled:true, anniversaryMessagesEnabled:true, autoOpenPayrollEnabled:true, quarterlyPerformanceEnabled:true}});
});

router.put("/settings", requirePermission("settings.manage"), async (req,res)=>{
  const essUrl = text(req.body?.essUrl) || "/ess";
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO "chris_automation_settings" ("organizationId","essUrl","birthdayMessagesEnabled","anniversaryMessagesEnabled","autoOpenPayrollEnabled","quarterlyPerformanceEnabled")
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT ("organizationId") DO UPDATE SET "essUrl"=EXCLUDED."essUrl","birthdayMessagesEnabled"=EXCLUDED."birthdayMessagesEnabled","anniversaryMessagesEnabled"=EXCLUDED."anniversaryMessagesEnabled","autoOpenPayrollEnabled"=EXCLUDED."autoOpenPayrollEnabled","quarterlyPerformanceEnabled"=EXCLUDED."quarterlyPerformanceEnabled","updatedAt"=CURRENT_TIMESTAMP
     RETURNING *`,
    req.auth.organizationId, essUrl,
    req.body?.birthdayMessagesEnabled !== false,
    req.body?.anniversaryMessagesEnabled !== false,
    req.body?.autoOpenPayrollEnabled !== false,
    req.body?.quarterlyPerformanceEnabled !== false
  );
  return res.json({status:"success",data:rows[0]});
});

router.get("/payroll-notes", requirePermission("payroll.view"), async (req,res)=>{
  const rows = await prisma.$queryRawUnsafe(
    `SELECT n.*, CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName", e."employeeNumber", l."name" AS "branchName"
       FROM "chris_payroll_notes" n
       LEFT JOIN "employees" e ON e."id"=n."employeeId" AND e."organizationId"=n."organizationId"
       LEFT JOIN "organization_locations" l ON l."id"=n."branchId" AND l."organizationId"=n."organizationId"
      WHERE n."organizationId"=$1
      ORDER BY n."submittedAt" DESC LIMIT 250`,
    req.auth.organizationId
  );
  return res.json({status:"success",data:rows});
});

router.post("/payroll-notes", requirePermission("payroll.view"), async (req,res)=>{
  const note = text(req.body?.originalNote);
  if (!note) return res.status(400).json({status:"error",message:"Payroll note is required."});
  const row=(await prisma.$queryRawUnsafe(
    `INSERT INTO "chris_payroll_notes" ("id","organizationId","employeeId","branchId","payrollPeriodId","category","originalNote","attachmentUrl","submittedByUserId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    id(),req.auth.organizationId,text(req.body?.employeeId)||null,text(req.body?.branchId)||req.auth.activeLocationId||null,text(req.body?.payrollPeriodId)||null,text(req.body?.category)||"OTHER",note,text(req.body?.attachmentUrl)||null,req.auth.userId
  ))[0];
  return res.status(201).json({status:"success",message:"Payroll note submitted to Head HR and Head of Audit & Internal Control.",data:row});
});

router.patch("/payroll-notes/:id/review", requirePermission("payroll.manage"), async (req,res)=>{
  const status=text(req.body?.status).toUpperCase();
  if(!["UNDER_REVIEW","APPROVED","REJECTED","IMPLEMENTED"].includes(status)) return res.status(400).json({status:"error",message:"Invalid payroll note status."});
  const reviewedNote=text(req.body?.reviewedNote)||null;
  const aiAction=req.body?.aiAction || null;
  const sets=["status=$3","reviewedNote=$4","headHrUserId=$5","aiAction=$6::jsonb","reviewedAt=CURRENT_TIMESTAMP","updatedAt=CURRENT_TIMESTAMP"];
  if(status==="IMPLEMENTED") sets.push("implementedAt=CURRENT_TIMESTAMP");
  const row=(await prisma.$queryRawUnsafe(`UPDATE "chris_payroll_notes" SET ${sets.join(",")} WHERE "id"=$1 AND "organizationId"=$2 RETURNING *`,req.params.id,req.auth.organizationId,status,reviewedNote,req.auth.userId,JSON.stringify(aiAction)))[0];
  if(!row) return res.status(404).json({status:"error",message:"Payroll note not found."});
  return res.json({status:"success",data:row});
});

router.post("/payroll-notes/:id/audit-review", requirePermission("payroll.view"), async (req,res)=>{
  const row=(await prisma.$queryRawUnsafe(
    `UPDATE "chris_payroll_notes" SET "auditUserId"=$3,"status"=CASE WHEN "status"='SUBMITTED' THEN 'UNDER_REVIEW' ELSE "status" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "organizationId"=$2 RETURNING *`,
    req.params.id,req.auth.organizationId,req.auth.userId
  ))[0];
  if(!row) return res.status(404).json({status:"error",message:"Payroll note not found."});
  return res.json({status:"success",data:row});
});

router.get("/performance/employees", requirePermission("performance.view"), async (req,res)=>{
  const rows=await prisma.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            d."name" AS "designation",dep."name" AS "department",e."status"
       FROM "employees" e
       LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId"
       LEFT JOIN "departments" dep ON dep."id"=e."departmentId" AND dep."organizationId"=e."organizationId"
      WHERE e."organizationId"=$1 AND e."status"='ACTIVE'
      ORDER BY e."employeeNumber"`,
    req.auth.organizationId
  );
  return res.json({status:"success",data:rows});
});

router.post("/performance/kpis/generate", requirePermission("performance.manage"), async (req,res)=>{
  const employeeId=text(req.body?.employeeId);
  const employee=(await prisma.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            d."name" AS "designation",dep."name" AS "department"
       FROM "employees" e
       LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId"
       LEFT JOIN "departments" dep ON dep."id"=e."departmentId" AND dep."organizationId"=e."organizationId"
      WHERE e."organizationId"=$1 AND e."id"=$2 LIMIT 1`, req.auth.organizationId,employeeId
  ))[0];
  if(!employee) return res.status(404).json({status:"error",message:"Employee not found."});
  const cycle=await ensureCycle(req.auth.organizationId,req.body?.year || new Date().getUTCFullYear(),req.body?.quarter || Math.floor(new Date().getUTCMonth()/3)+1,req.auth.userId);
  const generated=await aiKpis({title:employee.designation,department:employee.department,level:req.body?.level});
  const saved=[];
  for(const k of generated.kpis){
    const row=(await prisma.$queryRawUnsafe(
      `INSERT INTO "chris_performance_kpis" ("id","organizationId","employeeId","cycleId","title","objective","measurement","target","weight","source","status")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT') RETURNING *`,
      id(),req.auth.organizationId,employee.id,cycle.id,text(k.title),text(k.objective),text(k.measurement),text(k.target),Number(k.weight)||0,generated.source
    ))[0];
    saved.push(row);
  }
  return res.status(201).json({status:"success",data:{employee,cycle,source:generated.source,kpis:saved}});
});

router.get("/performance/kpis", requirePermission("performance.view"), async (req,res)=>{
  const rows=await prisma.$queryRawUnsafe(
    `SELECT k.*,CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",e."employeeNumber",
            c."year",c."quarter",c."startDate",c."endDate"
       FROM "chris_performance_kpis" k
       JOIN "employees" e ON e."id"=k."employeeId" AND e."organizationId"=k."organizationId"
       JOIN "chris_performance_cycles" c ON c."id"=k."cycleId" AND c."organizationId"=k."organizationId"
      WHERE k."organizationId"=$1
      ORDER BY c."year" DESC,c."quarter" DESC,e."employeeNumber",k."createdAt" DESC LIMIT 1000`,
    req.auth.organizationId
  );
  return res.json({status:"success",data:rows});
});

router.patch("/performance/kpis/:id/approve", requirePermission("performance.manage"), async (req,res)=>{
  const row=(await prisma.$queryRawUnsafe(`UPDATE "chris_performance_kpis" SET "status"='APPROVED',"approvedByUserId"=$3,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "organizationId"=$2 RETURNING *`,req.params.id,req.auth.organizationId,req.auth.userId))[0];
  if(!row) return res.status(404).json({status:"error",message:"KPI not found."});
  return res.json({status:"success",data:row});
});

router.get("/performance/cycles", requirePermission("performance.view"), async (req,res)=>{
  const rows=await prisma.$queryRawUnsafe(`SELECT * FROM "chris_performance_cycles" WHERE "organizationId"=$1 ORDER BY "year" DESC,"quarter" DESC`,req.auth.organizationId);
  return res.json({status:"success",data:rows});
});

router.post("/performance/assessments/self", requirePermission("performance.view"), async (req,res)=>{
  const employeeId=text(req.body?.employeeId),cycleId=text(req.body?.cycleId);
  if(!employeeId||!cycleId) return res.status(400).json({status:"error",message:"Employee and cycle are required."});
  const row=(await prisma.$queryRawUnsafe(
    `INSERT INTO "chris_performance_assessments" ("id","organizationId","employeeId","cycleId","selfAssessment","status","submittedAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,'MANAGER_APPROVAL_PENDING',CURRENT_TIMESTAMP)
     ON CONFLICT ("organizationId","employeeId","cycleId") DO UPDATE SET "selfAssessment"=EXCLUDED."selfAssessment","status"='MANAGER_APPROVAL_PENDING',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP RETURNING *`,
    id(),req.auth.organizationId,employeeId,cycleId,JSON.stringify(req.body?.assessment||{})
  ))[0];
  return res.json({status:"success",data:row});
});

router.post("/performance/assessments/manager", requirePermission("performance.manage"), async (req,res)=>{
  const employeeId=text(req.body?.employeeId),cycleId=text(req.body?.cycleId),rating=text(req.body?.rating);
  if(!["EXCELLENT","SATISFACTORY","ACCEPTABLE","UNSATISFACTORY"].includes(rating)) return res.status(400).json({status:"error",message:"Invalid performance rating."});
  const improvementNotes=text(req.body?.improvementNotes);
  if(rating!=="EXCELLENT"&&!improvementNotes) return res.status(400).json({status:"error",message:"Improvement notes are required for this rating."});
  const existing=(await prisma.$queryRawUnsafe(`SELECT * FROM "chris_performance_assessments" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "cycleId"=$3 LIMIT 1`,req.auth.organizationId,employeeId,cycleId))[0];
  if(!existing) return res.status(404).json({status:"error",message:"Self assessment not found."});
  const row=(await prisma.$queryRawUnsafe(
    `UPDATE "chris_performance_assessments" SET "managerAssessment"=$4::jsonb,"finalRating"=$5,"improvementNotes"=$6,"status"='FINAL',"managerReviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3 RETURNING *`,
    existing.id,req.auth.organizationId,employeeId,JSON.stringify(req.body?.assessment||{}),rating,improvementNotes||null
  ))[0];
  if(rating==="EXCELLENT"){
    await prisma.$queryRawUnsafe(`INSERT INTO "chris_promotion_pipeline" ("id","organizationId","employeeId","assessmentId") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,id(),req.auth.organizationId,employeeId,row.id);
  } else {
    await prisma.$queryRawUnsafe(`INSERT INTO "chris_pips" ("id","organizationId","employeeId","assessmentId","improvementAreas","notes") VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING`,id(),req.auth.organizationId,employeeId,row.id,JSON.stringify(req.body?.improvementAreas||[improvementNotes]),improvementNotes);
  }
  return res.json({status:"success",data:row});
});

router.get("/performance/assessments", requirePermission("performance.view"), async (req,res)=>{
  const rows=await prisma.$queryRawUnsafe(
    `SELECT a.*,CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",e."employeeNumber",c."year",c."quarter"
       FROM "chris_performance_assessments" a JOIN "employees" e ON e."id"=a."employeeId" AND e."organizationId"=a."organizationId"
       JOIN "chris_performance_cycles" c ON c."id"=a."cycleId" AND c."organizationId"=a."organizationId"
      WHERE a."organizationId"=$1 ORDER BY c."year" DESC,c."quarter" DESC,a."updatedAt" DESC LIMIT 1000`,
    req.auth.organizationId
  );
  return res.json({status:"success",data:rows});
});

router.post("/automation/ensure-current-payroll", requirePermission("payroll.manage"), async (req,res)=>{
  const org=req.auth.organizationId;
  const today=new Date();
  const start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
  const end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0));
  const code=`${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,"0")}`;
  const existing=await prisma.$queryRawUnsafe(`SELECT * FROM "payroll_periods" WHERE "organizationId"=$1 AND "code"=$2 LIMIT 1`,org,code);
  let period=existing[0];
  if(!period){
    period=await payroll.createPeriod({organizationId:org,actorUserId:req.auth.userId,input:{code,name:start.toLocaleString("en-US",{month:"long",year:"numeric"})+" Payroll",periodStart:start.toISOString().slice(0,10),periodEnd:end.toISOString().slice(0,10),reason:"Automatic first-of-month CHRiS payroll opening"}});
  }
  const exits=await prisma.$queryRawUnsafe(
    `SELECT ep."id",ep."employeeId",ep."lastWorkingDay" FROM "employee_exit_processes" ep
      WHERE ep."organizationId"=$1 AND ep."status" IN ('IN_PROGRESS','READY_TO_COMPLETE') AND ep."lastWorkingDay" BETWEEN $2::date AND $3::date`,
    org,start.toISOString().slice(0,10),end.toISOString().slice(0,10)
  );
  const settlements=[];
  for(const ex of exits){
    try {
      const saved=await exitSettlement.calculateSettlement({organizationId:org,actorUserId:req.auth.userId,exitProcessId:ex.id,input:{}});
      settlements.push({employeeId:ex.employeeId,exitProcessId:ex.id,status:"CALCULATED",settlementId:saved?.id});
    } catch(error) {
      settlements.push({employeeId:ex.employeeId,exitProcessId:ex.id,status:"PENDING_INPUT",message:error.message});
    }
  }
  return res.json({status:"success",data:{period,exitSettlements:settlements}});
});

module.exports = router;
