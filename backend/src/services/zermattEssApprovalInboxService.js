"use strict";
const ledger=require("./zermattEssApprovalPersistence");
function fail(code,statusCode=409){throw Object.assign(new Error(code),{code,statusCode});}
function enabled(){if(process.env.ZERMATT_ESS_APPROVALS_ENABLED!=="true")fail("WORKFLOW_NOT_AVAILABLE",404);}
async function inbox(db,{organizationId,userId}){
 enabled();await ledger.tenant(db,organizationId);
 const user=await db.user.findFirst({where:{organizationId,id:userId,isActive:true},select:{id:true}});
 if(!user)fail("WORKFLOW_USER_NOT_ACTIVE",403);
 const rows=await db.$queryRawUnsafe('SELECT w."requestType",w."requestId",w."requesterUserId",w."status",w."version",w."currentIndex",w."stages",w."observers",w."history",e."employeeNumber",CONCAT_WS(\' \',e."firstName",e."lastName") AS "employeeName",l."principalAmount",l."installmentAmount",l."purpose",l."notes" AS "loanNotes",r."startDate",r."endDate",r."requestedUnits",r."reason" AS "leaveReason" FROM "ess_approval_workflows" w JOIN "employees" e ON e."id"=w."employeeId" AND e."organizationId"=w."organizationId" LEFT JOIN "payroll_loans" l ON w."requestType"=\'LOAN\' AND l."organizationId"=w."organizationId" AND l."id"=w."requestId" LEFT JOIN "leave_requests" r ON w."requestType"=\'LEAVE\' AND r."organizationId"=w."organizationId" AND r."id"=w."requestId" WHERE w."organizationId"=$1 AND (w."requesterUserId"=$2 OR EXISTS (SELECT 1 FROM jsonb_array_elements(w."stages") s WHERE s->>\'userId\'=$2) OR EXISTS (SELECT 1 FROM jsonb_array_elements(w."observers") o WHERE o->>\'userId\'=$2)) ORDER BY (w."status"=\'PENDING\') DESC,w."updatedAt" DESC LIMIT 100',organizationId,userId);
 return rows.map(row=>{
  const plan=ledger.hydrate(row),observer=plan.observers.some(x=>x.userId===userId),current=plan.stages[plan.currentIndex];
  return {details:observer?null:row.requestType==="LOAN"?{principalAmount:row.principalAmount,installmentAmount:row.installmentAmount,purpose:row.purpose,notes:row.loanNotes}:{startDate:row.startDate,endDate:row.endDate,requestedUnits:row.requestedUnits,reason:row.leaveReason},requestType:row.requestType,requestId:row.requestId,employeeNumber:row.employeeNumber,employeeName:row.employeeName,status:plan.status,version:plan.version,currentStage:plan.status==="PENDING"?current?.type:null,currentRole:plan.status==="PENDING"?current?.role:null,canAct:plan.status==="PENDING"&&current?.userId===userId&&!observer&&plan.requesterUserId!==userId,stages:plan.stages.map(s=>({type:s.type,role:s.role,status:s.status,actedAt:s.actedAt})),history:plan.history.map(({paymentEvidence,...event})=>event)};
 });
}
async function act(db,scope,type,id,input){
 enabled();
 const requestType=String(type).toUpperCase();
 const args={organizationId:scope.organizationId,loanId:id,actorUserId:scope.userId,decision:String(input?.decision||"").toUpperCase(),expectedVersion:input?.expectedVersion,reason:input?.reason,comments:input?.reason,prismaClient:db};
 if(requestType==="LEAVE")return ledger.decide(db,{organizationId:scope.organizationId,requestType,requestId:id,actorUserId:scope.userId,decision:String(input?.decision||"").toUpperCase(),expectedVersion:input?.expectedVersion,reason:input?.reason});
 if(requestType!=="LOAN")fail("WORKFLOW_NOT_FOUND",404);
 await ledger.tenant(db,scope.organizationId);
 const row=await ledger.readForParticipant(db,{organizationId:scope.organizationId,requestType,requestId:id,userId:scope.userId});
 const financial=require("./loanOriginationWorkflowService");
 const {STAGES}=require("./zermattEssApprovalPlan");
 const stage=row.stages[row.currentIndex]?.type;
 if(stage===STAGES.LOAN_BRANCH)return require("./zermattEssLoanIntegration").branchDecision(db,args);
 if(stage===STAGES.LOAN_HR)return financial.hrVerificationDecision({...args,decision:args.decision==="APPROVE"?"VERIFY":args.decision});
 if(stage===STAGES.LOAN_GM)return financial.gmDecision(args);
 if(stage===STAGES.LOAN_PAYMENT){
  if(args.decision!=="DISBURSE")fail("INVALID_WORKFLOW_DECISION",400);
  return financial.disburseApprovedLoan({...args,input});
 }
 fail("WORKFLOW_NOT_PENDING");
}
async function applicationForm(db,scope,id){
 enabled();
 const view=await ledger.readForParticipant(db,{organizationId:scope.organizationId,requestType:"LOAN",requestId:id,userId:scope.userId});
 if(view.readOnly)fail("AUDIT_OBSERVER_READ_ONLY",403);
 const rows=await db.$queryRawUnsafe('SELECT "fileName","mimeType","content" FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "loanId"=$2 AND "category"=\'LOAN_APPLICATION_FORM\' ORDER BY "createdAt" DESC LIMIT 1',scope.organizationId,id);
 if(!rows[0])fail("LOAN_ATTACHMENT_NOT_FOUND",404);
 return {fileName:rows[0].fileName,mimeType:rows[0].mimeType,contentBase64:Buffer.from(rows[0].content).toString("base64")};
}
module.exports={inbox,act,applicationForm};
