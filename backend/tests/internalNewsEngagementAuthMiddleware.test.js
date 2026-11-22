const test=require("node:test");
const assert=require("node:assert/strict");
const jwt=require("jsonwebtoken");
process.env.JWT_SECRET="synthetic-test-only-signing-secret-do-not-use";
const prisma={
 user:{findFirst:async({where})=>{
  if(where.id==="inactive-user")return null;
  const employee=where.id==="no-employee" ? null : {id:"emp-a",status:where.id==="suspended-employee"?"SUSPENDED":"ACTIVE"};
  return {
    id:where.id,organizationId:where.organizationId,employeeId:employee?.id,
    email:"synthetic@example.test",locationScope:"ASSIGNED_LOCATIONS",userLocations:[],userRoles:[],
    employee,organization:{id:where.organizationId,slug:"synthetic-organization",status:where.organizationId==="inactive-tenant"?"SUSPENDED":"ACTIVE"}
  };
 }},
 organizationLocation:{findMany:async()=>[]}
};
const path=require.resolve("../src/config/prisma");
require.cache[path]={id:path,filename:path,loaded:true,exports:prisma};
const {requireAuth,requireEssAuth}=require("../src/middleware/authMiddleware");
function token(userId,organizationId="tenant-a",accessType){
  return jwt.sign({userId,organizationId,accessType},process.env.JWT_SECRET);
}
async function invoke(middleware,t){
  const req={headers:{authorization:"Bearer "+t, "x-chris-location-id":""}};
  const res={statusCode:200,body:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  let authorized=false;await middleware(req,res,()=>{authorized=true});
  return {authorized,res,req};
}
test("real HR auth middleware denies ESS tokens",async()=>{
  const result=await invoke(requireAuth,token("user-a","tenant-a","ESS"));
  assert.equal(result.authorized,false);
  assert.equal(result.res.statusCode,401);
  assert.equal(result.res.body.code,"ESS_SESSION_NOT_ALLOWED");
});
test("real ESS auth middleware denies HR tokens",async()=>{
  const result=await invoke(requireEssAuth,token("user-a","tenant-a","HR"));
  assert.equal(result.authorized,false);
  assert.equal(result.res.statusCode,401);
});
test("real ESS middleware refuses suspended employee, inactive user and organization",async()=>{
  for(const userId of ["suspended-employee","inactive-user","no-employee"]){
    const result=await invoke(requireEssAuth,token(userId,"tenant-a","ESS"));
    assert.equal(result.authorized,false,userId);
  }
  const org=await invoke(requireEssAuth,token("user-a","inactive-tenant","ESS"));
  assert.equal(org.authorized,false);
  assert.equal(org.res.statusCode,403);
});
test("valid synthetic ESS identity derives organization and employee from signed token",async()=>{
  const result=await invoke(requireEssAuth,token("user-a","tenant-a","ESS"));
  assert.equal(result.authorized,true);
  assert.equal(result.req.essAuth.employeeId,"emp-a");
  assert.equal(result.req.essAuth.organizationId,"tenant-a");
});
test("valid synthetic HR identity derives tenant scope from signed token",async()=>{
  const result=await invoke(requireAuth,token("user-a","tenant-a","HR"));
  assert.equal(result.authorized,true);
  assert.equal(result.req.auth.organizationId,"tenant-a");
});
