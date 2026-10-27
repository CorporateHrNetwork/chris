const crypto = require('node:crypto');

// Called only inside the existing authorized payroll-reopen transaction, after
// liabilities have been reversed and the run has returned to DRAFT.
async function resetWorkflowForCorrection({prismaClient,organizationId,runId,actorUserId,reason}) {
  const runs=await prismaClient.$queryRawUnsafe('SELECT "id","status" FROM "payroll_runs" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE',organizationId,runId);
  if(!runs[0] || runs[0].status!=='DRAFT') throw new Error('PAYROLL_WORKFLOW_RESET_REQUIRES_REOPENED_DRAFT');
  const rows=await prismaClient.$queryRawUnsafe('SELECT * FROM "payroll_approval_workflows" WHERE "organizationId"=$1 AND "runId"=$2 FOR UPDATE',organizationId,runId);
  const previous=rows[0];
  if(!previous) return {reset:false};
  await prismaClient.$executeRawUnsafe(`UPDATE "payroll_approval_workflows" SET
    "stage"='DRAFT',"version"="version"+1,
    "auditObservations"=NULL,"auditDecision"=NULL,"auditActorUserId"=NULL,"auditOpenedAt"=NULL,"auditDecidedAt"=NULL,
    "gmDecision"=NULL,"gmActorUserId"=NULL,"gmOpenedAt"=NULL,"gmDecidedAt"=NULL,
    "payoutActorUserId"=NULL,"payoutExportedAt"=NULL,"lockedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "organizationId"=$1 AND "runId"=$2 AND "id"=$3`,organizationId,runId,previous.id);
  await prismaClient.$executeRawUnsafe(`INSERT INTO "payroll_approval_events"
    ("id","organizationId","runId","workflowId","actorUserId","action","fromStage","toStage","notes")
    VALUES ($1,$2,$3,$4,$5,'REOPENED_FOR_CORRECTION',$6,'DRAFT',$7)`,crypto.randomUUID(),organizationId,runId,previous.id,actorUserId || null,previous.stage,String(reason || '').trim());
  await prismaClient.organizationAudit.create({data:{organizationId,actorUserId:actorUserId || null,entityType:'PayrollApprovalWorkflow',entityId:previous.id,action:'PAYROLL_WORKFLOW_REOPENED_FOR_CORRECTION',previousValue:JSON.parse(JSON.stringify(previous)),newValue:{stage:'DRAFT',version:Number(previous.version || 1)+1,runId,approvalDecisionsReset:true},reason:String(reason || '').trim()}});
  return {reset:true,workflowId:previous.id,stage:'DRAFT',version:Number(previous.version || 1)+1};
}
module.exports={resetWorkflowForCorrection};
