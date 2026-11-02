const test=require('node:test'),assert=require('node:assert/strict');
let active;
const prisma={$transaction:async fn=>{const before=structuredClone(active);try{return await fn({$queryRawUnsafe:async()=>[],employee:{findFirst:async()=>({id:'e',employeeNumber:'SYN-1',status:'ACTIVE',shiftAssignments:[]})},leaveType:{findFirst:async()=>({id:'t',unit:'DAYS'})},leavePolicy:{findFirst:async()=>({id:'p',leaveTypeId:'t',entitlementDays:20,entitlementRules:{unit:'CALENDAR_DAYS'}})},publicHoliday:{findMany:async()=>[]},leaveBalance:{findUnique:async()=>active.balance,update:async({data})=>Object.assign(active.balance,data)},leaveRequest:{findFirst:async()=>null,aggregate:async()=>({_sum:{requestedUnits:2}}),create:async({data})=>{if(active.failCreate)throw Error('REQUEST_CREATE_FAILED');active.requests.push(data);return data;}},organizationAudit:{create:async({data})=>active.audits.push(data)}});}catch(e){active=before;throw e;}}};
require.cache[require.resolve('../src/config/prisma')]={exports:prisma};
require.cache[require.resolve('../src/services/serviceEligibility')]={exports:{evaluateEmployeeEligibility:async()=>({eligibility:{eligible:true}})}};
const {submitLeaveRequest}=require('../src/services/leaveService');
const input={organizationId:'org',employeeNumber:'SYN-1',actorUserId:'hr',leaveTypeId:'t',leavePolicyId:'p',startDate:'2099-01-05',endDate:'2099-01-07',manualDaysTaken:9,manualLeaveYear:2099};
test('manual usage and audit persist atomically, remain enforced and are never charged twice',async()=>{
 active={balance:{id:'b',openingBalance:20,used:4},audits:[],requests:[]};
 await submitLeaveRequest(input);assert.equal(active.balance.used,9);assert.equal(active.audits.length,1);assert.equal(active.audits[0].previousValue.used,4);assert.equal(active.requests[0].status,'PENDING');
 await submitLeaveRequest(input);assert.equal(active.balance.used,9);assert.equal(active.audits.length,1);
 await assert.rejects(submitLeaveRequest({...input,manualDaysTaken:19}),/INSUFFICIENT_LEAVE_BALANCE/);assert.equal(active.balance.used,9);assert.equal(active.audits.length,1);
 active.failCreate=true;await assert.rejects(submitLeaveRequest({...input,manualDaysTaken:10}),/REQUEST_CREATE_FAILED/);assert.equal(active.balance.used,9);assert.equal(active.audits.length,1);
 await assert.rejects(submitLeaveRequest({...input,manualDaysTaken:5}),/cannot be lower/);
 await assert.rejects(submitLeaveRequest({...input,manualLeaveYear:2026}),/year must match/);
 await assert.rejects(submitLeaveRequest({...input,strictAvailableBalance:true,reason:'ESS request'}),/cannot be set through ESS/);
});
