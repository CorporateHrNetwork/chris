const prisma=require("../config/prisma");
const {balanceAvailable,policyEntitlementForService}=require("./leaveService");
function dayStart(value=new Date()){const d=new Date(value);d.setHours(0,0,0,0);return d}
async function getLeaveOverview({organizationId,asOfDate=new Date()}){
 const today=dayStart(asOfDate),tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 const [pendingRequests,approvedUpcoming,employeesOnLeave,activeLeaveRequests,returnsDue,leaveEmployees,activeRequests]=await Promise.all([
  prisma.leaveRequest.count({where:{organizationId,status:"PENDING"}}),
  prisma.leaveRequest.count({where:{organizationId,status:"APPROVED",endDate:{gte:today}}}),
  prisma.employee.count({where:{organizationId,status:"LEAVE"}}),
  prisma.leaveRequest.count({where:{organizationId,status:"ACTIVE"}}),
  prisma.leaveRequest.count({where:{organizationId,status:"ACTIVE",endDate:{lt:tomorrow}}}),
  prisma.employee.findMany({where:{organizationId,status:"LEAVE"},select:{id:true}}),
  prisma.leaveRequest.findMany({where:{organizationId,status:"ACTIVE"},select:{employeeId:true,employee:{select:{status:true}}}})
 ]);
 const activeIds=new Set(activeRequests.map(x=>x.employeeId));
 const exceptions=leaveEmployees.filter(x=>!activeIds.has(x.id)).length+activeRequests.filter(x=>x.employee.status!=="LEAVE").length;
 return {pendingRequests,approvedUpcoming,employeesOnLeave,activeLeaveRequests,returnsDue,leaveExceptions:exceptions};
}
async function getBalanceRegister({organizationId,leaveYear}){
 const year=Number(leaveYear||new Date().getFullYear());
 const [balances,allocations,policies]=await Promise.all([
  prisma.leaveBalance.findMany({where:{organizationId,leaveYear:year},include:{employee:{select:{employeeNumber:true,firstName:true,middleName:true,lastName:true}},leaveType:true},orderBy:{employee:{employeeNumber:"asc"}}}),
  prisma.leaveRequest.groupBy({by:["employeeId","leaveTypeId","status"],where:{organizationId,startDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(year+1,0,1))},status:{in:["PENDING","APPROVED"]}},_sum:{requestedUnits:true}}),
  prisma.leavePolicy.findMany({where:{organizationId,status:"ACTIVE",effectiveFrom:{lt:new Date(Date.UTC(year+1,0,1))},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date(Date.UTC(year,0,1))}}]},select:{id:true,name:true,versionNumber:true,leaveTypeId:true,entitlementDays:true}})
 ]);
 const allocationMap=new Map();for(const row of allocations){const k=row.employeeId+":"+row.leaveTypeId;const old=allocationMap.get(k)||{pending:0,approved:0};old[row.status.toLowerCase()]=Number(row._sum.requestedUnits||0);allocationMap.set(k,old)}
 const policyMap=new Map(policies.map(p=>[p.leaveTypeId,p]));
 return balances.map(b=>{const allocation=allocationMap.get(b.employeeId+":"+b.leaveTypeId)||{pending:0,approved:0};return {...b,employeeName:[b.employee.firstName,b.employee.middleName,b.employee.lastName].filter(Boolean).join(" "),policy:policyMap.get(b.leaveTypeId)||null,pendingAllocation:allocation.pending,approvedAllocation:allocation.approved,available:balanceAvailable(b)}});
}
async function getEntitlementRegister({organizationId,asOfDate=new Date()}){
 const date=dayStart(asOfDate),year=date.getFullYear();
 const [employees,policies,balances]=await Promise.all([
  prisma.employee.findMany({where:{organizationId,status:{in:["ACTIVE","PROBATION","LEAVE"]},employmentEpisodes:{some:{endDate:null}}},select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,status:true,employmentEpisodes:{where:{endDate:null},orderBy:{sequenceNumber:"desc"},take:1,select:{startDate:true}}},orderBy:{employeeNumber:"asc"}}),
  prisma.leavePolicy.findMany({where:{organizationId,status:"ACTIVE",effectiveFrom:{lte:date},OR:[{effectiveTo:null},{effectiveTo:{gte:date}}]},include:{leaveType:true},orderBy:{name:"asc"}}),
  prisma.leaveBalance.findMany({where:{organizationId,leaveYear:year}})
 ]);
 const balanceMap=new Map(balances.map(b=>[b.employeeId+":"+b.leaveTypeId,b]));
 const rows=[];for(const employee of employees){const episode=employee.employmentEpisodes[0];const serviceDays=episode?Math.max(0,Math.floor((date-new Date(episode.startDate))/86400000)):0;for(const policy of policies){const eligibility=policy.eligibilityRules||{};const minimum=Number(eligibility.minimumServiceDays||policy.minimumServiceDays||0);if(serviceDays<minimum)continue;const base=Number(policy.entitlementDays);const finalEntitlement=policyEntitlementForService(policy,{eligibility:{measured:{serviceDays}}});const balance=balanceMap.get(employee.id+":"+policy.leaveTypeId);const advancedPending=Boolean((eligibility.scope&&eligibility.scope!=="ALL_EMPLOYEES")||(Array.isArray(eligibility.criteria)&&eligibility.criteria.length)||(policy.coverageRules&&Object.keys(policy.coverageRules).length));rows.push({employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(" "),policyId:policy.id,policyName:policy.name,policyVersion:policy.versionNumber,baseEntitlement:base,serviceBandAdjustment:finalEntitlement-base,proration:policy.entitlementRules?.proration||"NONE",carryover:Number(balance?.carriedForward||0),finalEntitlement,effectiveFrom:policy.effectiveFrom,effectiveTo:policy.effectiveTo,engineStatus:advancedPending?"Advanced eligibility rule pending engine support":"Applied from supported service/status rules"})}}
 return rows;
}
module.exports={getLeaveOverview,getBalanceRegister,getEntitlementRegister};