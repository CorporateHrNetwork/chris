"use strict";
require("dotenv").config();
const prisma=require("../src/config/prisma");
const {ZERMATT_SLUG,POLICY_DEFINITIONS}=require("../src/services/zermattLeaveEntitlementService");
const APPLY=process.argv.includes("--apply");
const codes=[...new Set(POLICY_DEFINITIONS.map(p=>p.policyCode))];

async function main(){
 const org=await prisma.organization.findUnique({where:{slug:ZERMATT_SLUG},select:{id:true,name:true,slug:true}});
 if(!org)throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");
 const policies=await prisma.leavePolicy.findMany({
  where:{organizationId:org.id,code:{in:codes},status:"ACTIVE",isActive:true},
  select:{id:true,code:true,name:true,versionNumber:true,noticeDays:true,requestRules:true}
 });
 const found=new Set(policies.map(p=>p.code));
 const missing=codes.filter(c=>!found.has(c));
 if(missing.length)throw new Error("ZERMATT_ACTIVE_POLICIES_MISSING:"+missing.join(","));
 const changes=policies.filter(p=>p.noticeDays!==0||p.requestRules?.backdatedRequestsAllowed!==true||p.requestRules?.minimumNotice!==0);
 console.log(JSON.stringify({mode:APPLY?"APPLY":"PREVIEW",organization:org.slug,total:policies.length,changes:changes.map(p=>({code:p.code,version:p.versionNumber,noticeDays:p.noticeDays,backdatedRequestsAllowed:p.requestRules?.backdatedRequestsAllowed,minimumNotice:p.requestRules?.minimumNotice}))},null,2));
 if(!APPLY){console.log("No writes. Re-run with --apply and ZERMATT_LEAVE_TIMING_ACTOR_EMAIL after approval.");return;}
 const email=String(process.env.ZERMATT_LEAVE_TIMING_ACTOR_EMAIL||"").trim().toLowerCase();
 if(!email)throw new Error("ZERMATT_LEAVE_TIMING_ACTOR_EMAIL_REQUIRED");
 const actor=await prisma.user.findFirst({where:{organizationId:org.id,email,isActive:true},select:{id:true}});
 if(!actor)throw new Error("ZERMATT_LEAVE_TIMING_ACTOR_NOT_FOUND");
 await prisma.$transaction(async tx=>{
  for(const p of changes){
   const live=await tx.leavePolicy.findFirst({where:{id:p.id,organizationId:org.id,status:"ACTIVE",isActive:true}});
   if(!live)throw new Error("POLICY_CHANGED_DURING_UPDATE");
   const previous={noticeDays:live.noticeDays,requestRules:live.requestRules||{}};
   const next={noticeDays:0,requestRules:{...previous.requestRules,backdatedRequestsAllowed:true,minimumNotice:0}};
   if(previous.noticeDays===0&&previous.requestRules.backdatedRequestsAllowed===true&&previous.requestRules.minimumNotice===0)continue;
   await tx.leavePolicy.update({where:{id:p.id},data:next});
   const reason="Approved Zermatt leave request timing exception: allow backdated applications and remove seven-day notice barrier; all other checks unchanged.";
   await tx.leavePolicyAudit.create({data:{organizationId:org.id,leavePolicyId:p.id,actorUserId:actor.id,action:"CHANGED",previousValue:previous,newValue:next,reason}});
   await tx.organizationAudit.create({data:{organizationId:org.id,actorUserId:actor.id,entityType:"LEAVE_POLICY",entityId:p.id,action:"ZERMATT_LEAVE_REQUEST_TIMING_UPDATED",previousValue:previous,newValue:next,reason}});
  }
 });
 console.log("Zermatt policy timing updated and audited. No employee requests or payroll records were changed.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
