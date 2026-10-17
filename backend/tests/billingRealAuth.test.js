"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const jwt=require("jsonwebtoken");
const routePath=require.resolve("../src/routes/billingRoutes");
const authPath=require.resolve("../src/middleware/authMiddleware");
const prismaPath=require.resolve("../src/config/prisma");
test("real JWT middleware enforces billing permissions and organization isolation",async()=>{
 const original=[prismaPath,authPath,routePath].map(p=>require.cache[p]);
 const previousSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET="billing-test-only-isolated-secret";
 const queries=[];
 const fakePrisma={
  user:{findFirst:async({where})=>{
   if(where.id==="missing")return null;
   const org=where.organizationId;
   const permission=where.id==="denied"?"unrelated.view":"settings.view";
   return {id:where.id,organizationId:org,email:"test@example.invalid",employeeId:null,locationScope:"ALL_LOCATIONS",organization:{id:org,slug:org==="org-z"?"zermatt-liquor-limited":"unrelated-tenant",status:"ACTIVE"},userLocations:[],userRoles:[{role:{name:"Tester",rolePermissions:[{permission:{key:permission}}]}}]};
  }},
  organizationLocation:{findMany:async()=>[]},
  ...Object.fromEntries(["billingSubscription","billingInvoice","billingPayment"].map(model=>[model,{findMany:async({where})=>{queries.push({model,org:where.organizationId});return []}}]))
 };
 require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:fakePrisma};
 delete require.cache[authPath];delete require.cache[routePath];
 const app=express();app.use("/api/billing",require(routePath));
 const server=app.listen(0,"127.0.0.1");
 try{
  await new Promise(resolve=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+server.address().port+"/api/billing";
  const token=(userId,organizationId,extra={})=>jwt.sign({userId,organizationId,...extra},process.env.JWT_SECRET,{expiresIn:"5m"});
  const get=(path,authorization)=>fetch(base+path,{headers:authorization?{Authorization:"Bearer "+authorization}:{}});
  assert.equal((await get("/records")).status,401);
  assert.equal((await get("/records","bad.token")).status,401);
  assert.equal((await get("/records",token("missing","org-z"))).status,401);
  assert.equal((await get("/records",token("denied","org-z"))).status,403);
  assert.equal((await get("/records",token("allowed","org-z",{accessType:"ESS"}))).status,401);
  for(const org of ["org-z","org-b"]){
   const res=await get("/records",token("allowed",org));
   assert.equal(res.status,200);
   assert.equal((await res.json()).data.readOnly,true);
  }
  assert.deepEqual(queries.map(q=>q.org),["org-z","org-z","org-z","org-b","org-b","org-b"]);
  const outsider=await (await get("/catalogue",token("allowed","org-b"))).json();
  assert.equal(outsider.data.negotiatedOffer,null);
  const zermatt=await (await get("/catalogue",token("allowed","org-z"))).json();
  assert.equal(zermatt.data.negotiatedOffer.status,"PROPOSED_NOT_ACTIVATED");
 }finally{
  await new Promise(resolve=>server.close(resolve));
  [prismaPath,authPath,routePath].forEach((p,i)=>{if(original[i])require.cache[p]=original[i];else delete require.cache[p]});
  if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
 }
});
