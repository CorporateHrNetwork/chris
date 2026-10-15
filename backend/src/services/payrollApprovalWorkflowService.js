const crypto = require("crypto");
const prisma = require("../config/prisma");

const RESPONSIBILITY = Object.freeze({
 HEAD_HR:"HEAD_HR", PAYROLL_AUDITOR:"PAYROLL_AUDITOR", GENERAL_MANAGER:"GENERAL_MANAGER", CHIEF_ACCOUNTANT:"CHIEF_ACCOUNTANT"
});
const ACTION_RESPONSIBILITY = Object.freeze({
 REQUEST_AUDIT:RESPONSIBILITY.HEAD_HR, AUDIT_OPEN:RESPONSIBILITY.PAYROLL_AUDITOR,
 AUDIT_APPROVE:RESPONSIBILITY.PAYROLL_AUDITOR, AUDIT_DISAPPROVE:RESPONSIBILITY.PAYROLL_AUDITOR,
 REQUEST_GM:RESPONSIBILITY.HEAD_HR, GM_OPEN:RESPONSIBILITY.GENERAL_MANAGER,
 GM_APPROVE:RESPONSIBILITY.GENERAL_MANAGER, GM_DISAPPROVE:RESPONSIBILITY.GENERAL_MANAGER,
 PAYOUT_EXPORTED:RESPONSIBILITY.CHIEF_ACCOUNTANT, REINITIATE_AUDIT:RESPONSIBILITY.HEAD_HR
});
const ROLE_CANDIDATES = Object.freeze({
 HEAD_HR:["HEAD HR","HEAD OF HR","HEAD_HR","HEAD_HR_VERIFIER","HEAD OF HUMAN RESOURCES","HEAD OF HR & ADMIN","HEAD OF HUMAN RESOURCES & ADMINISTRATION"],
 PAYROLL_AUDITOR:["HEAD OF AUDIT & INTERNAL CONTROL","HEAD OF AUDIT & INTERNAL CONTROLS","HEAD AUDIT & INTERNAL CONTROL","HEAD AUDIT & INTERNAL CONTROLS","HEAD_AUDIT_INTERNAL_CONTROL"],
 GENERAL_MANAGER:["GENERAL MANAGER","GM"], CHIEF_ACCOUNTANT:["CHIEF ACCOUNTANT","HEAD OF ACCOUNTS","HEAD ACCOUNTS"]
});
const STAGE = Object.freeze({
  DRAFT:"DRAFT", PENDING_AUDIT:"PENDING_AUDIT", AUDIT_PROCESSING:"AUDIT_PROCESSING",
  AUDIT_DISAPPROVED:"AUDIT_DISAPPROVED", AUDIT_APPROVED:"AUDIT_APPROVED",
  PENDING_GM:"PENDING_GM", GM_PROCESSING:"GM_PROCESSING", GM_DISAPPROVED:"GM_DISAPPROVED",
  APPROVED:"APPROVED", READY_FOR_PAYOUT:"READY_FOR_PAYOUT", PAYOUT_EXPORTED_LOCKED:"PAYOUT_EXPORTED_LOCKED"
});
function fail(code,message,statusCode=409){const e=new Error(message);e.code=code;e.statusCode=statusCode;throw e;}
async function workflow(tx,organizationId,runId){
 const rows=await tx.$queryRawUnsafe('SELECT * FROM "payroll_approval_workflows" WHERE "organizationId"=$1 AND "runId"=$2 LIMIT 1 FOR UPDATE',organizationId,runId);
 return rows[0]||null;
}
async function event(tx,wf,actorUserId,action,toStage,notes){
 await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_events" ("id","organizationId","runId","workflowId","actorUserId","action","fromStage","toStage","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',crypto.randomUUID(),wf.organizationId,wf.runId,wf.id,actorUserId||null,action,wf.stage,toStage,notes||null);
}
async function assignment(tx,organizationId,responsibility){
 const rows=await tx.$queryRawUnsafe('SELECT a.*,u."email",u."firstName",u."lastName" FROM "payroll_approval_assignments" a JOIN "users" u ON u."id"=a."assignedUserId" AND u."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a."responsibility"=$2 AND a."isActive"=true LIMIT 1',organizationId,responsibility);
 return rows[0]||null;
}
async function resolveAssignment({organizationId,responsibility,actorUserId=null,prismaClient=prisma}){
 return prismaClient.$transaction(async tx=>{
  let a=await assignment(tx,organizationId,responsibility); if(a)return a;
  const roles=ROLE_CANDIDATES[responsibility]||[];
  const rows=await tx.$queryRawUnsafe(`SELECT DISTINCT u."id",u."email",u."firstName",u."lastName" FROM "users" u JOIN "user_roles" ur ON ur."userId"=u."id" JOIN "roles" r ON r."id"=ur."roleId" WHERE u."organizationId"=$1 AND u."isActive"=true AND UPPER(REGEXP_REPLACE(TRIM(r."name"),$3,$4,'g')) = ANY($2::text[]) ORDER BY u."email"`,organizationId,roles.map(x=>x.toUpperCase()),'\\s+',' ');
  if(rows.length!==1) fail("PAYROLL_APPROVAL_ASSIGNMENT_REQUIRED",`Exactly one active user must be assigned to ${responsibility.replaceAll("_"," ")} before this payroll stage can proceed.`);
  await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_assignments" ("id","organizationId","responsibility","assignedUserId","assignedByUserId","isActive") VALUES ($1,$2,$3,$4,$5,true)',crypto.randomUUID(),organizationId,responsibility,rows[0].id,actorUserId||null);
  return assignment(tx,organizationId,responsibility);
 });
}
async function assertAssignedActor({organizationId,responsibility,actorUserId,prismaClient=prisma}){
 const a=await resolveAssignment({organizationId,responsibility,actorUserId,prismaClient});
 if(a.assignedUserId!==actorUserId) fail("PAYROLL_APPROVAL_ASSIGNED_USER_REQUIRED",`This stage is assigned to ${a.email}, not the current user.`,403);
 return a;
}
async function listAssignments({organizationId,prismaClient=prisma}){
 return prismaClient.$queryRawUnsafe('SELECT a."id",a."responsibility",a."assignedUserId",a."isActive",a."assignedAt",u."email",u."firstName",u."lastName" FROM "payroll_approval_assignments" a JOIN "users" u ON u."id"=a."assignedUserId" AND u."organizationId"=a."organizationId" WHERE a."organizationId"=$1 ORDER BY a."responsibility"',organizationId);
}
async function assignResponsibility({organizationId,responsibility,assignedUserId,assignedByUserId,prismaClient=prisma}){
 if(!ROLE_CANDIDATES[responsibility]) fail("INVALID_PAYROLL_APPROVAL_RESPONSIBILITY","Unsupported payroll approval responsibility.",400);
 return prismaClient.$transaction(async tx=>{
  const user=await tx.$queryRawUnsafe('SELECT "id","email","isActive" FROM "users" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',organizationId,assignedUserId);
  if(!user[0]||!user[0].isActive) fail("PAYROLL_APPROVAL_ASSIGNEE_INVALID","Assigned user must be an active Zermatt user.",400);
  const roleRows=await tx.$queryRawUnsafe(`SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id"=ur."roleId" WHERE ur."userId"=$1 AND UPPER(REGEXP_REPLACE(TRIM(r."name"),$3,$4,'g')) = ANY($2::text[]) LIMIT 1`,assignedUserId,ROLE_CANDIDATES[responsibility].map(x=>x.toUpperCase()),'\\s+',' ');
  if(!roleRows[0]) fail("PAYROLL_APPROVAL_ASSIGNEE_ROLE_MISMATCH","Assigned user does not hold the required approval role.",400);
  await tx.$executeRawUnsafe('UPDATE "payroll_approval_assignments" SET "isActive"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "responsibility"=$2 AND "isActive"=true',organizationId,responsibility);
  await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_assignments" ("id","organizationId","responsibility","assignedUserId","assignedByUserId","isActive") VALUES ($1,$2,$3,$4,$5,true)',crypto.randomUUID(),organizationId,responsibility,assignedUserId,assignedByUserId);
  return assignment(tx,organizationId,responsibility);
 });
}
async function ensure({organizationId,runId,actorUserId,prismaClient=prisma}){
 if(!actorUserId)fail("PAYROLL_APPROVAL_ACTOR_REQUIRED","Authenticated payroll officer required.",403);
 await assertAssignedActor({organizationId,responsibility:RESPONSIBILITY.HEAD_HR,actorUserId,prismaClient});
 return prismaClient.$transaction(async tx=>{
  let wf=await workflow(tx,organizationId,runId); if(wf)return wf;
  const run=await tx.$queryRawUnsafe('SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',organizationId,runId);
  if(!run[0])fail("PAYROLL_RUN_NOT_FOUND","Payroll run not found.",404);
  if(run[0].status === "APPROVED" || run[0].status === "PAID" || run[0].status === "LOCKED")fail("PAYROLL_ALREADY_FINALIZED","A finalized payroll run cannot start a new approval workflow.");
  const id=crypto.randomUUID();
  await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_workflows" ("id","organizationId","runId","stage") VALUES ($1,$2,$3,$4)',id,organizationId,runId,STAGE.DRAFT);
  wf=await workflow(tx,organizationId,runId); await event(tx,wf,actorUserId,"WORKFLOW_CREATED",STAGE.DRAFT,null); return wf;
 });
}
async function transition({organizationId,runId,actorUserId,action,notes,prismaClient=prisma}){
 if(!actorUserId)fail("PAYROLL_APPROVAL_ACTOR_REQUIRED","Authenticated payroll officer required.",403);
 const responsibility=ACTION_RESPONSIBILITY[action];
 if(!responsibility) fail("INVALID_PAYROLL_APPROVAL_ACTION","Unsupported payroll approval action.",400);
 await assertAssignedActor({organizationId,responsibility,actorUserId,prismaClient});
 return prismaClient.$transaction(async tx=>{
  let wf=await workflow(tx,organizationId,runId); if(!wf)fail("PAYROLL_APPROVAL_WORKFLOW_REQUIRED","Start the payroll approval workflow first.");
  const rules={
   REQUEST_AUDIT:[[STAGE.DRAFT,STAGE.AUDIT_DISAPPROVED],STAGE.PENDING_AUDIT],
   AUDIT_OPEN:[[STAGE.PENDING_AUDIT],STAGE.AUDIT_PROCESSING],
   AUDIT_APPROVE:[[STAGE.AUDIT_PROCESSING],STAGE.PENDING_GM],
   AUDIT_DISAPPROVE:[[STAGE.AUDIT_PROCESSING],STAGE.AUDIT_DISAPPROVED],
   REINITIATE_AUDIT:[[STAGE.AUDIT_DISAPPROVED],STAGE.PENDING_AUDIT],
   REQUEST_GM:[[STAGE.AUDIT_APPROVED],STAGE.PENDING_GM],
   GM_OPEN:[[STAGE.PENDING_GM],STAGE.GM_PROCESSING],
   GM_APPROVE:[[STAGE.GM_PROCESSING],STAGE.READY_FOR_PAYOUT],
   GM_DISAPPROVE:[[STAGE.GM_PROCESSING],STAGE.GM_DISAPPROVED],
   PAYOUT_EXPORTED:[[STAGE.READY_FOR_PAYOUT],STAGE.PAYOUT_EXPORTED_LOCKED]
  };
  const rule=rules[action]; if(!rule)fail("INVALID_PAYROLL_APPROVAL_ACTION","Unsupported payroll approval action.",400);
  if(!rule[0].includes(wf.stage))fail("INVALID_PAYROLL_APPROVAL_TRANSITION",action+" is not allowed while payroll is "+wf.stage+".");
  if((action==="AUDIT_APPROVE"||action==="AUDIT_DISAPPROVE")&&!String(notes||"").trim())fail("AUDIT_OBSERVATIONS_REQUIRED","Audit observations are required before the Auditor records a decision.",400);
  const to=rule[1]; await event(tx,wf,actorUserId,action,to,notes);
  const sets=['"stage"=$4','"updatedAt"=CURRENT_TIMESTAMP']; const values=[organizationId,runId,wf.id,to]; let n=5;
  const add=(sql,val)=>{sets.push(sql.replace("?",'$'+n++));values.push(val)};
  if(action==="AUDIT_OPEN") add('"auditOpenedAt"=?',new Date());
  if(action==="AUDIT_APPROVE"||action==="AUDIT_DISAPPROVE"){add('"auditDecision"=?',action==="AUDIT_APPROVE"?"APPROVED":"DISAPPROVED");add('"auditObservations"=?',String(notes).trim());add('"auditActorUserId"=?',actorUserId);add('"auditDecidedAt"=?',new Date());}
  if(action==="GM_OPEN") add('"gmOpenedAt"=?',new Date());
  if(action==="GM_APPROVE"||action==="GM_DISAPPROVE"){add('"gmDecision"=?',action==="GM_APPROVE"?"APPROVED":"DISAPPROVED");add('"gmActorUserId"=?',actorUserId);add('"gmDecidedAt"=?',new Date());}
  if(action==="PAYOUT_EXPORTED"){add('"payoutActorUserId"=?',actorUserId);add('"payoutExportedAt"=?',new Date());add('"lockedAt"=?',new Date());}
  await tx.$executeRawUnsafe('UPDATE "payroll_approval_workflows" SET '+sets.join(",")+' WHERE "organizationId"=$1 AND "runId"=$2 AND "id"=$3',...values);
  if(action==="GM_APPROVE") await tx.$executeRawUnsafe('UPDATE "payroll_runs" SET "status"=\'APPROVED\',"approvedAt"=CURRENT_TIMESTAMP,"approvedByUserId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2',organizationId,runId,actorUserId);
  return workflow(tx,organizationId,runId);
 });
}
async function get({organizationId,runId,prismaClient=prisma}){return workflow(prismaClient,organizationId,runId)}
async function history({organizationId,runId,prismaClient=prisma}){
 const current=await get({organizationId,runId,prismaClient});
 if(!current)fail("PAYROLL_APPROVAL_WORKFLOW_NOT_FOUND","Approval workflow not found.",404);
 return prismaClient.$queryRawUnsafe(
  'SELECT "id","action","actorUserId","fromStage","toStage","notes","createdAt" FROM "payroll_approval_events" WHERE "organizationId"=$1 AND "runId"=$2 AND "workflowId"=$3 ORDER BY "createdAt" ASC,"id" ASC',
  organizationId,runId,current.id
 );
}
module.exports={STAGE,RESPONSIBILITY,ACTION_RESPONSIBILITY,ensure,transition,get,history,listAssignments,assignResponsibility,resolveAssignment};
