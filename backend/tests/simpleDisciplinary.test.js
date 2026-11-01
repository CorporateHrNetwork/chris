const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../src/services/simpleDisciplinaryPolicy');
const service=require('../src/services/simpleDisciplinaryService');
function state(){return {workflow:p.VERSION,version:1,stage:'SCREENING',reporterUserId:'reporter',hrOwnerId:'hr',reviewerUserId:'reviewer',decisionOwnerId:'gm',appealOwnerId:'ceo',employeeUserId:'employee-user',ownerUserId:'hr',targets:p.DEFAULT_TARGETS,dueDate:'2026-11-04'};}
const rights={hr:true,reviewer:true,decider:true,appeal:true,employee:true,userId:'gm',reporter:true};
test('complete fair process retains original decision and requires independent appeal before closure',()=>{
 let s=state();const step=(a,i={},day='2026-11-02')=>s=p.reduce(s,a,{notes:'Recorded reason',...i},rights,day);
 step('ISSUE_QUERY',{publicText:'Please explain the recorded incident.'});assert.equal(s.stage,'EMPLOYEE_RESPONSE');assert.equal(s.dueDate,'2026-11-05');
 step('ACKNOWLEDGE');assert.equal(s.stage,'EMPLOYEE_RESPONSE');assert.ok(s.acknowledgedAt);
 step('RESPOND',{notes:'Employee explanation and evidence.'});assert.equal(s.stage,'REVIEW');
 assert.throws(()=>step('SUBMIT_FINDINGS'),/hearing is not required/);
 step('SUBMIT_FINDINGS',{hearingRecord:'Meeting held; both sides heard.'});assert.equal(s.stage,'DECISION');
 step('DECIDE',{outcome:'WRITTEN_WARNING',publicText:'Reasoned decision and corrective steps.',warningReviewDate:'2026-12-01',warningExpiryDate:'2027-02-01'});assert.equal(s.stage,'DECIDED');assert.throws(()=>step('CLOSE'),/appeal period/);
 step('APPEAL',{notes:'New evidence for independent consideration.'});assert.equal(s.stage,'APPEAL');assert.throws(()=>step('CLOSE'),/Only HR/);
 step('APPEAL_DECIDE',{outcome:'NO_CASE_ESTABLISHED',publicText:'Appeal upheld.'});assert.equal(s.originalOutcome,'WRITTEN_WARNING');assert.equal(s.outcome,'NO_CASE_ESTABLISHED');assert.equal(s.warningExpiryDate,null);assert.throws(()=>step('APPEAL'),/Only the employee/);step('CLOSE');assert.equal(s.stage,'CLOSED');
});
test('no response never becomes guilt, deadlines can be extended and decision cannot skip review',()=>{
 let s=p.reduce(state(),'ISSUE_QUERY',{notes:'Screened facts',publicText:'Query details'},rights,'2026-11-06');assert.equal(s.dueDate,'2026-11-11');
 assert.throws(()=>p.reduce(s,'RECORD_NO_RESPONSE',{notes:'No reply'},rights,'2026-11-11'),/deadline has not passed/);
 s=p.reduce(s,'EXTEND_DEADLINE',{notes:'Accommodation agreed',dueDate:'2026-11-16'},rights,'2026-11-09');
 s=p.reduce(s,'RECORD_NO_RESPONSE',{notes:'Contact attempts documented; review required.'},rights,'2026-11-17');assert.equal(s.stage,'REVIEW');assert.equal(s.outcome,undefined);
 assert.throws(()=>p.reduce(s,'DECIDE',{notes:'Skip stages'},rights,'2026-11-17'),/Only the assigned approval/);
 assert.throws(()=>p.reduce(state(),'ISSUE_QUERY',{notes:'x',publicText:'x'},{hr:false},'2026-11-02'),/HR screening/);
 assert.throws(()=>p.dateOnly('2026-02-30'),/calendar/);assert.equal(p.workingDate('2026-11-06',2),'2026-11-10');
 assert.throws(()=>p.targets({response:0}),/1 and 60/);
});
function fixture(){
 const users=[['reporter','Branch HR Officer',null],['hr','Head HR',null],['reviewer','Line Manager','manager-e'],['gm','General Manager',null],['ceo','CEO',null],['employee-user','Employee','e']].map(([id,role,employeeId])=>({id,employeeId,organizationId:'org',isActive:true,email:id+'@example.invalid',locationScope:'ALL_LOCATIONS',userLocations:[{locationId:'loc'}],userRoles:[{role:{name:role}}]}));
 const cases=[],events=[],audits=[],evidence=[],sql=[];let n=0;
 const matches=(r,w)=>Object.entries(w||{}).every(([k,v])=>typeof v==='object'||r[k]===v);
 const row=r=>r&&({...r,processEvents:events.filter(e=>e.disciplinaryCaseId===r.id)});
 const db={user:{findFirst:async({where})=>users.find(u=>matches(u,where)),findMany:async({where})=>users.filter(u=>matches(u,where))},employee:{findFirst:async({where})=>where.organizationId==='org'&&(!where.id||where.id==='e')?{id:'e',employeeNumber:'SYN-1',organizationId:'org',locationId:'loc'}:null},employeeLineManagerAssignment:{findFirst:async()=>null},organizationAudit:{findFirst:async()=>null,create:async({data})=>{audits.push(data);return data;}},disciplinaryCase:{create:async({data})=>{const r={...data,id:'case-'+(++n)};cases.push(r);return r;},findFirst:async({where})=>row(cases.find(r=>matches(r,where))),findMany:async({where})=>cases.filter(r=>matches(r,where)).map(row),update:async({where,data})=>Object.assign(cases.find(r=>r.id===where.id),data)},disciplinaryProcessEvent:{create:async({data})=>{const e={...data,id:'event-'+(++n),createdAt:new Date()};events.push(e);return e;}},disciplinaryEvidenceVersion:{create:async({data})=>{evidence.push(data);return data;}},$queryRawUnsafe:async(...a)=>{sql.push(a);return []}};
 db.$transaction=async fn=>fn(db);
 const auth={organizationId:'org',userId:'reporter',roles:['Branch HR Officer']};
 const report={employeeNumber:'SYN-1',incidentDate:'2026-10-30',incidentSummary:'Synthetic incident only',allegation:'Conduct',hrOwnerId:'hr',reviewerUserId:'reviewer',decisionOwnerId:'gm',appealOwnerId:'ceo'};
 return {db,users,cases,events,audits,evidence,sql,auth,report};
}
test('service verifies assignments, tenant ownership, stale versions and keeps ESS disclosure minimal',async()=>{
 const f=fixture();
 await assert.rejects(service.create(f.db,f.auth,{...f.report,appealOwnerId:'gm'}),/independent/);
 await assert.rejects(service.create(f.db,f.auth,{...f.report,reviewerUserId:'employee-user'}),/authorized owner/);
 await assert.rejects(service.create(f.db,f.auth,{...f.report,hrOwnerId:'foreign-user'}),/authorized owner/);
 const savedLocations=f.users[0].userLocations;f.users[0].userLocations=[];await assert.rejects(service.create(f.db,f.auth,f.report),/Only the line manager/);f.users[0].userLocations=savedLocations;
 const r=await service.create(f.db,f.auth,f.report);assert.equal(r.workflow.stage,'SCREENING');assert.equal(f.cases.length,1);assert.ok(f.audits.length);
 await assert.rejects(service.get(f.db,{...f.auth,organizationId:'other'},r.id),/not found/);
 const hr={organizationId:'org',userId:'hr',roles:['Head HR']};
 await assert.rejects(service.action(f.db,hr,r.id,{action:'ISSUE_QUERY',expectedVersion:0,notes:'x',publicText:'x'}),/Refresh/);
 await service.action(f.db,hr,r.id,{action:'ISSUE_QUERY',expectedVersion:1,notes:'Private HR screening notes',publicText:'Public query for employee'});
 assert.match(f.sql[0][0],/FOR UPDATE/);
 const employee={organizationId:'org',userId:'employee-user',employeeId:'e',ess:true};
 let rows=await service.list(f.db,employee);assert.equal(rows.length,1);assert.equal(rows[0].workflow.queryText,'Public query for employee');assert.equal(JSON.stringify(rows).includes('Private HR'),false);assert.equal(rows[0].incidentSummary,undefined);assert.equal(rows[0].workflow.hrOwnerId,undefined);
 await assert.rejects(service.action(f.db,employee,r.id,{action:'DECIDE',expectedVersion:2,notes:'x'}),/HR workspace/);
 await service.action(f.db,employee,r.id,{action:'RESPOND',expectedVersion:2,notes:'Employee explanation'});assert.equal(f.evidence[0].category,'EMPLOYEE_RESPONSE');assert.equal(f.cases[0].status,'FINDINGS_PENDING');
 assert.equal(f.db.employee.update,undefined,'workflow has no employee mutation path');
 assert.ok(f.events.some(e=>e.eventType==='DISCIPLINARY_TASK_NOTICE'&&e.metadata.recipientUserId==='employee-user'));
});
test('only scoped HR, reporter and assigned owners can read a case; closed legacy cases are not adopted',async()=>{
 const f=fixture();const r=await service.create(f.db,f.auth,f.report);
 f.users.push({id:'outsider',organizationId:'org',isActive:true,userRoles:[],userLocations:[],locationScope:'ALL_LOCATIONS'});
 assert.deepEqual(await service.list(f.db,{organizationId:'org',userId:'outsider'}),[]);
 const employee={organizationId:'org',userId:'employee-user',employeeId:'e',ess:true};assert.deepEqual(await service.list(f.db,employee),[],'unissued allegations are not exposed in ESS');
 f.events.length=0;f.cases[0].status='CLOSED';
 await assert.rejects(service.action(f.db,{organizationId:'org',userId:'hr',roles:['Head HR']},r.id,{action:'ADOPT',notes:'Legacy record',...f.report}),/open legacy case/);
});
test('task worker resolves a current tenant recipient and sends only a secure case reference',async()=>{
 const {tick}=require('../src/services/disciplinaryTaskScheduler');
 const f=fixture();const r=await service.create(f.db,f.auth,f.report);
 const notice=f.events.find(e=>e.eventType==='DISCIPLINARY_TASK_NOTICE');
 f.db.organization={findFirst:async()=>({id:'org',slug:'synthetic-company',name:'Synthetic Company'})};
 f.db.$queryRawUnsafe=async()=>[{locked:true}];
 f.db.disciplinaryProcessEvent.findFirst=async()=>null;
 f.db.disciplinaryProcessEvent.findMany=async()=>[notice];
 f.db.disciplinaryProcessEvent.update=async({where,data})=>Object.assign(f.events.find(e=>e.id===where.id),data);
 const sent=[];await tick(f.db,{configured:()=>true,send:async m=>sent.push(m)});
 assert.equal(sent.length,1);assert.equal(sent[0].to,'hr@example.invalid');assert.match(sent[0].textBody,/login\?organization=synthetic-company/);assert.match(sent[0].textBody,new RegExp(r.caseNumber));assert.equal(sent[0].textBody.includes('Synthetic incident only'),false);assert.equal(notice.metadata.status,'SENT');
 const old=process.env.CHRIS_SALES_DEMO_MODE;process.env.CHRIS_SALES_DEMO_MODE='ON';try{await tick(f.db,{configured:()=>true,send:async()=>assert.fail('Demo must not send')});}finally{if(old===undefined)delete process.env.CHRIS_SALES_DEMO_MODE;else process.env.CHRIS_SALES_DEMO_MODE=old;}
});
