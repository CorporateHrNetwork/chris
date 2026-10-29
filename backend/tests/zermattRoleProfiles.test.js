const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const C=require('../src/services/zermattRoleProfileCatalog'),R=require('../src/services/performanceEvaluationRules');
const roles=require('./fixtures/zermattRoleDesignations.json');
test('all 120 registered roles have concrete duties, measurable weighted goals and five rating anchors',()=>{
 const families=new Set();
 for(const role of roles){
  const p=C.buildRoleProfile(role);families.add(p.family);R.assertPublishable(p.goals);
  assert.equal(p.jobDescription.title,role.name);assert.ok(p.jobDescription.responsibilities.length>=4);
  assert.equal(p.goals.length,5);assert.equal(p.goals.reduce((s,g)=>s+g.weight,0),100);
  assert.ok(p.goals.every(g=>g.anchors.length===5&&g.evidence&&g.measurement&&g.target));
  assert.doesNotMatch(JSON.stringify(p),/HR to (define|confirm|specify)|SYNTHETIC/);
 }
 assert.ok(families.size>=30);assert.throws(()=>C.buildRoleProfile({name:'Unrecognized role'}));
 assert.ok(C.buildRoleProfile({name:'General Manager'}).goals.some(g=>g.id==='leadership'));
 assert.ok(!C.buildRoleProfile({name:'Waitress'}).goals.some(g=>g.id==='leadership'));
 assert.notDeepEqual(C.buildRoleProfile({name:'Storekeeper'}).goals,C.buildRoleProfile({name:'Driver'}).goals);
});
test('atomic rollout maps standards, preserves existing reporting/payroll/loan records, flags top-level gaps and is idempotent',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY,slug text,status text);
   CREATE TABLE designations(id text PRIMARY KEY,"organizationId" text,name text,description text,"isActive" boolean,"updatedAt" timestamptz,"reportsToDesignationId" text);
   CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,"employeeNumber" text,"firstName" text,"middleName" text,"lastName" text,status text,"exitDate" date,"hireDate" date,"designationId" text,"locationId" text,"departmentId" text);
   CREATE TABLE employee_line_manager_assignments(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"managerEmployeeId" text,"effectiveFrom" timestamptz,"effectiveTo" timestamptz,reason text,notes text,"performedByUserId" text,"createdAt" timestamptz,"updatedAt" timestamptz);
   CREATE TABLE organization_audits(id text PRIMARY KEY,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamptz);
   CREATE TABLE payroll_runs(id text,"organizationId" text,status text);CREATE TABLE payroll_run_lines(id text,"organizationId" text,amount numeric);CREATE TABLE payroll_loans(id text,"organizationId" text,balance numeric);
   INSERT INTO organizations VALUES('org','zermatt-liquor-limited','ACTIVE'),('foreign','other','ACTIVE');
   INSERT INTO payroll_runs VALUES('run','org','DRAFT');INSERT INTO payroll_run_lines VALUES('line','org',12345);INSERT INTO payroll_loans VALUES('loan','org',50000);`);
  const gm='role'+roles.findIndex(r=>r.name==='General Manager'),md='role'+roles.findIndex(r=>r.name==='Managing Director'),stock='role'+roles.findIndex(r=>r.name==='Storekeeper');
  const rows=roles.map((r,i)=>({id:'role'+i,...r,profile:C.buildRoleProfile(r)}));
  for(const r of rows){
   await db.query('INSERT INTO designations VALUES($1,\'org\',$2,NULL,true,now(),$3)',[r.id,r.name,r.id===gm?md:gm]);
   await db.query('INSERT INTO organization_audits VALUES($1,\'org\',NULL,\'ZermattPerformanceEvaluation\',$1,\'PE_TEMPLATE\',NULL,$2,\'Initial draft\',now())',['template:'+r.id,JSON.stringify({kind:'template',id:'template:'+r.id,roleId:r.id,roleName:r.name,status:'DRAFT',version:1,revision:1})]);
  }
  await db.query('INSERT INTO organization_audits VALUES(\'policy\',\'org\',NULL,\'ZermattPerformanceEvaluation\',\'policy\',\'PE_POLICY\',NULL,$1,\'Published policy\',now())',[JSON.stringify({kind:'policy',...R.POLICY,revision:1})]);
  await db.query(`INSERT INTO employees VALUES('gm','org','SYN-GM','Synthetic',NULL,'Manager','ACTIVE',NULL,'2020-01-01',$1,'branch','dept'),('new','org','SYN-NEW','Synthetic',NULL,'New','ACTIVE',NULL,'2026-01-01',$2,'branch','dept'),('existing','org','SYN-OLD','Synthetic',NULL,'Existing','ACTIVE',NULL,'2026-01-01',$2,'branch','dept'),('foreign','foreign','FOREIGN','Foreign',NULL,'Employee','ACTIVE',NULL,'2020-01-01',$2,'branch','dept')`,[gm,stock]);
  await db.exec("INSERT INTO employee_line_manager_assignments VALUES('existing-assignment','org','existing','gm','2026-01-01',NULL,'Original',NULL,NULL,now(),now());");
  for(let i=0;i<6;i++)await db.query(`INSERT INTO organization_audits VALUES($1,'org',NULL,'ZermattRoleProfileProvisioning',$1,'ROLE_PROFILE_BATCH_PREPARED',NULL,$2,'Prepared',now())`,['batch'+i,JSON.stringify({reference:'ZLL-ROLE-PROFILES-20261029',profiles:rows.slice(i*20,i*20+20).map(r=>({name:r.name,...r.profile}))})]);
  const sql=fs.readFileSync(path.join(__dirname,'../sql/repairs/zermatt_role_profiles_20261029.sql'),'utf8');
  await db.exec(sql);
  const reviews=(await db.query(`SELECT "newValue" v FROM organization_audits WHERE action='PE_REVIEW'`)).rows;
  assert.equal(reviews.length,3);assert.ok(reviews.every(r=>r.v.selfRatingRequired&&r.v.status==='GOALS_PUBLISHED'&&!r.v.selfAssessment&&!r.v.managerAssessment));
  assert.ok(reviews.find(r=>r.v.employeeId==='gm').v.managerMappingRequired);
  assert.equal(reviews.find(r=>r.v.employeeId==='new').v.managerEmployeeId,'gm');
  assert.equal((await db.query(`SELECT count(*)::int n FROM designations WHERE description IS NOT NULL`)).rows[0].n,120);
  assert.equal((await db.query(`SELECT reason FROM employee_line_manager_assignments WHERE id='existing-assignment'`)).rows[0].reason,'Original');
  const proof=(await db.query(`SELECT "newValue" v FROM organization_audits WHERE action='ZERMATT_ROLE_PROFILES_PROVISIONED'`)).rows[0].v;
  assert.equal(proof.newUnambiguousManagerMappings,1);assert.equal(proof.reportingExceptions.length,1);assert.ok(proof.payrollUnchanged&&proof.loansUnchanged&&proof.existingReportingLinesUnchanged);
  const count=(await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n;await db.exec(sql);
  assert.equal((await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n,count);
  assert.equal((await db.query("SELECT count(*)::int n FROM organization_audits WHERE \"organizationId\"='foreign'")).rows[0].n,0);
 }finally{await db.close();}
});
