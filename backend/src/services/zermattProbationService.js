const { randomUUID } = require('crypto');
const p = require('./zermattProbationPolicy');
const SLUG='zermatt-liquor-limited';
function fail(message,statusCode=400) { return Object.assign(new Error(message),{statusCode}); }
async function audit(tx,org,actor,id,action,before,after,reason) {
  await tx.organizationAudit.create({data:{organizationId:org,actorUserId:actor||null,entityType:'ZermattProbationReview',entityId:id,action,previousValue:before||undefined,newValue:after||undefined,reason}});
}
async function managerId(tx,org,employeeId,today) {
  const a=await tx.employeeLineManagerAssignment.findFirst({where:{organizationId:org,employeeId,manager:{status:{in:['ACTIVE','PROBATION','LEAVE']},exitDate:null},effectiveFrom:{lte:new Date(today+'T23:59:59Z')},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date(today+'T00:00:00Z')}}]},orderBy:{effectiveFrom:'desc'}});
  return a?.managerEmployeeId||null;
}
async function users(tx,org) {
  return tx.user.findMany({where:{organizationId:org,isActive:true},include:{userRoles:{include:{role:true}},userLocations:true}});
}
function userRoles(u) { return u.userRoles.map(x=>x.role.name); }
function branchMatches(u,locationId) {
  // Branch notices require an explicit branch assignment; ALL_LOCATIONS alone is not a branch assignment.
  return !!locationId && u.userLocations.some(x=>x.locationId===locationId);
}
async function notify(tx,org,review,eventKey,message,today) {
  const employee=await tx.employee.findFirst({where:{id:review.employeeId,organizationId:org}});
  if (!employee) return;
  const manager=await managerId(tx,org,employee.id,today);
  const recipients=(await users(tx,org)).filter(u=>p.hasRole(userRoles(u),p.HEAD)||p.hasRole(userRoles(u),p.BRANCH)&&branchMatches(u,employee.locationId)||u.employeeId===manager);
  for (const u of recipients) await tx.$executeRawUnsafe(`INSERT INTO "zermatt_probation_notices" ("id","organizationId","reviewId","recipientUserId","eventKey","message") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("reviewId","recipientUserId","eventKey") DO NOTHING`,randomUUID(),org,review.id,u.id,eventKey,`${employee.employeeNumber} — ${employee.firstName} ${employee.lastName}: ${message}`);
}
async function loadContext(tx,auth,review,today) {
  const employee=await tx.employee.findFirst({where:{id:review.employeeId,organizationId:auth.organizationId},include:{location:true,designation:true}});
  if (!employee) throw fail('Employee not found.',404);
  const user=await tx.user.findFirst({where:{id:auth.userId,organizationId:auth.organizationId,isActive:true},include:{userLocations:true}});
  const managerInScope=(!auth.activeLocationId||auth.activeLocationId===employee.locationId) && (auth.locationScope!=='ASSIGNED_LOCATIONS'||(auth.availableLocations||[]).some(x=>x.id===employee.locationId));
  const manager=managerInScope && !!user?.employeeId && user.employeeId===await managerId(tx,auth.organizationId,employee.id,today) && user.employeeId!==employee.id;
  const sameBranch=!!user && branchMatches(user,employee.locationId) && (!auth.activeLocationId||auth.activeLocationId===employee.locationId);
  const rights=p.access({roles:auth.roles,manager,sameBranch});
  if (!rights.canRead) throw fail('This probation review is outside your authority.',403);
  return {employee,rights};
}
async function synchronize(prisma,now=new Date()) {
  const today=p.lagosDate(now);
  return prisma.$transaction(async tx=>{
    const org=await tx.organization.findUnique({where:{slug:SLUG},select:{id:true}});
    if (!org) return {skipped:'ZERMATT_NOT_CONFIGURED'};
    // A transaction-scoped lock prevents duplicate cycles and notification races across API replicas.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text AS locked',`zermatt-probation:${org.id}`);
    const employees=await tx.employee.findMany({where:{organizationId:org.id,status:'PROBATION'},include:{employmentEpisodes:{where:{endDate:null},orderBy:{sequenceNumber:'desc'},take:1}}});
    let created=0;
    for (const e of employees) {
      const episode=e.employmentEpisodes[0];
      if (!episode || !e.hireDate) continue;
      const dates=p.probationDates(episode.startDate);
      const reviewId=randomUUID();
      const inserted=await tx.$executeRawUnsafe(`INSERT INTO "zermatt_probation_reviews" ("id","organizationId","employeeId","episodeId","startDate","endDate","noticeDate") VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date) ON CONFLICT ("organizationId","episodeId","cycle") DO NOTHING`,reviewId,org.id,e.id,episode.id,dates.startDate,dates.endDate,dates.noticeDate);
      if (inserted) {created++;await audit(tx,org.id,null,reviewId,'PROBATION_REVIEW_OPENED',null,dates,'Three-calendar-month probation review from current employment episode.');}
    }
    const due=await tx.$queryRawUnsafe(`SELECT r.* FROM "zermatt_probation_reviews" r JOIN "employees" e ON e."id"=r."employeeId" AND e."organizationId"=r."organizationId" JOIN "employee_employment_episodes" ep ON ep."id"=r."episodeId" WHERE r."organizationId"=$1 AND r."status"<>'DECIDED' AND r."noticeDate" <= $2::date AND e."status"='PROBATION' AND ep."endDate" IS NULL`,org.id,today);
    for (const r of due) await notify(tx,org.id,r,'REVIEW_DUE',`Probation assessment due ${p.dateOnly(r.endDate)}. Line Manager: submit assessment to Head HR. Branch HR: coordinate and verify evidence.${p.dateOnly(r.endDate)<today?' OVERDUE — Head HR follow-up required.':''}`,today);
    return {created,due:due.length};
  },{timeout:60000});
}
async function list(prisma,auth) {
  if (auth.organization?.slug!==SLUG) throw fail('Zermatt workflow only.',404);
  const today=p.lagosDate();
  const all=await prisma.$queryRawUnsafe(`SELECT * FROM "zermatt_probation_reviews" WHERE "organizationId"=$1 ORDER BY "endDate","createdAt"`,auth.organizationId);
  const records=[];
  for (const row of all) {
    let ctx;try {ctx=await loadContext(prisma,auth,row,today);}catch(e){if(e.statusCode===403)continue;throw e;}
    records.push({...row,startDate:p.dateOnly(row.startDate),endDate:p.dateOnly(row.endDate),noticeDate:p.dateOnly(row.noticeDate),overdue:p.dateOnly(row.endDate)<today&&row.status!=='DECIDED',employeeNumber:ctx.employee.employeeNumber,employeeName:[ctx.employee.firstName,ctx.employee.middleName,ctx.employee.lastName].filter(Boolean).join(' '),branch:ctx.employee.location?.name,role:ctx.employee.designation?.name,...ctx.rights});
  }
  return records;
}
async function change(prisma,auth,id,action,input) {
  if (auth.organization?.slug!==SLUG) throw fail('Zermatt workflow only.',404);
  return prisma.$transaction(async tx=>{
    const r=(await tx.$queryRawUnsafe(`SELECT * FROM "zermatt_probation_reviews" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,auth.organizationId,id))[0];
    if (!r) throw fail('Review not found.',404);
    if (!Number.isInteger(input.version)||input.version!==r.version) throw fail('This review changed. Refresh before continuing.',409);
    if (r.status==='DECIDED') throw fail('This review already has a final decision.',409);
    const today=p.lagosDate();
    const {employee,rights}=await loadContext(tx,auth,r,today);
    await tx.$queryRawUnsafe('SELECT "id" FROM "employees" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE',auth.organizationId,employee.id);
    const current=await tx.employee.findFirst({where:{id:employee.id,organizationId:auth.organizationId}});
    const episode=await tx.employeeEmploymentEpisode.findFirst({where:{id:r.episodeId,organizationId:auth.organizationId,employeeId:employee.id,endDate:null}});
    if (!episode||current.status!=='PROBATION') throw fail('Employee is no longer on probation in this employment episode.',409);
    let state=r.status, assessment=r.assessment, decision=r.decision, reason;
    if (action==='submit') {
      if (!rights.canAssess) throw fail('Only the assigned Line Manager may assess this employee.',403);
      if (!['AWAITING_ASSESSMENT','RETURNED'].includes(r.status)) throw fail('Assessment is already submitted.',409);
      assessment={...assessment,...p.assessment(input),assessorUserId:auth.userId,submittedAt:new Date().toISOString()};state='SUBMITTED';reason=assessment.reason;
    } else if (action==='verify') {
      if (!rights.canVerify || r.status!=='SUBMITTED') throw fail('Branch HR verification requires a submitted assessment in your branch.',403);
      assessment={...assessment,branchVerification:{reason:p.required(input.reason,'Verification note'),userId:auth.userId,at:new Date().toISOString()}};reason=assessment.branchVerification.reason;
    } else if (action==='return') {
      if (!rights.canDecide||r.status!=='SUBMITTED') throw fail('Only Head HR may return a submitted assessment.',403);
      reason=p.required(input.reason,'Clarification reason');assessment={...assessment,returnReason:reason};state='RETURNED';
    } else if (action==='decide') {
      if (!rights.canDecide||r.status!=='SUBMITTED'||!assessment?.assessorUserId) throw fail('Head HR decision requires a submitted manager assessment.',403);
      decision={...p.decision(input,r,today),approverUserId:auth.userId,decidedAt:new Date().toISOString()};reason=decision.reason;state='DECIDED';
      const effectiveDate=new Date(decision.effectiveDate+'T00:00:00Z');
      if (decision.outcome==='EXTEND_PROBATION') {
        const next={id:randomUUID(),employeeId:employee.id};
        await tx.$executeRawUnsafe(`INSERT INTO "zermatt_probation_reviews" ("id","organizationId","employeeId","episodeId","cycle","startDate","endDate","noticeDate","assessment") VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8::date,$9::jsonb)`,next.id,auth.organizationId,employee.id,r.episodeId,r.cycle+1,p.addDays(p.dateOnly(r.endDate),1),decision.newEndDate,p.addDays(decision.newEndDate,-7),JSON.stringify({improvementGoals:decision.improvementGoals,previousReviewId:r.id}));
        await audit(tx,auth.organizationId,auth.userId,next.id,'PROBATION_EXTENSION_OPENED',null,{...decision,previousReviewId:r.id},reason);
        // Short extensions whose reminder window is already open are notified immediately.
        if (p.addDays(decision.newEndDate,-7)<=today) await notify(tx,auth.organizationId,next,'REVIEW_DUE',`Extended probation assessment due ${decision.newEndDate}. Goals: ${decision.improvementGoals}`,today);
      } else {
        if (effectiveDate<episode.startDate) throw fail('Decision cannot predate current employment episode.');
        const target=decision.outcome==='CONFIRM_EMPLOYMENT'?'ACTIVE':'TERMINATED';
        await tx.employee.update({where:{id:employee.id},data:target==='ACTIVE'?{status:target,confirmationDate:effectiveDate}:{status:target,exitDate:effectiveDate,suspensionEndDate:null}});
        if (target==='TERMINATED') {
          await tx.employeeEmploymentEpisode.update({where:{id:episode.id},data:{endDate:effectiveDate,endStatus:target,endDepartmentId:employee.departmentId,endDesignationId:employee.designationId,endLocationId:employee.locationId,endReason:reason}});
          await tx.user.updateMany({where:{organizationId:auth.organizationId,employeeId:employee.id},data:{isActive:false}});
        }
        await tx.employeeLifecycleEvent.create({data:{organizationId:auth.organizationId,employeeId:employee.id,eventType:target==='ACTIVE'?'CONFIRMED':'EXITED',effectiveDate,previousStatus:current.status,newStatus:target,fromLocationId:employee.locationId,toLocationId:employee.locationId,reason,notes:`Probation review ${id}; manager recommendation: ${assessment.recommendation}`,performedByUserId:auth.userId}});
      }
    } else throw fail('Unknown workflow action.');
    await tx.$executeRawUnsafe(`UPDATE "zermatt_probation_reviews" SET "status"=$3,"assessment"=$4::jsonb,"decision"=$5::jsonb,"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,auth.organizationId,id,state,JSON.stringify(assessment),JSON.stringify(decision));
    await audit(tx,auth.organizationId,auth.userId,id,`PROBATION_${action.toUpperCase()}`,{status:r.status,assessment:r.assessment,decision:r.decision},{status:state,assessment,decision},reason);
    await notify(tx,auth.organizationId,r,`${action}:${r.version+1}`,action==='decide'?`Head HR decision: ${decision.outcome.replaceAll('_',' ')} effective ${decision.effectiveDate}.`:action==='submit'?'Assessment submitted to Head HR.':action==='return'?`Assessment returned: ${reason}`:'Branch HR evidence verification recorded.',today);
    return {id,status:state,version:r.version+1};
  },{timeout:30000});
}
module.exports={SLUG,synchronize,list,change,loadContext,notify};
