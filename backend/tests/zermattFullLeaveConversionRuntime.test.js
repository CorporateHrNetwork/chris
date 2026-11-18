const test = require("node:test");
const assert = require("node:assert/strict");
const {
  POLICY_DEFINITIONS,
  provisionZermattEmployeeLeaveProfile
} = require("../src/services/zermattLeaveEntitlementService");

const ORG = "org-zermatt-test";
function fixture(employeeNumber, overrideLevel = null, existingOpeningBalance = null) {
  const isUchenna = employeeNumber === "ZLL000053";
  const employeeId = isUchenna ? "employee-053" : "employee-046";
  const designationLevel = { levelNumber: 202, code: "L2", isActive: true };
  const assignedLevel = overrideLevel === 201 ? { levelNumber: 201, code: "L1", isActive: true } : designationLevel;
  const employee = {
    id: employeeId, employeeNumber, firstName: isUchenna ? "Uchenna" : "Kpokou",
    lastName: "Michael", gender: "MALE", employmentType: "Full-Time",
    designation: { id: "designation-" + employeeId, code: "JOB", name: "Staff", careerLevel: 202,
      employmentLevel: designationLevel, reportsToDesignation: null }
  };
  const balanceStore = new Map(), allocationStore = new Map();
  const writes = [];
  if (existingOpeningBalance != null) balanceStore.set("annual", {id:"existing-balance",openingBalance:existingOpeningBalance,used:0});
  const tx = {
    organizationAudit: { create: async ({data}) => {writes.push({kind:"audit",data});return {id:"audit-id",...data};} },
    organization: { findUnique: async () => ({id:ORG,slug:"zermatt-liquor-limited",name:"Zermatt"}) },
    employee: { findFirst: async ({where}) => (where.employeeNumber === employeeNumber || where.OR?.some(x=>x.id===employeeId)) ? employee : null },
    employeeEmploymentLevelAssignment: { findFirst: async () => overrideLevel == null ? null : ({
      id: "override-053", levelNumber: overrideLevel, effectiveFrom: new Date("2026-11-17T00:00:00Z"),
      effectiveTo: null, reason: "HR approved", createdAt: new Date(), employmentLevel: assignedLevel, performedBy:null
    }) },
    leaveBalance: {
      findUnique: async () => balanceStore.get("annual") || null,
      upsert: async ({update,create}) => {
        writes.push({kind:"balance",update,create});
        const existing=balanceStore.get("annual");
        if (existing) return existing;
        const next={id:"new-balance",openingBalance:create.openingBalance,used:0};
        balanceStore.set("annual",next);
        return next;
      }
    },
    leaveEntitlementAllocation: {
      findFirst: async () => allocationStore.get("annual") || null,
      create: async ({data}) => {
        writes.push({kind:"allocation",data});
        const row={id:"new-allocation",...data};
        allocationStore.set("annual",row);return row;
      }
    }
  };
  const configuredPolicies=[{
    hierarchyVersion:"V3", definition:POLICY_DEFINITIONS[0],
    leaveType:{id:"annual-type"}, policy:{id:"annual-policy",code:"ZLL-ANNUAL-FT",name:"Annual"}
  }];
  const run=()=>provisionZermattEmployeeLeaveProfile({organizationId:ORG,employeeNumber,leaveYear:2026,
    actorUserId:null,tx,configuredPolicies});
  return {run,writes,balanceStore,allocationStore};
}

test("approved full 2026 annual leave creates exact balance, effective-dated allocation, and is idempotent",async()=>{
  for(const [number,override,days,level] of [["ZLL000046",null,16,202],["ZLL000053",201,14,201]]){
    const f=fixture(number,override);
    const first=await f.run();
    assert.equal(first.levelNumber,level);
    assert.equal(first.allocations[0].entitlement,days);
    assert.equal(f.balanceStore.get("annual").openingBalance,days);
    assert.equal(f.allocationStore.get("annual").allocatedEntitlement,days);
    assert.equal(f.allocationStore.get("annual").effectiveDate.toISOString(),"2026-11-17T00:00:00.000Z");
    await f.run();
    assert.equal(f.writes.filter(x=>x.kind==="allocation").length,1,"no duplicate allocation");
    const audits=f.writes.filter(x=>x.kind==="audit");
    assert.equal(audits.length,1,"create one audit per first allocation");
    assert.equal(audits[0].data.action,"APPROVED_FULL_TIME_CONVERSION_LEAVE_ALLOCATED");
    assert.equal(audits[0].data.newValue.allocatedEntitlement,days);
    assert.equal(audits[0].data.newValue.proration,"NONE");
    assert.equal(f.writes.filter(x=>x.kind==="balance").length,2,"balance upsert is repeatable");
    assert.deepEqual(f.writes.filter(x=>x.kind==="balance")[1].update,{},"do not overwrite an existing balance");
  }
});

test("Uchenna cannot receive annual leave until individually assigned L1",async()=>{
  const f=fixture("ZLL000053");
  await assert.rejects(f.run(),{message:"APPROVED_EMPLOYMENT_LEVEL_MAPPING_REQUIRED"});
  assert.equal(f.writes.length,0);
});

test("existing conflicting balance is held for review without mutating leave ledger",async()=>{
  const f=fixture("ZLL000046",null,10);
  await assert.rejects(f.run(),{message:"APPROVED_CONVERSION_EXISTING_LEAVE_BALANCE_REVIEW_REQUIRED"});
  assert.equal(f.writes.length,0);
});
