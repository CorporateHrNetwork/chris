"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const routePath=require.resolve("../src/routes/billingRoutes");
const authPath=require.resolve("../src/middleware/authMiddleware");
const prismaPath=require.resolve("../src/config/prisma");
test("billing catalogue protects negotiated Zermatt terms from other tenants",async()=>{
 const saved=[authPath,prismaPath,routePath].map(p=>require.cache[p]);
 require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{requireAuth:(req,res,next)=>{
  const token=req.headers.authorization;
  if(!token)return res.status(401).json({status:"error"});
  const slug=token==="Bearer zermatt"?"zermatt-liquor-limited":token==="Bearer platform"?"corporatehr-network":"unrelated-tenant";
  req.auth={organizationId:slug,organization:{slug},permissions:token==="Bearer denied"?[]:["settings.view"]};next();
 }}};
 require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{}};
 delete require.cache[routePath];
 const app=express();app.use("/api/billing",require(routePath));
 const server=app.listen(0,"127.0.0.1");
 try{
  await new Promise(resolve=>server.once("listening",resolve));
  const url="http://127.0.0.1:"+server.address().port+"/api/billing/catalogue";
  const get=(token)=>fetch(url,{headers:token?{Authorization:token}:{}});
  assert.equal((await get()).status,401);
  assert.equal((await get("Bearer denied")).status,403);
  const unrelated=await (await get("Bearer unrelated")).json();
  assert.equal(unrelated.data.negotiatedOffer,null);
  assert.equal(unrelated.data.examples,null);
  assert.equal(unrelated.data.plans.PREMIUM.license,1700);
  for(const token of ["Bearer zermatt","Bearer platform"]){
   const response=await get(token);assert.equal(response.status,200);
   const body=await response.json();
   assert.equal(body.data.negotiatedOffer.firstYearOfferExcludingVat,10000000);
   assert.equal(body.data.negotiatedOffer.status,"PROPOSED_NOT_ACTIVATED");
   assert.equal(body.data.subscriptionStatus,"NOT_CONNECTED");
  }
 }finally{
  await new Promise(resolve=>server.close(resolve));
  [authPath,prismaPath,routePath].forEach((p,i)=>{if(saved[i])require.cache[p]=saved[i];else delete require.cache[p]});
 }
});
