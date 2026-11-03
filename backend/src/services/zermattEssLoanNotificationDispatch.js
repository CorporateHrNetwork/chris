"use strict";
const {tenant}=require("./zermattEssApprovalPersistence");
async function dispatch(db,{organizationId,notificationIds=null,limit=20}){
 if(process.env.ZERMATT_ESS_APPROVALS_ENABLED!=="true")return [];
 await tenant(db,organizationId);
 const results=[];
 // Each delivery holds its own outbox row lock, so parallel dispatchers cannot
 // send the same row concurrently. SMTP remains at-least-once across crashes.
 for(let i=0;i<Math.min(Math.max(Number(limit)||1,1),20);i++){
  const result=await db.$transaction(async tx=>{
   const rows=await tx.$queryRawUnsafe('SELECT n.* FROM "payroll_loan_notification_outbox" n JOIN "payroll_loans" l ON l."organizationId"=n."organizationId" AND l."id"=n."loanId" WHERE n."organizationId"=$1 AND l."essApprovalRequired"=true AND n."status" IN (\'QUEUED\',\'FAILED\') AND n."attempts"<5 AND ($2::text[] IS NULL OR n."id"=ANY($2::text[])) AND (n."attempts"=0 OR n."updatedAt"<=now()-(power(2,n."attempts")*interval \'1 minute\')) ORDER BY n."createdAt",n."id" LIMIT 1 FOR UPDATE OF n SKIP LOCKED',organizationId,notificationIds);
   const row=rows[0];if(!row)return null;
   const recipient=await tx.user.findFirst({where:{id:row.recipientUserId,organizationId,isActive:true},select:{email:true}});
   if(!recipient||recipient.email!==row.toEmail){
    await tx.$executeRawUnsafe('UPDATE "payroll_loan_notification_outbox" SET "status"=\'FAILED\',"attempts"=5,"lastError"=\'RECIPIENT_CHANGED_OR_INACTIVE\',"updatedAt"=now() WHERE "organizationId"=$1 AND "id"=$2',organizationId,row.id);
    return {id:row.id,status:"FAILED"};
   }
   const sent=await require("./loanWorkflowNotificationService").deliverNotification({notificationId:row.id,prismaClient:tx});
   return {id:row.id,...sent};
  },{timeout:30000,maxWait:5000});
  if(!result)break;results.push(result);
  if(result.reason==="SMTP_NOT_CONFIGURED")break;
 }
 return results;
}
function kick(db,organizationId){
 // The durable outbox is committed before delivery. Errors never turn an
 // already-saved approval into an apparent failure that invites a duplicate.
 void dispatch(db,{organizationId}).catch(error=>console.error("ESS loan notification dispatch failed",error.code||"DISPATCH_FAILED"));
}
module.exports={dispatch,kick};
