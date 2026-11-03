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
  const actor=await tx.user.findFirst({where:{id:actorUserId,organizationId,isActive:true},select:{id:true}});
  if(!actor)fail("WORKFLOW_ACTOR_NOT_ACTIVE",403);
  const row=await lookup(tx,{organizationId,requestType,requestId,lock:true});
  if(!row)fail("WORKFLOW_NOT_FOUND",404);
  const current=hydrate(row);
  const action=String(decision||"").trim().toUpperCase();
  let paymentEvidence;
  if(requestType==="LOAN"&&action==="DISBURSE"){
   const loans=await tx.$queryRawUnsafe('SELECT "status","disbursedDate","disbursementReference","principalAmount" FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE',organizationId,requestId);
   const loan=loans[0];
   if(!loan||loan.status!=="ACTIVE"||!loan.disbursedDate||!String(loan.disbursementReference||"").trim())fail("DISBURSEMENT_NOT_RECORDED");
   paymentEvidence={amount:Number(loan.principalAmount),reference:loan.disbursementReference,paymentDate:new Date(loan.disbursedDate).toISOString().slice(0,10)};
  }
  const next=transition(current,{actorUserId,decision:action,expectedVersion,reason,paymentEvidence});
  const updated=await tx.$queryRawUnsafe(
   'UPDATE "ess_approval_workflows" SET "status"=$4,"version"=$5,"currentIndex"=$6,"stages"=$7::jsonb,"observers"=$8::jsonb,"history"=$9::jsonb,"updatedAt"=now() WHERE "organizationId"=$1 AND "requestType"=$2 AND "requestId"=$3 AND "version"=$10 RETURNING "id"',
   organizationId,requestType,requestId,next.status,next.version,next.currentIndex,JSON.stringify(next.stages),JSON.stringify(next.observers),JSON.stringify(next.history),current.version);
  if(updated.length!==1)fail("WORKFLOW_VERSION_CONFLICT");
  await tx.organizationAudit.create({data:{organizationId,actorUserId,entityType:requestType==="LOAN"?"LOAN_ESS_APPROVAL":"LEAVE_ESS_APPROVAL",entityId:requestId,action:"ESS_WORKFLOW_"+action,previousValue:{status:current.status,version:current.version},newValue:{status:next.status,version:next.version},reason:String(reason||"").trim()||null}});
  return next;
 });
}
module.exports={tenant,hydrate,lookup,create,decide};
