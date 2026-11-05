const test=require('node:test'),assert=require('node:assert/strict');
const url=process.env.CHRIS_ESS_LEAVE_TEST_DATABASE_URL;

// This uses a disposable CI database only. ESS can view its own leave records,
// but cannot create, preview or approve leave, even with forged employee IDs.
test('isolated PostgreSQL/HTTP: ESS read-only leave access and identity isolation',{skip:!url},async()=>{
 assert.equal(new URL(url).pathname,'/chris_ess_leave_test','Refuse any shared or live database');
 process.env.DATABASE_URL=url;process.env.JWT_SECRET='synthetic-ess-leave-test-secret-only';
 const prisma=require('../src/config/prisma'),express=require('express'),jwt=require('jsonwebtoken');
 const current=(await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name;
 assert.equal(current,'chris_ess_leave_test');
 const app=express();app.use(express.json());app.use('/api/ess',require('../src/routes/essRoutes'));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const org=await prisma.organization.create({data:{name:'Synthetic ESS Leave',slug:'synthetic-ess-leave'}});
  const otherOrg=await prisma.organization.create({data:{name:'Other synthetic org',slug:'other-synthetic-ess-leave'}});
  const employee=await prisma.employee.create({data:{organizationId:org.id,employeeNumber:'SYN-001',firstName:'Synthetic',lastName:'Employee',employmentType:'Full-Time',hireDate:new Date('2020-01-01')}});
  const victim=await prisma.employee.create({data:{organizationId:org.id,employeeNumber:'SYN-002',firstName:'Other',lastName:'Employee',employmentType:'Full-Time'}});
  const user=await prisma.user.create({data:{organizationId:org.id,employeeId:employee.id,email:'synthetic-ess@example.invalid',passwordHash:'fixture-no-login'}});
  const type=await prisma.leaveType.create({data:{organizationId:org.id,name:'Synthetic Annual',code:'SYN-ANNUAL'}});
  const foreignType=await prisma.leaveType.create({data:{organizationId:otherOrg.id,name:'Foreign',code:'FOREIGN'}});
  const policy=await prisma.leavePolicy.create({data:{organizationId:org.id,leaveTypeId:type.id,name:'Synthetic Annual v1',entitlementDays:99,effectiveFrom:new Date('2020-01-01'),allowNegativeBalance:true,maxNegativeDays:100,entitlementRules:{unit:'CALENDAR_DAYS'}}});
  await prisma.leavePolicy.create({data:{organizationId:otherOrg.id,leaveTypeId:foreignType.id,name:'Foreign',entitlementDays:99,effectiveFrom:new Date('2020-01-01'),entitlementRules:{unit:'CALENDAR_DAYS'}}});
  const year=new Date().getUTCFullYear()+1,day=n=>`${year}-01-${String(n).padStart(2,'0')}`;
  await prisma.leaveBalance.create({data:{organizationId:org.id,employeeId:employee.id,leaveTypeId:type.id,leaveYear:year,openingBalance:3}});
  await prisma.leaveBalance.create({data:{organizationId:org.id,employeeId:victim.id,leaveTypeId:type.id,leaveYear:year,openingBalance:100}});
  const token=jwt.sign({accessType:'ESS',organizationId:org.id,userId:user.id},process.env.JWT_SECRET,{expiresIn:'1h'});
  async function request(path,method='GET',body,auth=token){
   const response=await fetch(base+path,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   return {...await response.json(),httpStatus:response.status};
  }
  const input={leavePolicyId:policy.id,startDate:day(5),endDate:day(9),reason:'Synthetic leave request',employeeId:victim.id,employeeNumber:victim.employeeNumber,requestedUnits:0,strictAvailableBalance:false};
  assert.equal((await request('/api/ess/leave/applications','GET',null,null)).httpStatus,401);
  const options=await request(`/api/ess/leave/applications?asOfDate=${day(20)}&employeeId=${victim.id}&organizationId=${otherOrg.id}`);
  assert.equal(options.httpStatus,200);
  assert.equal(options.data.policies.find(p=>p.id===policy.id).available,3);
  assert.equal(options.data.policies.some(p=>p.name==='Foreign'),false);
  assert.equal(options.data.requests.length,0);
  const attempts=await Promise.all([
   request('/api/ess/leave/applications','POST',input),
   request('/api/ess/leave/applications','POST',{...input,startDate:day(10),endDate:day(11)}),
   request('/api/ess/leave/preview','POST',input),
   request('/api/ess/loans/applications','POST',{employeeId:victim.id,principalAmount:5000})
  ]);
  for(const result of attempts){
   assert.equal(result.httpStatus,403);
   assert.equal(result.code,'ESS_APPLICATIONS_DISABLED');
  }
  assert.equal(await prisma.leaveRequest.count({where:{organizationId:org.id}}),0,'Denied ESS attempts cannot create requests');
  assert.equal(await prisma.leaveBalance.count({where:{employeeId:employee.id,leaveTypeId:type.id}}),1,'ESS cannot alter balance records');
  assert.equal(await prisma.leaveRequest.count({where:{employeeId:victim.id}}),0,'Forged employee selector must never create requests');
  // HR-created records must populate the register without enabling ESS writes.
  const recorded=await prisma.leaveRequest.create({data:{organizationId:org.id,employeeId:employee.id,leaveTypeId:type.id,leavePolicyId:policy.id,startDate:new Date(day(5)),endDate:new Date(day(6)),requestedUnits:2,status:'PENDING',createdByUserId:user.id}});
  const registerService=require('../src/services/leaveService');
  assert.ok((await registerService.getLeaveRequests({organizationId:org.id})).some(row=>row.id===recorded.id),'No-year register must include recorded requests');
  assert.ok((await registerService.getLeaveRequests({organizationId:org.id,leaveYear:year})).some(row=>row.id===recorded.id));
  assert.equal((await registerService.getLeaveRequests({organizationId:otherOrg.id})).length,0,'Register must remain tenant scoped');
  assert.equal((await registerService.getLeaveRequests({organizationId:org.id,locationIds:[]})).length,0);
  const locationA=await prisma.organizationLocation.create({data:{organizationId:org.id,name:'Synthetic Branch A',code:'REG-A'}});
  const locationB=await prisma.organizationLocation.create({data:{organizationId:org.id,name:'Synthetic Branch B',code:'REG-B'}});
  await prisma.employee.update({where:{id:employee.id},data:{locationId:locationA.id}});
  await prisma.employee.update({where:{id:victim.id},data:{locationId:locationB.id}});
  for(const staff of [employee,victim])await prisma.attendancePayrollInput.create({data:{organizationId:org.id,employeeId:staff.id,periodStart:new Date(day(1)),periodEnd:new Date(day(31)),workedDays:5,recordedByUserId:user.id}});
  const attendance=require('../src/services/attendancePayrollService');
  const scoped=await attendance.listManualPayrollInputs({organizationId:org.id,locationIds:[locationA.id]});
  assert.deepEqual(scoped.map(row=>row.employeeNumber),[employee.employeeNumber]);
  assert.equal((await attendance.listManualPayrollInputs({organizationId:org.id,locationIds:[]})).length,0);
  assert.equal((await attendance.listManualPayrollInputs({organizationId:org.id})).length,2);
  await prisma.user.update({where:{id:user.id},data:{isActive:false}});
  assert.equal((await request('/api/ess/leave/applications','POST',input)).httpStatus,403);
  assert.equal((await request('/api/ess/leave/applications')).httpStatus,403);
 }finally{await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();}
});

