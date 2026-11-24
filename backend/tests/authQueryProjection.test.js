"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

function middleware({user,locations=[],decoded={userId:"u1",organizationId:"org1"},jwtError=null}={}){
 const file=path.join(__dirname,"../src/middleware/authMiddleware.js");
 const source=fs.readFileSync(file,"utf8");
 const calls=[];
 const prisma={
  user:{findFirst:async query=>{calls.push({model:"user",query});return user}},
  organizationLocation:{findMany:async query=>{calls.push({model:"locations",query});return locations}}
 };
 const jwt={verify:()=>{if(jwtError)throw jwtError;return decoded}};
 const mod={exports:{}};
 const wrap=vm.runInNewContext("(function(require,module,exports){"+source+"\n})",{console,process,Set,Array,String},{filename:file});
 wrap(name=>name==="jsonwebtoken"?jwt:name==="../config/prisma"?prisma:require(name),mod,mod.exports);
 return {...mod.exports,calls};
}
function res(){
 const r={statusCode:200,body:null};
 r.status=(code)=>{r.statusCode=code;return r};
 r.json=(value)=>{r.body=value;return r};
 return r;
}
const org={id:"org1",slug:"zermatt-liquor-limited",status:"ACTIVE"};
const loc={id:"l1",name:"Abuja",code:"ABJ",type:"BRANCH",city:"Abuja",state:"FCT",isActive:true};
function user(extra={}){return {
 id:"u1",organizationId:"org1",email:"hr@example.invalid",locationScope:"ASSIGNED_LOCATIONS",
 organization:org,userLocations:[{location:loc}],
 userRoles:[{role:{name:"Head HR",rolePermissions:[{permission:{key:"payroll.read"}},{permission:{key:"employees.read"}}]}}],
 ...extra
};}
async function invoke(fn,headers={authorization:"Bearer sample"}){const response=res();let nextCalls=0;await fn({headers},response,()=>{nextCalls++});return {response,nextCalls};}

test("HR authorization loads only required columns, excluding password and profile columns",async()=>{
 const api=middleware({user:user()});
 const {response,nextCalls}=await invoke(api.requireAuth);
 assert.equal(nextCalls,1);
 assert.equal(response.statusCode,200);
 const q=api.calls[0].query;
 assert.deepEqual(Object.keys(q.select).sort(),["email","id","locationScope","organization","organizationId","userLocations","userRoles"].sort());
 assert.equal(q.include,undefined);
 assert.deepEqual(Object.keys(q.select.userRoles.select.role.select.rolePermissions.select.permission.select),["key"]);
 assert.deepEqual(Object.keys(q.select.userLocations.select.location.select).sort(),["city","code","id","isActive","name","state","type"].sort());
 assert.ok(!JSON.stringify(q.select).includes("passwordHash"));
 assert.ok(!JSON.stringify(q.select).includes("essPasswordHash"));
});
test("permission revocation is effective on the next request (no caching)",async()=>{
 const current=user();const api=middleware({user:current});
 const response1=res();let r1;
 await api.requireAuth({headers:{authorization:"Bearer sample"}},response1,()=>{r1=true});
 assert.equal(r1,true);
 current.userRoles[0].role.rolePermissions=[];
 const response2=res();let auth2;
 const req2={headers:{authorization:"Bearer sample"}};
 await api.requireAuth(req2,response2,()=>{auth2=true});
 assert.equal(auth2,true);
 const denied=res();let passed=false;
 api.requirePermission("payroll.read")(req2,denied,()=>{passed=true});
 assert.equal(passed,false);
 assert.equal(denied.statusCode,403);
 assert.equal(api.calls.filter(x=>x.model==="user").length,2);
});
test("selected head office scope still rejects an unauthorized location",async()=>{
 const api=middleware({user:user()});
 const response=res();let nextCount=0;
 await api.requireAuth({headers:{authorization:"Bearer sample","x-chris-location-id":"other-branch"}},response,()=>{nextCount++});
 assert.equal(nextCount,0);assert.equal(response.statusCode,403);
 assert.equal(response.body.code,"LOCATION_SCOPE_FORBIDDEN");
});
test("platform-only permission never works for a Zermatt user",async()=>{
 const api=middleware({user:user({userRoles:[{role:{name:"Head HR",rolePermissions:[{permission:{key:"support.internal.read"}}]}}]})});
 const req={headers:{authorization:"Bearer sample"}};const response=res();
 await api.requireAuth(req,response,()=>{});
 const denied=res();let passed=false;
 api.requirePermission("support.internal.read")(req,denied,()=>{passed=true});
 assert.equal(passed,false);assert.equal(denied.statusCode,403);
});
test("ESS query excludes unnecessary user and employee details",async()=>{
 const essUser={id:"u1",organizationId:"org1",email:"ess@example.invalid",organization:org,employee:{id:"e1",status:"ACTIVE"}};
 const api=middleware({user:essUser,decoded:{userId:"u1",organizationId:"org1",accessType:"ESS"}});
 const response=res();let accepted=false;
 await api.requireEssAuth({headers:{authorization:"Bearer sample"}},response,()=>{accepted=true});
 assert.equal(accepted,true);
 const q=api.calls[0].query;
 assert.deepEqual(Object.keys(q.select).sort(),["email","employee","id","organization","organizationId"].sort());
 assert.deepEqual(Object.keys(q.select.employee.select).sort(),["id","status"]);
 assert.equal(q.include,undefined);
});
test("ESS access is denied after employee becomes inactive",async()=>{
 const essUser={id:"u1",organizationId:"org1",email:"ess@example.invalid",organization:org,employee:{id:"e1",status:"EXITED"}};
 const api=middleware({user:essUser,decoded:{userId:"u1",organizationId:"org1",accessType:"ESS"}});
 const r=res();let accepted=false;
 await api.requireEssAuth({headers:{authorization:"Bearer sample"}},r,()=>{accepted=true});
 assert.equal(accepted,false);assert.equal(r.statusCode,403);
});
test("ESS token cannot authenticate into HRIS",async()=>{
 const api=middleware({user:user(),decoded:{userId:"u1",organizationId:"org1",accessType:"ESS"}});
 const result=await invoke(api.requireAuth);
 assert.equal(result.response.statusCode,401);
 assert.equal(api.calls.length,0);
});
