const prisma=require("../config/prisma");
const {balanceAvailable,policyEntitlementForService}=require("./leaveService");
const {getEmployeePolicyBalance}=require("./leaveBalanceService");
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
  prisma.leavePolicy.findMany({where:{organizationId,status:"ACTIVE",isActive:true,effectiveFrom:{lt:new Date(Date.UTC(year+1,0,1))},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date(Date.UTC(year,0,1))}}]},select:{id:true,name:true,versionNumber:true,leaveTypeId:true,entitlementDays:true}})
 ]);
 const allocationMap=new Map();for(const row of allocations){const k=row.employeeId+":"+row.leaveTypeId;const old=allocationMap.get(k)||{pending:0,approved:0};old[row.status.toLowerCase()]=Number(row._sum.requestedUnits||0);allocationMap.set(k,old)}
 const policyMap=new Map(policies.map(p=>[p.leaveTypeId,p]));
 return Promise.all(balances.map(async b=>{const allocation=allocationMap.get(b.employeeId+":"+b.leaveTypeId)||{pending:0,approved:0};const policy=policyMap.get(b.leaveTypeId)||null;const projection=policy?await getEmployeePolicyBalance({organizationId,employeeNumber:b.employee.employeeNumber,leavePolicyId:policy.id,leaveYear:year}):null;return {...b,employeeName:[b.employee.firstName,b.employee.middleName,b.employee.lastName].filter(Boolean).join(" "),policy,pendingAllocation:projection?.committed??allocation.pending,approvedAllocation:allocation.approved,entitlement:projection?.entitlement??Number(b.openingBalance),available:projection?.available??balanceAvailable(b),maximumRequestable:projection?.maximumRequestable??balanceAvailable(b)}}));
}
async function getEntitlementRegister({organizationId,asOfDate=new Date(),employeeNumber}){
 const date=dayStart(asOfDate),year=date.getFullYear();
 const [employees,policies]=await Promise.all([
  prisma.employee.findMany({where:{organizationId,...(employeeNumber?{employeeNumber}:{}),status:{in:["ACTIVE","PROBATION","LEAVE"]},employmentEpisodes:{some:{endDate:null}}},select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,status:true,designation:{select:{id:true,name:true,careerLevel:true,employmentLevel:true}},employmentEpisodes:{where:{endDate:null},orderBy:{sequenceNumber:"desc"},take:1,select:{startDate:true}}},orderBy:{employeeNumber:"asc"}}),
  prisma.leavePolicy.findMany({where:{organizationId,status:"ACTIVE",isActive:true,effectiveFrom:{lte:date},OR:[{effectiveTo:null},{effectiveTo:{gte:date}}]},include:{leaveType:true},orderBy:{name:"asc"}}),
 ]);
 const candidates=[];
 for(const employee of employees){
  const episode=employee.employmentEpisodes[0];
  const serviceDays=episode?Math.max(0,Math.floor((date-new Date(episode.startDate))/86400000)):0;
  for(const policy of policies){
   const eligibility=policy.eligibilityRules||{};
   const minimum=Number(eligibility.minimumServiceDays||policy.minimumServiceDays||0);
   if(serviceDays<minimum)continue;
   const base=Number(policy.entitlementDays);
   const finalEntitlement=policyEntitlementForService(policy,{eligibility:{measured:{serviceDays}}});
   const advancedPending=Boolean((eligibility.scope&&eligibility.scope!=="ALL_EMPLOYEES")||(Array.isArray(eligibility.criteria)&&eligibility.criteria.length)||(policy.coverageRules&&Object.keys(policy.coverageRules).length));
   candidates.push({employee,policy,base,finalEntitlement,advancedPending});
  }
 }
 const projections=await Promise.all(candidates.map(({employee,policy})=>getEmployeePolicyBalance({organizationId,employeeNumber:employee.employeeNumber,leavePolicyId:policy.id,leaveYear:year})));
 return candidates.map(({employee,policy,base,finalEntitlement,advancedPending},index)=>{
  const projection=projections[index];
  const otherActivePolicies=candidates.filter(item=>item.employee.id===employee.id&&item.policy.id!==policy.id).map(item=>({id:item.policy.id,name:item.policy.name,versionNumber:item.policy.versionNumber,leaveType:item.policy.leaveType}));
  return {employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(" "),designation:employee.designation,employmentLevel:employee.designation?.employmentLevel||null,policyId:policy.id,policyName:policy.name,policyVersion:policy.versionNumber,leaveType:policy.leaveType,allocation:projection.allocation,baseEntitlement:projection.allocation?Number(projection.allocation.baseEntitlement):base,serviceBandAdjustment:projection.entitlement-base,proration:projection.allocation?.method==="PRORATED"?"PRORATED":policy.entitlementRules?.proration||"NONE",carryover:projection.carryover,finalEntitlement:projection.entitlement,entitlement:projection.entitlement,used:projection.used,committed:projection.committed,available:projection.available,maximumRequestable:projection.maximumRequestable,adjustments:projection.adjustments,unit:projection.unit,provisioningStatus:projection.hasEntitlement?"PROVISIONED":"NOT_PROVISIONED",leaveYear:year,otherActivePolicies,effectiveFrom:policy.effectiveFrom,effectiveTo:policy.effectiveTo,engineStatus:advancedPending?"Advanced eligibility rule pending engine support":"Applied from supported service/status rules"};
 });
}
module.exports={getLeaveOverview,getBalanceRegister,getEntitlementRegister};
