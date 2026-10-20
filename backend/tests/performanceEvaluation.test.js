"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const R=require("../src/services/performanceEvaluationRules");
const S=require("../src/services/performanceEvaluationService");
const ORG="synthetic-zermatt";
function goals(){return [
  {id:"results",category:"results",title:"Role delivery",weight:60,target:"Approved target",measurement:"Approved output",evidence:"Verified output record",anchors:["Material failure","Below target","Meets target","Above target","Exceptional"]},
  {id:"quality",category:"quality",title:"Quality",weight:20,target:"Approved quality",measurement:"Quality checklist",evidence:"Independent quality check",anchors:["Material failure","Below target","Meets target","Above target","Exceptional"]},
  {id:"teamwork",category:"teamwork",title:"Teamwork",weight:20,target:"Approved conduct",measurement:"Observable collaboration",evidence:"Documented behaviour examples",anchors:["Material failure","Below target","Meets target","Above target","Exceptional"]}
];}
function ratings(values=[3,4,4]){return goals().map((g,i)=>({goalId:g.id,rating:values[i],evidence:"Verified evidence "+g.id}));}
function auth(id="hr"){return {organizationId:ORG,userId:id,permissions:["performance.manage"],locationScope:"ALL_LOCATIONS",availableLocations:[]};}
function mock(){
  process.env.CHRIS_PE_ENABLED="true";process.env.CHRIS_PE_ORGANIZATION_IDS=ORG;
  const rows=[],employees=[
    {id:"employee",organizationId:ORG,employeeNumber:"SYN-001",firstName:"Synthetic",lastName:"Storekeeper",designationId:"role",status:"ACTIVE",exitDate:null,locationId:"branch"},
    {id:"manager",organizationId:ORG,employeeNumber:"SYN-002",status:"ACTIVE",exitDate:null,locationId:"branch"}
  ];
  const users=[{id:"hr",employeeId:null,isActive:true},{id:"employee-user",employeeId:"employee",isActive:true},{id:"manager-user",employeeId:"manager",isActive:true},{id:"appeal-user",employeeId:null,isActive:true}];
  const assignments=[{employeeId:"employee",managerEmployeeId:"manager",manager:employees[1]}];
  const match=(row,where)=>Object.entries(where||{}).every(([k,v])=>{
    if(k==="organizationId") return v===ORG;
    if(v&&typeof v==="object"&&"in" in v)return v.in.includes(row[k]);
    if(v&&typeof v==="object"&&"lte" in v)return true;
    if(k==="effectiveTo")return true;
    return row[k]===v;
  });
  const roles=[{id:"role",name:"Storekeeper",description:"Maintain inventory records and reconcile receipts.",isActive:true}];
  const db={
    organization:{findFirst:async w=>w.where.id===ORG?{id:ORG,slug:"zermatt-liquor-limited",status:"ACTIVE"}:null},
    organizationAudit:{
      findMany:async({where})=>rows.filter(row=>match(row,where)),
      create:async({data})=>{const r={...data,id:"event-"+rows.length,createdAt:new Date().toISOString()};rows.push(r);return r;}
    },
    user:{findFirst:async({where})=>users.find(u=>match(u,where))||null,findMany:async()=>users},
    employee:{findMany:async()=>employees.filter(e=>e.id==="employee"),findFirst:async({where})=>employees.find(e=>match(e,where))||null},
    designation:{findMany:async()=>roles,findFirst:async({where})=>roles.find(r=>r.id===where.id)||null},
    employeeLineManagerAssignment:{findMany:async({where})=>assignments.filter(a=>match(a,where)),findFirst:async({where})=>assignments.find(a=>match(a,where))||null},
    $queryRawUnsafe:async()=>[],
    $transaction:async fn=>fn(db)
  };
  function seed(id,value){rows.push({organizationId:ORG,entityType:"ZermattPerformanceEvaluation",entityId:id,newValue:{...value,revision:1},id:"seed-"+rows.length,createdAt:"2000-01-01"});}
  return {db,rows,seed,users,employees,assignments,roles};
}
test("Storekeeper 3.4 is Meets expectations; boundary 3.5 is Exceeds",()=>{
  assert.deepEqual(R.score(goals(),ratings()),{score:3.4,band:"Meets expectations"});
  const gs=goals();gs[0].weight=30;gs.splice(1,0,{...gs[0],id:"results2",weight:30});
  assert.equal(R.score(gs,[{goalId:"results",rating:3,evidence:"a"},{goalId:"results2",rating:4,evidence:"b"},{goalId:"quality",rating:4,evidence:"c"},{goalId:"teamwork",rating:3,evidence:"d"}]).band,"Exceeds expectations");
});
test("rejects missing evidence, duplicate scores and wrong category weights",()=>{
  assert.throws(()=>R.score(goals(),ratings().map(r=>({...r,evidence:""}))));
  assert.throws(()=>R.score(goals(),[ratings()[0],ratings()[0],ratings()[2]]));
  const gs=goals();gs[0].weight=59;assert.throws(()=>R.validateGoals(gs));
  assert.throws(()=>R.assertPublishable(R.draftGoals()));
});
test("calendar boundaries use Africa/Lagos and end dates cross the year correctly",()=>{
  assert.equal(R.quarter(new Date("2026-12-31T23:30:00Z")).key,"2027-Q1");
  assert.equal(R.quarter(new Date("2026-03-31T22:30:00Z")).key,"2026-Q1");
  assert.equal(R.plusDays("2026-12-31",7),"2027-01-07");
});
test("disabled tenant exposes no review data and cannot publish policy",async()=>{
  const {db}=mock();process.env.CHRIS_PE_ENABLED="false";
  assert.deepEqual(await S.workspace(db,auth()),{enabled:false});
  await assert.rejects(()=>S.publishPolicy(db,auth()),/not enabled/);
});
test("role generation covers registered roles, skips existing drafts, and publication freezes standards",async()=>{
  const {db}=mock();
  let calls=0;
  await S.generateStandards(db,auth(),async()=>{calls++;return {source:"SYNTHETIC_TEST",goals:goals()};});
  await S.generateStandards(db,auth(),async()=>{calls++;return {source:"SYNTHETIC_TEST",goals:goals()};});
  assert.equal(calls,1);
  const ws=await S.workspace(db,auth()),t=ws.templates[0];
  await S.saveTemplate(db,auth(),t.id,{goals:goals(),publish:true,reason:"Validated synthetic standard"});
  await assert.rejects(()=>S.saveTemplate(db,auth(),t.id,{goals:goals(),publish:true,reason:"change"}),/immutable/);
});
test("cycle opening is idempotent, snapshots standards, and late scheduler startup never backdates",async()=>{
  const {db}=mock();
  await S.publishPolicy(db,auth());
  await S.generateStandards(db,auth(),async()=>({source:"TEST",goals:goals()}));
  const template=(await S.workspace(db,auth())).templates[0];
  await S.saveTemplate(db,auth(),template.id,{goals:goals(),publish:true,reason:"Validated"});
  const late=await S.tick(db,ORG,{now:new Date("2200-01-10T12:00:00Z")});
  assert.equal(late.opened,false);
  await S.tick(db,ORG,{now:new Date("2200-01-10T12:00:00Z"),manual:true});
  await S.tick(db,ORG,{now:new Date("2200-01-10T12:00:00Z"),manual:true});
  const ws=await S.workspace(db,auth());
  assert.equal(ws.cycles.length,1);assert.equal(ws.reviews.length,1);
  assert.equal(ws.reviews[0].effectiveFrom,"2200-01-10");
  assert.equal(ws.reviews[0].goals[0].weight,60);
  assert.equal(ws.reviews[0].policyVersion,R.POLICY.version);
  assert.equal(ws.notifications.filter(n=>n.message.includes("No cycle exists")).length,1);
});
function seededReview(m){
  m.seed("review:test",{kind:"review",id:"review:test",employeeId:"employee",employeeNumber:"SYN-001",managerEmployeeId:"manager",
    status:"GOALS_PUBLISHED",endDate:"2000-01-01",goals:goals(),policy:R.POLICY,deadlines:{self:"2000-01-08",manager:"2000-01-15",hr:"2000-01-22"}});
}
test("ESS identity and current reporting line enforce self-review and manager boundaries",async()=>{
  const m=mock();seededReview(m);
  await assert.rejects(()=>S.transition(m.db,{...auth("manager-user"),employeeId:"manager"},"review:test","self",{comments:"x",evidence:"x"},true),/Only the employee/);
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","self",{comments:"Achievements",evidence:"Evidence"},true);
  await assert.rejects(()=>S.transition(m.db,auth(),"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"}),/line manager/);
  await S.transition(m.db,auth("manager-user"),"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"});
  const own=await S.workspace(m.db,{...auth("employee-user"),employeeId:"employee"},true);
  assert.equal(own.reviews[0].managerAssessment,undefined);
  assert.equal(own.reviews[0].finalScore,undefined);
  await assert.rejects(()=>S.transition(m.db,auth("manager-user"),"review:test","finalise",{comments:"approve"}),/independent/);
  await S.transition(m.db,auth(),"review:test","finalise",{comments:"Evidence validated"});
  const released=await S.workspace(m.db,{...auth("employee-user"),employeeId:"employee"},true);
  assert.equal(released.reviews[0].finalScore.score,3.4);
});
test("dispute routes to independent reviewer and cannot be decided by original HR",async()=>{
  const m=mock();seededReview(m);
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","self",{comments:"Achievements",evidence:"Evidence"},true);
  await S.transition(m.db,auth("manager-user"),"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"});
  await S.transition(m.db,auth(),"review:test","finalise",{comments:"Validated"});
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","dispute",{comments:"Evidence missing"},true);
  await assert.rejects(()=>S.transition(m.db,auth(),"review:test","assign-appeal",{reviewerUserId:"hr"}),/independent/);
  await S.transition(m.db,auth(),"review:test","assign-appeal",{reviewerUserId:"appeal-user"});
  await assert.rejects(()=>S.transition(m.db,auth(),"review:test","appeal",{comments:"Upheld"}),/designated/);
  await S.transition(m.db,auth("appeal-user"),"review:test","appeal",{comments:"Reviewed evidence; rating upheld"});
  assert.equal((await S.workspace(m.db,auth())).reviews[0].status,"CLOSED");
});
test("branch-limited manager cannot assess a report outside available locations",async()=>{
  const m=mock();seededReview(m);
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","self",{comments:"x",evidence:"y"},true);
  await assert.rejects(()=>S.transition(m.db,{...auth("manager-user"),locationScope:"ASSIGNED_LOCATIONS",availableLocations:[{id:"other"}]},"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"}),/line manager/);
});
test("stale event ordering cannot overwrite the latest revision",async()=>{
  const m=mock();seededReview(m);
  const latest={...m.rows[0].newValue,revision:9,status:"RELEASED"};
  m.rows.unshift({...m.rows[0],newValue:latest});
  const state=await S.state(m.db,ORG);
  assert.equal(state.get("review:test").status,"RELEASED");
});

