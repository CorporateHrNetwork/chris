const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("crypto");
const {demoLogin,demoDashboard,demoLoans}=require("../src/services/northstarEssDemo");
const password="local-test-secret-only";
process.env.JWT_SECRET="local-northstar-test-jwt-secret";
process.env.NORTHSTAR_ESS_DEMO_PASSWORD_SHA256=crypto.createHash("sha256").update(password).digest("hex");
function res(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}}}
const req=(pw)=>({ip:"unit-test-ip",body:{organizationSlug:"chris-demo-company",email:"employee@northstar-demo.example",password:pw},headers:{}});
test("fictional Northstar ESS login issues isolated short-lived token and dashboard",()=>{
 const response=res();demoLogin(req(password),response,()=>assert.fail("must not fall through"));
 assert.equal(response.statusCode,200);assert.ok(response.data.data.token);
 const dashboard=res();demoDashboard({headers:{authorization:"Bearer "+response.data.data.token}},dashboard,()=>assert.fail("must not access DB"));
 assert.equal(dashboard.data.data.profile.employeeNumber,"NSTAR-DEMO-001");
 assert.equal(dashboard.data.data.payroll.payslips.length,0);
 assert.equal(dashboard.data.data.news[0].isPinned,true);
 const loans=res();demoLoans({headers:{authorization:"Bearer "+response.data.data.token}},loans,()=>assert.fail("must not access DB"));
 assert.deepEqual(loans.data.data,[]);
});
test("incorrect password rejected and unrelated tokens not accepted",()=>{
 const wrong=res();demoLogin(req("incorrect"),wrong,()=>assert.fail("must not fall through"));
 assert.equal(wrong.statusCode,401);
 let next=false;demoDashboard({headers:{authorization:"Bearer invalid"}},res(),()=>{next=true});
 assert.equal(next,true);
});
