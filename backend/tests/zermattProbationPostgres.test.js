const test=require('node:test'),assert=require('node:assert/strict');
const url=process.env.CHRIS_PROBATION_TEST_DATABASE_URL;
test('isolated PostgreSQL/Prisma/HTTP: migrate, notify, assess, extend and record final outcomes',{skip:!url},async()=>{
  assert.equal(new URL(url).pathname,'/chris_probation_test','Refuse shared or production database');
  process.env.DATABASE_URL=url;process.env.JWT_SECRET='synthetic-probation-test-only';
  const prisma=require('../src/config/prisma'),express=require('express'),jwt=require('jsonwebtoken');
  assert.equal((await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'chris_probation_test');
  const s=require('../src/services/zermattProbationService'),p=require('../src/services/zermattProbationPolicy');
  const app=express();app.use(express.json());app.use('/api/zermatt/probation',require('../src/routes/zermattProbationRoutes'));app.use('/api/ess/probation',require('../src/routes/zermattProbationRoutes').essRouter);
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  const base=`http://127.0.0.1:${server.address().port}/api/zermatt/probation`;
  try{
    const org=await prisma.organization.create({data:{name:'Synthetic Zermatt',slug:'zermatt-liquor-limited'}});
    const other=await prisma.organization.create({data:{name:'Synthetic other tenant',slug:'probation-other-test'}});
    const branch=await prisma.organizationLocation.create({data:{organizationId:org.id,name:'Synthetic Branch',code:'SYN',type:'BRANCH'}});
    const employee=async(number,status='PROBATION')=>prisma.employee.create({data:{organizationId:org.id,employeeNumber:number,firstName:'Synthetic',lastName:number,status,locationId:branch.id,hireDate:new Date('2026-07-31T00:00:00Z')}});
    const manager=await employee('SYN-MANAGER','ACTIVE');
    const account=async(name,role,employeeId=null,organizationId=org.id)=>{
      const r=await prisma.role.create({data:{organizationId,name:role}});
      return prisma.user.create({data:{organizationId,email:`${name}@example.invalid`,passwordHash:'synthetic-not-a-password',employeeId,userRoles:{create:{roleId:r.id}},userLocations:organizationId===org.id?{create:{locationId:branch.id}}:undefined}});
    };
    const head=await account('head','Head of HR & Admin'),mgr=await account('manager','Line Manager',manager.id),hr=await account('branch','HR & Admin Officer - Branch'),foreign=await account('foreign','Foreign Head',null,other.id);
    const token=u=>jwt.sign({userId:u.id,organizationId:u.organizationId},process.env.JWT_SECRET);
    async function request(u,path='',body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token(u)}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {http:r.status,...await r.json()};}
    const targets=[];
    for(const n of ['CONFIRM','EXTEND','TERMINATE']){
      const e=await employee('SYN-'+n);targets.push(e);
      await prisma.employeeEmploymentEpisode.create({data:{organizationId:org.id,employeeId:e.id,sequenceNumber:1,startDate:e.hireDate,startStatus:'PROBATION'}});
      await prisma.employeeLineManagerAssignment.create({data:{organizationId:org.id,employeeId:e.id,managerEmployeeId:manager.id,effectiveFrom:e.hireDate}});
    }
    await s.synchronize(prisma,new Date('2026-10-24T12:00:00Z'));await s.synchronize(prisma,new Date('2026-10-24T13:00:00Z'));
    assert.equal((await request(foreign)).http,404);
    assert.equal((await request(head,'/notices')).data.length,3);
    assert.equal((await request(mgr,'/notices')).data.length,3);
    assert.equal((await request(hr,'/notices')).data.length,3);
    const essToken=jwt.sign({userId:mgr.id,organizationId:org.id,accessType:'ESS'},process.env.JWT_SECRET);
    const essBase=base.replace('/api/zermatt/probation','/api/ess/probation');
    const essFetch=(path='',body)=>fetch(essBase+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${essToken}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const essList=await essFetch();assert.equal(essList.status,200);assert.equal((await essList.json()).data.length,3);
    assert.equal((await essFetch('/synchronize',{})).status,403,'ESS cannot acquire Head HR privileges');
    let rows=(await request(head)).data;assert.equal(rows.length,3);
    for(const e of targets){
      const r=rows.find(x=>x.employeeNumber===e.employeeNumber);
      const submission={version:r.version,recommendation:'CONFIRM_EMPLOYMENT',performance:'Agreed targets met',conduct:'Verified',attendance:'Register checked',evidence:'Synthetic reference only',reason:'Synthetic manager assessment'};
      assert.equal((await request(hr,`/${r.id}/submit`,submission)).http,403);
      assert.equal((await essFetch(`/${r.id}/submit`,submission)).status,200);
      assert.equal((await essFetch(`/${r.id}/decide`,{version:r.version+1,outcome:'CONFIRM_EMPLOYMENT'})).status,403);
      const outcome=e.employeeNumber.endsWith('CONFIRM')?'CONFIRM_EMPLOYMENT':e.employeeNumber.endsWith('EXTEND')?'EXTEND_PROBATION':'TERMINATE_EMPLOYMENT';
      const input={version:r.version+1,outcome,effectiveDate:p.lagosDate(),reason:'Synthetic Head HR decision',newEndDate:p.addDays(p.lagosDate(),30),improvementGoals:'Synthetic extension targets'};
      assert.equal((await request(mgr,`/${r.id}/decide`,input)).http,403);
      const results=await Promise.all([request(head,`/${r.id}/decide`,input),request(head,`/${r.id}/decide`,input)]);
      assert.deepEqual(results.map(x=>x.http).sort(),[200,409]);
    }
    const states=await prisma.employee.findMany({where:{id:{in:targets.map(e=>e.id)}}});
    assert.equal(states.find(e=>e.employeeNumber==='SYN-CONFIRM').status,'ACTIVE');
    assert.equal(states.find(e=>e.employeeNumber==='SYN-EXTEND').status,'PROBATION');
    assert.equal(states.find(e=>e.employeeNumber==='SYN-TERMINATE').status,'TERMINATED');
    assert.equal((await request(head)).data.length,4,'Extension opens exactly one next cycle');
    assert.equal(await prisma.organizationAudit.count({where:{organizationId:org.id,action:'PROBATION_DECIDE'}}),3);
    const closed=await prisma.employeeEmploymentEpisode.findFirst({where:{employeeId:targets[2].id}});assert.equal(closed.endStatus,'TERMINATED');
  }finally{await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();}
});
