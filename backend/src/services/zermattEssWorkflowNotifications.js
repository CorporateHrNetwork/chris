"use strict";
const {AUDIT}=require("./zermattEssApprovalPlan");
const ALLOWED_STATES=new Set(["PENDING","COMPLETED","RETURNED","REJECTED"]);
function notificationError(code){const e=new Error(code);e.code=code;throw e;}
function notificationPlan({requestId,plan,participantUserIds=[],baseUrl}){
 if(!requestId||!plan||!Number.isInteger(plan.version)||!ALLOWED_STATES.has(plan.status))notificationError("INVALID_WORKFLOW_NOTIFICATION_CONTEXT");
 const linkBase=String(baseUrl||"").replace(/\/$/,"");
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(linkBase))notificationError("HTTPS_CHRIS_LINK_REQUIRED");
 const next=plan.status==="PENDING"?plan.stages[plan.currentIndex]:null;
 const participantIds=new Set([plan.requesterUserId,...participantUserIds,...plan.stages.map(s=>s.userId),...plan.observers.map(s=>s.userId)]);
 const observerIds=new Set(plan.observers.filter(x=>x.role===AUDIT&&x.authority==="VIEW_ONLY").map(x=>x.userId));
 const type=plan.type==="LOAN"?"loan":"leave";
 const safeLink=linkBase+"/workflows/"+type+"/"+encodeURIComponent(requestId);
 const rows=[];
 for(const userId of participantIds){
  if(!userId)continue;
  const observer=observerIds.has(userId);
  const isOwner=Boolean(next&&next.userId===userId&&!observer);
  const message=plan.status==="PENDING"?(isOwner?"Action required: a "+type+" application is awaiting your review.":"For information: a "+type+" application has progressed to its next stage."):"For information: a "+type+" application is "+plan.status.toLowerCase()+".";
  rows.push({userId,recipientRole:observer?AUDIT:isOwner?"ACTION_OWNER":"WORKFLOW_PARTICIPANT",notificationType:isOwner?"ACTION_REQUIRED":"FOR_INFORMATION",subject:"CHRiS "+(isOwner?"Action Required":"Status Update")+" — "+type+" application",message,link:safeLink,idempotencyKey:[requestId,plan.version,userId].join(":")});
 }
 return rows;
}
module.exports={notificationPlan};
