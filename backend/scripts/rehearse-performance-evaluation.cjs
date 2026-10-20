"use strict";
// Synthetic local rehearsal only. Never point this script at a shared, staging-cloud or production database.
const assert=require("node:assert/strict");
const path=require("node:path");
const fs=require("node:fs");
const crypto=require("node:crypto");
const url=new URL(process.env.DATABASE_URL||"http://invalid");
if(url.hostname!=="127.0.0.1"||url.port!=="55440"||url.pathname!=="/chris_pe_staging") throw new Error("Rehearsal requires the dedicated loopback test database.");
process.env.JWT_SECRET=crypto.randomBytes(48).toString("hex");
process.env.CHRIS_PE_ENABLED="true";
process.env.CHRIS_PE_SCHEDULER_ENABLED="false";
process.env.OPENAI_API_KEY="";
const prisma=require("../src/config/prisma");
const bcrypt=require("bcryptjs");
const S=require("../src/services/performanceEvaluationService");
const R=require("../src/services/performanceEvaluationRules");
const report={synthetic:true,source:"PR #140 candidate with route-shell import and explicit cycle labels",checks:[],startedAt:new Date().toISOString()};
const root=path.resolve(__dirname,"../..");
const dataRoot=path.resolve(process.env.CHRIS_PE_REHEARSAL_OUTPUT||path.join(root,"../chris-pe-testdata-140"));
let server,browser;
function check(name){report.checks.push({name,passed:true});console.log("PASS "+name);}
function goals(role){return [
 {id:"results",category:"results",title:role==="Storekeeper"?"Stock record accuracy":"Warehouse team control",weight:60,
 target:"Synthetic target: all assigned daily reconciliation checklists completed",measurement:"Completed assigned checklists / due checklists",
 evidence:"Synthetic daily reconciliation register",anchors:["Below 50%","50–79%","80–94%","95–99%","100%"]},
 {id:"quality",category:"quality",title:"Quality and service",weight:20,target:"Synthetic target: verified quality checks meet the approved sample standard",
 measurement:"Independent sample quality checklist",evidence:"Synthetic independent quality sampling log",
 anchors:["Critical repeated errors","Repeated correctable errors","Acceptable sample quality","Consistently strong sample quality","Exceptional verified sample quality"]},
 {id:"teamwork",category:"teamwork",title:"Teamwork and conduct",weight:20,target:"Synthetic target: complete agreed shift handovers respectfully",
 measurement:"Observed handover checklist",evidence:"Synthetic handover observation log",
 anchors:["Repeated serious handover failures","Frequent incomplete handovers","Expected handovers completed","Supports others proactively","Consistent exemplary handovers and support"]}
];}
function ratings(gs,values=[3,4,4]){return gs.map((g,i)=>({goalId:g.id,rating:values[i],evidence:"Synthetic verified evidence for "+g.id}));}
async function request(endpoint,token,body,method=body===undefined?"GET":"POST",expected=200){
 const response=await fetch("http://127.0.0.1:55441"+endpoint,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();
 assert.equal(response.status,expected,endpoint+" "+response.status+" "+JSON.stringify(result));
 return result.data;
}
async function main(){
 if(await prisma.organization.findUnique({where:{slug:"zermatt-liquor-limited"}}))throw new Error("Synthetic tenant already exists; do not overwrite a previous rehearsal.");
 const org=await prisma.organization.create({data:{slug:"zermatt-liquor-limited",name:"Zermatt Liquor Limited — Synthetic PE Rehearsal",legalName:"SYNTHETIC PE REHEARSAL ONLY",status:"ACTIVE"}});
 const otherOrg=await prisma.organization.create({data:{slug:"pe-unrelated-synthetic",name:"Unrelated synthetic tenant",status:"ACTIVE"}});
 process.env.CHRIS_PE_ORGANIZATION_IDS=org.id;
 const branch=await prisma.organizationLocation.create({data:{organizationId:org.id,name:"Synthetic Abuja",code:"SYN-ABJ"}});
 const otherBranch=await prisma.organizationLocation.create({data:{organizationId:org.id,name:"Synthetic Lagos",code:"SYN-LAG"}});
 const dept=await prisma.department.create({data:{organizationId:org.id,name:"Synthetic Warehouse"}});
 const storeRole=await prisma.designation.create({data:{organizationId:org.id,departmentId:dept.id,name:"Storekeeper",description:"Synthetic role: reconcile receipts, issues and stock records; provide complete shift handovers."}});
 const managerRole=await prisma.designation.create({data:{organizationId:org.id,departmentId:dept.id,name:"Warehouse Manager",description:"Synthetic role: supervise warehouse reconciliations, quality controls and team handovers."}});
 const missingRole=await prisma.designation.create({data:{organizationId:org.id,name:"Synthetic missing job description"}});
 const emp=await prisma.employee.create({data:{organizationId:org.id,employeeNumber:"SYN-001",firstName:"Synthetic",lastName:"Storekeeper",designationId:storeRole.id,departmentId:dept.id,locationId:branch.id}});
 const emp2=await prisma.employee.create({data:{organizationId:org.id,employeeNumber:"SYN-002",firstName:"Synthetic",lastName:"Storekeeper Two",designationId:storeRole.id,departmentId:dept.id,locationId:branch.id}});
 const mgr=await prisma.employee.create({data:{organizationId:org.id,employeeNumber:"SYN-MGR",firstName:"Synthetic",lastName:"Manager",designationId:managerRole.id,departmentId:dept.id,locationId:branch.id}});
 await prisma.employeeLineManagerAssignment.create({data:{organizationId:org.id,employeeId:emp.id,managerEmployeeId:mgr.id,effectiveFrom:new Date("2020-01-01")}});
 const password="Synthetic-"+crypto.randomBytes(18).toString("hex");
 const hash=await bcrypt.hash(password,10);
 async function makeUser(name,employeeId=null,organizationId=org.id,manage=false,scope="ALL_LOCATIONS"){
  const u=await prisma.user.create({data:{organizationId,email:name+"@example.invalid",passwordHash:hash,firstName:"Synthetic",lastName:name,employeeId,locationScope:scope}});
  const role=await prisma.role.create({data:{organizationId,name:"SYN-"+name}});
  for(const k of ["dashboard.view","performance.view","employees.view",...(manage?["performance.manage"]:[])]){
   const p=await prisma.permission.upsert({where:{key:k},create:{key:k,name:k},update:{}});
   await prisma.rolePermission.create({data:{roleId:role.id,permissionId:p.id}});
  }
  await prisma.userRole.create({data:{userId:u.id,roleId:role.id}});
  return u;
 }
 const hr=await makeUser("hr",null,org.id,true),manager=await makeUser("manager",mgr.id),employee=await makeUser("employee",emp.id),employee2=await makeUser("employee2",emp2.id);
 const reviewer=await makeUser("appeal"),outsider=await makeUser("outsider",null,otherOrg.id);
 const app=require("../src/app"),express=require("express");
 app.use((req,res,next)=>{if(!req.path.startsWith("/api/"))res.removeHeader("Content-Security-Policy");next();});
 app.use(express.static(path.join(root,"dist")));
 app.get(/.*/,(_req,res)=>res.sendFile(path.join(root,"dist/index.html")));
 server=await new Promise(resolve=>{const s=app.listen(55441,"127.0.0.1",()=>resolve(s));});
 const logins={};
 for(const u of [hr,manager,employee,employee2,reviewer,outsider]){
  logins[u.id]=await request("/api/auth/login",null,{email:u.email,password,organizationSlug:u.organizationId===otherOrg.id?otherOrg.slug:org.slug});
 }
 const ht=logins[hr.id].token,mt=logins[manager.id].token,at=logins[reviewer.id].token;
 const es=await request("/api/ess/login",null,{email:employee.email,password,organizationSlug:org.slug});
 const es2=await request("/api/ess/login",null,{email:employee2.email,password,organizationSlug:org.slug});
 const et=es.token,et2=es2.token;
 await request("/api/performance-evaluation/workspace",null,undefined,"GET",401);
 await request("/api/performance-evaluation/workspace",et,undefined,"GET",401);
 assert.equal((await request("/api/performance-evaluation/workspace",logins[outsider.id].token)).enabled,false);
 check("Authenticated tenant and ESS/admin-session isolation");
 await request("/api/performance-evaluation/policy/publish",ht,{});
 await request("/api/performance-evaluation/standards/generate",ht,{});
 let ws=await request("/api/performance-evaluation/workspace",ht);
 assert.equal(ws.templates.length,3);
 for(const t of ws.templates){
  if(t.roleId===missingRole.id){await request("/api/performance-evaluation/standards/"+encodeURIComponent(t.id),ht,{goals:goals("Storekeeper"),publish:true,reason:"Synthetic missing description rejection"},"PUT",400);continue;}
  await request("/api/performance-evaluation/standards/"+encodeURIComponent(t.id),ht,{goals:goals(t.roleName),publish:true,reason:"Synthetic role standard validated"},"PUT");
 }
 check("Role coverage, missing-description rejection, published 60/20/20 goals");
 await Promise.all(Array.from({length:4},()=>request("/api/performance-evaluation/agent/open",ht,{})));
 ws=await request("/api/performance-evaluation/workspace",ht);
 assert.equal(ws.cycles.length,1);assert.equal(ws.reviews.length,1);
 assert.equal(ws.cycles[0].exceptions.some(e=>e.employeeId===emp2.id),true);
 const physicalCards=await prisma.organizationAudit.count({where:{organizationId:org.id,entityType:"ZermattPerformanceEvaluation",action:"PE_REVIEW"}});
 assert.equal(physicalCards,1);
 const mws=await request("/api/performance-evaluation/workspace",mt);
 assert.equal(mws.reviews.length,1);assert.equal(mws.notifications.filter(n=>n.message.includes("Quarterly scorecard")).length,1);
 check("Four concurrent opens produce one cycle/card and one manager notification");
 await prisma.employeeLineManagerAssignment.create({data:{organizationId:org.id,employeeId:emp2.id,managerEmployeeId:mgr.id,effectiveFrom:new Date("2020-01-01")}});
 await request("/api/performance-evaluation/agent/open",ht,{});
 ws=await request("/api/performance-evaluation/workspace",ht);
 assert.equal(ws.reviews.length,2);
 const activeReview=ws.reviews.find(r=>r.employeeId===emp.id);
 await request("/api/performance-evaluation/ess/reviews/"+encodeURIComponent(activeReview.id)+"/self",et,{comments:"Too early",evidence:"Synthetic"},"POST",409);
 check("Prospective exception reconciliation and premature review rejection");
 // A completed-period synthetic fixture enables full review rehearsal without changing the computer clock.
 const cy={...ws.cycles[0],id:"cycle:SYNTHETIC-COMPLETED",key:"SYNTHETIC-COMPLETED",end:"2000-01-01",deadlines:{self:"2000-01-08",manager:"2000-01-15",hr:"2000-01-22"},revision:1,synthetic:true};
 await prisma.organizationAudit.create({data:{organizationId:org.id,actorUserId:hr.id,entityType:"ZermattPerformanceEvaluation",entityId:cy.id,action:"PE_CYCLE",newValue:cy,reason:"Completed-period synthetic rehearsal fixture only"}});
 const completed=[];
 for(const r of ws.reviews){
  const v={...r,id:"review:SYNTHETIC-COMPLETED:"+r.employeeId,cycleId:cy.id,status:"GOALS_PUBLISHED",endDate:"2000-01-01",deadlines:cy.deadlines,revision:1,synthetic:true};
  delete v.actions;
  await prisma.organizationAudit.create({data:{organizationId:org.id,actorUserId:hr.id,entityType:"ZermattPerformanceEvaluation",entityId:v.id,action:"PE_REVIEW",newValue:v,reason:"Completed-period synthetic rehearsal fixture only"}});
  completed.push(v);
 }
 const r1=completed.find(r=>r.employeeId===emp.id),r2=completed.find(r=>r.employeeId===emp2.id);
 const route=(r,a,ess=false)=>"/api/performance-evaluation/"+(ess?"ess/":"")+"reviews/"+encodeURIComponent(r.id)+"/"+a;
 await request(route(r1,"self",true),et2,{comments:"Wrong identity",evidence:"Synthetic"},"POST",403);
 for(const [r,token] of [[r1,et],[r2,et2]])await request(route(r,"self",true),token,{comments:"Synthetic achievements",evidence:"Synthetic reconciliation evidence"});
 await request(route(r1,"manager"),ht,{ratings:ratings(r1.goals),discussion:"Synthetic discussion",development:"Synthetic training"},"POST",403);
 const managerBody={ratings:ratings(r1.goals),discussion:"Synthetic feedback discussion recorded",development:"Synthetic documentation refresher with manager follow-up"};
 await request(route(r1,"manager"),mt,managerBody);
 let own=await request("/api/performance-evaluation/ess",et);
 assert.equal(own.reviews.find(r=>r.id===r1.id).finalScore,undefined);
 await request(route(r1,"finalise"),mt,{comments:"Self approval"},"POST",403);
 await request(route(r1,"return"),ht,{comments:"Include clearer evidence"});
 await request(route(r1,"manager"),mt,managerBody);
 await request(route(r1,"finalise"),ht,{comments:"Synthetic evidence validated"});
 await request(route(r1,"acknowledge",true),et,{comments:"Receipt acknowledged"});
 await request(route(r1,"follow-up"),mt,{comments:"Synthetic refresher completed",followUpStatus:"COMPLETED",followUpDate:"2026-12-31"});
 ws=await request("/api/performance-evaluation/workspace",ht);
 const final1=ws.reviews.find(r=>r.id===r1.id);
 assert.equal(final1.finalScore.score,3.4);assert.equal(final1.finalScore.band,"Meets expectations");assert.equal(final1.followUp.status,"COMPLETED");
 check("Self-review → manager → HR return/resubmit → release → acknowledgment → follow-up");
 await request(route(r2,"manager"),mt,{...managerBody,ratings:ratings(r2.goals)});
 await request(route(r2,"finalise"),ht,{comments:"Synthetic evidence validated"});
 await request(route(r2,"dispute",true),et2,{comments:"Synthetic missing evidence dispute"});
 await request(route(r2,"assign-appeal"),ht,{reviewerUserId:hr.id},"POST",400);
 await request(route(r2,"assign-appeal"),ht,{reviewerUserId:reviewer.id});
 await request(route(r2,"appeal"),ht,{comments:"Unauthorized original reviewer"},"POST",403);
 await request(route(r2,"appeal"),at,{comments:"Synthetic independent evidence review; revised rating",ratings:ratings(r2.goals,[4,4,4])});
 const final2=(await request("/api/performance-evaluation/ess",et2)).reviews.find(r=>r.id===r2.id);
 assert.equal(final2.finalScore.score,4);assert.equal(final2.status,"CLOSED");
 check("Independent appeal, evidence-supported score correction and retained outcome");
 const before=(await request("/api/performance-evaluation/workspace",ht)).notifications.length;
 await Promise.all([S.tick(prisma,org.id),S.tick(prisma,org.id)]);
 const after=(await request("/api/performance-evaluation/workspace",ht)).notifications.length;
 assert.equal(before,after);
 check("Repeated agent ticks do not duplicate same-day notifications");
 await prisma.user.update({where:{id:manager.id},data:{locationScope:"ASSIGNED_LOCATIONS"}});
 await prisma.userLocation.create({data:{organizationId:org.id,userId:manager.id,locationId:otherBranch.id}});
 const restricted=await request("/api/performance-evaluation/workspace",mt);
 assert.equal(restricted.reviews.length,0);
 await prisma.user.update({where:{id:manager.id},data:{locationScope:"ALL_LOCATIONS"}});
 check("Real HTTP branch authorization excludes unrelated reports");
 if(process.env.CHRIS_PE_BROWSER_MODULE){
  const {chromium}=require(process.env.CHRIS_PE_BROWSER_MODULE);
  browser=await chromium.launch({channel:"chrome",headless:true});
  const errors=[];
  async function pageFor(login,ess=false,viewport={width:1280,height:900}){
   const context=await browser.newContext({viewport});
   await context.addInitScript(({login,ess})=>{
    if(ess){localStorage.setItem("chris_ess_token",login.token);}
    else{
     localStorage.setItem("chris_token",login.token);
     localStorage.setItem("chris_user",JSON.stringify(login.user));
     localStorage.setItem("chris_organization",JSON.stringify(login.organization));
    }
   },{login,ess});
   const page=await context.newPage();
   page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:55441"+(ess?"/ess":"/performance"),{waitUntil:"networkidle"});
   await page.getByRole("heading",{name:"Quarterly performance evaluation",exact:true}).waitFor();
   return page;
  }
  const hrpage=await pageFor(logins[hr.id]);
  await hrpage.getByText("HR AI Performance Evaluation Agent",{exact:true}).waitFor();
  await hrpage.getByText(/Performance evaluation rules and HR policy/).click();
  assert.equal(await hrpage.getByText("Zermatt Liquor Limited — Quarterly Performance Evaluation Policy",{exact:true}).isVisible(),true);
  await hrpage.screenshot({path:path.join(dataRoot,"hr-performance-desktop.png"),fullPage:true});
  const managerpage=await pageFor(logins[manager.id]);
  assert.equal(await managerpage.getByText(/My performance notifications/).isVisible(),true);
  const employeePage=await pageFor(es,true,{width:390,height:844});
  await employeePage.getByText("Goals, weights and scoring evidence",{exact:true}).first().click();
  assert.equal(await employeePage.getByText(/Stock record accuracy/).first().isVisible(),true);
  assert.equal(await employeePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await employeePage.screenshot({path:path.join(dataRoot,"ess-performance-mobile.png"),fullPage:true});
  const forbiddenActions=employeePage.getByRole("button",{name:/Publish evaluation policy|Generate missing role standards|Validate and release/});
  assert.equal(await forbiddenActions.count(),0);
  assert.deepEqual(errors,[]);
  check("Real Chromium HR, manager and mobile ESS pages; policy visibility and no page errors");
  await browser.close();browser=null;
 }
 report.completedAt=new Date().toISOString();
 fs.writeFileSync(path.join(dataRoot,"rehearsal-results.json"),JSON.stringify(report,null,2));
 console.log("REHEARSAL PASSED: "+report.checks.length+" database/API/browser checks. Synthetic data only.");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{
 if(browser)await browser.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await prisma.$disconnect();
});
