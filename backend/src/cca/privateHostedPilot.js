"use strict";

// Private CCA hosted pilot composition. No identity provider, key store,
// revocation service or database is provisioned here. All must be injected;
// startup remains loopback-only until independently reviewed TLS edge exists.
const {createCcaOperatorJwtVerifier}=require("./operatorJwtVerifier");
const {createCcaHostedSessionResolver}=require("./hostedOperatorSession");
const {createCcaHostedRuntime}=require("./hostedRuntime");

function createCcaPrivatePilot({env=process.env,Pool,isRevoked,clock}={}){
 if(env.CCA_PILOT_ENABLED!=="true" ||
    env.CCA_HOSTED_DATABASE_MODE!=="isolated-hosted" ||
    env.CCA_HOSTED_DATABASE_SCOPE!=="CCA_ONLY" ||
    typeof isRevoked!=="function" ||
    typeof Pool!=="function") {
  throw Error("CCA_PILOT_SECURITY_DEPENDENCIES_REQUIRED");
 }
 const verifier=createCcaOperatorJwtVerifier({
  publicKeyPem:env.CCA_OPERATOR_PUBLIC_KEY_PEM,
  issuer:env.CCA_OPERATOR_ISSUER,
  audience:env.CCA_OPERATOR_AUDIENCE,
  keyId:env.CCA_OPERATOR_KEY_ID,
  isRevoked,clock,
 });
 const resolveOperatorSession=createCcaHostedSessionResolver({
  verifyToken:verifier,
 });
 return createCcaHostedRuntime({env,Pool,resolveOperatorSession});
}
module.exports={createCcaPrivatePilot};
