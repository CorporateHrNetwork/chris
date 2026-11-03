"use strict";
const crypto=require("node:crypto");
const ledger=require("./zermattEssApprovalPersistence");
const {STAGES,transition}=require("./zermattEssApprovalPlan");
const resolver=require("./zermattEssApproverResolver");
const {notificationPlan}=require("./zermattEssWorkflowNotifications");
function fail(code,statusCode=409){throw Object.assign(new Error(code),{code,statusCode});}
function enabled(){if(process.env.ZERMATT_ESS_APPROVALS_ENABLED!=="true")fail("ESS_LOAN_WORKFLOW_DISABLED");}
async function queue(tx,organizationId,loanId,plan){
 const notices=notificationPlan({requestId:loanId,plan,baseUrl:process.env.FRONTEND_URL||"https://chris.crnetwork.com.ng"});
 const users=await tx.user.findMany({where:{organizationId,isActive:true,id:{in:notices.map(n=>n.userId)}},select:{id:true,email:true}});
 const queued=[];
 for(const n of notices){
  const email=users.find(u=>u.id===n.userId)?.email;
  if(!email)fail("WORKFLOW_RECIPIENT_EMAIL_MISSING");
  const id=crypto.createHash("sha256").update(JSON.stringify([organizationId,"LOAN",loanId,plan.version,n.userId])).digest("hex");
  const base=(process.env.FRONTEND_URL||"https://chris.crnetwork.com.ng").replace(/\/$/,"");
  const link=n.userId===plan.requesterUserId?base+"/ess":base+"/loans";
  await tx.$executeRawUnsafe('INSERT INTO "payroll_loan_notification_outbox" ("id","organizationId","loanId","recipientUserId","recipientRole","toEmail","subject","textBody") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("id") DO NOTHING',id,organizationId,loanId,n.userId,n.recipientRole,email,n.subject,n.message+"\n"+link);
  queued.push(id);
 }
 return queued;
}
// Called only while the existing financial service holds the loan row lock.
// Historical/manual loans never enter this path, including when the gate is on.
async function prepare(tx,{organizationId,loan,actorUserId,stage,decision,expectedVersion,paymentEvidence,reason}){
 if(!loan.essApprovalRequired)return null;
 enabled();await ledger.tenant(tx,organizationId);
 const row=await ledger.lookup(tx,{organizationId,requestType:"LOAN",requestId:loan.id,lock:true});
 if(!row||row.employeeId!==loan.employeeId)fail("ESS_LOAN_WORKFLOW_REQUIRED");
 const current=ledger.hydrate(row);
 if(current.stages[current.currentIndex]?.type!==stage)fail("ESS_LOAN_STAGE_MISMATCH");
 const user=await tx.user.findFirst({where:{organizationId,id:actorUserId,isActive:true},select:{id:true}});
 if(!user)fail("WORKFLOW_ACTOR_NOT_ACTIVE",403);
 // Revalidate present authority; a saved snapshot does not preserve a revoked role.
 const assigned=await resolver.resolveLoanApprovers(tx,{organizationId,employeeId:loan.employeeId,requesterUserId:current.requesterUserId,asOf:new Date()});
 if(assigned.find(s=>s.type===stage)?.userId!==actorUserId)fail("WORKFLOW_AUTHORITY_CHANGED",403);
 const next=transition(current,{actorUserId,decision,expectedVersion,paymentEvidence,reason});
 return {current,next,organizationId,loanId:loan.id,actorUserId,decision};
}
async function save(tx,change){
 if(!change)return [];
 const {current,next,organizationId,loanId,actorUserId,decision}=change;
 const rows=await tx.$queryRawUnsafe('UPDATE "ess_approval_workflows" SET "status"=$4,"version"=$5,"currentIndex"=$6,"stages"=$7::jsonb,"observers"=$8::jsonb,"history"=$9::jsonb,"updatedAt"=now() WHERE "organizationId"=$1 AND "requestType"=$2 AND "requestId"=$3 AND "version"=$10 RETURNING "id"',organizationId,"LOAN",loanId,next.status,next.version,next.currentIndex,JSON.stringify(next.stages),JSON.stringify(next.observers),JSON.stringify(next.history),current.version);
 if(rows.length!==1)fail("WORKFLOW_VERSION_CONFLICT");
 await tx.organizationAudit.create({data:{organizationId,actorUserId,entityType:"LOAN_ESS_APPROVAL",entityId:loanId,action:"ESS_WORKFLOW_"+decision,previousValue:{status:current.status,version:current.version},newValue:{status:next.status,version:next.version}}});
 return queue(tx,organizationId,loanId,next);
}
async function submit(db,scope,loanId){
 enabled();
 return db.$transaction(async tx=>{
  await ledger.tenant(tx,scope.organizationId);
  const actor=await tx.user.findFirst({where:{id:scope.userId,organizationId:scope.organizationId,employeeId:scope.employeeId,isActive:true},select:{id:true}});
  if(!actor)fail("ESS_EMPLOYEE_SESSION_REQUIRED",403);
  const rows=await tx.$queryRawUnsafe('SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "id"=$3 FOR UPDATE',scope.organizationId,scope.employeeId,loanId);
  const loan=rows[0];
  if(!loan||loan.createdByUserId!==scope.userId||!loan.essApprovalRequired)fail("ESS_LOAN_NOT_FOUND",404);
  // A fresh request is required after return until a revision UI is available.
  if(loan.status!=="DRAFT")fail("ESS_LOAN_NOT_DRAFT");
  const forms=await tx.$queryRawUnsafe('SELECT COUNT(*)::int AS "count" FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "loanId"=$2 AND "category"=\'LOAN_APPLICATION_FORM\'',scope.organizationId,loanId);
  if(!Number(forms[0]?.count))fail("LOAN_APPLICATION_FORM_REQUIRED");
  await require("./loanCollateralWorkflowService").revalidateExistingLoan({organizationId:scope.organizationId,actorUserId:scope.userId,loanId,prismaClient:tx});
  const stages=await resolver.resolveLoanApprovers(tx,{organizationId:scope.organizationId,employeeId:scope.employeeId,requesterUserId:scope.userId,asOf:new Date()});
  const observerUserIds=await resolver.resolveAuditObservers(tx,scope.organizationId);
  const plan=await ledger.create(tx,{organizationId:scope.organizationId,requestType:"LOAN",requestId:loanId,employeeId:scope.employeeId,requesterUserId:scope.userId,stages,observerUserIds});
  await tx.$executeRawUnsafe('UPDATE "payroll_loans" SET "status"=\'PENDING_BRANCH_MANAGER_APPROVAL\',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2',scope.organizationId,loanId);
  await tx.organizationAudit.create({data:{organizationId:scope.organizationId,actorUserId:scope.userId,entityType:"LOAN_ESS_APPROVAL",entityId:loanId,action:"ESS_LOAN_SUBMITTED",newValue:{status:"PENDING_BRANCH_MANAGER_APPROVAL",version:plan.version}}});
  await queue(tx,scope.organizationId,loanId,plan);
  return {id:loanId,status:"PENDING_BRANCH_MANAGER_APPROVAL",version:plan.version};
 });
}
async function branchDecision(db,{organizationId,loanId,actorUserId,decision,expectedVersion,reason}){
 enabled();
 return db.$transaction(async tx=>{
  const rows=await tx.$queryRawUnsafe('SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE',organizationId,loanId);
  const loan=rows[0];
  if(!loan?.essApprovalRequired)fail("ESS_LOAN_NOT_FOUND",404);
  if(loan.status!=="PENDING_BRANCH_MANAGER_APPROVAL")fail("ESS_LOAN_STAGE_MISMATCH");
  const change=await prepare(tx,{organizationId,loan,actorUserId,stage:STAGES.LOAN_BRANCH,decision,expectedVersion,reason});
  const status=change.next.status==="REJECTED"?"REJECTED":change.next.status==="RETURNED"?"RETURNED_FOR_CORRECTION":"PENDING_HR_VERIFICATION";
  await tx.$executeRawUnsafe('UPDATE "payroll_loans" SET "status"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2',organizationId,loanId,status);
  await save(tx,change);
  return {id:loanId,status,version:change.next.version};
 });
}
module.exports={prepare,save,submit,branchDecision,queue};
