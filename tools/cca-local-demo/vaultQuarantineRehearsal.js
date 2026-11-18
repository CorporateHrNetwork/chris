"use strict";
// A DRY-RUN ONLY recovery proof for encrypted CCA identity vaults.
// Never writes to the protected source vault, checkpoint, audit or backup.
// All unknown role assignments are preserved as encrypted evidence and their
// accounts become disabled with a sentinel role that grants NO permissions.
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const {createIdentityVault}=require("./identityVault");
const {ROLES}=require("../../backend/src/cca/controlPlanePolicy");

function simulateVaultQuarantine({encryptedFile,encryptionKey,tempDir}={}){
 if(!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||
    typeof encryptedFile!=="string"||typeof tempDir!=="string"||
    !path.isAbsolute(encryptedFile)||!path.isAbsolute(tempDir))
   throw Error("CCA_QUARANTINE_REHEARSAL_INVALID_INPUT");
 const original=fs.readFileSync(encryptedFile);
 if(original.length>1024*1024)throw Error("CCA_QUARANTINE_REHEARSAL_OVERSIZE");
 const outer=JSON.parse(original.toString("utf8"));
 if(outer.version!==1||typeof outer.iv!=="string"||
    typeof outer.tag!=="string"||typeof outer.encrypted!=="string")
   throw Error("CCA_QUARANTINE_REHEARSAL_FORMAT_INVALID");
 const iv=Buffer.from(outer.iv,"base64"),tag=Buffer.from(outer.tag,"base64");
 if(iv.length!==12||tag.length!==16)throw Error("CCA_QUARANTINE_REHEARSAL_FORMAT_INVALID");
 const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey,iv);
 decipher.setAuthTag(tag);
 const plaintext=Buffer.concat([
  decipher.update(Buffer.from(outer.encrypted,"base64")),
  decipher.final()
 ]);
 let data;
 try{data=JSON.parse(plaintext.toString("utf8"))}
 finally{plaintext.fill(0)}
 if(data?.version!==1||!Array.isArray(data?.users)||
    !Array.isArray(data?.events))throw Error("CCA_QUARANTINE_REHEARSAL_SCHEMA_INVALID");
 let quarantined=0;
 for(const user of data.users){
  if(!Array.isArray(user?.roles)||user.roles.length<1||user.roles.length>10||
     !user.roles.every(role=>typeof role==="string"&&role.length>0&&role.length<=128))
   throw Error("CCA_QUARANTINE_REHEARSAL_ROLE_SHAPE_INVALID");
  if(user.roles.every(role=>Object.hasOwn(ROLES,role)))continue;
  user.quarantineOriginalRoles=[...user.roles];
  user.roles=["CCA_QUARANTINED_NO_ACCESS"];
  user.active=false;
  quarantined++;
 }
 if(quarantined===0)throw Error("CCA_QUARANTINE_REHEARSAL_NOT_REQUIRED");
 const candidateIv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey,candidateIv);
 const sensitive=Buffer.from(JSON.stringify(data),"utf8");
 let ciphertext;
 try{ciphertext=Buffer.concat([cipher.update(sensitive),cipher.final()])}
 finally{sensitive.fill(0)}
 const candidate=JSON.stringify({
  version:1,iv:candidateIv.toString("base64"),
  tag:cipher.getAuthTag().toString("base64"),
  encrypted:ciphertext.toString("base64")
 });
 const copy=path.join(tempDir,"cca-identities.enc.json");
 if(fs.existsSync(copy))throw Error("CCA_QUARANTINE_REHEARSAL_DEST_EXISTS");
 fs.writeFileSync(copy,candidate,{flag:"wx",mode:0o600});
 // The ordinary production validator must accept the isolated copy;
 // the actual protected vault, permissions and audit are never mutated.
 const validated=createIdentityVault({directory:tempDir,encryptionKey});
 if(!validated)throw Error("CCA_QUARANTINE_REHEARSAL_VALIDATION_FAILED");
 return Object.freeze({
  status:"PASS",
  quarantinedAccounts:quarantined,
  unaffectedActiveAccounts:data.users.filter(user=>user.active===true).length,
  noAccessForQuarantined:true,
  sourceUnchanged:true,
 });
}
module.exports={simulateVaultQuarantine};
