"use strict";
const {ZERMATT,buildLeaveStages,buildLoanStages}=require("./zermattEssApprovalPlan");
const HEAD_HR=["head of hr & admin","head of hr and admin","head of human resources","head of hr"];
const BRANCH_HR=["branch hr & admin officer","branch hr and admin officer","branch hr admin officer","hr admin officer"];
const BRANCH_MANAGER=["branch business operations manager","branch operations manager","branch manager"];
const GM=["general manager","gm"];
const CHIEF=["chief accountant"];
const AUDIT=["head of audit & internal controls","head of audit and internal controls","head of audit & internal control","head of audit and internal control"];
const norm=s=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
function error(code){const e=new Error(code);e.code=code;e.statusCode=409;throw e;}
function roleNames(user){return (user?.userRoles||[]).map(x=>norm(x.role?.name));}
function matches(user,aliases){return roleNames(user).some(n=>aliases.includes(n));}
function assignedToLocation(user,locationId){
 if(user.locationScope==="ALL_LOCATIONS")return true;
 return Boolean(locationId&&(user.userLocations||[]).some(x=>x.locationId===locationId));
}
function uniqueUser(users,aliases,locationId,code){
 const found=users.filter(u=>u.isActive&&matches(u,aliases)&&assignedToLocation(u,locationId));
 if(found.length!==1)error(code+"_"+(found.length?"AMBIGUOUS":"MISSING"));
 return found[0];
}
async function loadScope(db,organizationId,employeeId){
 const [org,employee,users]=await Promise.all([
  db.organization.findUnique({where:{id:organizationId},select:{slug:true}}),
  db.employee.findFirst({where:{id:employeeId,organizationId},select:{id:true,locationId:true,status:true}}),
  db.user.findMany({where:{organizationId,isActive:true},select:{id:true,isActive:true,employeeId:true,locationScope:true,userRoles:{select:{role:{select:{name:true}}}},userLocations:{select:{locationId:true}}}}}),
 ]);
 if(org?.slug!==ZERMATT)error("ZERMATT_WORKFLOW_ONLY");
 if(!employee||!["ACTIVE","PROBATION","LEAVE"].includes(employee.status))error("EMPLOYEE_NOT_ELIGIBLE");
 return {org,employee,users};
}
async function reportingChain(db,{organizationId,employeeId,users,asOf=new Date(),maxDepth=20}){
 const chain=[],visited=new Set([employeeId]);
 let current=employeeId;
 for(let depth=0;depth<maxDepth;depth++){
  const links=await db.employeeLineManagerAssignment.findMany({
   where:{organizationId,employeeId:current,effectiveFrom:{lte:asOf},OR:[{effectiveTo:null},{effectiveTo:{gte:asOf}}]},
   select:{managerEmployeeId:true,manager:{select:{id:true,locationId:true,designation:{select:{name:true}}}}},
   take:2,
  });
  if(links.length!==1)error(links.length?"AMBIGUOUS_REPORTING_LINE":"REPORTING_LINE_MISSING");
  const next=links[0].manager;
  if(!next||visited.has(next.id))error("REPORTING_LINE_CYCLE");
  visited.add(next.id);
  const user=users.find(u=>u.employeeId===next.id&&u.isActive);
  if(!user)error("LINE_MANAGER_LOGIN_MISSING");
  const designation=norm(next.designation?.name);
  const isFinalBranchManager=BRANCH_MANAGER.includes(designation)||matches(user,BRANCH_MANAGER);
  chain.push({userId:user.id,designation:next.designation?.name||"Line manager",isFinalBranchManager});
  if(isFinalBranchManager)return chain;
  current=next.id;
 }
 error("REPORTING_LINE_DEPTH_EXCEEDED");
}
async function resolveLeaveApprovers(db,{organizationId,employeeId,requesterUserId,asOf}){
 const {employee,users}=await loadScope(db,organizationId,employeeId);
 const chain=await reportingChain(db,{organizationId,employeeId,users,asOf});
 const branchHr=users.filter(u=>u.isActive&&matches(u,BRANCH_HR)&&assignedToLocation(u,employee.locationId));
 const hr=branchHr.length===1?branchHr[0]:uniqueUser(users,HEAD_HR,null,"HEAD_HR");
 return buildLeaveStages({organizationSlug:ZERMATT,requesterUserId,hrUserId:hr.id,managerChain:chain,finalHrUserId:hr.id});
}
async function resolveLoanApprovers(db,{organizationId,employeeId,requesterUserId}){
 const {employee,users}=await loadScope(db,organizationId,employeeId);
 const branch=uniqueUser(users,BRANCH_MANAGER,employee.locationId,"BRANCH_MANAGER");
 const hr=uniqueUser(users,HEAD_HR,null,"HEAD_HR");
 const gm=uniqueUser(users,GM,null,"GENERAL_MANAGER");
 const chief=uniqueUser(users,CHIEF,null,"CHIEF_ACCOUNTANT");
 return buildLoanStages({organizationSlug:ZERMATT,requesterUserId,branchManagerUserId:branch.id,headHrUserId:hr.id,gmUserId:gm.id,chiefAccountantUserId:chief.id});
}
async function resolveAuditObservers(db,organizationId){
 const users=await db.user.findMany({where:{organizationId,isActive:true},select:{id:true,isActive:true,userRoles:{select:{role:{select:{name:true}}}}}});
 return users.filter(u=>matches(u,AUDIT)).map(u=>u.id);
}
module.exports={resolveLeaveApprovers,resolveLoanApprovers,resolveAuditObservers,reportingChain,uniqueUser,roleNames,assignedToLocation};
