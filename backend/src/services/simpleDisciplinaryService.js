const {randomUUID}=require('node:crypto');
const p=require('./simpleDisciplinaryPolicy');
const roles=u=>(u?.userRoles||[]).map(x=>x.role.name);
const stateOf=row=>(row.processEvents||[]).filter(e=>e.eventType==='SIMPLE_WORKFLOW'&&e.metadata?.workflow===p.VERSION).sort((a,b)=>b.metadata.version-a.metadata.version)[0]?.metadata||null;
const eventsInclude={processEvents:{where:{eventType:'SIMPLE_WORKFLOW'},orderBy:{createdAt:'desc'}}};
async function roster(db,org){return db.user.findMany({where:{organizationId:org,isActive:true},include:{userRoles:{include:{role:true}},userLocations:true}});}
function branch(u,employee,auth){return (!auth.activeLocationId||auth.activeLocationId===employee.locationId)&&(u.locationScope!=='ASSIGNED_LOCATIONS'||u.userLocations?.some(x=>x.locationId===employee.locationId));}
function hrScope(u,employee,auth){return p.hr(roles(u))&&branch(u,employee,auth)&&(p.head(roles(u))||u.userLocations?.some(l=>l.locationId===employee.locationId));}
async function context(db,auth,row){
 const [u,employee]=await Promise.all([db.user.findFirst({where:{id:auth.userId,organizationId:auth.organizationId,isActive:true},include:{userRoles:{include:{role:true}},userLocations:true}}),db.employee.findFirst({where:{id:row.employeeId,organizationId:auth.organizationId}})]);
 if(!u||!employee)throw p.fail('Case is unavailable.',404);
 const s=stateOf(row),subject=u.employeeId===employee.id;
 const hr=hrScope(u,employee,auth)&&!subject;
 const head=p.head(roles(u))&&branch(u,employee,auth)&&!subject;
 const rights={userId:u.id,employee:subject,head,hr:hr&&(!s||s.hrOwnerId===u.id||head),reporter:row.createdByUserId===u.id,reviewer:s?.reviewerUserId===u.id&&!subject,decider:s?.decisionOwnerId===u.id&&!subject,appeal:s?.appealOwnerId===u.id&&!subject};
 rights.canRead=hr||rights.reporter||rights.reviewer||rights.decider||rights.appeal;
 if(auth.ess)rights.canRead=subject;
 if(!rights.canRead)throw p.fail('This case is outside your authority.',403);
 return {u,employee,s,rights};
}
function employeeView(row,s){return {id:row.id,caseNumber:row.caseNumber,employeeNumber:row.employeeNumber,workflow:s?{version:s.version,stage:s.stage,queryText:s.queryText||null,dueDate:s.stage==='EMPLOYEE_RESPONSE'?s.dueDate:null,acknowledgedAt:s.acknowledgedAt||null,responseText:s.responseText||null,responseAt:s.responseAt||null,decisionText:s.decisionText||null,decisionAt:s.decisionAt||null,outcome:s.outcome||null,originalOutcome:s.originalOutcome||null,appealDueDate:s.appealDueDate||null,appealText:s.appealText||null,appealDecision:s.appealDecision||null,appealResolved:!!s.appealResolved,warningReviewDate:s.warningReviewDate||null,warningExpiryDate:s.warningExpiryDate||null,correctiveAction:s.correctiveAction||null}:null};}
function adminView(row,s,rights){const {processEvents,...rest}=row;return {...rest,workflow:s,rights,delivery:(processEvents||[]).filter(e=>e.eventType==='DISCIPLINARY_TASK_NOTICE').map(e=>({status:e.metadata?.status,attempts:e.metadata?.attempts||0,lastError:e.metadata?.lastError||null})),history:(processEvents||[]).filter(e=>e.eventType==='SIMPLE_WORKFLOW').map(e=>({id:e.id,action:e.metadata?.lastAction||"WORKFLOW",stage:e.metadata?.stage,notes:e.notes,at:e.occurredAt}))};}
async function list(db,auth){
 const where={organizationId:auth.organizationId,...(auth.ess?{employeeId:auth.employeeId}:{})};
 const rows=await db.disciplinaryCase.findMany({where,include:eventsInclude,orderBy:{createdAt:'desc'}});const result=[];
 for(const row of rows){try{const {s,rights}=await context(db,auth,row);if(auth.ess){if(s?.queryText||s?.decisionText)result.push(employeeView(row,s));}else result.push(adminView(row,s,rights));}catch(e){if(e.statusCode!==403)throw e;}}
 return result;
}
async function get(db,auth,id){const row=await db.disciplinaryCase.findFirst({where:{id,organizationId:auth.organizationId},include:{processEvents:{orderBy:{createdAt:'desc'}}}});if(!row)throw p.fail('Case not found.',404);const c=await context(db,auth,row);return {row,...c};}
async function policy(db,auth){const record=await db.organizationAudit.findFirst({where:{organizationId:auth.organizationId,entityType:'DisciplinaryWorkflowPolicy',action:'POLICY_CONFIGURED'},orderBy:{createdAt:'desc'}});return {...p.DEFAULT_TARGETS,...record?.newValue?.targets};}
async function configure(db,auth,input){if(!p.head(auth.roles))throw p.fail('Only Head HR may configure service targets.',403);const t=p.targets(input);await db.organizationAudit.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,entityType:'DisciplinaryWorkflowPolicy',entityId:auth.organizationId,action:'POLICY_CONFIGURED',newValue:{targets:t},reason:'Organization-specific service targets; working days exclude weekends. Organization policy and public holidays must be considered when extending deadlines.'}});return t;}
async function assignments(db,auth,employee,input,reporter){
 const all=await roster(db,auth.organizationId);const byId=new Map(all.map(u=>[u.id,u]));
 const pick=(key)=>{const u=byId.get(input[key]);if(!u||u.employeeId===employee.id||!branch(u,employee,{...auth,activeLocationId:null}))throw p.fail('Select an active, authorized owner in this organization and branch.',400);return u;};
 const coordinator=pick('hrOwnerId'),reviewer=pick('reviewerUserId'),decider=pick('decisionOwnerId'),appeal=pick('appealOwnerId');
 if(!hrScope(coordinator,employee,{...auth,activeLocationId:null}))throw p.fail('The coordinator must be an HR officer.');
 if(!p.head(roles(decider))&&!roles(decider).some(r=>/^(GENERAL MANAGER|MANAGING DIRECTOR|CHIEF EXECUTIVE OFFICER|CEO)$/i.test(r)))throw p.fail('The decision owner must be Head HR or the organization management approval authority.');
 if(new Set([reporter,reviewer.id,decider.id]).size!==3)throw p.fail('Reporter, investigator and decision owner must be different people.');
 if([reporter,reviewer.id,decider.id].includes(appeal.id))throw p.fail('Select an appeal reviewer independent of the report, investigation and original decision.');
 if(!p.head(roles(appeal))&&!roles(appeal).some(r=>/^(GENERAL MANAGER|MANAGING DIRECTOR|CHIEF EXECUTIVE OFFICER|CEO)$/i.test(r)))throw p.fail('The appeal reviewer must be Head HR or an independent management authority.');
 const employeeUser=all.find(u=>u.employeeId===employee.id);
 return {hrOwnerId:coordinator.id,reviewerUserId:reviewer.id,decisionOwnerId:decider.id,appealOwnerId:appeal.id,employeeUserId:employeeUser?.id||null};
}
async function append(tx,auth,row,s,action,notes){
 const e=await tx.disciplinaryProcessEvent.create({data:{organizationId:auth.organizationId,disciplinaryCaseId:row.id,eventType:'SIMPLE_WORKFLOW',occurredAt:new Date(),actorUserId:auth.userId,notes,metadata:{...s,lastAction:action}}});
 await tx.organizationAudit.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,entityType:'DisciplinaryCase',entityId:row.id,action:'DISCIPLINARY_'+action,newValue:{stage:s.stage,version:s.version,ownerUserId:s.ownerUserId,outcome:s.outcome||null},reason:notes}});
 const recipients=new Set([s.ownerUserId]);if(['ISSUE_QUERY','DECIDE','APPEAL_DECIDE','SCREEN_CLOSE'].includes(action))recipients.add(s.employeeUserId);
 for(const recipientUserId of recipients){if(recipientUserId)await tx.disciplinaryProcessEvent.create({data:{organizationId:auth.organizationId,disciplinaryCaseId:row.id,eventType:'DISCIPLINARY_TASK_NOTICE',occurredAt:new Date(),actorUserId:auth.userId,metadata:{recipientUserId,workflowEventId:e.id,stage:s.stage,status:'QUEUED',attempts:0}}});}
 return e;
}
async function create(db,auth,input){
 const employee=await db.employee.findFirst({where:{organizationId:auth.organizationId,employeeNumber:String(input.employeeNumber||'').trim().toUpperCase()}});if(!employee)throw p.fail('Employee not found.',404);
 const actor=await db.user.findFirst({where:{id:auth.userId,organizationId:auth.organizationId,isActive:true},include:{userRoles:{include:{role:true}},userLocations:true}});
 if(!actor||actor.employeeId===employee.id||!branch(actor,employee,auth))throw p.fail('You cannot report this employee.',403);
 const manager=actor.employeeId?await db.employeeLineManagerAssignment.findFirst({where:{organizationId:auth.organizationId,employeeId:employee.id,managerEmployeeId:actor.employeeId,effectiveFrom:{lte:new Date()},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date()}}]}}):null;
 if(!hrScope(actor,employee,auth)&&!manager)throw p.fail('Only the line manager or authorized HR may report an issue.',403);
 const escalationOwnerIds=(await roster(db,auth.organizationId)).filter(u=>p.head(roles(u))&&u.employeeId!==employee.id).map(u=>u.id);
 const owners=await assignments(db,auth,employee,input,auth.userId),t=p.targets(await policy(db,auth)),day=p.today(),incidentDate=p.dateOnly(input.incidentDate);
 if(incidentDate>day)throw p.fail('The incident date cannot be in the future.',400);
 return db.$transaction(async tx=>{const row=await tx.disciplinaryCase.create({data:{organizationId:auth.organizationId,employeeId:employee.id,employeeNumber:employee.employeeNumber,caseNumber:'ER-'+randomUUID().slice(0,8).toUpperCase(),incidentSummary:p.required(input.incidentSummary,'Incident description'),allegation:p.required(input.allegation,'Allegation category'),openedAt:new Date(),status:'OPEN',createdByUserId:auth.userId}});const s={workflow:p.VERSION,version:1,stage:'SCREENING',...owners,reporterUserId:auth.userId,ownerUserId:owners.hrOwnerId,targets:t,escalationOwnerIds,incidentDate,dueDate:p.workingDate(day,t.screen)};await append(tx,auth,row,s,'REPORT','Incident reported for HR screening.');return adminView(row,s,{reporter:true});});
}
async function action(db,auth,id,input){
 return db.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT id FROM disciplinary_cases WHERE id=$1 AND "organizationId"=$2 FOR UPDATE',id,auth.organizationId);
  const {row,s,rights,employee}=await get(tx,auth,id);
  let next;
  if(!s){if(input.action!=='ADOPT'||!rights.hr||row.status==='CLOSED')throw p.fail('An HR officer must explicitly adopt this open legacy case before using the new workflow.');const owners=await assignments(tx,auth,employee,input,row.createdByUserId);next={workflow:p.VERSION,version:1,stage:'SCREENING',escalationOwnerIds:(await roster(tx,auth.organizationId)).filter(u=>p.head(roles(u))&&u.employeeId!==employee.id).map(u=>u.id),legacySnapshot:{status:row.status,outcome:row.outcome,decidedAt:row.decidedAt,policyReference:row.policyReference,policyVersion:row.policyVersion},...owners,reporterUserId:row.createdByUserId,ownerUserId:owners.hrOwnerId,targets:p.targets(await policy(tx,auth)),dueDate:p.workingDate(p.today(),p.targets(await policy(tx,auth)).screen)};}
  else {if(Number(input.expectedVersion)!==s.version)throw p.fail('This case changed. Refresh before acting.');if(auth.ess&&!['ACKNOWLEDGE','RESPOND','APPEAL'].includes(input.action))throw p.fail('This action requires the HR workspace.',403);next=p.reduce(s,input.action,input,rights,p.today());next.version=s.version+1;}
  if(['DECIDE','APPEAL_DECIDE'].includes(input.action)&&input.outcome==='POLICY_ACTION'&&!String(input.policyReference||'').trim())throw p.fail('Record the approved policy clause for this action.');
  if(input.policyReference)next.policyReference=String(input.policyReference).slice(0,500);
  const status={SCREENING:'OPEN',EMPLOYEE_RESPONSE:'AWAITING_EMPLOYEE_RESPONSE',REVIEW:'FINDINGS_PENDING',DECISION:'DECISION_PENDING',DECIDED:'DECISION_PENDING',APPEAL:'DECISION_PENDING',CLOSED:'CLOSED'}[next.stage];
  await tx.disciplinaryCase.update({where:{id:row.id},data:{status,outcome:next.outcome||null,decidedAt:next.decisionAt?new Date(next.decisionAt):row.decidedAt}});
  await append(tx,auth,row,next,input.action,p.required(input.notes,'Reason / record'));
  if(['RESPOND','SUBMIT_FINDINGS','DECIDE','APPEAL_DECIDE'].includes(input.action)){await tx.disciplinaryEvidenceVersion.create({data:{organizationId:auth.organizationId,disciplinaryCaseId:row.id,logicalEvidenceKey:'workflow-'+next.version,versionNumber:1,category:input.action==='RESPOND'?'EMPLOYEE_RESPONSE':input.action==='SUBMIT_FINDINGS'?'FINDINGS':'DECISION_LETTER',title:input.action.replaceAll('_',' '),content:{text:input.publicText||input.notes,hearingRecord:input.hearingRecord||null},contentHash:require('node:crypto').createHash('sha256').update(JSON.stringify(input)).digest('hex'),finalizedAt:new Date(),createdByUserId:auth.userId}});}
  // No employee status, payroll or financial mutation is performed here.
  return {stage:next.stage,version:next.version};
 });
}
module.exports={list,get,create,action,configure,policy,roster,stateOf,context,roles,employeeView,adminView,eventsInclude};
