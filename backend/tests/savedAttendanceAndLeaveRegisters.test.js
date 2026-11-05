const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
function load(file,resolve){const sandbox={module:{exports:{}},console,Date,Number,Math,Set,require:resolve};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src",file),"utf8"),sandbox);return sandbox.module.exports;}
const employees=[{id:"a",organizationId:"org",employeeNumber:"SYN-A",firstName:"Synthetic",lastName:"A",locationId:"branch-a"},{id:"b",organizationId:"org",employeeNumber:"SYN-B",firstName:"Synthetic",lastName:"B",locationId:"branch-b"},{id:"foreign",organizationId:"other",employeeNumber:"FOREIGN",locationId:"branch-a"}];
test("saved manual records respect tenant, employee and branch intersection; empty scope exposes nothing",async()=>{
 const db={attendancePayrollInput:{findMany:async({where})=>employees.filter(e=>e.organizationId===where.organizationId&&(!where.employee?.employeeNumber||e.employeeNumber===where.employee.employeeNumber)&&(!where.employee?.locationId||where.employee.locationId.in.includes(e.locationId))).map(e=>({id:e.id,employee:e,workedDays:5,periodStart:new Date("2026-11-01"),periodEnd:new Date("2026-11-30")}))}};
 const service=load("services/attendancePayrollService.js",()=>db);
 assert.equal((await service.listManualPayrollInputs({organizationId:"org"})).length,2);
 assert.deepEqual(Array.from(await service.listManualPayrollInputs({organizationId:"org",locationIds:["branch-a"]}),x=>x.employeeNumber),["SYN-A"]);
 assert.equal((await service.listManualPayrollInputs({organizationId:"org",locationIds:[]})).length,0);
 assert.equal((await service.listManualPayrollInputs({organizationId:"org",employeeNumber:"SYN-B",locationIds:["branch-a"]})).length,0);
});
test("worked-hours endpoint remains usable when no location selector is supplied",async()=>{
 const service=load("services/attendancePayrollService.js",()=>({attendanceRecord:{findMany:async()=>[]}}));
 await assert.doesNotReject(()=>service.getWorkedHours({organizationId:"org"}));
});
test("manual register route derives branch scope only from authenticated context",async()=>{
 const routes=[],calls=[];
 const router={get:(...a)=>routes.push(a),post:()=>{},patch:()=>{},put:()=>{},delete:()=>{},use:()=>{}};
 load("routes/attendanceRoutes.js",id=>id==="express"?{Router:()=>router}:id.includes("authMiddleware")?{requireAuth:()=>{},requirePermission:()=>()=>{},requireAnyPermission:()=>()=>{}}:id.includes("attendancePayrollService")?{listManualPayrollInputs:async scope=>{calls.push(scope);return []}}:{});
 const route=routes.find(r=>r[0]==="/manual-payroll-inputs"),handler=route.at(-1),res={json:v=>v,status(){return this}};
 for(const [auth,expected] of [[{locationScope:"ALL_LOCATIONS"},undefined],[{locationScope:"ASSIGNED_LOCATIONS",availableLocations:[{id:"branch-a"}]},["branch-a"]],[{locationScope:"ASSIGNED_LOCATIONS",availableLocations:[]},[]],[{locationScope:"ALL_LOCATIONS",activeLocationId:"branch-b"},["branch-b"]]]){
  await handler({auth:{organizationId:"org",...auth},query:{organizationId:"other",locationIds:["victim"]}},res);
  assert.equal(calls.at(-1).organizationId,"org");assert.equal(JSON.stringify(calls.at(-1).locationIds),JSON.stringify(expected));
 }
});
test("request register includes recorded requests when year is omitted, null or blank",async()=>{
 const calls=[],records=[{id:"pending",organizationId:"org",startDate:new Date("2026-11-01"),endDate:new Date("2026-11-05")},{id:"overlap",organizationId:"org",startDate:new Date("2025-12-30"),endDate:new Date("2026-01-02")}];
 const service=load("services/leaveService.js",id=>id==="../config/prisma"?{leaveRequest:{findMany:async({where})=>{calls.push(where);return records.filter(r=>r.organizationId===where.organizationId&&(!where.startDate||r.startDate<where.startDate.lt)&&(!where.endDate||r.endDate>=where.endDate.gte));}}}:{});
 for(const leaveYear of [undefined,null,""]){const rows=await service.getLeaveRequests({organizationId:"org",leaveYear});assert.equal(rows.length,2);assert.equal(calls.at(-1).startDate,undefined);}
 assert.equal((await service.getLeaveRequests({organizationId:"org",leaveYear:2026})).length,2);
 assert.equal((await service.getLeaveRequests({organizationId:"other"})).length,0);
 for(const leaveYear of [0,"invalid",2026.5])await assert.rejects(()=>service.getLeaveRequests({organizationId:"org",leaveYear}),/INVALID_LEAVE_YEAR/);
 await service.getLeaveRequests({organizationId:"org",locationIds:["branch-a"]});assert.deepEqual(Array.from(calls.at(-1).AND[0].employee.is.locationId.in),["branch-a"]);
});
