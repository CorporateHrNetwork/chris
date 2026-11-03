// Fictional Northstar ESS login. Demo-only, no database access or customer records.
const crypto=require("crypto"),jwt=require("jsonwebtoken");
const ORG="chris-demo-org-20261022",SLUG="chris-demo-company",EMAIL="employee@northstar-demo.example",USER="northstar-fictional-ess-employee",ACCESS="ESS_NORTHSTAR_FICTIONAL";
const attempts=new Map();
function authorized(req){try{const m=String(req.headers.authorization||"").match(/^Bearer (.+)$/);if(!m)return false;const c=jwt.verify(m[1],process.env.JWT_SECRET,{algorithms:["HS256"]});return c.organizationId===ORG&&c.userId===USER&&c.accessType===ACCESS&&c.demoOnly===true}catch{return false}}
function demoLogin(req,res,next){
 if(String(req.body?.organizationSlug||"").toLowerCase()!==SLUG||String(req.body?.email||"").trim().toLowerCase()!==EMAIL)return next();
 res.set("Cache-Control","no-store");
 const ip=String(req.ip||"unknown").slice(0,100),now=Date.now(),prev=attempts.get(ip);
 if(attempts.size>1000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
 const entry=prev&&prev.until>now?{count:prev.count+1,until:prev.until}:{count:1,until:now+600000};attempts.set(ip,entry);
 if(entry.count>10)return res.status(429).json({status:"error",message:"Too many attempts. Try again later."});
 const expected=process.env.NORTHSTAR_ESS_DEMO_PASSWORD_SHA256||"";
 if(!/^[a-f0-9]{64}$/.test(expected)||!process.env.JWT_SECRET)return res.status(503).json({status:"error",message:"Demo employee login is not configured."});
 const actual=crypto.createHash("sha256").update(String(req.body?.password||"")).digest();
 if(!crypto.timingSafeEqual(actual,Buffer.from(expected,"hex")))return res.status(401).json({status:"error",message:"Invalid employee login credentials."});
 const token=jwt.sign({userId:USER,organizationId:ORG,accessType:ACCESS,demoOnly:true},process.env.JWT_SECRET,{algorithm:"HS256",expiresIn:"2h"});
 return res.json({status:"success",data:{token,employee:{employeeNumber:"NSTAR-DEMO-001",firstName:"Ada",lastName:"Okafor",email:EMAIL,status:"ACTIVE"},organization:{name:"Northstar CHRiS Demo",slug:SLUG}}});
}
function fixture(){const profile={id:USER,employeeNumber:"NSTAR-DEMO-001",firstName:"Ada",lastName:"Okafor",name:"Ada Okafor",email:EMAIL,status:"ACTIVE",employmentType:"FULL_TIME",hireDate:"2024-02-01",confirmationDate:"2024-08-01",department:{name:"People Operations"},designation:{name:"HR Operations Specialist"},employmentLevel:{name:"Level 3"},location:{name:"Northstar Demo Office"},costCentre:{name:"People Operations"},lineManager:{name:"Tunde Bello",designation:"Head of HR"},employmentEpisodes:[{startDate:"2024-02-01"}]};
 const preview={id:"demo-preview",periodName:"October 2026",periodCode:"2026-10",periodEnd:"2026-10-31",currency:"NGN",grossPay:450000,netPreview:370000,runStatus:"DRAFT"};
 const keys=["personal-details","employment-details","statutory-details","payment-details"];
 return {profile,onboarding:{completionPercent:100,currentStage:"Completed",status:"COMPLETED",sections:keys.map(key=>({key,label:key.replace("-"," ")})),sectionProgress:Object.fromEntries(keys.map(k=>[k,{completed:true,completedItems:4,totalItems:4}])),data:{"personal-details":{dateOfBirth:"1996-07-15",nationality:"Nigerian"},"statutory-details":{payeState:"FCT",pensionPfa:"Fictional Demo PFA",pensionPin:"DEMO ONLY"},"payment-details":{bankName:"Demo Bank",accountName:"Ada Okafor (Fictional)",accountNumber:"DEMO ONLY",payrollCurrency:"NGN"}},documents:[]},statutory:{registered:{payeState:"FCT",pensionPfa:"Fictional Demo PFA",pensionPin:"DEMO ONLY"},obligations:[]},payment:{bankName:"Demo Bank",accountName:"Ada Okafor (Fictional)",accountNumber:"DEMO ONLY",payrollCurrency:"NGN"},payroll:{payslips:[],latestPayslip:null,previews:[preview],latestCalculation:preview},leaveBalances:[{id:"demo-leave",leaveType:"Annual Leave",leaveYear:2026,openingBalance:21,accrued:0,used:5,adjusted:0,carriedForward:0}],attendance:[{id:"attendance-demo-1",attendanceDate:"2026-10-30",status:"PRESENT",lateMinutes:0,overtimeMinutes:0}],performance:[{cycle:{id:"demo-cycle",year:2026,quarter:3},kpis:[{id:"demo-kpi",title:"HR Service Quality",objective:"Improve response time",measurement:"Response SLA",target:"95%",weight:100}],assessment:{status:"FINAL",finalRating:"SATISFACTORY",selfAssessment:{kpis:[]}}}],gratuity:{status:"ACCRUING",currency:"NGN",serviceStartDate:"2024-02-01",grossMonthly:450000},birthday:{dateOfBirth:"1996-07-15"},birthdays:[],workAnniversaries:[],news:[{id:"demo-news",category:"ANNOUNCEMENT",title:"Welcome to Northstar MY CHRiS",summary:"Fictional, read-only employee demo. No customer records are used.",body:"Explore profile, payroll preview, leave, performance and communications.",isPinned:true,publishAt:"2026-11-01"}]};}
function demoDashboard(req,res,next){if(!authorized(req))return next();res.set("Cache-Control","no-store");return res.json({status:"success",data:fixture()})}
function demoLoans(req,res,next){if(!authorized(req))return next();return res.json({status:"success",data:[]})}
module.exports={demoLogin,demoDashboard,demoLoans};
