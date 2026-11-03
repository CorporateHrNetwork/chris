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
const {fixture,loans}=require("./northstarEssFixture");
function demoDashboard(req,res,next){if(!authorized(req))return next();res.set("Cache-Control","no-store");return res.json({status:"success",data:fixture()})}
function demoLoans(req,res,next){if(!authorized(req))return next();return res.json({status:"success",data:loans()})}
module.exports={demoLogin,demoDashboard,demoLoans};
