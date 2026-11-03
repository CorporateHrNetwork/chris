"use strict";
const {validateLoanPurpose}=require("./loanPolicyService");
// Load the existing financial workflow only when a real ESS request is made.
function fail(code,statusCode=403){throw Object.assign(new Error(code),{code,statusCode});}
async function employeeFor(db,scope){
 if(!scope?.employeeId||!scope?.userId||!scope?.organizationId)fail("ESS_EMPLOYEE_SESSION_REQUIRED");
 const [org,employee]=await Promise.all([
  db.organization.findUnique({where:{id:scope.organizationId},select:{slug:true}}),
  db.employee.findFirst({where:{id:scope.employeeId,organizationId:scope.organizationId,status:{in:["ACTIVE","PROBATION","LEAVE"]}},select:{id:true,employeeNumber:true}})
 ]);
 if(org?.slug!=="zermatt-liquor-limited")fail("ESS_LOAN_TENANT_NOT_ENABLED");
 if(!employee)fail("ESS_EMPLOYEE_NOT_ELIGIBLE");
 return employee;
}
async function createDraft(db,scope,input){
 const employee=await employeeFor(db,scope);
 const created=await db.$transaction(async tx=>{
  const purpose=await validateLoanPurpose({organizationId:scope.organizationId,purpose:input?.purpose,prismaClient:tx});
  // Ignore all client-supplied employee, branch, loan status or actor fields.
  return require("./loanOriginationWorkflowService").createDraftApplication({organizationId:scope.organizationId,actorUserId:scope.userId,
   input:{employeeNumber:employee.employeeNumber,principalAmount:input?.principalAmount,installmentAmount:input?.installmentAmount,purpose,notes:String(input?.notes||"").slice(0,1500)},
   purpose,prismaClient:tx});
 });
 return {id:created.id,loanNumber:created.loanNumber,status:"DRAFT",principalAmount:created.principalAmount,installmentAmount:created.installmentAmount,message:"Attach the required application form. Branch manager approval is not yet enabled."};
}
async function attachForm(db,scope,loanId,file){
 await employeeFor(db,scope);
 return db.$transaction(async tx=>{
  const rows=await tx.$queryRawUnsafe('SELECT "id","status" FROM "payroll_loans" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "id"=$3 FOR UPDATE',scope.organizationId,scope.employeeId,loanId);
  if(!rows[0])fail("ESS_LOAN_NOT_FOUND",404);
  if(!["DRAFT","RETURNED_FOR_CORRECTION"].includes(rows[0].status))fail("ESS_LOAN_APPLICATION_FROZEN",409);
  return require("./loanOriginationWorkflowService").addApplicationForm({organizationId:scope.organizationId,actorUserId:scope.userId,loanId,file,prismaClient:tx});
 });
}
module.exports={employeeFor,createDraft,attachForm};
