"use strict";
/**
 * Isolated staging adapter. Never connect to CHRiS sessions or real tenants.
 * The encrypted vault and signing keys are supplied by the staging host or test harness.
 * The module intentionally provides no executable production bootstrap.
 */
const {createAuthServer}=require("./localAuthServer");
const {createSourceThrottle}=require("./sourceThrottle");
const {isAuthorized}=require("../../backend/src/cca/platformDirectoryPolicy");
function createStagingAuth({vault,account}){
 if(!vault || typeof vault.passwordStep!=="function" ||
    typeof vault.mfaStep!=="function" || typeof vault.context!=="function" ||
    typeof account!=="string" || !account.startsWith("cca-"))
   throw Error("CCA_STAGING_VAULT_REQUIRED");
 const lab=Object.freeze({
   loginPassword:({id,password})=>vault.passwordStep(id,password),
   loginOtp:({challenge,code})=>vault.mfaStep(challenge,code),
   resolveSession:(token,permission,tenantId)=>{
     const ctx=vault.context(token);
     if(!ctx.accepted || (permission && !isAuthorized(ctx,permission,tenantId)))
       return {accepted:false};
     return {accepted:true,principalId:ctx.principalId,
       assignedTenantIds:ctx.assignedTenantIds,platformScope:"CCA"};
   },
   revoke:(token)=>vault.revoke(token)
 });
 return Object.freeze({lab,account});
}
function createStagingServer({vault,account,auditLedger,sourceThrottle,checkpoint,staging=false}){
 if(!auditLedger || typeof auditLedger.append!=="function" ||
    typeof auditLedger.verify!=="function")
   throw Error("CCA_STAGING_AUDIT_REQUIRED");
 auditLedger.verify(); // fail closed when existing ledger is damaged
 return createAuthServer(createStagingAuth({vault,account}),
   {auditLedger,sourceThrottle:sourceThrottle||createSourceThrottle(),checkpoint,staging});
}
module.exports={createStagingAuth,createStagingServer};
