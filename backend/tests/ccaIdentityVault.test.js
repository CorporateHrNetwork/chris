"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {createIdentityVault,inspectVaultBackup,restoreVaultBackup}=require("../../tools/cca-local-demo/identityVault");
const {otpAt}=require("../../tools/cca-local-demo/localIdentityLab");
const secret=Buffer.from("12345678901234567890");
const now=1800000030;
const key=Buffer.alloc(32,5);
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),"cca-vault-test-"));
const open=dir=>createIdentityVault({directory:dir,encryptionKey:key,clock:()=>now});
const enrollment=(id,roles,tenants=[])=>({
 id,password:"UniqueLongDemoPassword!491",mfaSecret:secret,roles,tenantIds:tenants
});
function signIn(vault,id){
 const first=vault.passwordStep(id,"UniqueLongDemoPassword!491");
 assert.equal(first.ok,true);
 const confirmed=vault.mfaStep(first.challenge,otpAt(secret,Math.floor(now/30)));
 assert.equal(confirmed.ok,true);
 return confirmed.token;
}
test("independent CCA identity and MFA enrollment persist encrypted across restarts",()=>{
 const dir=setup();
 try{
  const vault=open(dir);
  vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  const approver=signIn(vault,"cca-demo-root");
  vault.register(enrollment("cca-demo-service",["SERVICE_AGENT"],["demo-cedar"]),{
   actor:"cca-demo-root",token:approver
  });
  const file=fs.readFileSync(vault.file,"utf8");
  assert.equal(file.includes("UniqueLongDemoPassword"),false);
  assert.equal(file.includes("12345678901234567890"),false);
  assert.equal(file.includes("cca-demo-root"),false);
  const later=open(dir);
  assert.equal(later.passwordStep("cca-demo-service","UniqueLongDemoPassword!491").ok,true);
  assert.equal(later.context(approver).accepted,false);
  assert.equal(later.mfaStep("bad","123456").ok,false);
  assert.equal(fs.existsSync(later.backup),true);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("vault fails closed when tampered, unreadable, wrong key or missing primary",()=>{
 const dir=setup();
 try{
  const vault=open(dir);vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  const badkey=Buffer.alloc(32,8);
  assert.throws(()=>createIdentityVault({directory:dir,encryptionKey:badkey}),/authenticat/);
  const bytes=JSON.parse(fs.readFileSync(vault.file,"utf8"));
  bytes.encrypted="AAAA"+bytes.encrypted.slice(4);
  fs.writeFileSync(vault.file,JSON.stringify(bytes));
  assert.throws(()=>open(dir));
  // Explicit recovery is withheld: a damaged vault is never automatically overwritten.
  assert.equal(fs.readFileSync(vault.file,"utf8"),JSON.stringify(bytes));
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("role changes require a different verified platform approver; revoke target session",()=>{
 const dir=setup();
 try{
  const vault=open(dir);
  vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  const approver=signIn(vault,"cca-demo-root");
  vault.register(enrollment("cca-demo-service",["SERVICE_AGENT"],["demo-cedar"]),{
   actor:"cca-demo-root",token:approver
  });
  const requester=signIn(vault,"cca-demo-service");
  assert.deepEqual(vault.context(requester).assignedTenantIds,["demo-cedar"]);
  assert.equal(vault.changeRoles({targetId:"cca-demo-service",roles:["BILLING_OFFICER"],
   tenantIds:["demo-atlas"],requesterToken:requester,approverToken:requester}).ok,false);
  assert.equal(vault.changeRoles({targetId:"cca-demo-service",roles:["BILLING_OFFICER"],
   tenantIds:["demo-atlas"],requesterToken:requester,approverToken:approver}).ok,true);
  assert.equal(vault.context(requester).accepted,false);
  const log=vault.audit(approver);
  assert.equal(log.ok,true);
  assert.equal(log.events.some(e=>e.event==="CCA_ROLE_CHANGE_APPROVED"),true);
  assert.equal(JSON.stringify(log).includes("mfaSecret"),false);
  const next=open(dir);
  assert.equal(next.passwordStep("cca-demo-service","UniqueLongDemoPassword!491").ok,true);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("unverified users cannot read audit or register additional identities",()=>{
 const dir=setup();
 try{
  const vault=open(dir);vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  assert.equal(vault.audit("invalid").ok,false);
  assert.throws(()=>vault.register(enrollment("cca-demo-billing",["BILLING_OFFICER"])),
   /CCA_INDEPENDENT_APPROVER_REQUIRED/);
  assert.throws(()=>vault.register(enrollment("cca-demo-rogue",["ROOT_ACCESS"])),
   /CCA_INVALID_ENROLLMENT/);
  assert.equal(vault.passwordStep("cca-demo-root","wrong").ok,false);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});

test("encrypted vault backup can be inspected and restored only with explicit offline confirmation",()=>{
 const dir=setup();
 try {
   const first=open(dir);
   first.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
   const token=signIn(first,"cca-demo-root");
   first.register(enrollment("cca-demo-service",["SERVICE_AGENT"],["demo-cedar"]),{
     actor:"cca-demo-root",token
   });
   const backup=inspectVaultBackup({directory:dir,encryptionKey:key});
   assert.equal(backup.available,true);
   assert.equal(backup.identityCount,1);
   assert.throws(()=>restoreVaultBackup({directory:dir,encryptionKey:key}),/CONFIRMATION/);
   assert.throws(()=>restoreVaultBackup({directory:dir,encryptionKey:Buffer.alloc(32,11),confirm:true}));
   assert.equal(open(dir).passwordStep("cca-demo-service","UniqueLongDemoPassword!491").ok,true);
   const recovery=restoreVaultBackup({directory:dir,encryptionKey:key,confirm:true});
   assert.equal(recovery.restored,true);
   assert.throws(()=>open(dir),/CCA_RECOVERY_SECURITY_REVIEW_REQUIRED/);
   assert.equal(fs.existsSync(path.join(dir,"cca-recovery-review-required")),true);
   assert.equal(fs.readdirSync(dir).some(f=>f.startsWith("cca-identities.before-restore-")),true);
 } finally {fs.rmSync(dir,{force:true,recursive:true});}
});

test("five incorrect passwords cause persistent timed lockout across restart",()=>{
 const dir=setup();
 try{
  const vault=open(dir);
  vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  for(let i=0;i<5;i++)
    assert.equal(vault.passwordStep("cca-demo-root","invalid").ok,false);
  assert.equal(vault.passwordStep("cca-demo-root","UniqueLongDemoPassword!491").ok,false);
  const restarted=open(dir);
  assert.equal(restarted.passwordStep("cca-demo-root","UniqueLongDemoPassword!491").ok,false);
  assert.equal(restarted.audit("forged").ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("five incorrect MFA challenges cause persistent timed lockout across restart",()=>{
 const dir=setup();
 try{
  const vault=open(dir);
  vault.register(enrollment("cca-demo-root",["PLATFORM_APPROVER"]));
  for(let i=0;i<5;i++){
    const password=vault.passwordStep("cca-demo-root","UniqueLongDemoPassword!491");
    assert.equal(password.ok,true);
    assert.equal(vault.mfaStep(password.challenge,"000000").ok,false);
  }
  assert.equal(vault.passwordStep("cca-demo-root","UniqueLongDemoPassword!491").ok,false);
  assert.equal(open(dir).passwordStep("cca-demo-root","UniqueLongDemoPassword!491").ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
