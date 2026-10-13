const crypto = require("crypto");
const prisma = require("../config/prisma");

const STAGE = Object.freeze({
  DRAFT:"DRAFT", PENDING_AUDIT:"PENDING_AUDIT", AUDIT_PROCESSING:"AUDIT_PROCESSING",
  AUDIT_DISAPPROVED:"AUDIT_DISAPPROVED", AUDIT_APPROVED:"AUDIT_APPROVED",
  PENDING_GM:"PENDING_GM", GM_PROCESSING:"GM_PROCESSING", GM_DISAPPROVED:"GM_DISAPPROVED",
  APPROVED:"APPROVED", READY_FOR_PAYOUT:"READY_FOR_PAYOUT", PAYOUT_EXPORTED_LOCKED:"PAYOUT_EXPORTED_LOCKED"
});
function fail(code,message,statusCode=409){const e=new Error(message);e.code=code;e.statusCode=statusCode;throw e;}
async function workflow(tx,organizationId,runId){
 const rows=await tx.$queryRawUnsafe('SELECT * FROM "payroll_approval_workflows" WHERE "organizationId"=$1 AND "runId"=$2 LIMIT 1',organizationId,runId);
 return rows[0]||null;
}
async function event(tx,wf,actorUserId,action,toStage,notes){
 await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_events" ("id","organizationId","runId","workflowId","actorUserId","action","fromStage","toStage","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',crypto.randomUUID(),wf.organizationId,wf.runId,wf.id,actorUserId||null,action,wf.stage,toStage,notes||null);
}
async function ensure({organizationId,runId,actorUserId,prismaClient=prisma}){
 return prismaClient.$transaction(async tx=>{
  let wf=await workflow(tx,organizationId,runId); if(wf)return wf;
  const run=await tx.$queryRawUnsafe('SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1',organizationId,runId);
  if(!run[0])fail("PAYROLL_RUN_NOT_FOUND","Payroll run not found.",404);
  const id=crypto.randomUUID();
  await tx.$executeRawUnsafe('INSERT INTO "payroll_approval_workflows" ("id","organizationId","runId","stage") VALUES ($1,$2,$3,$4)',id,organizationId,runId,STAGE.DRAFT);
  wf=await workflow(tx,organizationId,runId); await event(tx,wf,actorUserId,"WORKFLOW_CREATED",STAGE.DRAFT,null); return wf;
 });
}
async function transition({organizationId,runId,actorUserId,action,notes,prismaClient=prisma}){
 return prismaClient.$transaction(async tx=>{
  let wf=await workflow(tx,organizationId,runId); if(!wf)fail("PAYROLL_APPROVAL_WORKFLOW_REQUIRED","Start the payroll approval workflow first.");
  const rules={
   REQUEST_AUDIT:[[STAGE.DRAFT,STAGE.AUDIT_DISAPPROVED],STAGE.PENDING_AUDIT],
   AUDIT_OPEN:[[STAGE.PENDING_AUDIT],STAGE.AUDIT_PROCESSING],
   AUDIT_APPROVE:[[STAGE.AUDIT_PROCESSING],STAGE.AUDIT_APPROVED],
   AUDIT_DISAPPROVE:[[STAGE.AUDIT_PROCESSING],STAGE.AUDIT_DISAPPROVED],
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
module.exports={STAGE,ensure,transition,get};
