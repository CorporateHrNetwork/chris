"use strict";
// Read-only compatibility inspection. Copies encrypted vault blobs into an
// isolated temporary directory, validates using existing crypto and schema,
// emits categorical status only, and never mutates the protected source.
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {createIdentityVault}=require("./identityVault");

const SAFE_ERRORS=new Set([
 "CCA_INVALID_IDENTITY_VAULT:VAULT_CONTAINER",
 "CCA_INVALID_IDENTITY_VAULT:USER_IDENTIFIER",
 "CCA_INVALID_IDENTITY_VAULT:USER_CREDENTIAL_FIELDS",
 "CCA_INVALID_IDENTITY_VAULT:USER_ROLE_SHAPE",
 "CCA_INVALID_IDENTITY_VAULT:USER_ROLE_UNRECOGNIZED",
 "CCA_INVALID_IDENTITY_VAULT:USER_ROLE_CANONICALIZATION_REQUIRED",
 "CCA_INVALID_IDENTITY_VAULT:USER_TENANT_ASSIGNMENT",
 "CCA_INVALID_IDENTITY_VAULT:USER_ACTIVE_STATUS",
 "CCA_INVALID_IDENTITY_VAULT:USER_OTP_COUNTER",
 "CCA_INVALID_IDENTITY_VAULT:USER_PASSWORD_LOCKOUT",
 "CCA_INVALID_IDENTITY_VAULT:USER_LOCKOUT_TIME",
 "CCA_INVALID_IDENTITY_VAULT:USER_MFA_LOCKOUT",
 "CCA_INVALID_IDENTITY_VAULT:AUDIT_EVENT_FIELDS",
 "CCA_DUPLICATE_IDENTITY",
 "CCA_VAULT_FORMAT",
 "CCA_VAULT_TOO_LARGE"
]);
function classify(error) {
 const str=String(error?.message||"");
 return SAFE_ERRORS.has(str)?str:"CCA_VAULT_INTEGRITY_OR_FORMAT_FAILED";
}
function inspectVaultCompatibility({directory,encryptionKey}={}){
 if(typeof directory!=="string"||!path.isAbsolute(directory)||
     !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32)
   throw Error("CCA_INSPECTION_INPUT_INVALID");
 const state=path.join(directory,"state");
 const specimens=[
  {label:"primary",file:"cca-identities.enc.json"},
  {label:"previous",file:"cca-identities.previous.enc.json"},
 ];
 const outcomes=[];
 for(const specimen of specimens){
  const original=path.join(state,specimen.file);
  if(!fs.existsSync(original)){
   outcomes.push(Object.freeze({label:specimen.label,status:"MISSING"}));
   continue;
  }
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"cca-vault-readonly-"));
  try {
   const originalStat=fs.lstatSync(original);
   if(!originalStat.isFile()||originalStat.isSymbolicLink()||originalStat.size>1024*1024){
     outcomes.push(Object.freeze({label:specimen.label,status:"INVALID_SOURCE_FILE"}));
     continue;
   }
   const bytes=fs.readFileSync(original);
   const digest=crypto.createHash("sha256").update(bytes).digest("hex");
   fs.writeFileSync(path.join(tmp,"cca-identities.enc.json"),bytes,{flag:"wx",mode:0o600});
   try {
     createIdentityVault({directory:tmp,encryptionKey});
     outcomes.push(Object.freeze({label:specimen.label,status:"VALID",sha256:digest}));
   }catch(error){
     outcomes.push(Object.freeze({label:specimen.label,status:classify(error),sha256:digest}));
   }
  }finally {
   fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:150});
  }
 }
 return Object.freeze(outcomes);
}
module.exports={inspectVaultCompatibility};
