"use strict";

// Standalone verifier for a separately administered CCA operator identity service.
// Does NOT issue credentials, accept passwords or configure an IdP. Strict RS256,
// issuer/audience and revocation requirements; no shared CHRiS login shortcuts.
const crypto=require("node:crypto");
const {grantsForRoles,PERMISSIONS}=require("./controlPlanePolicy");

function createCcaOperatorJwtVerifier({
  publicKeyPem,issuer,audience,keyId,isRevoked,clock=()=>Date.now()
}={}){
  if(typeof publicKeyPem!=="string" || !publicKeyPem.includes("BEGIN PUBLIC KEY") ||
     typeof issuer!=="string" || !/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(issuer) ||
     typeof audience!=="string" || !/^cca-hosted-[a-z0-9-]{3,48}$/.test(audience) ||
     typeof keyId!=="string" || !/^[a-zA-Z0-9_-]{4,64}$/.test(keyId) ||
     typeof isRevoked!=="function" || typeof clock!=="function"){
    throw Error("CCA_JWT_VERIFIER_CONFIG_REQUIRED");
  }
  let publicKey;
  try{
    publicKey=crypto.createPublicKey(publicKeyPem);
    if(publicKey.asymmetricKeyType!=="rsa" ||
       (publicKey.asymmetricKeyDetails?.modulusLength||0)<2048)
      throw Error("CCA_JWT_KEY_INVALID");
  }catch{throw Error("CCA_JWT_KEY_INVALID");}
  const decode=value=>{
    if(typeof value!=="string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(value))
      throw Error("CCA_JWT_MALFORMED");
    const raw=Buffer.from(value,"base64url");
    if(raw.toString("base64url")!==value)throw Error("CCA_JWT_MALFORMED");
    const data=JSON.parse(raw.toString("utf8"));
    if(!data || typeof data!=="object" || Array.isArray(data))throw Error("CCA_JWT_MALFORMED");
    return data;
  };
  return async token=>{
    try{
      if(typeof token!=="string" || token.length>2048 ||
         !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
        return null;
      const parts=token.split(".");
      const header=decode(parts[0]),claims=decode(parts[1]);
      if(header.alg!=="RS256" || header.typ!=="JWT" || header.kid!==keyId ||
         header.crit || header.jku || header.jwk || header.x5u || header.x5c)
        return null;
      const signature=Buffer.from(parts[2],"base64url");
      if(signature.toString("base64url")!==parts[2] ||
         !crypto.verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),publicKey,signature))
        return null;
      const now=Math.floor(clock()/1000);
      if(!Number.isFinite(now) || claims.iss!==issuer || claims.aud!==audience ||
         !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
         !Number.isSafeInteger(claims.nbf) ||
         claims.iat>now+30 || claims.nbf>now+30 || claims.exp<=now ||
         claims.exp-claims.iat>900 || claims.exp<=claims.iat ||
         typeof claims.jti!=="string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(claims.jti) ||
         typeof claims.sub!=="string" || !/^cca-[a-z0-9_-]{4,100}$/.test(claims.sub) ||
         claims.scope!=="CCA" || claims.subjectType!=="OPERATOR" ||
         typeof claims.tenantId!=="string" ||
         !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.tenantId) ||
         !Array.isArray(claims.roles) || claims.roles.length<1 || claims.roles.length>10 ||
         claims.roles.some(r=>typeof r!=="string")) return null;
      const grants=grantsForRoles(claims.roles);
      if(!grants.includes(PERMISSIONS.TICKETS_READ))return null;
      // Revocation service failures fail closed. No token, claims or errors logged.
      if(await isRevoked({jti:claims.jti,subject:claims.sub})!==false)return null;
      return {
        verified:true,revoked:false,scope:"CCA",subjectType:"OPERATOR",
        expiresAtMs:claims.exp*1000,tenantId:claims.tenantId,roles:[...claims.roles],
        context:{
          platformIdentityVerified:true,platformScope:"CCA",platformGrants:grants,
          tenantGrants:{[claims.tenantId]:grants}
        }
      };
    }catch{return null;}
  };
}
module.exports={createCcaOperatorJwtVerifier};
