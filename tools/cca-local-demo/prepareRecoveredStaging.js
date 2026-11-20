"use strict";
// Explicit offline recovery: create a SEPARATE CCA workspace with two
// unsupported-role identities quarantined (disabled/no grants).
// Never edit or replace the original encrypted vault, key, audit or checkpoint.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {simulateVaultQuarantine}=require("./vaultQuarantineRehearsal");
const {createCheckpoint,deriveKey}=require("./stagingState");
const {createAuditLedger}=require("./auditLedger");
const {openStaging}=require("./runStaging");
const FILES=Object.freeze({
 vault:"cca-identities.enc.json",
 backup:"cca-identities.previous.enc.json",
 recovery:"cca-recovery-review-required",
 audit:"auth-audit.log",
 throttle:"source-throttle.json",
});
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");

function prepareRecoveredStaging({directory,master}={}){
 const base=process.env.LOCALAPPDATA;
 const original=path.join(base||"","CRNetwork-CCA-Stage4D");
 const recovered=path.join(base||"","CRNetwork-CCA-Stage4D-Recovered");
 if(process.platform!=="win32"||!base||directory!==original||
    !Buffer.isBuffer(master)||master.length!==32)
   throw Error("CCA_RECOVERY_SOURCE_INVALID");
 if(!fs.existsSync(recovered)||!fs.statSync(recovered).isDirectory()||
    fs.readdirSync(recovered).length!==0)
   throw Error("CCA_RECOVERY_DESTINATION_NOT_EMPTY_OR_MISSING");
 if(fs.existsSync(path.join(original,"host-security","writer.lock")))
   throw Error("CCA_ORIGINAL_WRITER_STILL_ACTIVE");
 const originalFiles={};
 const checkSource=(source)=>{
  const stat=fs.lstatSync(source);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)
    throw Error("CCA_RECOVERY_SOURCE_FILE_INVALID");
  const buffer=fs.readFileSync(source);
  originalFiles[source]=sha(buffer);
  return buffer;
 };
 const state=path.join(recovered,"state");
 const security=path.join(recovered,"host-security");
 let successful=false;
 try{
  fs.mkdirSync(state,{mode:0o700});fs.mkdirSync(security,{mode:0o700});
  for(const filename of Object.values(FILES)){
   const source=path.join(original,"state",filename);
   if(!fs.existsSync(source))continue;
   fs.writeFileSync(path.join(state,filename),checkSource(source),{flag:"wx",mode:0o600});
  }
  for(const filename of ["staging-key.dpapi","state-checkpoint.json"]){
   const source=path.join(original,"host-security",filename);
   fs.writeFileSync(path.join(security,filename),checkSource(source),{flag:"wx",mode:0o600});
  }
  const originalSupport=path.join(original,"fictional-support");
  if(fs.existsSync(originalSupport)){
   const copySupport=(from,to)=>{
    const sourceStat=fs.lstatSync(from);
    if(sourceStat.isSymbolicLink())throw Error("CCA_RECOVERY_SUPPORT_SYMLINK_DENIED");
    if(sourceStat.isDirectory()){
      fs.mkdirSync(to,{mode:0o700});
      for(const entry of fs.readdirSync(from))copySupport(path.join(from,entry),path.join(to,entry));
    }else if(sourceStat.isFile()&&sourceStat.size<=1024*1024){
      fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
    }else throw Error("CCA_RECOVERY_SUPPORT_FILE_INVALID");
   };
   copySupport(originalSupport,path.join(recovered,"fictional-support"));
  }
  const snapshot=Object.fromEntries(Object.entries(FILES).map(([k,v])=>[k,path.join(state,v)]));
  const checkpoint=createCheckpoint({
   file:path.join(security,"state-checkpoint.json"),
   files:snapshot,key:deriveKey(master,"checkpoint-v1"),
  });
  const ledger=createAuditLedger({
   file:path.join(state,FILES.audit),key:deriveKey(master,"audit-v1")
  });
  ledger.verify();
  const candidateDir=path.join(recovered,"candidate");
  fs.mkdirSync(candidateDir,{mode:0o700});
  let quarantine;
  try {
   quarantine=simulateVaultQuarantine({
     encryptedFile:path.join(state,FILES.vault),
     encryptionKey:deriveKey(master,"vault-v1"),
     tempDir:candidateDir,
   });
   if(!quarantine.stagingOperatorUnaffected||
      quarantine.unaffectedActiveAccounts<1||
      quarantine.quarantinedAccounts<1)
    throw Error("CCA_RECOVERY_OPERATOR_NOT_USABLE");
   fs.copyFileSync(path.join(candidateDir,FILES.vault),path.join(state,FILES.vault));
  }finally{
   fs.rmSync(candidateDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
  ledger.append({
   event:"CCA_IDENTITY_ROLE_QUARANTINED",
   actor:"LOCAL_RECOVERY_OPERATOR",
   target:"CCA_STAGE4D_RECOVERED",
  });
  checkpoint.commit();
  const opened=openStaging({directory:recovered,master});
  if(!opened.server)throw Error("CCA_RECOVERY_STAGING_SERVER_INVALID");
  opened.release();
  for(const [source,expected] of Object.entries(originalFiles)){
   if(sha(fs.readFileSync(source))!==expected)
    throw Error("CCA_RECOVERY_ORIGINAL_FILE_CHANGED");
  }
  fs.writeFileSync(path.join(recovered,"recovery-readiness.json"),
    JSON.stringify({
      scope:"ISOLATED_RECOVERED_CCA_STAGING",
      recoveredAtUtc:new Date().toISOString(),
      sourceVaultSha256:originalFiles[path.join(original,"state",FILES.vault)],
      quarantinedAccounts:quarantine.quarantinedAccounts,
      stagingOperatorUnaffected:true,
      authenticatedLoginTested:false,
      originalVaultUnchanged:true,
      postgresOptInRequired:true,
    },null,2),{flag:"wx",mode:0o600});
  successful=true;
  return Object.freeze({
    status:"PASS",isolatedWorkspaceCreated:true,
    checkpointAndAuditVerified:true,sourceVaultUnchanged:true,
    quarantinedAccounts:quarantine.quarantinedAccounts,
    stagingOperatorUnaffected:true,
    loginAuthenticated:false,
  });
 }finally {
  if(!successful){
   fs.rmSync(recovered,{recursive:true,force:true,maxRetries:4,retryDelay:200});
  }
 }
}
module.exports={prepareRecoveredStaging};
