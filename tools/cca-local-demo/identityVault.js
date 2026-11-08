"use strict";
/**
 * Stage 4D: offline independent CCA identity vault, not a web authentication
 * endpoint. No real customers, CHRiS login or production secrets.
 * Never commit a vault encryption key or saved vault files.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { checkOtp } = require("./localIdentityLab");
const { grantsForRoles } = require("../../backend/src/cca/controlPlanePolicy");
const { derivePlatformContext, isAuthorized } = require("../../backend/src/cca/platformDirectoryPolicy");

const VERSION = 1;
const MAX_FILE = 1024 * 1024;
const ALLOWED_ROLES = Object.freeze([
  "SERVICE_AGENT", "AI_OPERATOR", "BILLING_OFFICER",
  "CLIENT_LIFECYCLE_MANAGER", "RELEASE_MANAGER", "AUDITOR", "PLATFORM_APPROVER"
]);
const ID_PATTERN = /^cca-[a-z0-9][a-z0-9-]{3,50}$/;
const safeEqual = (a,b) => Buffer.isBuffer(a) && Buffer.isBuffer(b) &&
  a.length === b.length && crypto.timingSafeEqual(a,b);
const keyHash = token => crypto.createHash("sha256").update(token).digest("hex");
function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64");
}
function requireRole(role) {
  if (!ALLOWED_ROLES.includes(role) || grantsForRoles([role]).length === 0)
    throw Error("CCA_INVALID_ROLE");
}
function validateUser(user) {
  if (!user || !ID_PATTERN.test(user.id) || typeof user.passwordHash !== "string" ||
    typeof user.salt !== "string" || typeof user.mfaSecret !== "string" ||
    !Array.isArray(user.roles) || user.roles.length < 1 ||
    !user.roles.every(r => ALLOWED_ROLES.includes(r)) ||
    !Array.isArray(user.tenantIds) || !user.tenantIds.every(id =>
      ["demo-cedar", "demo-atlas"].includes(id)) ||
    typeof user.active !== "boolean" ||
    !Number.isSafeInteger(user.lastOtpCounter) ||
    !Number.isSafeInteger(user.failedPasswords) || user.failedPasswords<0 || user.failedPasswords>5 ||
    !Number.isSafeInteger(user.lockedUntil) || user.lockedUntil<0 ||
    !Number.isSafeInteger(user.failedMfa) || user.failedMfa<0 || user.failedMfa>5) throw Error("CCA_INVALID_IDENTITY_VAULT");
}
function validateData(data) {
  if (!data || data.version !== VERSION || !Array.isArray(data.users) ||
      !Array.isArray(data.events) || data.users.length > 30 ||
      data.events.length > 3000) throw Error("CCA_INVALID_IDENTITY_VAULT");
  const ids = new Set();
  for (const user of data.users) {
    validateUser(user);
    if (ids.has(user.id)) throw Error("CCA_DUPLICATE_IDENTITY");
    ids.add(user.id);
  }
  for (const ev of data.events) {
    if (!ev || typeof ev.actor !== "string" || typeof ev.event !== "string" ||
        typeof ev.target !== "string" || typeof ev.time !== "string") throw Error("CCA_INVALID_AUDIT");
  }
}
function encrypt(data, key) {
  validateData(data);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(data));
  const bytes = Buffer.concat([cipher.update(plain), cipher.final()]);
  const output = JSON.stringify({ version: VERSION, iv:iv.toString("base64"),
    tag:cipher.getAuthTag().toString("base64"), encrypted:bytes.toString("base64") });
  if (Buffer.byteLength(output) > MAX_FILE) throw Error("CCA_VAULT_TOO_LARGE");
  return output;
}
function decrypt(text, key) {
  if (Buffer.byteLength(text) > MAX_FILE) throw Error("CCA_VAULT_TOO_LARGE");
  const payload = JSON.parse(text);
  if (payload.version !== VERSION || typeof payload.encrypted !== "string" ||
      typeof payload.iv !== "string" || typeof payload.tag !== "string") throw Error("CCA_VAULT_FORMAT");
  const iv = Buffer.from(payload.iv, "base64"), tag = Buffer.from(payload.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw Error("CCA_VAULT_FORMAT");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const result = Buffer.concat([decipher.update(Buffer.from(payload.encrypted,"base64")),decipher.final()]);
  const data = JSON.parse(result.toString("utf8"));
  validateData(data);
  return data;
}
function createIdentityVault({ directory, encryptionKey, clock = () => Math.floor(Date.now()/1000) }) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32 ||
      typeof directory !== "string" || !path.isAbsolute(directory))
    throw Error("CCA_VAULT_CONFIGURATION_REQUIRED");
  const filename = path.join(directory, "cca-identities.enc.json");
  const backup = path.join(directory, "cca-identities.previous.enc.json");
  const quarantine = path.join(directory, "cca-recovery-review-required");
  if (fs.existsSync(quarantine)) throw Error("CCA_RECOVERY_SECURITY_REVIEW_REQUIRED");
  const sessions = new Map(), challenges = new Map();
  let data;
  if (fs.existsSync(filename)) {
    data = decrypt(fs.readFileSync(filename, "utf8"), encryptionKey);
  } else {
    if (fs.existsSync(backup)) throw Error("CCA_VAULT_PRIMARY_MISSING");
    data = { version: VERSION, users: [], events: [] };
  }
  const clone = obj => structuredClone(obj);
  function persist(next) {
    validateData(next);
    const contents = encrypt(next, encryptionKey);
    fs.mkdirSync(directory, {recursive:true,mode:0o700});
    if (fs.existsSync(filename)) decrypt(fs.readFileSync(filename,"utf8"), encryptionKey);
    const temporary = path.join(directory, ".cca-" + crypto.randomUUID() + ".tmp");
    let fd;
    try {
      fd = fs.openSync(temporary, "wx", 0o600);
      fs.writeFileSync(fd, contents,"utf8");
      fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      if (fs.existsSync(filename)) fs.copyFileSync(filename,backup);
      fs.renameSync(temporary,filename);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    data = next;
  }
  function audited(next, event, actor, target) {
    next.events.push({ sequence:next.events.length+1,
      event, actor, target, time:new Date(clock()*1000).toISOString() });
    persist(next);
  }
  function register({id,password,mfaSecret,roles,tenantIds=[]}, authorizer) {
    if (!ID_PATTERN.test(id || "") || typeof password !== "string" ||
      password.length < 14 || password.length > 256 ||
      !Buffer.isBuffer(mfaSecret) || mfaSecret.length < 20 ||
      !Array.isArray(roles) || roles.length < 1 ||
      !roles.every(role=>ALLOWED_ROLES.includes(role)) ||
      !Array.isArray(tenantIds) || tenantIds.some(t=>!["demo-cedar","demo-atlas"].includes(t)) ||
      data.users.some(u=>u.id===id)) throw Error("CCA_INVALID_ENROLLMENT");
    if (data.users.length > 0 && !requireApprover(authorizer))
      throw Error("CCA_INDEPENDENT_APPROVER_REQUIRED");
    const next=clone(data), salt=crypto.randomBytes(16);
    next.users.push({id,salt:salt.toString("base64"),
      passwordHash:passwordHash(password,salt),mfaSecret:mfaSecret.toString("base64"),
      roles:[...new Set(roles)],tenantIds:[...new Set(tenantIds)],
      active:true,lastOtpCounter:-1,failedPasswords:0,failedMfa:0,lockedUntil:0});
    audited(next, "CCA_IDENTITY_ENROLLED", data.users.length===0?"LOCAL_INITIAL_BOOTSTRAP":authorizer.actor,id);
    return {ok:true,id};
  }
  function passwordStep(id,password) {
    const user=data.users.find(u=>u.id===id && u.active);
    const fake=Buffer.alloc(16);
    const actual=typeof password==="string" && password.length<=256 ?
      Buffer.from(passwordHash(password, user?Buffer.from(user.salt,"base64"):fake),"base64") : Buffer.alloc(64);
    const expected=user?Buffer.from(user.passwordHash,"base64"):Buffer.alloc(64);
    if (!user || clock()<user.lockedUntil) return {ok:false,code:"CCA_AUTH_FAILED"};
    if (!safeEqual(actual,expected)) {
      const next=clone(data), target=next.users.find(u=>u.id===user.id);
      target.failedPasswords+=1;
      if (target.failedPasswords>=5) {
        target.failedPasswords=0;
        target.lockedUntil=clock()+300;
      }
      audited(next,"CCA_PASSWORD_REJECTED",user.id,user.id);
      return {ok:false,code:"CCA_AUTH_FAILED"};
    }
    if(user.failedPasswords!==0 || user.lockedUntil!==0) {
      const next=clone(data), target=next.users.find(u=>u.id===user.id);
      target.failedPasswords=0;target.lockedUntil=0;
      persist(next);
    }
    for (const [ref, pending] of challenges) if (pending.expires <= clock()) challenges.delete(ref);
    const challenge=crypto.randomBytes(32).toString("base64url");
    challenges.set(keyHash(challenge),{id,expires:clock()+120});
    return {ok:true,challenge};
  }
  function mfaStep(challenge,code) {
    if(typeof challenge!=="string" || challenge.length>200) return {ok:false,code:"CCA_AUTH_FAILED"};
    const ref=keyHash(challenge), pending=challenges.get(ref);
    challenges.delete(ref);
    const user=pending && data.users.find(u=>u.id===pending.id && u.active);
    if (!user || pending.expires<=clock() || clock()<user.lockedUntil)
      return {ok:false,code:"CCA_AUTH_FAILED"};
    const counter=checkOtp(Buffer.from(user.mfaSecret,"base64"),code,clock(),user.lastOtpCounter);
    if (counter<0) {
      const next=clone(data), target=next.users.find(u=>u.id===user.id);
      target.failedMfa+=1;
      if(target.failedMfa>=5) {
        target.failedMfa=0;target.lockedUntil=clock()+300;
      }
      audited(next,"CCA_MFA_REJECTED",user.id,user.id);
      return {ok:false,code:"CCA_AUTH_FAILED"};
    }
    const next=clone(data), updated=next.users.find(u=>u.id===user.id);
    updated.lastOtpCounter=counter;updated.failedMfa=0;updated.lockedUntil=0;
    audited(next,"CCA_MFA_VERIFIED",user.id,user.id);
    for (const [ref, session] of sessions) if (session.expiry <= clock()) sessions.delete(ref);
    const token=crypto.randomBytes(32).toString("base64url");
    sessions.set(keyHash(token),{id:user.id,expiry:clock()+900});
    return {ok:true,token,expiresAt:clock()+900};
  }
  function context(token) {
    if(typeof token!=="string" || token.length>200) return {accepted:false};
    const session=sessions.get(keyHash(token));
    const user=session && data.users.find(u=>u.id===session.id && u.active);
    if(!user || session.expiry<=clock()) return {accepted:false};
    const assignments=[
      ...user.roles.map((role,i)=>({assignmentId:"cca-"+i,principalId:user.id,
        active:true,scope:"PLATFORM",role})),
      ...user.tenantIds.map((tenantId,i)=>({assignmentId:"tenant-"+i,principalId:user.id,
        active:true,scope:"TENANT",tenantId,role:user.roles[0]}))
    ];
    return derivePlatformContext({sessionResult:{accepted:true,platformPrincipalId:user.id,
      sessionId:keyHash(token).slice(0,16)},principal:{id:user.id,active:true},assignments});
  }
  function requireApprover(approval) {
    if(!approval || typeof approval.actor!=="string" || typeof approval.token!=="string") return false;
    const current=context(approval.token);
    return current.accepted===true && current.principalId===approval.actor &&
      isAuthorized(current,"cca.approvals.grant");
  }
  function changeRoles({targetId,roles,tenantIds,requesterToken,approverToken}) {
    const requester=context(requesterToken), approver=context(approverToken);
    if(!requester.accepted || !approver.accepted ||
      requester.principalId===approver.principalId ||
      !isAuthorized(approver,"cca.approvals.grant") ||
      !Array.isArray(roles) || roles.length<1 || !roles.every(r=>ALLOWED_ROLES.includes(r)) ||
      !Array.isArray(tenantIds) || tenantIds.some(id=>!["demo-cedar","demo-atlas"].includes(id)))
      return {ok:false,code:"CCA_ROLE_CHANGE_DENIED"};
    const next=clone(data),target=next.users.find(u=>u.id===targetId && u.active);
    if(!target || target.id===approver.principalId) return {ok:false,code:"CCA_ROLE_CHANGE_DENIED"};
    target.roles=[...new Set(roles)];target.tenantIds=[...new Set(tenantIds)];
    audited(next,"CCA_ROLE_CHANGE_APPROVED",approver.principalId,targetId);
    for(const [hash,s] of sessions) if(s.id===targetId) sessions.delete(hash);
    return {ok:true};
  }
  function revoke(token) {
    if(typeof token!=="string" || token.length>200) return false;
    return sessions.delete(keyHash(token));
  }
  function audit(token) {
    const ctx=context(token);
    if(!isAuthorized(ctx,"cca.audit.read")) return {ok:false,code:"CCA_AUDIT_DENIED"};
    return {ok:true,events:data.events.map(({sequence,event,actor,target,time})=>({
      sequence,event,actor,target,time}))};
  }
  return Object.freeze({register,passwordStep,mfaStep,context,changeRoles,revoke,audit,
    file:filename,backup});
}
function inspectVaultBackup({directory,encryptionKey}) {
  if(typeof directory!=="string" || !path.isAbsolute(directory) ||
      !Buffer.isBuffer(encryptionKey) || encryptionKey.length!==32)
    throw Error("CCA_VAULT_CONFIGURATION_REQUIRED");
  const backup=path.join(directory,"cca-identities.previous.enc.json");
  if(!fs.existsSync(backup)) return {available:false};
  const saved=decrypt(fs.readFileSync(backup,"utf8"),encryptionKey);
  return {available:true,identityCount:saved.users.length,auditEventCount:saved.events.length};
}
function restoreVaultBackup({directory,encryptionKey,confirm=false}) {
  if(confirm!==true) throw Error("CCA_EXPLICIT_RECOVERY_CONFIRMATION_REQUIRED");
  const info=inspectVaultBackup({directory,encryptionKey});
  if(!info.available) throw Error("CCA_NO_RECOVERY_BACKUP");
  // Run only with all CCA identity processes stopped. This function does not
  // coordinate multi-process access and must never be exposed via HTTP.
  const original=path.join(directory,"cca-identities.enc.json");
  const quarantine=path.join(directory,"cca-recovery-review-required");
  const backup=path.join(directory,"cca-identities.previous.enc.json");
  const source=fs.readFileSync(backup,"utf8");
  decrypt(source,encryptionKey);
  const temporary=path.join(directory,".cca-recover-"+crypto.randomUUID()+".tmp");
  let fd;
  try {
    fd=fs.openSync(temporary,"wx",0o600);
    fs.writeFileSync(fd,source,"utf8");fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    if(fs.existsSync(original)) {
      const archive=path.join(directory,"cca-identities.before-restore-"+Date.now()+".enc.json");
      fs.copyFileSync(original,archive);
    }
    const marker=fs.openSync(quarantine,"wx",0o600);
    try {
      fs.writeFileSync(marker,
        "Vault recovery requires independent security review, revocation reconciliation and MFA reset before activation.\n");
      fs.fsyncSync(marker);
    } finally { fs.closeSync(marker); }
    fs.renameSync(temporary,original);
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
  }
  return {restored:true,identityCount:info.identityCount,
    warning:"Previous snapshot restored. Review revoked roles and MFA counters before use."};
}
module.exports={createIdentityVault,ALLOWED_ROLES,inspectVaultBackup,restoreVaultBackup};
