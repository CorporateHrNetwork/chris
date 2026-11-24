"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const jwt=require("jsonwebtoken");
const express=require("express");
const bcrypt=require("bcryptjs");
const authRoutes=require("../src/routes/authRoutes");
const essRoutes=require("../src/routes/essRoutes");
process.env.JWT_SECRET="fictional-prisma-test-key";
const prisma=require("../src/config/prisma");
const {requireAuth,requireEssAuth,requirePermission}=require("../src/middleware/authMiddleware");

function response(){
 const r={statusCode:200,body:null};
 r.status=n=>{r.statusCode=n;return r};r.json=b=>{r.body=b;return r};
 return r;
}
async function verify(token,locationId){
 const req={headers:{authorization:"Bearer "+token,...(locationId?{"x-chris-location-id":locationId}:{})}};
 const res=response();let next=false;
 await requireAuth(req,res,()=>next=true);
 return {req,res,next};
}
test("generated Prisma client preserves tenant, branch and instant permission revocation on a disposable PostgreSQL 17 database",async(t)=>{
 if(process.env.CHRIS_DISPOSABLE_PRISMA_INTEGRATION!=="true")return t.skip("Fictional disposable database required");
 const id=crypto.randomUUID();
 const orgA=await prisma.organization.create({data:{id:crypto.randomUUID(),name:"Fictional A "+id,slug:"fictional-a-"+id}});
 const orgB=await prisma.organization.create({data:{id:crypto.randomUUID(),name:"Fictional B "+id,slug:"fictional-b-"+id}});
 const locA=await prisma.organizationLocation.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,name:"Fictional branch A"}});
 const role=await prisma.role.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,name:"Test HR "+id}});
 const permission=await prisma.permission.create({data:{id:crypto.randomUUID(),key:"fictional.perm."+id,name:"Fictional permission"}});
 const payrollView=await prisma.permission.create({data:{id:crypto.randomUUID(),key:"payroll.view",name:"Payroll view fictional test"}});
 await prisma.rolePermission.create({data:{roleId:role.id,permissionId:payrollView.id}});
 const u=await prisma.user.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,email:"fictional-"+id+"@example.invalid",passwordHash:"NEVER_REAL_SECRET",locationScope:"ASSIGNED_LOCATIONS"}});
 await prisma.userRole.create({data:{userId:u.id,roleId:role.id}});
 await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 await prisma.userLocation.create({data:{organizationId:orgA.id,userId:u.id,locationId:locA.id}});
 const token=jwt.sign({userId:u.id,organizationId:orgA.id},process.env.JWT_SECRET);
 // Exercise a real Express protected route using the same Prisma authorization
 // middleware as CHRiS. No production endpoint or employee data is involved.
 const app=express();
 app.use(express.json());
 app.use("/api/auth",authRoutes);
 app.use("/api/ess",essRoutes);
 app.get("/fictional/hr/authorized",requireAuth,requirePermission(permission.key),(req,res)=>
  res.status(200).json({scope:req.auth.organizationId,location:req.auth.activeLocationId}));
 app.get("/fictional/ess/authorized",requireEssAuth,(req,res)=>
  res.status(200).json({employeeId:req.essAuth.employeeId}));
 app.get("/fictional/payroll/view",requireAuth,requirePermission("payroll.view"),(req,res)=>
  res.status(200).json({allowed:true}));
 app.post("/fictional/payroll/manage",requireAuth,requirePermission("payroll.manage"),(req,res)=>
  res.status(200).json({allowed:true}));
 app.post("/fictional/tsp/manage",requireAuth,requirePermission("benefits.manage"),(req,res)=>
  res.status(200).json({allowed:true}));
 const server=app.listen(0,"127.0.0.1");
 await new Promise(resolve=>server.once("listening",resolve));
 t.after(()=>server.close());
 const root="http://127.0.0.1:"+server.address().port;
 async function route(url,bearer){return fetch(root+url,{headers:{authorization:"Bearer "+bearer}})}
 const noToken=await fetch(root+"/fictional/hr/authorized");
 assert.equal(noToken.status,401);
 const httpAllowed=await route("/fictional/hr/authorized",token);
 assert.equal(httpAllowed.status,200);
 assert.equal((await httpAllowed.json()).scope,orgA.id);
 assert.equal((await route("/fictional/payroll/view",token)).status,200);
 assert.equal((await route("/fictional/payroll/manage",token)).status,404); // GET must not mutate
 const postProtected=async path=>fetch(root+path,{method:"POST",headers:{authorization:"Bearer "+token}});
 assert.equal((await postProtected("/fictional/payroll/manage")).status,403);
 assert.equal((await postProtected("/fictional/tsp/manage")).status,403);
 // Use the real CHRiS login and /me endpoints against fictional database users.
 const temporaryHrisPassword="Fictional-HRIS-Login-Only-928!";
 await prisma.user.update({where:{id:u.id},data:{passwordHash:await bcrypt.hash(temporaryHrisPassword,10)}});
 const hrisLogin=await fetch(root+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
  email:u.email,password:temporaryHrisPassword,organizationSlug:orgA.slug
 })});
 assert.equal(hrisLogin.status,200);
 const hrisLoginData=(await hrisLogin.json()).data;
 assert.ok(hrisLoginData.token);
 const hrisMe=await route("/api/auth/me",hrisLoginData.token);
 assert.equal(hrisMe.status,200);
 const hrisMeData=(await hrisMe.json()).data;
 assert.equal(hrisMeData.userId,u.id);
 assert.equal(hrisMeData.organization.slug,orgA.slug);
 const incorrectTenantLogin=await fetch(root+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
  email:u.email,password:temporaryHrisPassword,organizationSlug:orgB.slug
 })});
 assert.equal(incorrectTenantLogin.status,401);
 const httpWrongTenant=await route("/fictional/hr/authorized",
  jwt.sign({userId:u.id,organizationId:orgB.id},process.env.JWT_SECRET));
 assert.equal(httpWrongTenant.status,401);
 const ok=await verify(token);
 assert.equal(ok.next,true);
 assert.equal(ok.req.auth.organizationId,orgA.id);
 assert.equal(ok.req.auth.activeLocationId,locA.id);
 assert.ok(ok.req.auth.permissions.includes(permission.key));
 assert.equal(ok.req.auth.availableLocations.length,1);
 const denied=await verify(token,crypto.randomUUID());
 assert.equal(denied.next,false);assert.equal(denied.res.statusCode,403);
 const cross=await verify(jwt.sign({userId:u.id,organizationId:orgB.id},process.env.JWT_SECRET));
 assert.equal(cross.next,false);assert.equal(cross.res.statusCode,401);
 await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});
 const revokedHttp=await route("/fictional/hr/authorized",token);
 assert.equal(revokedHttp.status,403);
 const after=await verify(token);
 assert.equal(after.next,true);
 assert.ok(!after.req.auth.permissions.includes(permission.key));
 assert.equal((await route("/fictional/payroll/view",token)).status,200);
 const forbidden=response();let approved=false;
 requirePermission(permission.key)(after.req,forbidden,()=>approved=true);
 assert.equal(approved,false);assert.equal(forbidden.statusCode,403);
 await prisma.user.update({where:{id:u.id},data:{isActive:false}});
 const revoked=await verify(token);
 assert.equal(revoked.next,false);assert.equal(revoked.res.statusCode,401);
 const employee=await prisma.employee.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,employeeNumber:"TEST-"+id,firstName:"Fictional",lastName:"Employee"}});
 const essUser=await prisma.user.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,employeeId:employee.id,email:"fictional-ess-"+id+"@example.invalid",passwordHash:"FICTIONAL_ONLY"}});
 const temporaryEssPassword="Fictional-ESS-Login-Only-929!";
 await prisma.user.update({where:{id:essUser.id},data:{passwordHash:await bcrypt.hash(temporaryEssPassword,10)}});
 const essLogin=await fetch(root+"/api/ess/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
  email:essUser.email,password:temporaryEssPassword,organizationSlug:orgA.slug
 })});
 assert.equal(essLogin.status,200);
 const essLoginToken=(await essLogin.json()).data.token;
 const essProfile=await route("/api/ess/me",essLoginToken);
 assert.equal(essProfile.status,200);
 const essProfileData=(await essProfile.json()).data;
 assert.equal(essProfileData.employee.id,employee.id);
 assert.equal(essProfileData.organization.slug,orgA.slug);
 assert.equal((await route("/api/auth/me",essLoginToken)).status,401);
 const essToken=jwt.sign({userId:essUser.id,organizationId:orgA.id,accessType:"ESS"},process.env.JWT_SECRET);
 const essRequest={headers:{authorization:"Bearer "+essToken}};
 let essNext=false;const essResponse=response();
 await requireEssAuth(essRequest,essResponse,()=>essNext=true);
 assert.equal(essNext,true);
 assert.equal(essRequest.essAuth.employeeId,employee.id);
 const httpEss=await route("/fictional/ess/authorized",essToken);
 assert.equal(httpEss.status,200);
 assert.equal((await httpEss.json()).employeeId,employee.id);
 const essAsHris=await verify(essToken);
 const httpEssAsHris=await route("/fictional/hr/authorized",essToken);
 assert.equal(httpEssAsHris.status,401);
 const httpHrisAsEss=await route("/fictional/ess/authorized",token);
 assert.equal(httpHrisAsEss.status,401);
 assert.equal(essAsHris.next,false);assert.equal(essAsHris.res.statusCode,401);
 await prisma.employee.update({where:{id:employee.id},data:{status:"TERMINATED"}});
 let essAfter=false;const inactiveResponse=response();
 await requireEssAuth(essRequest,inactiveResponse,()=>essAfter=true);
 assert.equal(essAfter,false);assert.equal(inactiveResponse.statusCode,403);
 assert.equal(inactiveResponse.body.code,"ESS_ACCESS_REVOKED");
 const terminatedHttp=await route("/fictional/ess/authorized",essToken);
 assert.equal(terminatedHttp.status,403);
 assert.equal((await route("/api/ess/me",essLoginToken)).status,403);
 const terminatedLogin=await fetch(root+"/api/ess/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
  email:essUser.email,password:temporaryEssPassword,organizationSlug:orgA.slug
 })});
 assert.equal(terminatedLogin.status,401);
 // A suspended organization must immediately lose access on both HRIS and ESS
 // protected routes, even when users and employees remain active.
 await prisma.user.update({where:{id:u.id},data:{isActive:true}});
 await prisma.employee.update({where:{id:employee.id},data:{status:"ACTIVE"}});
 await prisma.organization.update({where:{id:orgA.id},data:{status:"SUSPENDED"}});
 assert.equal((await route("/api/auth/me",hrisLoginData.token)).status,403);
 assert.equal((await route("/api/ess/me",essLoginToken)).status,403);
 assert.equal((await route("/fictional/payroll/view",token)).status,403);
 assert.equal((await route("/fictional/ess/authorized",essToken)).status,403);
 await prisma.organization.update({where:{id:orgA.id},data:{status:"ACTIVE"}});
 assert.equal((await route("/api/auth/me",hrisLoginData.token)).status,200);
 assert.equal((await route("/api/ess/me",essLoginToken)).status,200);
 // Disposable GitHub CI database is destroyed with the job. No live data is read.
});
test.after(async()=>{await prisma.$disconnect()});
