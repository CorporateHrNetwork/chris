const p=require('./simpleDisciplinaryPolicy');
const s=require('./simpleDisciplinaryService');
const mailConfigured=()=>require('./payrollStageEmailService').mailConfigured();
const sendStageMail=(...args)=>require('./payrollStageEmailService').sendStageMail(...args);
async function tick(prisma,{send=sendStageMail,configured=mailConfigured}={}){
 if(String(process.env.CHRIS_SALES_DEMO_MODE||'').toUpperCase()==='ON')return;
 return prisma.$transaction(async tx=>{
  const lock=await tx.$queryRawUnsafe("SELECT pg_try_advisory_xact_lock(hashtext('chris-disciplinary-tasks')) AS locked");if(!lock[0]?.locked)return;
  const rows=await tx.disciplinaryCase.findMany({where:{status:{not:'CLOSED'}},include:s.eventsInclude});
  for(const row of rows){const state=s.stateOf(row);if(!state||state.stage==='CLOSED')continue;
   const day=p.today();if(!state.dueDate||state.dueDate>=day)continue;
   const key=`${state.version}:${day}`;
   const found=await tx.disciplinaryProcessEvent.findFirst({where:{organizationId:row.organizationId,disciplinaryCaseId:row.id,eventType:'DISCIPLINARY_REMINDER',metadata:{path:['key'],equals:key}}});if(found)continue;
   await tx.disciplinaryProcessEvent.create({data:{organizationId:row.organizationId,disciplinaryCaseId:row.id,eventType:'DISCIPLINARY_REMINDER',occurredAt:new Date(),metadata:{key}}});
   for(const recipientUserId of new Set([state.ownerUserId,state.hrOwnerId,...(state.escalationOwnerIds||[])]))if(recipientUserId)await tx.disciplinaryProcessEvent.create({data:{organizationId:row.organizationId,disciplinaryCaseId:row.id,eventType:'DISCIPLINARY_TASK_NOTICE',occurredAt:new Date(),metadata:{recipientUserId,stage:state.stage,version:state.version,status:'QUEUED',attempts:0,overdue:true}}});
  }
  if(!configured())return;
  const notices=await tx.disciplinaryProcessEvent.findMany({where:{eventType:'DISCIPLINARY_TASK_NOTICE',metadata:{path:['status'],equals:'QUEUED'}},orderBy:{createdAt:'asc'},take:1});
  for(const n of notices){const m=n.metadata||{};if((m.attempts||0)>=5)continue;
   const [user,row,org]=await Promise.all([tx.user.findFirst({where:{id:m.recipientUserId,organizationId:n.organizationId,isActive:true}}),tx.disciplinaryCase.findFirst({where:{id:n.disciplinaryCaseId,organizationId:n.organizationId},include:s.eventsInclude}),tx.organization.findFirst({where:{id:n.organizationId}})]);
   const state=row&&s.stateOf(row);if(!user?.email||!state||!org||String(org.slug).includes('demo'))continue;
   if(m.stage!==state.stage){await tx.disciplinaryProcessEvent.update({where:{id:n.id},data:{metadata:{...m,status:'CANCELLED',lastError:'STAGE_SUPERSEDED'}}});continue;}
   // Verify the recipient still has case access; never email allegations or evidence.
   try{await s.context(tx,{userId:user.id,organizationId:n.organizationId,ess:user.employeeId===row.employeeId},row);}catch{continue;}
   const employee=user.employeeId===row.employeeId;
   const url=`https://chris.crnetwork.com.ng/${employee?'ess':'login'}?organization=${encodeURIComponent(org.slug)}`;
   const textBody=`${org.name}\nCHRiS case ${row.caseNumber}: ${m.overdue?'overdue task — please review':'case update — please review'}.\nOpen your ${employee?'employee portal':'Disciplinary Procedures workspace'} for the current task and deadline.\nSecure sign-in: ${url}\nAcknowledgement confirms receipt only. No allegation, evidence or outcome is included in this email.\nPowered by CHRiS`;
   try{await send({to:user.email,subject:`[CHRiS] Case task ${row.caseNumber}`,textBody,htmlBody:`<p>A confidential CHRiS case requires your attention.</p><p><a href="${url.replace(/&/g,'&amp;')}">Secure sign-in</a></p>`,deliveryKey:'disciplinary-'+n.id});await tx.disciplinaryProcessEvent.update({where:{id:n.id},data:{metadata:{...m,status:'SENT',attempts:(m.attempts||0)+1}}});await tx.disciplinaryProcessEvent.create({data:{organizationId:n.organizationId,disciplinaryCaseId:row.id,eventType:'NOTIFICATION_PROVIDER_ACCEPTED',occurredAt:new Date(),metadata:{noticeId:n.id,recipientUserId:user.id}}});}
   catch{await tx.disciplinaryProcessEvent.update({where:{id:n.id},data:{metadata:{...m,attempts:(m.attempts||0)+1,lastError:'EMAIL_DELIVERY_FAILED'}}});}
  }
 },{timeout:60000});
}
function createDisciplinaryTaskScheduler({prisma}){let timer,running=false;async function run(){if(running)return;running=true;try{await tick(prisma);}catch{console.error('Disciplinary task delivery failed. Inspect case task notices.');}finally{running=false;}}return {start(){if(timer)return;void run();timer=setInterval(run,60000);timer.unref?.();},stop(){clearInterval(timer);timer=null;},run};}
module.exports={tick,createDisciplinaryTaskScheduler};
