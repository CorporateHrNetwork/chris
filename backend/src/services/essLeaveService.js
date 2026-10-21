const { calculateLeaveRequestDays, submitLeaveRequest } = require('./leaveService');
const { getEmployeePolicyBalance } = require('./leaveBalanceService');

function fail(code, statusCode = 400) { throw Object.assign(new Error(code), { statusCode }); }
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_LEAVE_DATES');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) fail('INVALID_LEAVE_DATES');
  return date;
}
function eligible(employee, policy) {
  const rules = policy.eligibilityRules || {};
  return (!Array.isArray(rules.genders) || !rules.genders.length || rules.genders.includes(employee.gender)) &&
    (!Array.isArray(rules.employmentTypes) || !rules.employmentTypes.length || rules.employmentTypes.includes(employee.employmentType));
}
async function employeeFor(db, scope) {
  if (!scope.organizationId || !scope.employeeId) fail('EMPLOYEE_SESSION_REQUIRED',403);
  const employee = await db.employee.findFirst({where:{organizationId:scope.organizationId,id:scope.employeeId,status:{in:['ACTIVE','PROBATION','LEAVE']}},select:{id:true,employeeNumber:true,gender:true,employmentType:true}});
  if (!employee) fail('EMPLOYEE_NOT_FOUND',403);
  return employee;
}
async function policyFor(db, scope, policyId, start) {
  if (typeof policyId !== 'string' || !policyId.trim()) fail('LEAVE_POLICY_REQUIRED');
  const policy = await db.leavePolicy.findFirst({where:{id:policyId,organizationId:scope.organizationId,isActive:true,status:'ACTIVE',effectiveFrom:{lte:start},OR:[{effectiveTo:null},{effectiveTo:{gte:start}}]},include:{leaveType:true}});
  if (!policy || !policy.leaveType.isActive) fail('TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND');
  return policy;
}
async function options(db, scope, asOfDate) {
  const date = dateOnly(asOfDate), year=date.getUTCFullYear();
  if (year < 2000 || year > 2200) fail('INVALID_LEAVE_YEAR');
  const employee=await employeeFor(db,scope);
  const policies=await db.leavePolicy.findMany({where:{organizationId:scope.organizationId,isActive:true,status:'ACTIVE',effectiveFrom:{lte:date},OR:[{effectiveTo:null},{effectiveTo:{gte:date}}],leaveType:{isActive:true}},include:{leaveType:true},orderBy:{name:'asc'}});
  const rows=[];
  for (const policy of policies) {
    const balance=await getEmployeePolicyBalance({organizationId:scope.organizationId,employeeNumber:employee.employeeNumber,leavePolicyId:policy.id,leaveYear:year,tx:db});
    rows.push({id:policy.id,name:policy.name,unit:balance.unit,eligible:eligible(employee,policy),available:Math.max(0,balance.available),pending:balance.committed,used:balance.used,hasEntitlement:balance.hasEntitlement,maximumRequestable:Math.max(0,Math.min(balance.available,balance.maximumRequestable)),requiresAttachment:policy.leaveType.requiresAttachment});
  }
  const requests=await db.leaveRequest.findMany({where:{organizationId:scope.organizationId,employeeId:employee.id},select:{id:true,startDate:true,endDate:true,requestedUnits:true,status:true,reason:true,leavePolicy:{select:{name:true}}},orderBy:{submittedAt:'desc'},take:100});
  return {leaveYear:year,policies:rows,requests};
}
async function preview(db, scope, input) {
  const start=dateOnly(input.startDate),end=dateOnly(input.endDate);
  if (end<start) fail('INVALID_LEAVE_DATES');
  if (start.getUTCFullYear()!==end.getUTCFullYear()) fail('SPLIT_LEAVE_BY_YEAR');
  const employee=await employeeFor(db,scope),policy=await policyFor(db,scope,input.leavePolicyId,start);
  if (!eligible(employee,policy)) fail('LEAVE_NOT_ELIGIBLE');
  const calculation=await calculateLeaveRequestDays({organizationId:scope.organizationId,employeeNumber:employee.employeeNumber,leavePolicyId:policy.id,startDate:input.startDate,endDate:input.endDate,policy,tx:db});
  const balance=await getEmployeePolicyBalance({organizationId:scope.organizationId,employeeNumber:employee.employeeNumber,leavePolicyId:policy.id,leaveYear:start.getUTCFullYear(),tx:db});
  const available=Math.max(0,balance.available),maximumRequestable=Math.max(0,Math.min(available,balance.maximumRequestable));
  return {requestedUnits:calculation.requestedUnits,available,pending:balance.committed,maximumRequestable,unit:calculation.unit,remaining:available-calculation.requestedUnits,canSubmit:balance.hasEntitlement&&calculation.requestedUnits>0&&calculation.requestedUnits<=maximumRequestable,scheduleNote:calculation.scheduleNote};
}
async function submit(db, scope, input) {
  const employee=await employeeFor(db,scope),start=dateOnly(input.startDate);
  dateOnly(input.endDate);
  const policy=await policyFor(db,scope,input.leavePolicyId,start);
  // The caller cannot choose an employee, override units or request negative leave.
  const result=await submitLeaveRequest({organizationId:scope.organizationId,actorUserId:scope.userId,employeeNumber:employee.employeeNumber,leaveTypeId:policy.leaveTypeId,leavePolicyId:policy.id,startDate:input.startDate,endDate:input.endDate,reason:String(input.reason||'').trim().slice(0,4000),attachmentUrl:String(input.attachmentUrl||'').trim().slice(0,2000)||null,strictAvailableBalance:true});
  return {id:result.id,status:result.status,requestedUnits:Number(result.requestedUnits),startDate:result.startDate,endDate:result.endDate};
}
module.exports={options,preview,submit,dateOnly,eligible};
