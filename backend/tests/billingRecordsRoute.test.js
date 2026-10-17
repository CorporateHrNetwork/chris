"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const path = require("node:path");
const routePath = require.resolve("../src/routes/billingRoutes");
const authPath = require.resolve("../src/middleware/authMiddleware");
const prismaPath = require.resolve("../src/config/prisma");
const calls = [];
const prisma = Object.fromEntries(["billingSubscription","billingInvoice","billingPayment"].map((name) => [name, {findMany: async (query) => {calls.push({name,query});return [{id:name,organizationId:query.where.organizationId,amountMinor:12345n,annualAmountMinor:1000000000n}];}}]));
const auth = (req,res,next) => {
 const token = req.headers.authorization;
 if (!token) return res.status(401).json({status:"error"});
 req.auth = {organizationId: token === "Bearer tenant-b" ? "tenant-b" : "tenant-a",permissions: token === "Bearer denied" ? [] : ["settings.view"],organization:{slug:"other-tenant"}};
 next();
};
test("authenticated billing records are permission gated and tenant scoped", async () => {
 const originalAuth=require.cache[authPath], originalPrisma=require.cache[prismaPath],originalRoute=require.cache[routePath];
 require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{requireAuth:auth}};
 require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:prisma};
 delete require.cache[routePath];
 const app=express();app.use("/api/billing",require(routePath));
 const server=app.listen(0,"127.0.0.1");
 try {
  await new Promise((resolve)=>server.once("listening",resolve));
  const base="http://127.0.0.1:"+server.address().port+"/api/billing/records";
  const request=(token)=>fetch(base,{headers:token?{Authorization:token}:{}});
  assert.equal((await request()).status,401);
  assert.equal((await request("Bearer denied")).status,403);
  assert.equal(calls.length,0);
  const a=await request("Bearer tenant-a"),b=await request("Bearer tenant-b");
  assert.equal(a.status,200);assert.equal(b.status,200);
  const aBody=await a.json(),bBody=await b.json();
  assert.equal(aBody.data.subscriptions[0].annualAmountMinor,"1000000000");
  assert.equal(aBody.data.readOnly,true);
  assert.equal(bBody.data.payments[0].organizationId,"tenant-b");
  assert.equal(calls.length,6);
  assert.deepEqual(calls.slice(0,3).map(c=>c.query.where.organizationId),["tenant-a","tenant-a","tenant-a"]);
  assert.deepEqual(calls.slice(3).map(c=>c.query.where.organizationId),["tenant-b","tenant-b","tenant-b"]);
 } finally {
  await new Promise((resolve)=>server.close(resolve));
  if(originalAuth)require.cache[authPath]=originalAuth;else delete require.cache[authPath];
  if(originalPrisma)require.cache[prismaPath]=originalPrisma;else delete require.cache[prismaPath];
  if(originalRoute)require.cache[routePath]=originalRoute;else delete require.cache[routePath];
 }
});
