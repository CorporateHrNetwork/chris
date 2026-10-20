"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(process.env.CHRIS_PE_BROWSER_MODULE);
const out=process.env.CHRIS_PE_REHEARSAL_OUTPUT;
let browser;
(async()=>{
 const dbUrl=new URL(process.env.DATABASE_URL||"http://invalid");
 if(dbUrl.hostname!=="127.0.0.1"||dbUrl.port!=="55440"||dbUrl.pathname!=="/chris_pe_staging")throw Error("Dedicated loopback fixture database required.");
 const db=require("../src/config/prisma");
 const org=await db.organization.findUnique({where:{slug:"zermatt-liquor-limited"}});
 if(org?.legalName!=="SYNTHETIC PE REHEARSAL ONLY")throw Error("Synthetic marker missing.");
 const state=await require("../src/services/performanceEvaluationService").state(db,org.id);
 const fixture=[...state.values()].find(v=>v.kind==="review"&&v.cycleId==="cycle:SYNTHETIC-INTERACTIVE");
 if(!fixture)throw Error("Start the synthetic review server first.");
 await db.organizationAudit.create({data:{organizationId:org.id,entityType:"ZermattPerformanceEvaluation",entityId:fixture.id,action:"PE_REVIEW",
  newValue:{...fixture,revision:fixture.revision+1,status:"GOALS_PUBLISHED",selfAssessment:null,managerAssessment:null,finalScore:null,hrComment:null,employeeResponse:null,appeal:null,followUp:null},
  reason:"Reset dedicated synthetic interactive fixture for browser rehearsal"}});
 await db.$disconnect();
 if(process.env.CHRIS_PE_BROWSER_RESET_ONLY==="true"){console.log("Synthetic interactive fixture reset for review.");return;}
 browser=await chromium.launch({channel:"chrome",headless:true});
 const errors=[],checks=[];
 async function open(role,viewport={width:1280,height:900}){
  const context=await browser.newContext({viewport}),page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  try{
   await page.goto("http://127.0.0.1:55441/rehearsal/role/"+role,{waitUntil:"networkidle"});
   await page.getByRole("heading",{name:"Quarterly performance evaluation",exact:true}).waitFor({timeout:15000});
  }catch(e){
   console.log("Browser role failed: "+role+" at "+page.url());
   console.log("Visible text: "+(await page.locator("body").innerText()).slice(0,2000));
   console.log("Page errors: "+JSON.stringify(errors));
   await page.screenshot({path:path.join(out,"failed-"+role+".png"),fullPage:true});
   throw e;
  }
  return page;
 }
 function check(name){checks.push({name,passed:true});console.log("PASS "+name);}
 const hr=await open("hr");
 await hr.getByText(/Performance evaluation rules and HR policy/).click();
 assert.equal(await hr.getByText("Zermatt Liquor Limited — Quarterly Performance Evaluation Policy",{exact:true}).isVisible(),true);
 await hr.screenshot({path:path.join(out,"hr-performance-desktop.png"),fullPage:true});
 check("HR sees the published rules and agent controls in the application");
 const employee=await open("employee",{width:390,height:844});
 assert.equal(await employee.getByRole("button",{name:/Publish evaluation policy|Generate missing role standards|Validate and release/}).count(),0);
 assert.equal(await employee.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const card=employee.locator("article").filter({hasText:"SYNTHETIC-INTERACTIVE"});
 await card.getByRole("button",{name:"Submit self-review",exact:true}).click();
 await employee.getByLabel("Achievements and challenges").fill("Completed synthetic stock reconciliations and handovers.");
 await employee.getByLabel("Supporting evidence").fill("Synthetic reconciliation register and handover checklist.");
 await employee.getByRole("button",{name:"Submit",exact:true}).click();
 await card.getByText(/MANAGER PENDING/).waitFor();
 check("Employee submits a self-review through the mobile ESS form");
 const manager=await open("manager");
 const mc=manager.locator("article").filter({hasText:"SYNTHETIC-INTERACTIVE"});
 await mc.getByRole("button",{name:"Submit manager assessment",exact:true}).click();
 const selects=manager.locator("form select");
 assert.equal(await selects.count(),3);
 for(let i=0;i<3;i++)await selects.nth(i).selectOption(String([3,4,4][i]));
 for(let i=0;i<3;i++)await manager.locator("form fieldset").nth(i).locator("textarea").fill("Verified synthetic evidence for goal "+(i+1));
 await manager.getByLabel("Feedback discussion record").fill("Synthetic feedback discussion held with the employee.");
 await manager.getByLabel("Development and follow-up plan").fill("Documentation refresher and follow-up after 30 days.");
 await manager.getByRole("button",{name:"Submit",exact:true}).click();
 await mc.getByText(/HR PENDING/).waitFor();
 check("Manager rates weighted goals, records evidence/discussion and submits to HR");
 await employee.reload({waitUntil:"networkidle"});
 assert.equal(await employee.locator("article").filter({hasText:"SYNTHETIC-INTERACTIVE"}).getByText(/3.4000/).count(),0);
 await hr.reload({waitUntil:"networkidle"});
 const hc=hr.locator("article").filter({hasText:"SYNTHETIC-INTERACTIVE"});
 await hc.getByRole("button",{name:"Validate and release",exact:true}).click();
 await hr.getByLabel("Comments / reasons").fill("Synthetic evidence and consistency checked.");
 await hr.getByRole("button",{name:"Submit",exact:true}).click();
 await hc.getByText(/RELEASED/).waitFor();
 check("HR validates and releases; employee cannot see unreleased manager rating");
 await employee.reload({waitUntil:"networkidle"});
 const ec=employee.locator("article").filter({hasText:"SYNTHETIC-INTERACTIVE"});
 assert.equal(await ec.getByText(/3.4000 \/ 5 · Meets expectations/).isVisible(),true);
 await ec.getByRole("button",{name:"Acknowledge receipt",exact:true}).click();
 await employee.getByLabel("Comments / reasons").fill("Receipt acknowledged for synthetic demonstration.");
 await employee.getByRole("button",{name:"Submit",exact:true}).click();
 await ec.getByText(/ACKNOWLEDGED/).waitFor();
 await ec.getByText("Goals, weights and scoring evidence",{exact:true}).click();
 assert.equal(await employee.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await employee.screenshot({path:path.join(out,"ess-performance-mobile.png"),fullPage:true});
 check("Employee sees 3.4 Meets expectations, acknowledges receipt, and reads goals without mobile overflow");
 await manager.screenshot({path:path.join(out,"manager-performance-desktop.png"),fullPage:true});
 assert.deepEqual(errors,[]);
 check("No browser JavaScript page errors across HR, manager and employee sessions");
 fs.writeFileSync(path.join(out,"browser-results.json"),JSON.stringify({synthetic:true,checks,completedAt:new Date().toISOString()},null,2));
 console.log("BROWSER REHEARSAL PASSED: "+checks.length+" checks.");
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
