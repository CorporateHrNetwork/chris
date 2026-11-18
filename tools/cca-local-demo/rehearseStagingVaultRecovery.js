"use strict";
// Offline full-checkpoint rehearsal for an unsupported historical role.
// Copies only encrypted files/checkpoints. NEVER writes the source directory.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {simulateVaultQuarantine}=require("./vaultQuarantineRehearsal");
const {createCheckpoint,deriveKey}=require("./stagingState");
const {openStaging}=require("./runStaging");

const FILES=Object.freeze({
 vault:"cca-identities.enc.json",
 backup:"cca-identities.previous.enc.json",
 recovery:"cca-recovery-review-required",
 audit:"auth-audit.log",
 throttle:"source-throttle.json",
});
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function rehearseStagingVaultRecovery({directory,master}={}){
 if(typeof directory!=="string"||!path.isAbsolute(directory)||
    !Buffer.isBuffer(master)||master.length!==32)
  throw Error("CCA_VAULT_FULL_REHEARSAL_INVALID_INPUT");
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"cca-full-vault-recovery-"));
 const fromState=path.join(directory,"state");
 const fromSecurity=path.join(directory,"host-security");
 const toState=path.join(temp,"state");
 const toSecurity=path.join(temp,"host-security");
 const isolated=fs.mkdtempSync(path.join(os.tmpdir(),"cca-vault-candidate-"));
 const originalHashes={};
 try{
  fs.mkdirSync(toState,{mode:0o700});fs.mkdirSync(toSecurity,{mode:0o700});
  for(const [name,filename] of Object.entries(FILES)){
   const source=path.join(fromState,filename),dest=path.join(toState,filename);
   if(!fs.existsSync(source))continue;
   const stat=fs.lstatSync(source);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)
    throw Error("CCA_VAULT_SOURCE_FILE_INVALID");
   const data=fs.readFileSync(source);
   originalHashes[name]=sha(data);
   fs.writeFileSync(dest,data,{flag:"wx",mode:0o600});
  }
  const sourceCheckpoint=path.join(fromSecurity,"state-checkpoint.json");
  if(!fs.existsSync(sourceCheckpoint))throw Error("CCA_VAULT_CHECKPOINT_MISSING");
  const checkpointBytes=fs.readFileSync(sourceCheckpoint);
  originalHashes.checkpoint=sha(checkpointBytes);
  fs.writeFileSync(path.join(toSecurity,"state-checkpoint.json"),checkpointBytes,{flag:"wx",mode:0o600});
  const mapped=Object.fromEntries(Object.entries(FILES).map(([k,v])=>[k,path.join(toState,v)]));
  const checkpoint=createCheckpoint({
   file:path.join(toSecurity,"state-checkpoint.json"),
   files:mapped,
   key:deriveKey(master,"checkpoint-v1"),
  });
  // Generate candidate in a separate ephemeral folder; only the copy of the
  // primary file in the ephemeral staging tree will be replaced.
  const quarantine=simulateVaultQuarantine({
   encryptedFile:path.join(toState,FILES.vault),
   encryptionKey:deriveKey(master,"vault-v1"),
   tempDir:isolated,
  });
  fs.copyFileSync(path.join(isolated,FILES.vault),path.join(toState,FILES.vault));
  checkpoint.commit();
  const runtime=openStaging({directory:temp,master});
  if(!runtime.server)throw Error("CCA_REHEARSAL_SERVER_NOT_CONSTRUCTED");
  runtime.release();
  // Verify original encrypted bytes and checkpoint were not modified.
  for(const [name,filename] of Object.entries(FILES)){
   if(!Object.hasOwn(originalHashes,name))continue;
   if(sha(fs.readFileSync(path.join(fromState,filename)))!==originalHashes[name])
    throw Error("CCA_ORIGINAL_VAULT_CHANGED");
  }
  if(sha(fs.readFileSync(sourceCheckpoint))!==originalHashes.checkpoint)
   throw Error("CCA_ORIGINAL_CHECKPOINT_CHANGED");
  return Object.freeze({
   status:"PASS",checkpointReconciled:true,
   stagingServerConstructed:true,protectedSourceUnchanged:true,
   quarantinedAccounts:quarantine.quarantinedAccounts,
   stagingOperatorUnaffected:quarantine.stagingOperatorUnaffected,
  });
 }finally{
  fs.rmSync(isolated,{recursive:true,force:true,maxRetries:4,retryDelay:200});
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:200});
 }
}
module.exports={rehearseStagingVaultRecovery};
