"use strict";
const {randomUUID}=require("node:crypto");
const {ZERMATT,createPlan,transition}=require("./zermattEssApprovalPlan");
function fail(code,statusCode=409){throw Object.assign(new Error(code),{code,statusCode});}
async function tenant(tx,organizationId){
 const org=await tx.organization.findUnique({where:{id:organizationId},select:{slug:true}});
 if(org?.slug!==ZERMATT)fail("ESS_WORKFLOW_TENANT_FORBIDDEN",403);
}
function hydrate(row){
 if(!row)return null;
 const json=value=>typeof value==="string"?JSON.parse(value):value;
 return {type:row.requestType,status:row.status,version:Number(row.version),currentIndex:row.currentIndex===null?null:Number(row.currentIndex),requesterUserId:row.requesterUserId,stages:json(row.stages),observers:json(row.observers),history:json(row.history)};
}
async function lookup(tx,{organizationId,requestType,requestId,lock=false}){
 if(!["LEAVE","LOAN"].includes(requestType))fail("INVALID_WORKFLOW_TYPE",400);
 const sql='SELECT * FROM "ess_approval_workflows" WHERE "organizationId"=$1 AND "requestType"=$2 AND "requestId"=$3'+(lock?' FOR UPDATE':'');
 const rows=await tx.$queryRawUnsafe(sql,organizationId,requestType,requestId);
 return rows[0]||null;
}
async function create(tx,{organizationId,requestType,requestId,employeeId,requesterUserId,stages,observerUserIds}){
 await tenant(tx,organizationId);
 if(!requestId||!employeeId||!requesterUserId)fail("WORKFLOW_IDENTITY_REQUIRED",400);
 const employee=await tx.employee.findFirst({where:{id:employeeId,organizationId},select:{id:true}});
 if(!employee)fail("WORKFLOW_EMPLOYEE_NOT_FOUND",404);
 const plan=createPlan({type:requestType,requesterUserId,stages,observerUserIds});
 const rows=await tx.$queryRawUnsafe(
 'INSERT INTO "ess_approval_workflows" ("id","organizationId","requestType","requestId","employeeId","requesterUserId","status","version","currentIndex","stages","observers","history") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) ON CONFLICT ("organizationId","requestType","requestId") DO NOTHING RETURNING "id"',
 randomUUID(),organizationId,requestType,requestId,employeeId,requesterUserId,plan.status,plan.version,plan.currentIndex,JSON.stringify(plan.stages),JSON.stringify(plan.observers),JSON.stringify(plan.history));
 if(rows.length!==1)fail("WORKFLOW_ALREADY_EXISTS");
 return plan;
}
async function decide(db,{organizationId,requestType,requestId,actorUserId,decision,expectedVersion,reason}){
 return db.$transaction(async tx=>{
  await tenant(tx,organizationId);
  // Match the existing leave lifecycle lock order: employee before workflow.
  // This serializes final posting against cancellation and other leave reviews.
  if(requestType==="LEAVE"){
   await tx.$queryRawUnsafe('SELECT e."id" FROM "employees" e JOIN "leave_requests" r ON r."employeeId"=e."id" AND r."organizationId"=e."organizationId" WHERE r."organizationId"=$1 AND r."id"=$2 FOR UPDATE OF e',organizationId,requestId);
  }
  const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId,isActive:true},select:{id:true}});
  if(!actor)fail("WORKFLOW_ACTOR_NOT_ACTIVE",403);
  const row=await lookup(tx,{organizationId,requestType,requestId,lock:true});
  if(!row)fail("WORKFLOW_NOT_FOUND",404);
  const current=hydrate(row);
  const action=String(decision||"").trim().toUpperCase();
  // The existing leave record has no returned-for-correction state. Do not
  // mislabel a return as rejection or release reservations with a live workflow.
  if(requestType==="LEAVE"&&action==="RETURN")fail("LEAVE_RETURN_NOT_READY");
  let paymentEvidence;
  if(requestType==="LOAN"&&action==="DISBURSE"){
   const loans=await tx.$queryRawUnsafe('SELECT "status","disbursedDate","disbursementReference","principalAmount" FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE',organizationId,requestId);
   const loan=loans[0];
   if(!loan||loan.status!=="ACTIVE"||!loan.disbursedDate||!String(loan.disbursementReference||"").trim())fail("DISBURSEMENT_NOT_RECORDED");
   paymentEvidence={amount:Number(loan.principalAmount),reference:loan.disbursementReference,paymentDate:new Date(loan.disbursedDate).toISOString().slice(0,10)};
  }
  const next=transition(current,{actorUserId,decision:action,expectedVersion,reason,paymentEvidence});
  if(requestType==="LEAVE"){
   const request=await tx.leaveRequest.findFirst({where:{id:requestId,organizationId},select:{id:true,status:true,employeeId:true}});
   if(!request||request.employeeId!==row.employeeId||request.status!=="PENDING")fail("LEAVE_REQUEST_NOT_PENDING");
   if(action==="CONFIRM"){
    await require("./leaveService").reviewLeaveRequestInTransaction({organizationId,leaveRequestId:requestId,reviewerUserId:actorUserId,decision:"APPROVE",reviewNotes:reason,workflowExpectedVersion:current.version},tx);
   }else if(action==="REJECT"){
    // Rejection releases the existing pending reservation without posting usage.
    await tx.leaveRequest.update({where:{id:requestId},data:{status:"REJECTED",reviewedByUserId:actorUserId,reviewedAt:new Date(),reviewNotes:reason}});
   }
  }
  const updated=await tx.$queryRawUnsafe(
   'UPDATE "ess_approval_workflows" SET "status"=$4,"version"=$5,"currentIndex"=$6,"stages"=$7::jsonb,"observers"=$8::jsonb,"history"=$9::jsonb,"updatedAt"=now() WHERE "organizationId"=$1 AND "requestType"=$2 AND "requestId"=$3 AND "version"=$10 RETURNING "id"',
   organizationId,requestType,requestId,next.status,next.version,next.currentIndex,JSON.stringify(next.stages),JSON.stringify(next.observers),JSON.stringify(next.history),current.version);
  if(updated.length!==1)fail("WORKFLOW_VERSION_CONFLICT");
  await tx.organizationAudit.create({data:{organizationId,actorUserId,entityType:requestType==="LOAN"?"LOAN_ESS_APPROVAL":"LEAVE_ESS_APPROVAL",entityId:requestId,action:"ESS_WORKFLOW_"+action,previousValue:{status:current.status,version:current.version},newValue:{status:next.status,version:next.version},reason:String(reason||"").trim()||null}});
  return next;
 });
}
async function readForParticipant(tx,{organizationId,requestType,requestId,userId,employeeId=null}){
 await tenant(tx,organizationId);
 const user=await tx.user.findFirst({where:{id:userId,organizationId,isActive:true},select:{id:true,employeeId:true}});
 if(!user)fail("WORKFLOW_USER_NOT_ACTIVE",403);
 const row=await lookup(tx,{organizationId,requestType,requestId});
 if(!row)fail("WORKFLOW_NOT_FOUND",404);
 const plan=hydrate(row);
 if(employeeId&&row.employeeId!==employeeId)fail("WORKFLOW_NOT_FOUND",404);
 const participant=plan.requesterUserId===userId||plan.stages.some(x=>x.userId===userId)||plan.observers.some(x=>x.userId===userId);
 if(!participant)fail("WORKFLOW_ACCESS_DENIED",403);
 // Do not disclose confidential supporting documents or payment evidence in
 // an observer's stage history; detailed financial evidence stays in finance.
 const observer=plan.observers.some(x=>x.userId===userId);
 const history=observer?plan.history.map(({paymentEvidence,...event})=>event):plan.history;
 return {requestType,requestId,status:plan.status,version:plan.version,currentIndex:plan.currentIndex,
  stages:plan.stages.map(x=>({type:x.type,index:x.index,status:x.status,role:x.role,userId:x.userId,actedAt:x.actedAt})),
  history,readOnly:observer,currentActionOwnerId:plan.status==="PENDING"?plan.stages[plan.currentIndex]?.userId:null};
}
module.exports={tenant,hydrate,lookup,create,decide,readForParticipant};

