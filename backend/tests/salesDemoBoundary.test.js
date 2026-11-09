const test=require('node:test'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
process.env.JWT_SECRET='synthetic-demo-test-secret';const {salesDemoBoundary}=require('../src/middleware/salesDemoBoundary');
function check({org='chris-demo-org-20261022',path='/api/employees',method='GET',body={},token=true}={}){let next=false;const res={statusCode:200,status(v){this.statusCode=v;return this;},json(value){this.body=value;return this;}};salesDemoBoundary({path,method,body,headers:{authorization:token?'Bearer '+jwt.sign({organizationId:org},process.env.JWT_SECRET):''}},res,()=>{next=true;});return {next,res};}
test('demo tenant boundary permits only verified fictional tenant claims and known demo login slugs',()=>{assert.equal(check().next,true);assert.equal(check({org:'chris-client-demo-org-20261025'}).next,true);assert.equal(check({org:'production-tenant'}).res.statusCode,403);assert.equal(check({token:false}).res.statusCode,403);assert.equal(check({path:'/api/auth/login',method:'POST',body:{organizationSlug:'chris-demo-company'}}).next,true);assert.equal(check({path:'/api/auth/login',method:'POST',body:{organizationSlug:'zermatt-liquor-limited'}}).res.statusCode,403);});
test('demo cannot change records, send mail, pay or open customer-specific policy endpoints',()=>{for(const path of ['/api/payroll/runs/x/approve','/api/payroll/payslips/x/email','/api/employees','/api/auth/forgot-password'])assert.equal(check({path,method:'POST'}).res.statusCode,403);for(const path of ['/api/zermatt/employee-options','/api/payroll/transport-support','/api/performance-evaluation/policy','/api/benefits/leave-allowance'])assert.equal(check({path}).res.statusCode,403);});

test('demo allows authenticated pricing reads and calculations, but never invoice or payment actions',()=>{
  assert.equal(check({path:'/api/billing/catalogue'}).next,true);
  assert.equal(check({path:'/api/billing/quotes',method:'POST'}).next,true);
  assert.equal(check({path:'/api/billing/quotes',method:'POST',org:'production-tenant'}).res.statusCode,403);
  assert.equal(check({path:'/api/billing/quotes',method:'POST',token:false}).res.statusCode,403);
  for(const path of ['/api/billing/invoice/email','/api/billing/payments','/api/billing/subscriptions']) assert.equal(check({path,method:'POST'}).res.statusCode,403);
  assert.equal(check({path:'/api/billing/history'}).res.statusCode,403);
});

test('only Northstar sessions can enter the permission-checked payroll write routes', () => {
  for (const path of [
    '/api/payroll/runs/draft',
    '/api/payroll/runs/demo-run/submit',
    '/api/payroll/runs/demo-run/decision',
    '/api/payroll/runs/demo-run/reopen',
    '/api/attendance/manual-payroll-inputs',
  ]) {
    assert.equal(check({ path, method: 'POST' }).next, true);
    assert.equal(check({ path, method: 'POST', org: 'chris-client-demo-org-20261025' }).res.statusCode, 403);
    assert.equal(check({ path, method: 'POST', org: 'production-tenant' }).res.statusCode, 403);
    assert.equal(check({ path, method: 'POST', body: { organizationId: 'production-tenant' } }).res.statusCode, 403);
    assert.equal(check({ path, method: 'POST', token: false }).res.statusCode, 403);
  }
});
