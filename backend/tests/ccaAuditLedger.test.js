"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createAuditLedger}=require("../../tools/cca-local-demo/auditLedger");
test("independent signed audit chain verifies across reopening and refuses edits",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-audit-"));
 try{
  const file=path.join(dir,"ledger.log"),key=Buffer.alloc(32,19);
  const ledger=createAuditLedger({file,key,clock:()=>"2026-11-08T10:00:00Z"});
  assert.equal(ledger.append({event:"CCA_IDENTITY_ENROLLED",actor:"demo-root",target:"demo-agent"}).sequence,1);
  assert.equal(ledger.append({event:"CCA_MFA_VERIFIED",actor:"demo-agent",target:"demo-agent"}).sequence,2);
  assert.equal(createAuditLedger({file,key}).verify().count,2);
  const original=fs.readFileSync(file,"utf8");
  fs.writeFileSync(file,original.replace("demo-agent","demo-other"),"utf8");
  assert.throws(()=>ledger.verify(),/CCA_AUDIT_SIGNATURE_INVALID/);
  assert.throws(()=>ledger.append({event:"CCA_MFA_VERIFIED",actor:"demo-root",target:"demo-root"}),/CCA_AUDIT_SIGNATURE_INVALID/);
  fs.writeFileSync(file,original.slice(0,-3),"utf8");
  assert.throws(()=>ledger.verify(),/CCA_AUDIT_TRUNCATED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("wrong signing key fails verification",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-audit-"));
 try{
  const file=path.join(dir,"ledger.log");
  createAuditLedger({file,key:Buffer.alloc(32,8)}).append({event:"CCA_MFA_REJECTED",actor:"demo",target:"demo"});
  assert.throws(()=>createAuditLedger({file,key:Buffer.alloc(32,9)}).verify(),/SIGNATURE/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
