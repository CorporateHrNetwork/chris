"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createCcaOperatorJwtVerifier}=require("../src/cca/operatorJwtVerifier");
const {createCcaHostedSessionResolver}=require("../src/cca/hostedOperatorSession");
const {PERMISSIONS}=require("../src/cca/controlPlanePolicy");
const keys=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
const publicKeyPem=keys.publicKey.export({type:"spki",format:"pem"});
const now=1800000000;
const defaults={publicKeyPem,issuer:"https://identity.cca.example.test",audience:"cca-hosted-pilot",keyId:"cca-pilot-1",isRevoked:async()=>false,clock:()=>now*1000};
const claims=()=>({
 iss:defaults.issuer,aud:defaults.audience,iat:now-10,nbf:now-10,exp:now+600,
 jti:"fictional-jti-000001",sub:"cca-fictional-operator",
 scope:"CCA",subjectType:"OPERATOR",tenantId:"demo-cedar",roles:["SERVICE_AGENT"]
});
const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
function sign(c=claims(),header={alg:"RS256",typ:"JWT",kid:"cca-pilot-1"}){
 const payload=encode(header)+"."+encode(c);
 return payload+"."+crypto.sign("RSA-SHA256",Buffer.from(payload),keys.privateKey).toString("base64url");
}
test("CCA JWT verifier requires trusted independent key, issuer, audience and revocation",()=>{
 assert.throws(()=>createCcaOperatorJwtVerifier(),/CCA_JWT_VERIFIER_CONFIG_REQUIRED/);
 assert.throws(()=>createCcaOperatorJwtVerifier({...defaults,isRevoked:undefined}),/CCA_JWT_VERIFIER_CONFIG_REQUIRED/);
 assert.throws(()=>createCcaOperatorJwtVerifier({...defaults,publicKeyPem:"bad"}),/CCA_JWT_KEY_INVALID/);
});
test("CCA RS256 verified operator becomes server-owned Cedar tenant session",async()=>{
 const verifier=createCcaOperatorJwtVerifier(defaults);
 const jwt=sign();
 const proof=await verifier(jwt);
 assert.equal(proof?.verified,true);
 assert.equal(proof?.tenantId,"demo-cedar");
 assert.equal(proof?.context.platformGrants.includes(PERMISSIONS.TICKETS_READ),true);
 const resolve=createCcaHostedSessionResolver({verifyToken:verifier});
 const session=await resolve({headers:{cookie:"cca_hosted_sid="+jwt}});
 assert.equal(session?.accepted,true);
 assert.equal(session?.tenantId,"demo-cedar");
});
test("CCA verifier rejects tampering, wrong algorithm and unsigned token",async()=>{
 const verify=createCcaOperatorJwtVerifier(defaults);
 assert.equal(await verify(sign().replace(/.$/,"Q")),null);
 assert.equal(await verify(sign({...claims(),tenantId:"demo-atlas"}, {alg:"none",typ:"JWT",kid:"cca-pilot-1"})),null);
 assert.equal(await verify("bad"),null);
});
test("CCA verifier rejects wrong issuer, audience, stale, future, extended or cross-product claims",async()=>{
 const verify=createCcaOperatorJwtVerifier(defaults);
 for(const changes of [
  {iss:"https://other.example.test"},{aud:"chris-live"},{exp:now},
  {nbf:now+80},{iat:now+80},{exp:now+2000},
  {scope:"CHRIS"},{subjectType:"CUSTOMER"},{tenantId:"invalid tenant"},
  {roles:["UNKNOWN_ROLE"]},{sub:"chris-admin"},{jti:"short"}
 ])assert.equal(await verify(sign({...claims(),...changes})),null,JSON.stringify(changes));
});
test("CCA verifier rejects revoked sessions and revocation service outages",async()=>{
 const revoked=createCcaOperatorJwtVerifier({...defaults,isRevoked:async()=>true});
 const outage=createCcaOperatorJwtVerifier({...defaults,isRevoked:async()=>{throw Error("private outage")}});
 assert.equal(await revoked(sign()),null);
 assert.equal(await outage(sign()),null);
});
test("CCA rejects JWT header-supplied key URLs and critical extension",async()=>{
 const verify=createCcaOperatorJwtVerifier(defaults);
 for(const change of [{jku:"https://attacker.example/jwks"},{crit:["kid"]},{kid:"other-key"}]){
  assert.equal(await verify(sign(claims(),{alg:"RS256",typ:"JWT",kid:"cca-pilot-1",...change})),null);
 }
});
