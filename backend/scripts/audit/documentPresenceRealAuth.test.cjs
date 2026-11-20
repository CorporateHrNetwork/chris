'use strict';
// Tests the real CHRiS middleware implementation loaded from the repository,
// with fake JWT verifier and fake Prisma. NO NETWORK OR PRODUCTION ACCESS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const calls = [];
let scenario = { organization: 'corporatehr-network', permissions: [], active: true, ess: false, jwtValid: true };
const mockPrisma = {
  user: {
    findFirst: async (args) => {
      calls.push('lookup-user');
      if (!scenario.active) return null;
      const user = {
        id: 'fictional-platform-user', organizationId: 'fictional-platform-org',
        email: 'fake@example.invalid', isActive: true, employeeId: null,
        locationScope: 'ALL_LOCATIONS', userLocations: [],
        organization: { id: 'fictional-platform-org', slug: scenario.organization, status: 'ACTIVE' },
        userRoles: [{
          role: { name: 'Fictional Engineering', rolePermissions: scenario.permissions.map(key=>({
            permission: { key }
          })) }
        }]
      };
      return user;
    }
  },
  organizationLocation: { findMany: async () => [] },
  organization: { findUnique: async () => ({id:'fictional-zermatt-id',slug:'zermatt-liquor-limited'}) },
  employeeDocument: { findMany: async () => {
    calls.push('lookup-documents');
    return [{organizationId:'fictional-zermatt-id',storagePath:scenario.documentPath}];
  }}
};
const mockJwt = { verify: (token) => {
  if (!scenario.jwtValid) throw Object.assign(new Error('invalid'), {name:'JsonWebTokenError'});
  return {userId:'fictional-platform-user',organizationId:'fictional-platform-org',
    accessType:scenario.ess ? 'ESS' : undefined};
}};
const originalLoad = Module._load;
let middleware;
try {
  Module._load = function(request,parent,isMain) {
    if (request === 'jsonwebtoken') return mockJwt;
    if (request === '../config/prisma' && parent?.filename?.endsWith('authMiddleware.js')) return mockPrisma;
    return originalLoad.apply(this, arguments);
  };
  middleware = require('../../src/middleware/authMiddleware.js');
} finally { Module._load = originalLoad; }
const {runDocumentPresenceDiagnostic} = require('./documentPresenceIntegrationPrototype.cjs');
// Only fictional tests enable the server-owned audit gate in this isolated process.
process.env.CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED = 'true';

function response() {
 const r={statusCode:200, body:null, status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;}};
 return r;
}
async function pipeline({enabled=true,setupPermissions,organization='corporatehr-network',ess=false,active=true,jwtValid=true,authorized=true}={}) {
 calls.length=0;
 scenario={organization,permissions:setupPermissions ?? ['support.engineering.document_presence_audit'],
   ess,active,jwtValid};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chris-middleware-auth-'));
 const file=path.join(root,'fictional-only.pdf');
 fs.writeFileSync(file,'THIS IS FICTIONAL');
 scenario.documentPath=file;
 const req={headers:authorized?{authorization:'Bearer fake-jwt'}:{},auth:undefined};
 const res=response();
 let nextCalled=0;
 try {
   await middleware.requireAuth(req,res,()=>{nextCalled++});
   if (nextCalled===1) {
     middleware.requirePermission('support.engineering.document_presence_audit')(req,res,()=>{nextCalled++});
   }
   if (nextCalled!==2) return {status:res.statusCode,error:res.body,calls:[...calls],nextCalled};
   try {
     const result=await runDocumentPresenceDiagnostic({auth:req.auth,prisma:mockPrisma,
       enabled,trustedRoot:root});
     return {status:res.statusCode,result,calls:[...calls],nextCalled};
   } catch(e) {
     return {status:res.statusCode,errorCode:e.code,calls:[...calls],nextCalled};
   }
 } finally {
   delete scenario.documentPath;
   fs.rmSync(root,{recursive:true,force:true});
 }
}
test('real middleware passes platform engineer with dedicated permission and fictional file',async()=>{
 const r=await pipeline();
 assert.equal(r.nextCalled,2);
 assert.equal(r.result.total,1);
 assert.equal(r.result.present,1);
 assert.ok(r.calls.includes('lookup-documents'));
 assert.ok(!JSON.stringify(r).includes('fictional-only.pdf'));
});
test('real middleware blocks missing auth header before database lookup',async()=>{
 const r=await pipeline({authorized:false});
 assert.equal(r.status,401);assert.equal(r.nextCalled,0);
 assert.deepEqual(r.calls,[]);
});
test('real middleware blocks invalid signed token',async()=>{
 const r=await pipeline({jwtValid:false});
 assert.equal(r.status,401);assert.equal(r.nextCalled,0);
 assert.deepEqual(r.calls,[]);
});
test('real middleware rejects ESS token',async()=>{
 const r=await pipeline({ess:true});
 assert.equal(r.status,401);assert.equal(r.nextCalled,0);
 assert.deepEqual(r.calls,[]);
});
test('real middleware blocks inactive account',async()=>{
 const r=await pipeline({active:false});
 assert.equal(r.status,401);assert.equal(r.nextCalled,0);
 assert.deepEqual(r.calls,['lookup-user']);
});
test('real middleware prevents Zermatt tenant from exercising platform-only permission',async()=>{
 const r=await pipeline({organization:'zermatt-liquor-limited'});
 assert.equal(r.status,403);assert.equal(r.nextCalled,1);
 assert.ok(!r.calls.includes('lookup-documents'));
});
test('engineering escalation permission does not authorize document audit',async()=>{
 const r=await pipeline({setupPermissions:['support.engineering.escalate']});
 assert.equal(r.status,403);assert.equal(r.nextCalled,1);
 assert.ok(!r.calls.includes('lookup-documents'));
});
test('default-off feature gate prevents document query after authenticated middleware',async()=>{
 const r=await pipeline({enabled:false});
 assert.equal(r.nextCalled,2);assert.equal(r.errorCode,'DOCUMENT_DIAGNOSTIC_DISABLED');
 assert.ok(!r.calls.includes('lookup-documents'));
});
