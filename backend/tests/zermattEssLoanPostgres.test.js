"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const url=process.env.CHRIS_ESS_LOAN_TEST_DATABASE_URL;
test("isolated PostgreSQL/HTTP: assigned payment authority, participant privacy and concurrent duplicate payment",{skip:!url},async()=>{
 assert.equal(new URL(url).pathname,"/chris_ess_loan_test","Refuse shared/live databases");
 process.env.DATABASE_URL=url;process.env.JWT_SECRET="synthetic-ess-loan-secret-only";process.env.ZERMATT_ESS_APPROVALS_ENABLED="true";
 // No test can send real email, including on runners with unrelated SMTP settings.
 process.env.CHRIS_SMTP_HOST="";process.env.CHRIS_SMTP_USER="";process.env.CHRIS_SMTP_PASS="";
 const db=require("../src/config/prisma"),express=require("express"),jwt=require("jsonwebtoken");
 // Keep this test focused on HTTP/database transactions. Dispatch/retry is
 // tested separately; no background transport may outlive this fixture.
 require("../src/services/zermattEssLoanNotificationDispatch").kick=()=>{};
 assert.equal((await db.$queryRawUnsafe("SELECT current_database() AS name"))[0].name,"chris_ess_loan_test");
 const app=express();app.use(express.json());app.use("/api/ess",require("../src/routes/essRoutes"));
 const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s))});
 const base="http://127.0.0.1:"+server.address().port;
 try{
  const org=await db.organization.create({data:{name:"Synthetic ESS Loan",slug:"zermatt-liquor-limited"}});
  const location=await db.organizationLocation.create({data:{organizationId:org.id,name:"Synthetic Branch",code:"SYN"}});
  const users={};
  const roles={employee:"Employee",branch:"Branch Operations Manager",hr:"Head of HR & Admin",gm:"General Manager",chief:"Chief Accountant",audit:"Head of Audit & Internal Controls"};
  for(const [key,name] of Object.entries(roles)){
   const employee=await db.employee.create({data:{organizationId:org.id,employeeNumber:"SYN-"+key,firstName:"Synthetic",lastName:key,employmentType:"Full-Time",locationId:location.id,hireDate:new Date("2020-01-01")}});
   const user=await db.user.create({data:{organizationId:org.id,employeeId:employee.id,email:key+"@example.invalid",passwordHash:"no-real-login",locationScope:"ALL_LOCATIONS"}});
   const role=await db.role.create({data:{organizationId:org.id,name}});await db.userRole.create({data:{userId:user.id,roleId:role.id}});
   users[key]={...user,employee};
  }
  await db.employeeLineManagerAssignment.create({data:{organizationId:org.id,employeeId:users.employee.employeeId,managerEmployeeId:users.branch.employeeId,effectiveFrom:new Date("2020-01-01")}});
  const id=randomUUID();
  await db.$executeRawUnsafe('INSERT INTO "payroll_loans" ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount","applicationDate","approvedDate","status","purpose","workflowLocationId","createdByUserId","essApprovalRequired") VALUES ($1,$2,$3,$4,100,100,10,CURRENT_DATE,CURRENT_DATE,\'AWAITING_DISBURSEMENT\',\'Staff Loan\',$5,$6,true)',id,org.id,users.employee.employeeId,"LN-SYN-PAYMENT",location.id,users.employee.id);
  // Seed completed upstream decisions to isolate the real payment transaction.
  // Full upstream routing is covered by the financial service integration suite.
  const {buildLoanStages,createPlan,transition}=require("../src/services/zermattEssApprovalPlan");
  let plan=createPlan({type:"LOAN",requesterUserId:users.employee.id,observerUserIds:[users.audit.id],stages:buildLoanStages({organizationSlug:org.slug,requesterUserId:users.employee.id,branchManagerUserId:users.branch.id,headHrUserId:users.hr.id,gmUserId:users.gm.id,chiefAccountantUserId:users.chief.id})});
  for(const actor of [users.branch,users.hr,users.gm])plan=transition(plan,{actorUserId:actor.id,decision:"APPROVE",expectedVersion:plan.version});
  await db.$executeRawUnsafe('INSERT INTO "ess_approval_workflows" ("id","organizationId","requestType","requestId","employeeId","requesterUserId","status","version","currentIndex","stages","observers","history") VALUES ($1::uuid,$2,\'LOAN\',$3,$4,$5,\'PENDING\',$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)',randomUUID(),org.id,id,users.employee.employeeId,users.employee.id,plan.version,plan.currentIndex,JSON.stringify(plan.stages),JSON.stringify(plan.observers),JSON.stringify(plan.history));
  const token=user=>jwt.sign({accessType:"ESS",organizationId:org.id,userId:user.id},process.env.JWT_SECRET,{expiresIn:"1h"});
  async function request(path,body,user){const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(user?{Authorization:"Bearer "+token(user)}:{})},...(body?{body:JSON.stringify(body)}:{})});return {http:response.status,...await response.json()};}
  const payment={decision:"DISBURSE",expectedVersion:4,disbursedDate:"2026-11-03",recoveryStartDate:"2026-12-01",disbursementReference:"SYN-PAYMENT"};
  const path="/api/ess/approvals/loan/"+id+"/decisions";
  assert.equal((await request(path,payment)).http,401);
  for(const who of ["employee","hr","gm","audit"])assert.notEqual((await request(path,payment,users[who])).http,200,who+" cannot record payment");
  const audit=await request("/api/ess/approvals",null,users.audit);assert.equal(audit.http,200);assert.equal(audit.data[0].canAct,false);assert.equal(audit.data[0].details,null);
  const chief=await request("/api/ess/approvals",null,users.chief);assert.equal(chief.http,200);assert.equal(chief.data[0].canAct,true);assert.equal(Number(chief.data[0].details.principalAmount),100);
  const outcomes=await Promise.all([request(path,payment,users.chief),request(path,payment,users.chief)]);
  assert.deepEqual(outcomes.map(r=>r.http).sort(),[200,409],JSON.stringify(outcomes));
  const loans=await db.$queryRawUnsafe('SELECT "status","disbursementReference" FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2',org.id,id);
  assert.equal(loans[0].status,"ACTIVE");assert.equal(loans[0].disbursementReference,"SYN-PAYMENT");
  const workflow=await db.$queryRawUnsafe('SELECT "status","version" FROM "ess_approval_workflows" WHERE "organizationId"=$1 AND "requestId"=$2',org.id,id);
  assert.equal(workflow[0].status,"COMPLETED");assert.equal(workflow[0].version,5);
  assert.equal(await db.organizationAudit.count({where:{organizationId:org.id,entityId:id,action:"LOAN_DISBURSED"}}),1);
  assert.equal(await db.organizationAudit.count({where:{organizationId:org.id,entityId:id,action:"ESS_WORKFLOW_DISBURSE"}}),1);
 }finally{
  await new Promise(resolve=>server.close(resolve));await db.$disconnect();delete process.env.ZERMATT_ESS_APPROVALS_ENABLED;
 }
});
