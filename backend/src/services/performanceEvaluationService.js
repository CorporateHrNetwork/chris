"use strict";
const crypto = require("crypto");
const R = require("./performanceEvaluationRules");
const TYPE = "ZermattPerformanceEvaluation";
const eligible = ["ACTIVE","PROBATION","LEAVE"];
function enabled(organizationId) {
  return process.env.CHRIS_PE_ENABLED === "true" &&
    String(process.env.CHRIS_PE_ORGANIZATION_IDS || "").split(",").map(s=>s.trim()).includes(organizationId);
}
async function assertEnabled(db, organizationId) {
  if (!enabled(organizationId)) R.fail("Performance evaluation is not enabled for this organization.",404);
  const org = await db.organization.findFirst({where:{id:organizationId,slug:"zermatt-liquor-limited",status:"ACTIVE"}});
  if (!org) R.fail("This rollout is restricted to the approved Zermatt tenant.",403);
}
async function state(db, organizationId) {
  const rows = await db.organizationAudit.findMany({where:{organizationId,entityType:TYPE},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const values = new Map();
  for (const row of rows) {
    if ((row.newValue?.revision||0) > (values.get(row.entityId)?.revision||0)) values.set(row.entityId,row.newValue);
  }
  return values;
}
async function event(db, org, actor, key, value, reason) {
  const history = await db.organizationAudit.findMany({where:{organizationId:org,entityType:TYPE,entityId:key},select:{newValue:true}});
  const revision = Math.max(0,...history.map(r=>r.newValue?.revision||0))+1;
  const saved = {...value, revision, updatedAt:new Date().toISOString()};
  await db.organizationAudit.create({data:{organizationId:org,actorUserId:actor||null,entityType:TYPE,entityId:key,action:"PE_"+value.kind.toUpperCase(),newValue:saved,reason}});
  return saved;
}
async function locked(db, org, fn) {
  await assertEnabled(db,org);
  return db.$transaction(async tx=>{
    // Serialize the entire tenant so concurrent workers cannot open duplicate cycles or overwrite transitions.
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))::text AS locked", "chris-pe:"+org);
    return fn(tx,await state(tx,org));
  },{timeout:30000});
}
function key(...parts) { return parts.join(":"); }
function list(s, kind) { return [...s.values()].filter(v=>v?.kind===kind); }
async function notify(tx,org,actor,s,recipient,code,message,now) {
  const id=key("notice",recipient,code);
  if(s.has(id)) return;
  const row=await event(tx,org,actor,id,{kind:"notification",id,recipient,message,createdAt:now.toISOString()},"Agent task notification");
  s.set(id,row);
}
function hrAllowed(auth) {
  return auth.permissions?.includes("performance.manage") && auth.locationScope==="ALL_LOCATIONS" && !auth.activeLocationId;
}
async function actor(db,auth,ess=false) {
  if(ess) return {userId:auth.userId,employeeId:auth.employeeId,hr:false};
  const u=await db.user.findFirst({where:{id:auth.userId,organizationId:auth.organizationId,isActive:true},select:{employeeId:true}});
  if(!u) R.fail("Account unavailable.",403);
  return {userId:auth.userId,employeeId:u.employeeId,hr:hrAllowed(auth),auth};
}
async function isManager(db,org,a,r) {
  if(!a.employeeId || a.employeeId===r.employeeId || a.employeeId!==r.managerEmployeeId) return false;
  const assignment=await db.employeeLineManagerAssignment.findFirst({where:{organizationId:org,employeeId:r.employeeId,managerEmployeeId:a.employeeId,effectiveTo:null,effectiveFrom:{lte:new Date()}}});
  if(!assignment) return false;
  const manager=await db.employee.findFirst({where:{id:a.employeeId,organizationId:org,status:{in:eligible},exitDate:null}});
  if(!manager) return false;
  if(a.auth) {
    const employee=await db.employee.findFirst({where:{id:r.employeeId,organizationId:org},select:{locationId:true}});
    const allowed=a.auth.availableLocations?.map(l=>l.id)||[];
    if(a.auth.activeLocationId && employee?.locationId!==a.auth.activeLocationId) return false;
    if(a.auth.locationScope==="ASSIGNED_LOCATIONS" && !allowed.includes(employee?.locationId)) return false;
  }
  return true;
}
async function profileRows(db, org, a, s) {
  if (!a.hr && !a.employeeId) return [];
  const now = new Date();
  const current = {effectiveTo:null,effectiveFrom:{lte:now}};
  const employees = await db.employee.findMany({where:{organizationId:org,status:{in:eligible},exitDate:null,
    ...(!a.hr?{OR:[{id:a.employeeId},{lineManagerAssignments:{some:{...current,managerEmployeeId:a.employeeId}}}]}:{}),
    ...(a.auth?.activeLocationId?{locationId:a.auth.activeLocationId}:a.auth?.locationScope==='ASSIGNED_LOCATIONS'?{locationId:{in:(a.auth.availableLocations||[]).map(l=>l.id)}}:{})},
    include:{designation:true,department:true,location:true,lineManagerAssignments:{where:current,include:{manager:{include:{designation:true}}}}},orderBy:{employeeNumber:'asc'}});
  const standards=list(s,'template').filter(t=>t.status==='PUBLISHED');
  return employees.filter(e=>a.hr||e.id===a.employeeId||(e.lineManagerAssignments||[]).some(m=>m.managerEmployeeId===a.employeeId)).map(e=>{
    const template=standards.filter(t=>t.roleId===e.designationId).sort((x,y)=>String(y.publishedAt).localeCompare(String(x.publishedAt)))[0];
    const assignments=(e.lineManagerAssignments||[]).filter(m=>m.managerEmployeeId!==e.id&&eligible.includes(m.manager?.status)&&!m.manager?.exitDate);
    const manager=assignments.length===1?assignments[0].manager:null;
    return {employeeId:e.id,employeeNumber:e.employeeNumber,employeeName:[e.firstName,e.middleName,e.lastName].filter(Boolean).join(' '),
      own:e.id===a.employeeId,roleName:e.designation?.name||template?.roleName||'Unassigned',department:e.department?.name,branch:e.location?.name,
      managerEmployeeId:manager?.id||null,managerName:manager?[manager.firstName,manager.middleName,manager.lastName].filter(Boolean).join(' '):null,
      mappingStatus:manager?'MAPPED':'HR_MANAGER_MAPPING_REQUIRED',
      standard:template?{id:template.id,version:template.version,description:template.description,jobDescription:template.jobDescription||null,goals:template.goals,publishedAt:template.publishedAt}:null};
  });
}
async function roleProfiles(db,auth,ess=false) {
  if(!enabled(auth.organizationId))return {enabled:false,profiles:[]};
  await assertEnabled(db,auth.organizationId);
  const a=await actor(db,auth,ess);
  return {enabled:true,profiles:await profileRows(db,auth.organizationId,a,await state(db,auth.organizationId))};
}
async function workspace(db,auth,ess=false) {
  const org=auth.organizationId;
  if(!enabled(org)) return {enabled:false};
  await assertEnabled(db,org);
  const a=await actor(db,auth,ess), s=await state(db,org), reviews=[];
  for(const review of list(s,"review")) {
    const manager=await isManager(db,org,a,review), own=a.employeeId===review.employeeId;
    const appeal=review.appealReviewerUserId===a.userId;
    if(!a.hr&&!own&&!manager&&!appeal) continue;
    const actions=[];
    if(own&&["GOALS_PUBLISHED","SELF_REVIEW_PENDING"].includes(review.status)&&R.lagosDate()>review.endDate) actions.push("self");
    if(manager&&["MANAGER_PENDING","RETURNED"].includes(review.status)) actions.push("manager");
    if(a.hr&&review.status==="HR_PENDING") actions.push("finalise","return");
    if(own&&review.status==="RELEASED") actions.push("acknowledge","dispute");
    if(a.hr&&review.status==="DISPUTED") actions.push("assign-appeal");
    if(a.hr&&["GOALS_PUBLISHED","SELF_REVIEW_PENDING","MANAGER_PENDING","RETURNED","HR_PENDING"].includes(review.status)) actions.push("reassign");
    if(appeal&&review.status==="APPEAL_PENDING") actions.push("appeal");
    if(manager&&["RELEASED","ACKNOWLEDGED","CLOSED"].includes(review.status)) actions.push("follow-up");
    if(own&&['GOALS_PUBLISHED','SELF_REVIEW_PENDING'].includes(review.status)&&R.lagosDate()>=review.effectiveFrom) actions.push('self-draft');
    const visible={...review,actions};
    if(!own) delete visible.selfAssessmentDraft;
    if(own&&!a.hr&&!manager&&!["RELEASED","ACKNOWLEDGED","DISPUTED","APPEAL_PENDING","CLOSED"].includes(review.status)) {
      delete visible.managerAssessment; delete visible.finalScore; delete visible.managerUserId;
    }
    reviews.push(visible);
  }
  return {enabled:true,canManage:a.hr,policy:s.get("policy")||null,
    draftPolicy:a.hr?R.POLICY:null,
    templates:a.hr?list(s,"template"):[],
    cycles:a.hr?list(s,"cycle"):[],
    reviews,
    profiles:await profileRows(db,org,a,s),
    reviewerCandidates:a.hr?(await db.user.findMany({where:{organizationId:org,isActive:true},select:{id:true,firstName:true,lastName:true,employeeId:true}})).map(u=>({id:u.id,employeeId:u.employeeId,label:[u.firstName,u.lastName].filter(Boolean).join(" ")||"Unnamed user — complete the user profile"})):[],
    notifications:list(s,"notification").filter(n=>n.recipient==="user:"+a.userId||n.recipient==="employee:"+a.employeeId||(a.hr&&n.recipient==="HR"))
  };
}
async function publishPolicy(db,auth) {
  if(!hrAllowed(auth)) R.fail("Organization-wide performance management authority is required.",403);
  return locked(db,auth.organizationId,async(tx,s)=>{
    const old=s.get("policy");
    if(old?.version===R.POLICY.version) return old;
    return event(tx,auth.organizationId,auth.userId,"policy",{kind:"policy",...R.POLICY,publishedAt:new Date().toISOString(),publishedBy:auth.userId},"HR published performance policy");
  });
}
async function generateStandards(db,auth,generate) {
  if(!hrAllowed(auth)) R.fail("Organization-wide performance management authority is required.",403);
  await assertEnabled(db,auth.organizationId);
  const roles=await db.designation.findMany({where:{organizationId:auth.organizationId,isActive:true},include:{department:true},orderBy:{name:"asc"}});
  const results=[];
  for(const role of roles) {
    const existing=await state(db,auth.organizationId);
    if(list(existing,"template").some(t=>t.roleId===role.id)) continue;
    const generated=role.description ? await generate({title:role.name,department:role.department?.name,description:role.description}) : null;
    results.push(await locked(db,auth.organizationId,async(tx,s)=>{
      if(list(s,"template").some(t=>t.roleId===role.id)) return null;
      const id=key("template",role.id,crypto.randomUUID());
      return event(tx,auth.organizationId,auth.userId,id,{kind:"template",id,roleId:role.id,roleName:role.name,
        description:role.description||null,source:generated?.source||"MISSING_JOB_DESCRIPTION",
        goals:generated?.goals||R.draftGoals(generated?.kpis),status:"DRAFT",version:1},"Agent generated role-standard draft");
    }));
  }
  return results.filter(Boolean);
}
async function saveTemplate(db,auth,id,input) {
  if(!hrAllowed(auth)) R.fail("Organization-wide performance management authority is required.",403);
  return locked(db,auth.organizationId,async(tx,s)=>{
    const t=s.get(id); if(t?.kind!=="template") R.fail("Role standard not found.",404);
    if(t.status!=="DRAFT") R.fail("Published standards are immutable. Create a new draft revision.",409);
    R.validateGoals(input.goals);
    if(!t.description) R.fail("Add the approved job description to the role register and regenerate its draft.");
    if(input.publish) R.assertPublishable(input.goals);
    return event(tx,auth.organizationId,auth.userId,id,{...t,goals:input.goals,
      status:input.publish?"PUBLISHED":"DRAFT",publishedAt:input.publish?new Date().toISOString():null,
      publishedBy:input.publish?auth.userId:null},R.required(input.reason,"Change reason"));
  });
}
async function reviseTemplate(db,auth,id) {
  if(!hrAllowed(auth)) R.fail("Organization-wide performance management authority is required.",403);
  return locked(db,auth.organizationId,async(tx,s)=>{
    const t=s.get(id);if(t?.kind!=="template") R.fail("Role standard not found.",404);
    const role=await tx.designation.findFirst({where:{id:t.roleId,organizationId:auth.organizationId,isActive:true}});
    if(!role) R.fail("Active role not found.",404);
    const next=key("template",t.roleId,crypto.randomUUID());
    return event(tx,auth.organizationId,auth.userId,next,{...t,id:next,description:role.description||null,version:t.version+1,status:"DRAFT",publishedAt:null,publishedBy:null},"Created prospective role-standard revision");
  });
}
async function tick(db,org,{now=new Date(),manual=false,actorUserId=null}={}) {
  return locked(db,org,async(tx,s)=>{
    const q=R.quarter(now), date=R.lagosDate(now), ck=key("cycle",q.key);
    let cycle=s.get(ck);
    const policy=cycle?.policy||s.get("policy");
    if(!cycle && !policy) { await notify(tx,org,actorUserId,s,"HR","policy:"+q.key,"Publish the performance policy before opening the cycle.",now); return {opened:false}; }
    if(!cycle && !manual && date!==q.start) {
      await notify(tx,org,actorUserId,s,"HR","missed:"+q.key,"No cycle exists for "+q.key+". HR may open a prospective partial-quarter cycle; earlier work will not be rated.",now);
      return {opened:false};
    }
    if(!cycle || manual) {
      const employees=await tx.employee.findMany({where:{organizationId:org,status:{in:eligible},exitDate:null},include:{designation:true}});
      const templates=list(s,"template").filter(t=>t.status==="PUBLISHED");
      const exceptions=[],cards=[];
      for(const e of employees) {
        if(s.has(key("review",q.key,e.id))) {
          if(s.get(key('review',q.key,e.id)).managerMappingRequired) exceptions.push({employeeId:e.id,employeeNumber:e.employeeNumber,reason:'HR manager mapping still required'});
          continue;
        }
        const t=templates.filter(t=>t.roleId===e.designationId).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
        const assignments=await tx.employeeLineManagerAssignment.findMany({where:{organizationId:org,employeeId:e.id,effectiveTo:null,effectiveFrom:{lte:now}},include:{manager:true}});
        const assignment=assignments.length===1?assignments[0]:null;
        const validManager=assignment&&assignment.managerEmployeeId!==e.id&&eligible.includes(assignment.manager.status)&&!assignment.manager.exitDate;
        if(!t || !validManager) {
          exceptions.push({employeeId:e.id,employeeNumber:e.employeeNumber,reason:!t?"No published role standard":"Missing, ambiguous or unavailable manager"});
          if(!t || !t.allowSelfReviewWithoutManager) continue;
        }
        cards.push({e,t,assignment:validManager?assignment:null});
      }
      cycle=await event(tx,org,actorUserId,ck,{kind:"cycle",id:ck,...q,effectiveFrom:cycle?.effectiveFrom||date,partial:cycle?.partial??(date!==q.start),
        openedAt:cycle?.openedAt||now.toISOString(),policy,exceptions,
        deadlines:{self:R.plusDays(q.end,7),manager:R.plusDays(q.end,14),hr:R.plusDays(q.end,21)}},"Agent opened quarterly cycle");
      s.set(ck,cycle);
      for(const {e,t,assignment} of cards) {
        const id=key("review",q.key,e.id);
        const r=await event(tx,org,actorUserId,id,{kind:"review",id,cycleId:ck,employeeId:e.id,
          employeeName:[e.firstName,e.lastName].filter(Boolean).join(" "),employeeNumber:e.employeeNumber,
          managerEmployeeId:assignment?.managerEmployeeId||null,templateId:t.id,roleName:t.roleName,goals:t.goals,
          jobDescription:t.jobDescription||null,description:t.description||null,selfRatingRequired:Boolean(t.catalogVersion),
          managerMappingRequired:!assignment,
          policyVersion:policy.version,policy,effectiveFrom:date,endDate:q.end,deadlines:cycle.deadlines,status:"GOALS_PUBLISHED",
          selfAssessment:null,managerAssessment:null,finalScore:null},"Published employee scorecard");
        s.set(id,r);
        for(const recipient of ["employee:"+e.id,...(assignment?["employee:"+assignment.managerEmployeeId]:[])]) await notify(tx,org,actorUserId,s,recipient,"open:"+id,"Quarterly scorecard available for "+e.employeeNumber+". Review goals and deadlines.",now);
      }
      if(exceptions.length) await notify(tx,org,actorUserId,s,"HR","exceptions:"+ck,exceptions.length+" employees need role or manager mapping. Open the cycle exceptions.",now);
    }
    const cycles=list(s,"cycle");
    for(const r of list(s,"review")) {
      const cy=cycles.find(c=>c.id===r.cycleId);if(!cy)continue;
      let recipient,deadline;
      if(["GOALS_PUBLISHED","SELF_REVIEW_PENDING"].includes(r.status)&&date>cy.end) {recipient="employee:"+r.employeeId;deadline=r.deadlines.self;}
      else if(["MANAGER_PENDING","RETURNED"].includes(r.status)){recipient="employee:"+r.managerEmployeeId;deadline=r.deadlines.manager;}
      else if(r.status==="HR_PENDING"){recipient="HR";deadline=r.deadlines.hr;}
      if(recipient) {
        await notify(tx,org,actorUserId,s,recipient,"task:"+r.id+":"+r.status+":"+date,"Performance task "+r.status+" for "+r.employeeNumber+"; due "+deadline+".",now);
        if(date>deadline) await notify(tx,org,actorUserId,s,"HR","overdue:"+r.id+":"+date,"Overdue performance task for "+r.employeeNumber+": "+r.status,now);
      }
    }
    return {opened:true,cycle};
  });
}
async function transition(db,auth,id,action,input={},ess=false) {
  const org=auth.organizationId;
  await assertEnabled(db,org);
  const a=await actor(db,auth,ess);
  return locked(db,org,async(tx,s)=>{
    const r=s.get(id);if(r?.kind!=="review") R.fail("Review not found.",404);
    const own=a.employeeId===r.employeeId, manager=await isManager(tx,org,a,r);
    const next={...r}, date=R.lagosDate(), now=new Date().toISOString();
    if(action==='self-draft') {
      if(!own) R.fail('Only the employee may save this self-assessment draft.',403);
      if(!['GOALS_PUBLISHED','SELF_REVIEW_PENDING'].includes(r.status)||date<r.effectiveFrom) R.fail('This scorecard is not open for a self-assessment draft.',409);
      const ratings=Array.isArray(input.ratings)?input.ratings:[];
      if(new Set(ratings.map(v=>v.goalId)).size!==ratings.length||ratings.some(v=>!r.goals.some(g=>g.id===v.goalId)||!Number.isInteger(v.rating)||v.rating<1||v.rating>5)) R.fail('Draft ratings must refer to distinct scorecard goals and use whole numbers from 1 to 5.');
      for(const field of ['comments','evidence']) if(typeof (input[field]||'')!=='string'||String(input[field]||'').length>20000) R.fail('Draft text must be at most 20,000 characters.');
      if(ratings.some(v=>typeof(v.evidence||'')!=='string'||String(v.evidence||'').length>20000)) R.fail('Draft rating evidence is too long.');
      next.selfAssessmentDraft={comments:input.comments||'',evidence:input.evidence||'',ratings,updatedAt:now};
      return event(tx,org,a.userId,id,next,'Employee saved their own self-assessment draft; no manager rating or final outcome changed.');
    } else if(action==="self") {
      if(!own) R.fail("Only the employee may submit this self-review.",403);
      if(!["GOALS_PUBLISHED","SELF_REVIEW_PENDING"].includes(r.status)||date<=r.endDate) R.fail("Self-review opens after the assessment period.",409);
      const selfScore=(input.ratings||r.selfRatingRequired)?R.score(r.goals,input.ratings):null;
      next.selfAssessmentDraft=null;
      next.selfAssessment={...(selfScore?{ratings:input.ratings,selfScore}:{}),comments:R.required(input.comments,"Achievements and challenges"),evidence:R.required(input.evidence,"Supporting evidence"),submittedAt:now};
      next.status="MANAGER_PENDING";
    } else if(action==="manager") {
      if(!manager) R.fail("Only the currently assigned line manager may assess this employee.",403);
      if(!["MANAGER_PENDING","RETURNED"].includes(r.status)) R.fail("Employee self-review is required before manager review.",409);
      next.finalScore=R.score(r.goals,input.ratings);
      next.managerAssessment={ratings:input.ratings,discussion:R.required(input.discussion,"Feedback discussion record"),development:R.required(input.development,"Development or follow-up plan"),reviewedAt:now};
      next.managerUserId=a.userId;next.status="HR_PENDING";
    } else if(action==="return"||action==="finalise") {
      if(!a.hr||own||manager||r.managerUserId===a.userId) R.fail("An independent authorized HR reviewer is required.",403);
      if(r.status!=="HR_PENDING") R.fail("Manager review must be pending HR validation.",409);
      next.hrComment=R.required(input.comments,"HR review reason");
      if(action==="return") {next.status="RETURNED";}
      else {next.finalScore=R.score(r.goals,r.managerAssessment.ratings);next.status="RELEASED";next.releasedAt=now;next.hrUserId=a.userId;next.appealDeadline=R.plusDays(date,7);}
    } else if(action==="acknowledge"||action==="dispute") {
      if(!own) R.fail("Only the employee may respond to the released result.",403);
      if(r.status!=="RELEASED") R.fail("The result is not awaiting acknowledgment.",409);
      if(action==="dispute"&&date>r.appealDeadline) R.fail("Appeal deadline passed; contact HR for an authorized exception.",409);
      next.employeeResponse={action,comments:action==="dispute"?R.required(input.comments,"Dispute reason"):String(input.comments||""),at:now};
      next.status=action==="dispute"?"DISPUTED":"ACKNOWLEDGED";
    } else if(action==="follow-up") {
      if(!manager||!["RELEASED","ACKNOWLEDGED","CLOSED"].includes(r.status)) R.fail("Only the current manager may record follow-up on a released review.",403);
      if(!["OPEN","IN_PROGRESS","COMPLETED"].includes(input.followUpStatus)) R.fail("Select a valid follow-up status.");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(input.followUpDate||"")||!Number.isFinite(Date.parse(input.followUpDate))) R.fail("A valid follow-up date is required.");
      next.followUp={status:input.followUpStatus,date:input.followUpDate,notes:R.required(input.comments,"Follow-up evidence"),recordedBy:a.userId,recordedAt:now};
    } else if(action==="reassign") {
      if(!a.hr||!["GOALS_PUBLISHED","SELF_REVIEW_PENDING","MANAGER_PENDING","RETURNED","HR_PENDING"].includes(r.status)) R.fail("HR may reassign only an unreleased review.",403);
      const assignments=await tx.employeeLineManagerAssignment.findMany({where:{organizationId:org,employeeId:r.employeeId,effectiveTo:null,effectiveFrom:{lte:new Date()}},include:{manager:true}});
      const assignment=assignments.length===1?assignments[0]:null;
      if(!assignment||assignment.managerEmployeeId===r.employeeId||!eligible.includes(assignment.manager.status)||assignment.manager.exitDate) R.fail("Set one valid current reporting line in the manager registry first.");
      if(assignment.managerEmployeeId===r.managerEmployeeId) R.fail("The reporting line has not changed.");
      next.reassignment={previousManagerEmployeeId:r.managerEmployeeId,reason:R.required(input.comments,"Reassignment reason"),at:now};
      next.managerEmployeeId=assignment.managerEmployeeId;next.managerMappingRequired=false;
      next.managerAssessment=null;next.managerUserId=null;next.finalScore=null;
      next.status=r.selfAssessment?"MANAGER_PENDING":"GOALS_PUBLISHED";
      await notify(tx,org,a.userId,s,"employee:"+r.managerEmployeeId,"reassigned:"+id+":"+crypto.randomUUID(),"Performance review reassigned to the employee's current manager.",new Date());
      await notify(tx,org,a.userId,s,"employee:"+r.employeeId,"manager-change:"+id+":"+crypto.randomUUID(),"Your performance review manager changed: "+next.reassignment.reason,new Date());
    } else if(action==="assign-appeal") {
      if(!a.hr||r.status!=="DISPUTED") R.fail("HR must assign an independent reviewer for a disputed result.",403);
      const reviewer=await tx.user.findFirst({where:{id:input.reviewerUserId,organizationId:org,isActive:true}});
      if(!reviewer||[a.userId,r.managerUserId,r.hrUserId].includes(reviewer.id)||[r.employeeId,r.managerEmployeeId].includes(reviewer.employeeId)) R.fail("Select an independent active reviewer.");
      next.appealReviewerUserId=reviewer.id;next.status="APPEAL_PENDING";
    } else if(action==="appeal") {
      if(r.status!=="APPEAL_PENDING"||r.appealReviewerUserId!==a.userId||own||manager) R.fail("Only the designated independent reviewer may decide this appeal.",403);
      next.appeal={decision:R.required(input.comments,"Appeal decision and reasons"),at:now,userId:a.userId};
      if(input.ratings) {
        next.appeal.previousScore=r.finalScore;
        next.finalScore=R.score(r.goals,input.ratings);next.appeal.ratings=input.ratings;
      }
      next.status="CLOSED";
    } else R.fail("Unknown review action.");
    const result=await event(tx,org,a.userId,id,next,"Performance workflow: "+action);
    const recipient=next.status==="MANAGER_PENDING"||next.status==="RETURNED"||action==="reassign"?"employee:"+next.managerEmployeeId:
      next.status==="HR_PENDING"||next.status==="DISPUTED"?"HR":
      next.status==="APPEAL_PENDING"?"user:"+next.appealReviewerUserId:"employee:"+r.employeeId;
    await notify(tx,org,a.userId,s,recipient,"transition:"+id+":"+crypto.randomUUID(),"Performance review "+r.employeeNumber+": "+next.status,new Date());
    if(!own) { const visible={...result}; delete visible.selfAssessmentDraft; return visible; }
    return result;
  });
}
function createScheduler(db) {
  let timer=null,running=false;
  async function run() {
    if(running||process.env.CHRIS_PE_SCHEDULER_ENABLED!=="true")return;
    running=true;
    try {
      for(const org of String(process.env.CHRIS_PE_ORGANIZATION_IDS||"").split(",").map(s=>s.trim()).filter(Boolean)) {
        try{await tick(db,org);}catch(e){console.error("PE agent tick failed for configured tenant:",e.message);}
      }
    } finally {running=false;}
  }
  return {start(){if(timer)return;run();timer=setInterval(run,3600000);timer.unref?.();},stop(){clearInterval(timer);timer=null;},run};
}
module.exports={roleProfiles,enabled,assertEnabled,hrAllowed,state,workspace,publishPolicy,generateStandards,saveTemplate,reviseTemplate,tick,transition,createScheduler};

