"use strict";
const path=require("node:path"),crypto=require("node:crypto");
const url=new URL(process.env.DATABASE_URL||"http://invalid");
if(url.hostname!=="127.0.0.1"||url.port!=="55440"||url.pathname!=="/chris_pe_staging")throw Error("Local synthetic database only.");
process.env.JWT_SECRET=crypto.randomBytes(48).toString("hex");
process.env.CHRIS_PE_ENABLED="true";process.env.CHRIS_PE_SCHEDULER_ENABLED="false";process.env.OPENAI_API_KEY="";
const prisma=require("../src/config/prisma");
async function main(){
 const org=await prisma.organization.findUnique({where:{slug:"zermatt-liquor-limited"}});
 if(org?.legalName!=="SYNTHETIC PE REHEARSAL ONLY")throw Error("Synthetic marker missing; refusing to run.");
 process.env.CHRIS_PE_ORGANIZATION_IDS=org.id;
 const app=require("../src/app"),express=require("express"),jwt=require("jsonwebtoken");
 app.use((req,res,next)=>{if(!req.path.startsWith("/api/"))res.removeHeader("Content-Security-Policy");next();});
 const roles={hr:"hr",manager:"manager",employee:"employee",employee2:"employee2",appeal:"appeal"};
 app.get("/rehearsal",(_req,res)=>res.type("html").send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHRiS PE Synthetic Rehearsal</title></head><body style="font:18px Arial;max-width:720px;padding:24px;margin:auto"><h1>CHRiS performance evaluation</h1><p>LOCAL SYNTHETIC DEMONSTRATION — no live Zermatt employee records.</p><p>Choose a role to inspect its portal:</p><ul>'+Object.keys(roles).map(r=>'<li style="margin:20px 0"><a href="/rehearsal/role/'+r+'">'+r+'</a></li>').join("")+'</ul><p>The current-quarter scorecards show published goals. Synthetic completed-period cases demonstrate acknowledgment and appeal. The SYNTHETIC-INTERACTIVE case starts with an employee self-review for you to try.</p></body></html>'));
 app.get("/rehearsal/role/:role",async(req,res)=>{
  try{
   const key=roles[req.params.role];if(!key)return res.status(404).end();
   const user=await prisma.user.findFirst({where:{organizationId:org.id,email:key+"@example.invalid",isActive:true},include:{userRoles:{include:{role:true}}}});
   if(!user)return res.status(404).end();
   const ess=key.startsWith("employee");
   const token=jwt.sign({userId:user.id,organizationId:org.id,...(ess?{accessType:"ESS"}:{})},process.env.JWT_SECRET,{expiresIn:"2h"});
   const values=ess?{chris_ess_token:token}:{chris_token:token,chris_user:JSON.stringify({id:user.id,email:user.email,firstName:user.firstName,lastName:user.lastName,roles:user.userRoles.map(x=>x.role.name)}),chris_organization:JSON.stringify(org)};
   res.type("html").send('<!doctype html><meta name="referrer" content="no-referrer"><script>localStorage.clear();sessionStorage.clear();const values='+JSON.stringify(values).replace(/</g,"\\u003c")+';for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);location.replace("'+(ess?"/ess":"/performance")+'");</script>');
  }catch{res.status(500).send("Unable to open synthetic role");}
 });
 const S=require("../src/services/performanceEvaluationService");
 const state=await S.state(prisma,org.id),employee=await prisma.employee.findFirst({where:{organizationId:org.id,employeeNumber:"SYN-001"}});
 const id="review:SYNTHETIC-INTERACTIVE:"+employee.id;
 if(!state.has(id)){
  const sample=[...state.values()].find(r=>r.kind==="review"&&r.employeeId===employee.id);
  const card={...sample,id,cycleId:"cycle:SYNTHETIC-INTERACTIVE",synthetic:true,status:"GOALS_PUBLISHED",effectiveFrom:"2026-07-01",endDate:"2026-09-30",deadlines:{self:"2026-10-07",manager:"2026-10-14",hr:"2026-10-21"},revision:1,
   selfAssessment:null,managerAssessment:null,finalScore:null,hrComment:null,employeeResponse:null,appeal:null,followUp:null};
  await prisma.organizationAudit.create({data:{organizationId:org.id,entityType:"ZermattPerformanceEvaluation",entityId:id,action:"PE_REVIEW",newValue:card,reason:"Interactive synthetic completed-period fixture only"}});
 }
 app.use(express.static(path.resolve(__dirname,"../../dist")));
 app.get(/.*/,(_req,res)=>res.sendFile(path.resolve(__dirname,"../../dist/index.html")));
 const server=app.listen(55441,"127.0.0.1",()=>console.log("Synthetic PE review ready: http://127.0.0.1:55441/rehearsal"));
 process.once("SIGINT",()=>server.close(async()=>{await prisma.$disconnect();process.exit(0);}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
