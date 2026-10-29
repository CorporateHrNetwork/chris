const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('confirmed managers update eight scorecards, preserve drafts and GM, roll back invalid pairs and are idempotent',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE organizations(id text,slug text,status text);
   CREATE TABLE employees(id text,"organizationId" text,"employeeNumber" text,status text,"exitDate" date,"locationId" text);
   CREATE TABLE employee_line_manager_assignments(id text,"organizationId" text,"employeeId" text,"managerEmployeeId" text,"effectiveFrom" timestamptz,"effectiveTo" timestamptz,reason text,notes text,"performedByUserId" text,"createdAt" timestamptz,"updatedAt" timestamptz);
   CREATE TABLE organization_audits(id text,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamptz);
   INSERT INTO organizations VALUES('org','zermatt-liquor-limited','ACTIVE');`);
  const pairs=[['146','044'],['181','044'],['244','092'],['260','044'],['261','044'],['322','013'],['332','183'],['334','092']];
  for(const id of new Set(pairs.flat()))await db.query(`INSERT INTO employees VALUES($1,'org',$2,'ACTIVE',NULL,'branch')`,[id,'ZLL000'+id]);
  const gm={kind:'review',employeeId:'gm',managerEmployeeId:null,managerMappingRequired:true,revision:1,status:'GOALS_PUBLISHED'};
  const audit=async(id,v)=>db.query(`INSERT INTO organization_audits(id,"organizationId","entityType","entityId",action,"newValue","createdAt") VALUES($1,'org','ZermattPerformanceEvaluation',$1,'SEED',$2,now())`,[id,JSON.stringify(v)]);
  await audit('review:2026-Q4:gm',gm);
  for(const [id] of pairs)await audit('review:2026-Q4:'+id,{kind:'review',employeeId:id,managerEmployeeId:null,managerMappingRequired:true,revision:1,status:'GOALS_PUBLISHED',goals:[{id:'goal',weight:100}],selfAssessmentDraft:{comments:'Private saved draft'}});
  await audit('cycle:2026-Q4',{kind:'cycle',revision:1,exceptions:[...pairs.map(([id])=>({employeeId:id})),{employeeId:'gm'}]});
  const sql=fs.readFileSync(path.join(__dirname,'../sql/repairs/zermatt_confirmed_role_managers_20261029.sql'),'utf8');
  await db.exec("UPDATE employees SET \"locationId\"='different' WHERE id='013';");
  await assert.rejects(()=>db.exec(sql),/cross-branch/);
  assert.equal((await db.query('SELECT count(*)::int n FROM employee_line_manager_assignments')).rows[0].n,0);
  await db.exec("UPDATE employees SET \"locationId\"='branch' WHERE id='013';");
  await db.exec(sql);
  assert.equal((await db.query('SELECT count(*)::int n FROM employee_line_manager_assignments')).rows[0].n,8);
  for(const [id,mgr] of pairs){
   const r=(await db.query(`SELECT "newValue" v FROM organization_audits WHERE "entityId"=$1 ORDER BY ("newValue"->>'revision')::int DESC LIMIT 1`,['review:2026-Q4:'+id])).rows[0].v;
   assert.equal(r.managerEmployeeId,mgr);assert.equal(r.managerMappingRequired,false);assert.equal(r.selfAssessmentDraft.comments,'Private saved draft');assert.equal(r.goals[0].weight,100);
  }
  assert.deepEqual((await db.query(`SELECT "newValue" v FROM organization_audits WHERE "entityId"='review:2026-Q4:gm'`)).rows[0].v,gm);
  const c=(await db.query(`SELECT "newValue" v FROM organization_audits WHERE "entityId"='cycle:2026-Q4' ORDER BY ("newValue"->>'revision')::int DESC LIMIT 1`)).rows[0].v;
  assert.deepEqual(c.exceptions,[{employeeId:'gm'}]);
  const count=(await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n;
  await db.exec(sql);assert.equal((await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n,count);
 }finally{await db.close();}
});
