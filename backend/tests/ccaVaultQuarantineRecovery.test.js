"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {createIdentityVault}=require("../../tools/cca-local-demo/identityVault");
const {simulateVaultQuarantine}=require("../../tools/cca-local-demo/vaultQuarantineRehearsal");
const {otpAt}=require("../../tools/cca-local-demo/localIdentityLab");

function makeCipher(data,key){
 const iv=crypto.randomBytes(12);
 const enc=crypto.createCipheriv("aes-256-gcm",key,iv);
 const bytes=Buffer.concat([enc.update(Buffer.from(JSON.stringify(data))),enc.final()]);
 return JSON.stringify({version:1,iv:iv.toString("base64"),
  tag:enc.getAuthTag().toString("base64"),encrypted:bytes.toString("base64")});
}
function decipher(content,key){
 const data=JSON.parse(content),iv=Buffer.from(data.iv,"base64");
 const dec=crypto.createDecipheriv("aes-256-gcm",key,iv);
 dec.setAuthTag(Buffer.from(data.tag,"base64"));
 return JSON.parse(Buffer.concat([dec.update(Buffer.from(data.encrypted,"base64")),dec.final()]).toString("utf8"));
}
test("quarantine rehearsal preserves source, disables every unknown-role fictional identity, and preserves unaffected MFA",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"cca-vault-quarantine-test-"));
 const source=path.join(root,"source"),candidate=path.join(root,"candidate");
 fs.mkdirSync(source);fs.mkdirSync(candidate);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const key=Buffer.alloc(32,23),secret=Buffer.from("12345678901234567890");
 const password="Fictional-Operator-Only-Password-34567!";
 const vault=createIdentityVault({directory:source,encryptionKey:key,clock:()=>1800000030});
 vault.register({id:"cca-staging-operator",password,mfaSecret:secret,roles:["SERVICE_AGENT"],tenantIds:["demo-cedar"]});
 const file=path.join(source,"cca-identities.enc.json");
 const plaintext=decipher(fs.readFileSync(file,"utf8"),key);
 const legacy={...plaintext.users[0],id:"cca-legacy-operator",roles:["NOT_A_REAL_ROLE"],active:true};
 plaintext.users.push(legacy);
 fs.writeFileSync(file,makeCipher(plaintext,key));
 const originalHash=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
 const result=simulateVaultQuarantine({encryptedFile:file,encryptionKey:key,tempDir:candidate});
 assert.deepEqual(result,{
  status:"PASS",quarantinedAccounts:1,unaffectedActiveAccounts:1,
  stagingOperatorUnaffected:true,noAccessForQuarantined:true,sourceUnchanged:true
 });
 assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),originalHash);
 const recovered=createIdentityVault({directory:candidate,encryptionKey:key,clock:()=>1800000030});
 assert.deepEqual(recovered.passwordStep("cca-legacy-operator",password),{ok:false,code:"CCA_AUTH_FAILED"});
 const login=recovered.passwordStep("cca-staging-operator",password);
 assert.equal(login.ok,true);
 const mfa=recovered.mfaStep(login.challenge,otpAt(secret,Math.floor(1800000030/30)));
 assert.equal(mfa.ok,true);
 const context=recovered.context(mfa.token);
 assert.equal(context.accepted,true);
 assert.ok(context.platformGrants.includes("cca.tickets.read"));
 const recoveredData=decipher(fs.readFileSync(path.join(candidate,"cca-identities.enc.json"),"utf8"),key);
 const quarantined=recoveredData.users.find(u=>u.id==="cca-legacy-operator");
 assert.equal(quarantined.active,false);
 assert.deepEqual(quarantined.roles,["CCA_QUARANTINED_NO_ACCESS"]);
 assert.deepEqual(quarantined.quarantineOriginalRoles,["NOT_A_REAL_ROLE"]);
});
test("quarantine cannot be assigned during normal registration",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-guarded-role-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const vault=createIdentityVault({directory:dir,encryptionKey:Buffer.alloc(32,24)});
 assert.throws(()=>vault.register({id:"cca-invalid-role",password:"Fictional-Password-12345678!",
  mfaSecret:Buffer.alloc(20,1),roles:["CCA_QUARANTINED_NO_ACCESS"],tenantIds:[]}),
  /CCA_INVALID_ENROLLMENT/);
});
