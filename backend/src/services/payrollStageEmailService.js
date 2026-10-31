const { randomUUID } = require('node:crypto');
const { sendSmtp, smtpConfigured } = require('./loanWorkflowNotificationService');
const TASKS = Object.freeze({
  PENDING_AUDIT: { responsibility: 'PAYROLL_AUDITOR', title: 'Payroll audit required', task: 'Open the submitted payroll, review the supporting records and record your audit approval or disapproval with observations.' },
  PENDING_GM: { responsibility: 'GENERAL_MANAGER', title: 'Payroll GM approval required', task: 'Review the audited payroll and record your approval or disapproval in CHRiS.' },
  READY_FOR_PAYOUT: { responsibility: 'CHIEF_ACCOUNTANT', title: 'Approved payroll: payout preparation required', task: 'Review the approved payroll and export the approved payout pack for Accounts processing. Payment is completed outside CHRiS.' },
});
const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function buildStageEmail({stage,periodName,organizationName,slug}) {
  const task=TASKS[stage]; if(!task) throw Error('Unsupported payroll task stage');
  const link=`https://chris.crnetwork.com.ng/login?organization=${encodeURIComponent(slug)}`;
  const subject=`[CHRiS] ${task.title} · ${periodName}`;
  const textBody=`${organizationName}\n${task.title}\nPayroll: ${periodName}\n\n${task.task}\n\nSecure sign-in: ${link}\nAfter sign-in, open Payroll > Payroll Approvals and select this period. Only the assigned stage owner can act.\nPowered by CHRiS`;
  return {subject,textBody,htmlBody:`<div style="font:15px/1.6 Arial,sans-serif;color:#17211c"><h2>${safe(organizationName)}</h2><h3>${safe(task.title)}</h3><p>Payroll: ${safe(periodName)}</p><p>${safe(task.task)}</p><p><a href="${safe(link)}">Secure CHRiS sign-in</a></p><p>After sign-in, open Payroll &gt; Payroll Approvals and select this period. Only the assigned stage owner can act.</p><p>Powered by CHRiS</p></div>`};
}
async function queueStageEmail(tx,{organizationId,runId,eventId,stage}) {
  const task=TASKS[stage]; if(!task)return;
  const recipients=await tx.$queryRawUnsafe(`SELECT a."assignedUserId" FROM payroll_approval_assignments a JOIN users u ON u.id=a."assignedUserId" AND u."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a.responsibility=$2 AND a."isActive"=true AND u."isActive"=true AND COALESCE(TRIM(u.email),'')<>''`,organizationId,task.responsibility);
  if(recipients.length!==1){const e=Error('Exactly one active approval owner with an email address is required for '+task.responsibility);e.code='PAYROLL_NOTIFICATION_RECIPIENT_REQUIRED';e.statusCode=409;throw e;}
  await tx.$executeRawUnsafe(`UPDATE payroll_stage_email_outbox SET status='CANCELLED',"lastError"='SUPERSEDED_BY_NEW_REQUEST' WHERE "organizationId"=$1 AND "runId"=$2 AND responsibility=$3 AND "eventId"<>$4 AND status IN ('QUEUED','FAILED')`,organizationId,runId,task.responsibility,eventId);
  await tx.$executeRawUnsafe(`INSERT INTO payroll_stage_email_outbox (id,"organizationId","runId","eventId","recipientUserId",responsibility,stage) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("eventId",responsibility) DO NOTHING`,randomUUID(),organizationId,runId,eventId,recipients[0].assignedUserId,task.responsibility,stage);
}
// Row locks serialize deliveries across replicas. A failed attempt remains visible and retries with backoff.
async function deliverNext({prisma,send=sendSmtp,configured=smtpConfigured}) {
  if(!configured())return {status:'SMTP_NOT_CONFIGURED'};
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRawUnsafe(`SELECT n.*,u.email,u."isActive",a."assignedUserId",w.stage AS "currentStage",p.name AS "periodName",o.name AS "organizationName",o.slug
      FROM payroll_stage_email_outbox n JOIN organizations o ON o.id=n."organizationId"
      JOIN users u ON u.id=n."recipientUserId" AND u."organizationId"=n."organizationId"
      JOIN payroll_runs r ON r.id=n."runId" AND r."organizationId"=n."organizationId"
      JOIN payroll_periods p ON p.id=r."periodId" AND p."organizationId"=n."organizationId"
      JOIN payroll_approval_workflows w ON w."runId"=n."runId" AND w."organizationId"=n."organizationId"
      LEFT JOIN payroll_approval_assignments a ON a."organizationId"=n."organizationId" AND a.responsibility=n.responsibility AND a."isActive"=true
      WHERE o.slug='zermatt-liquor-limited' AND n.status IN ('QUEUED','FAILED') AND n.attempts<8 AND n."nextAttemptAt"<=now()
      ORDER BY n."createdAt" LIMIT 1 FOR UPDATE OF n SKIP LOCKED`);
    const row=rows[0];if(!row)return {status:'EMPTY'};
    if(!row.isActive||row.assignedUserId!==row.recipientUserId||row.currentStage!==row.stage){
      await tx.$executeRawUnsafe(`UPDATE payroll_stage_email_outbox SET status='CANCELLED',"lastError"='RECIPIENT_OR_STAGE_CHANGED' WHERE id=$1`,row.id);
      return {status:'CANCELLED'};
    }
    try {
      await send({to:row.email,...buildStageEmail({stage:row.stage,periodName:row.periodName,organizationName:row.organizationName,slug:row.slug})});
      await tx.$executeRawUnsafe(`UPDATE payroll_stage_email_outbox SET status='SENT',attempts=attempts+1,"lastError"=NULL,"sentAt"=now() WHERE id=$1`,row.id);
      await tx.organizationAudit.create({data:{organizationId:row.organizationId,entityType:'PayrollApprovalEmail',entityId:row.id,action:'PAYROLL_STAGE_EMAIL_ACCEPTED',newValue:{runId:row.runId,eventId:row.eventId,recipientUserId:row.recipientUserId,responsibility:row.responsibility,stage:row.stage},reason:'SMTP accepted stage-owner task notification; inbox delivery is provider-dependent.'}});
      return {status:'SENT'};
    } catch {
      await tx.$executeRawUnsafe(`UPDATE payroll_stage_email_outbox SET status='FAILED',attempts=attempts+1,"lastError"='SMTP_DELIVERY_FAILED',"nextAttemptAt"=now()+interval '15 minutes' WHERE id=$1`,row.id);
      return {status:'FAILED'};
    }
  },{timeout:60000});
}
function createPayrollStageEmailScheduler({prisma,intervalMs=60000}) {
  let timer=null,running=false;
  async function run(){if(running)return;running=true;try{for(let i=0;i<20;i++){const r=await deliverNext({prisma});if(['EMPTY','SMTP_NOT_CONFIGURED'].includes(r.status))break;}}catch{console.error('Payroll stage email scheduler failed; inspect the notification outbox.');}finally{running=false;}}
  return {start(){if(timer)return;void run();timer=setInterval(run,intervalMs);timer.unref?.();},stop(){clearInterval(timer);timer=null;},run};
}
module.exports={TASKS,buildStageEmail,queueStageEmail,deliverNext,createPayrollStageEmailScheduler};
