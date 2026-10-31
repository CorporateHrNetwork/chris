const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const p=require('../src/services/zermattProbationPolicy');
const s=require('../src/services/zermattProbationService');

test('three calendar months clamp month ends and notices use Lagos calendar days',()=>{
  assert.deepEqual(p.probationDates('2026-11-30'),{startDate:'2026-11-30',endDate:'2027-02-28',noticeDate:'2027-02-21'});
  assert.equal(p.probationDates('2027-11-30').endDate,'2028-02-29');
  assert.equal(p.probationDates('2026-08-31').endDate,'2026-11-30');
  assert.equal(p.lagosDate(new Date('2026-10-31T23:30:00Z')),'2026-11-01');
  assert.throws(()=>p.dateOnly('2026-02-30'));
});
test('only the assigned manager assesses and Head HR decides; broad permissions cannot substitute',()=>{
  assert.deepEqual(p.access({roles:['General Manager'],manager:false,sameBranch:true}),{canRead:false,canAssess:false,canVerify:false,canDecide:false});
  assert.equal(p.access({roles:[],manager:true,sameBranch:false}).canAssess,true);
  assert.equal(p.access({roles:['HR & Admin Officer - Branch'],sameBranch:false}).canRead,false);
  assert.equal(p.access({roles:['HR & Admin Officer - Branch'],sameBranch:true}).canDecide,false);
  assert.equal(p.access({roles:['Head of HR & Admin']}).canDecide,true);
});
test('evidence, outcome, effective dates and extension goals are mandatory',()=>{
  assert.throws(()=>p.assessment({recommendation:'CONFIRM_EMPLOYMENT'}));
  const r={startDate:'2026-07-01',endDate:'2026-10-01'};
  assert.throws(()=>p.decision({outcome:'CONFIRM_EMPLOYMENT',effectiveDate:'2026-11-01',reason:'test'},r,'2026-10-31'));
  assert.throws(()=>p.decision({outcome:'EXTEND_PROBATION',effectiveDate:'2026-10-31',reason:'test',newEndDate:'2026-10-30',improvementGoals:'test'},r,'2026-10-31'));
  assert.equal(p.decision({outcome:'EXTEND_PROBATION',effectiveDate:'2026-10-31',reason:'Coaching needed',newEndDate:'2026-11-30',improvementGoals:'Complete agreed targets'},r,'2026-10-31').newEndDate,'2026-11-30');
});
async function fixture(){
  const db=new PGlite();
  await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY); INSERT INTO organizations VALUES ('org');
  CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text, UNIQUE("organizationId",id));INSERT INTO employees VALUES ('employee','org');
  CREATE TABLE employee_employment_episodes(id text PRIMARY KEY);INSERT INTO employee_employment_episodes VALUES ('episode');
  CREATE TABLE users(id text PRIMARY KEY);INSERT INTO users VALUES ('manager'),('head'),('branch'),('outsider');`);
  await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261031130000_zermatt_probation_reviews/migration.sql'),'utf8'));
  const audits=[],employee={id:'employee',organizationId:'org',employeeNumber:'ZLL-TEST',firstName:'Test',lastName:'Employee',status:'PROBATION',hireDate:new Date('2026-07-31'),locationId:'branch1',employmentEpisodes:[{id:'episode',startDate:new Date('2026-07-31'),sequenceNumber:1,endDate:null}]};
  const roles={manager:[],head:['Head of HR & Admin'],branch:['HR & Admin Officer - Branch'],outsider:['HR & Admin Officer - Branch']};
  const users=Object.keys(roles).map(id=>({id,employeeId:id==='manager'?'manager-employee':null,isActive:true,userRoles:roles[id].map(name=>({role:{name}})),userLocations:[{locationId:id==='outsider'?'branch2':'branch1'}]}));
  const tx={
    $queryRawUnsafe:async(sql,...args)=>sql.includes('pg_advisory')?[]:sql.startsWith('SELECT "id" FROM "employees"')?[]:(await db.query(sql,args)).rows,
    $executeRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).affectedRows,
    organization:{findUnique:async()=>({id:'org'})},
    employee:{findMany:async()=>[employee],findFirst:async()=>({...employee}),update:async({data})=>Object.assign(employee,data)},
    user:{findMany:async()=>users,findFirst:async({where})=>users.find(u=>u.id===where.id),updateMany:async()=>({count:1})},
    employeeLineManagerAssignment:{findFirst:async()=>({managerEmployeeId:'manager-employee'})},
    employeeEmploymentEpisode:{findFirst:async()=>employee.employmentEpisodes[0],update:async({data})=>Object.assign(employee.employmentEpisodes[0],data)},
    employeeLifecycleEvent:{create:async({data})=>audits.push(data)},organizationAudit:{create:async({data})=>audits.push(data)}
  };
  tx.$transaction=async fn=>{await db.exec('BEGIN');try{const result=await fn(tx);await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}};
  const auth=id=>({organizationId:'org',organization:{slug:s.SLUG},userId:id,roles:roles[id],availableLocations:[{id:id==='outsider'?'branch2':'branch1'}]});
  return {db,tx,audits,employee,auth};
}
test('migration constraints, reminder boundary, deduplication, role routing and tenant isolation',async()=>{
  const f=await fixture();try{
    // A real SQL join is used in production; fixture employee/episode columns are sufficient below.
    await f.db.exec(`ALTER TABLE employees ADD COLUMN status text DEFAULT 'PROBATION'; ALTER TABLE employee_employment_episodes ADD COLUMN "endDate" date;`);
    await s.synchronize(f.tx,new Date('2026-10-23T12:00:00Z'));
    assert.equal((await f.db.query('SELECT * FROM zermatt_probation_notices')).rows.length,0);
    await s.synchronize(f.tx,new Date('2026-10-24T12:00:00Z'));
    await s.synchronize(f.tx,new Date('2026-10-24T13:00:00Z'));
    const notices=(await f.db.query('SELECT * FROM zermatt_probation_notices')).rows;
    assert.deepEqual(notices.map(n=>n.recipientUserId).sort(),['branch','head','manager']);
    assert.equal((await f.db.query('SELECT * FROM zermatt_probation_reviews')).rows.length,1);
    assert.equal((await s.list(f.tx,f.auth('outsider'))).length,0);
    await assert.rejects(()=>s.list(f.tx,{...f.auth('head'),organization:{slug:'other'}}));
    await assert.rejects(()=>f.db.query(`INSERT INTO zermatt_probation_reviews (id,"organizationId","employeeId","episodeId","startDate","endDate","noticeDate") VALUES ('bad','org','employee','episode','2026-01-01','2026-04-01','2026-03-26')`));
  }finally{await f.db.close();}
});
test('manager submission, Head HR return, resubmission and confirmation are atomic and audited',async()=>{
  const f=await fixture();try{
    const dates=p.probationDates('2026-07-31');
    await f.db.query(`INSERT INTO zermatt_probation_reviews (id,"organizationId","employeeId","episodeId","startDate","endDate","noticeDate") VALUES ('review','org','employee','episode',$1,$2,$3)`,Object.values(dates));
    const input={version:1,recommendation:'CONFIRM_EMPLOYMENT',performance:'Targets met',conduct:'Meets standard',attendance:'Verified register',evidence:'Supervisor checklists',reason:'Ready for confirmation'};
    await assert.rejects(()=>s.change(f.tx,f.auth('branch'),'review','submit',input));
    await s.change(f.tx,f.auth('manager'),'review','submit',input);
    await assert.rejects(()=>s.change(f.tx,f.auth('head'),'review','decide',{version:1,outcome:'CONFIRM_EMPLOYMENT'}),/changed/);
    await assert.rejects(()=>s.change(f.tx,f.auth('manager'),'review','decide',{version:2,outcome:'CONFIRM_EMPLOYMENT'}));
    await s.change(f.tx,f.auth('head'),'review','return',{version:2,reason:'Add attendance evidence'});
    await s.change(f.tx,f.auth('manager'),'review','submit',{...input,version:3});
    await s.change(f.tx,f.auth('head'),'review','decide',{version:4,outcome:'CONFIRM_EMPLOYMENT',effectiveDate:p.lagosDate(),reason:'Evidence checked'});
    assert.equal(f.employee.status,'ACTIVE');
    assert.ok(f.audits.some(a=>a.eventType==='CONFIRMED'));
    assert.ok(f.audits.some(a=>a.action==='PROBATION_DECIDE'&&a.previousValue.status==='SUBMITTED'));
    assert.equal((await f.db.query('SELECT status,version FROM zermatt_probation_reviews')).rows[0].version,5);
    await assert.rejects(()=>s.change(f.tx,f.auth('head'),'review','decide',{version:5}),/already/);
  }finally{await f.db.close();}
});
test('extension preserves the original review, opens one new cycle and retains improvement goals',async()=>{
  const f=await fixture();try{
    const end=p.addDays(p.lagosDate(),-1),start=p.addDays(end,-90);
    await f.db.query(`INSERT INTO zermatt_probation_reviews (id,"organizationId","employeeId","episodeId","startDate","endDate","noticeDate","status","assessment") VALUES ('review','org','employee','episode',$1,$2,$3,'SUBMITTED',$4::jsonb)`,[start,end,p.addDays(end,-7),JSON.stringify({assessorUserId:'manager',recommendation:'EXTEND_PROBATION'})]);
    const newEnd=p.addDays(p.lagosDate(),5);
    await s.change(f.tx,f.auth('head'),'review','decide',{version:1,outcome:'EXTEND_PROBATION',effectiveDate:p.lagosDate(),reason:'Additional coaching',newEndDate:newEnd,improvementGoals:'Complete reconciliation independently'});
    const rows=(await f.db.query('SELECT * FROM zermatt_probation_reviews ORDER BY cycle')).rows;
    assert.equal(rows.length,2);assert.equal(rows[0].status,'DECIDED');assert.equal(rows[1].cycle,2);
    assert.equal(rows[0].decision.improvementGoals,'Complete reconciliation independently');
    assert.equal(f.employee.status,'PROBATION');
    assert.equal((await f.db.query('SELECT * FROM zermatt_probation_notices WHERE "reviewId"=$1',[rows[1].id])).rows.length,3);
  }finally{await f.db.close();}
});
test('termination requires Head HR, closes the episode, disables access and records lifecycle evidence',async()=>{
  const f=await fixture();let disabled=false;
  f.tx.user.updateMany=async()=>{disabled=true;};
  try{
    await f.db.query(`INSERT INTO zermatt_probation_reviews (id,"organizationId","employeeId","episodeId","startDate","endDate","noticeDate","status","assessment") VALUES ('review','org','employee','episode','2026-07-31','2026-10-31','2026-10-24','SUBMITTED',$1::jsonb)`,[JSON.stringify({assessorUserId:'manager',recommendation:'TERMINATE_EMPLOYMENT'})]);
    await assert.rejects(()=>s.change(f.tx,f.auth('branch'),'review','decide',{version:1}));
    await s.change(f.tx,f.auth('head'),'review','decide',{version:1,outcome:'TERMINATE_EMPLOYMENT',effectiveDate:p.lagosDate(),reason:'Head HR authorized outcome after assessment'});
    assert.equal(f.employee.status,'TERMINATED');assert.equal(disabled,true);
    assert.equal(f.employee.employmentEpisodes[0].endStatus,'TERMINATED');
    assert.ok(f.audits.some(a=>a.eventType==='EXITED'&&a.previousStatus==='PROBATION'));
  }finally{await f.db.close();}
});
test('scheduler rejects stale assignments and transaction rolls back the review when audit persistence fails',async()=>{
  const f=await fixture();try{
    await f.db.query(`INSERT INTO zermatt_probation_reviews (id,"organizationId","employeeId","episodeId","startDate","endDate","noticeDate") VALUES ('review','org','employee','episode','2026-07-31','2026-10-31','2026-10-24')`);
    const input={version:1,recommendation:'CONFIRM_EMPLOYMENT',performance:'Met',conduct:'Met',attendance:'Met',evidence:'Register',reason:'Met'};
    f.tx.employeeLineManagerAssignment.findFirst=async()=>null;
    await assert.rejects(()=>s.change(f.tx,f.auth('manager'),'review','submit',input));
    f.tx.employeeLineManagerAssignment.findFirst=async()=>({managerEmployeeId:'manager-employee'});
    f.tx.organizationAudit.create=async()=>{throw new Error('Audit unavailable');};
    await assert.rejects(()=>s.change(f.tx,f.auth('manager'),'review','submit',input),/Audit unavailable/);
    const row=(await f.db.query('SELECT * FROM zermatt_probation_reviews')).rows[0];assert.equal(row.status,'AWAITING_ASSESSMENT');assert.equal(row.version,1);assert.equal(row.assessment,null);
  }finally{await f.db.close();}
});