test("missing role descriptions cannot become published scorecards",async()=>{
  const m=mock();m.roles[0].description=null;
  await S.generateStandards(m.db,auth(),async()=>{throw new Error("must not call provider");});
  const t=(await S.workspace(m.db,auth())).templates[0];
  await assert.rejects(()=>S.saveTemplate(m.db,auth(),t.id,{goals:goals(),publish:true,reason:"publish"}),/job description/);
});
test("a tenant not in the rollout allowlist cannot mutate or read Zermatt reviews",async()=>{
  const m=mock();seededReview(m);
  assert.deepEqual(await S.workspace(m.db,{...auth(),organizationId:"another-tenant"}),{enabled:false});
  await assert.rejects(()=>S.transition(m.db,{...auth(),organizationId:"another-tenant"},"review:test","finalise",{comments:"x"}),/not enabled/);
});
test("manager reassignment invalidates an unreleased manager assessment and preserves self-review",async()=>{
  const m=mock();seededReview(m);
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","self",{comments:"x",evidence:"y"},true);
  await S.transition(m.db,auth("manager-user"),"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"});
  m.employees.push({id:"new-manager",organizationId:ORG,status:"ACTIVE",exitDate:null,locationId:"branch"});
  m.users.push({id:"new-manager-user",employeeId:"new-manager",isActive:true});
  m.assignments[0].managerEmployeeId="new-manager";m.assignments[0].manager=m.employees[2];
  await S.transition(m.db,auth(),"review:test","reassign",{comments:"Reporting line changed"});
  const r=(await S.workspace(m.db,auth())).reviews[0];
  assert.equal(r.managerAssessment,null);assert.equal(r.status,"MANAGER_PENDING");
  assert.equal(r.selfAssessment.comments,"x");
  await assert.rejects(()=>S.transition(m.db,auth("manager-user"),"review:test","manager",{ratings:ratings(),discussion:"x",development:"y"}),/line manager/);
});
test("a development follow-up never changes a validated rating",async()=>{
  const m=mock();seededReview(m);
  await S.transition(m.db,{...auth("employee-user"),employeeId:"employee"},"review:test","self",{comments:"x",evidence:"y"},true);
  await S.transition(m.db,auth("manager-user"),"review:test","manager",{ratings:ratings(),discussion:"Discussed",development:"Training"});
  await S.transition(m.db,auth(),"review:test","finalise",{comments:"Validated"});
  await S.transition(m.db,auth("manager-user"),"review:test","follow-up",{comments:"Training completed with evidence",followUpStatus:"COMPLETED",followUpDate:"2026-12-31"});
  const r=(await S.workspace(m.db,auth())).reviews[0];
  assert.equal(r.finalScore.score,3.4);assert.equal(r.followUp.status,"COMPLETED");
});

test("unknown category names cannot add uncounted score weight",()=>{
  const gs=goals();gs.push({...gs[0],id:"extra",category:"__proto__",weight:10});
  assert.throws(()=>R.validateGoals(gs));
});
