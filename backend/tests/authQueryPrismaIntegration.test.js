"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const jwt=require("jsonwebtoken");
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
 const u=await prisma.user.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,email:"fictional-"+id+"@example.invalid",passwordHash:"NEVER_REAL_SECRET",locationScope:"ASSIGNED_LOCATIONS"}});
 await prisma.userRole.create({data:{userId:u.id,roleId:role.id}});
 await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 await prisma.userLocation.create({data:{organizationId:orgA.id,userId:u.id,locationId:locA.id}});
 const token=jwt.sign({userId:u.id,organizationId:orgA.id},process.env.JWT_SECRET);
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
 const after=await verify(token);
 assert.equal(after.next,true);
 assert.ok(!after.req.auth.permissions.includes(permission.key));
 const forbidden=response();let approved=false;
 requirePermission(permission.key)(after.req,forbidden,()=>approved=true);
 assert.equal(approved,false);assert.equal(forbidden.statusCode,403);
 await prisma.user.update({where:{id:u.id},data:{isActive:false}});
 const revoked=await verify(token);
 assert.equal(revoked.next,false);assert.equal(revoked.res.statusCode,401);
 const employee=await prisma.employee.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,employeeNumber:"TEST-"+id,firstName:"Fictional",lastName:"Employee"}});
 const essUser=await prisma.user.create({data:{id:crypto.randomUUID(),organizationId:orgA.id,employeeId:employee.id,email:"fictional-ess-"+id+"@example.invalid",passwordHash:"FICTIONAL_ONLY"}});
 const essToken=jwt.sign({userId:essUser.id,organizationId:orgA.id,accessType:"ESS"},process.env.JWT_SECRET);
 const essRequest={headers:{authorization:"Bearer "+essToken}};
 let essNext=false;const essResponse=response();
 await requireEssAuth(essRequest,essResponse,()=>essNext=true);
 assert.equal(essNext,true);
 assert.equal(essRequest.essAuth.employeeId,employee.id);
 const essAsHris=await verify(essToken);
 assert.equal(essAsHris.next,false);assert.equal(essAsHris.res.statusCode,401);
 await prisma.employee.update({where:{id:employee.id},data:{status:"EXITED"}});
 let essAfter=false;const inactiveResponse=response();
 await requireEssAuth(essRequest,inactiveResponse,()=>essAfter=true);
 assert.equal(essAfter,false);assert.equal(inactiveResponse.statusCode,403);
 assert.equal(inactiveResponse.body.code,"ESS_ACCESS_REVOKED");
 // Disposable GitHub CI database is destroyed with the job. No live data is read.
});
test.after(async()=>{await prisma.$disconnect()});
