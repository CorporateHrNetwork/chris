const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {leaveDayBounds,summarizeOperationalLeave,projectLeaveStatuses}=require("../src/services/leaveAnalyticsService");
const now=new Date("2026-11-05T10:00:00Z"),bounds=leaveDayBounds(now);
const request=(id,status,start="2026-11-05",end="2026-11-05",extra={})=>({id,employeeId:id,status,startDate:start,endDate:end,cancelledAt:null,returnedAt:null,employee:{status:"ACTIVE"},...extra});
test("approved dates are inclusive; future, expired, rejected and cancelled leave are excluded",()=>{
 const rows=[request("today","APPROVED"),request("upcoming","APPROVED","2026-11-06","2026-11-08"),request("expired","APPROVED","2026-11-01","2026-11-04"),request("rejected","REJECTED"),request("cancelled","APPROVED",undefined,undefined,{cancelledAt:now}),request("done","COMPLETED"),request("suspended","APPROVED",undefined,undefined,{employee:{status:"SUSPENDED"}})];
 const result=summarizeOperationalLeave(rows,bounds);
 assert.equal(result.activeLeaveRequests,1);assert.equal(result.activeApprovedRequests,1);assert.equal(result.approvedUpcoming,1);assert.equal(result.approvedCurrentOrUpcoming,2);assert.deepEqual([...result.activeEmployeeIds],["today"]);
});
test("commenced overdue leave stays active until return; employees are deduplicated",()=>{
 const rows=[request("one","APPROVED"),request("duplicate","APPROVED",undefined,undefined,{employeeId:"one"}),request("overdue","ACTIVE","2026-10-01","2026-10-05"),request("returned","ACTIVE",undefined,undefined,{returnedAt:now})];
 const result=summarizeOperationalLeave(rows,bounds);assert.equal(result.activeLeaveRequests,3);assert.equal(result.activeEmployeeIds.size,2);assert.equal(result.commencedLeaveRequests,1);
});
test("Lagos midnight changes the effective date without changing persisted employee status",()=>{
 const edge=new Date("2026-11-04T23:30:00Z"),row=request("approved","APPROVED");
 assert.equal(summarizeOperationalLeave([row],leaveDayBounds(edge,"Africa/Lagos")).activeLeaveRequests,1);
 assert.equal(summarizeOperationalLeave([row],leaveDayBounds(edge,"UTC")).activeLeaveRequests,0);
 const employees=[{id:"approved",status:"ACTIVE"},{id:"probation",status:"PROBATION"},{id:"suspended",status:"SUSPENDED"}];
 const projected=projectLeaveStatuses(employees,new Set(["approved","suspended"]));
 assert.equal(projected[0].status,"LEAVE");assert.equal(projected[2].status,"SUSPENDED");assert.equal(employees[0].status,"ACTIVE");
});
test("Active Leave UI agrees with server counts while Return to Work remains commenced-only",async()=>{
 const source=fs.readFileSync(path.join(__dirname,"../../src/components/leave/leaveSelectors.js"),"utf8");
 const ui=await import("data:text/javascript,"+encodeURIComponent(source));
 const rows=[request("approved","APPROVED"),request("future","APPROVED","2026-11-06","2026-11-08"),request("commenced","ACTIVE","2026-10-01","2026-10-05"),request("cancelled","APPROVED",undefined,undefined,{cancelledAt:now})];
 assert.equal(ui.activeLeaves(rows,now).length,summarizeOperationalLeave(rows,bounds).activeLeaveRequests);
 assert.deepEqual(ui.returnQueue(rows).map(row=>row.id),["commenced"]);
 assert.equal(ui.calendarLeaves(rows,"2026-11").some(row=>row.id==="cancelled"),false);
});
test("Leave Overview counts effective approvals, keeps future approvals separate and preserves branch scope",async()=>{
 const data=[request("a","APPROVED",undefined,undefined,{organizationId:"org",branch:"a"}),request("b","APPROVED",undefined,undefined,{organizationId:"org",branch:"b"}),request("future","APPROVED","2026-11-06","2026-11-08",{organizationId:"org",branch:"a"})];
 const calls=[],db={employee:{findMany:async()=>[]},leaveRequest:{findMany:async({where})=>{calls.push(where);const ids=where.employee?.is?.AND?.[0]?.locationId.in;return data.filter(row=>row.organizationId===where.organizationId&&(!ids||ids.includes(row.branch))&&(!where.employee?.is?.locationId||where.employee.is.locationId===row.branch));}}};
 const sandbox={module:{exports:{}},require:id=>id==="../config/prisma"?db:id==="./leaveAnalyticsService"?require("../src/services/leaveAnalyticsService"): {}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/services/leaveOperationalService.js"),"utf8"),sandbox);
 const overview=sandbox.module.exports.getLeaveOverview;
 const scoped=await overview({organizationId:"org",asOfDate:now,locationIds:["a"]});assert.equal(scoped.activeLeaveRequests,1);assert.equal(scoped.employeesOnLeave,1);assert.equal(scoped.approvedUpcoming,1);
 assert.equal((await overview({organizationId:"org",asOfDate:now,locationIds:[]})).activeLeaveRequests,0);
 assert.equal((await overview({organizationId:"other",asOfDate:now})).activeLeaveRequests,0);
 assert.equal(calls[0].cancelledAt,null);assert.equal(calls[0].returnedAt,null);
});
