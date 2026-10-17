"use strict";
// Read-only deployment preflight. No network calls or database mutations.
const fs=require("node:fs");
const path=require("node:path");
function assessStaging(config){
 const errors=[],warnings=[];
 const stage=String(config.CHRIS_ENVIRONMENT||"").trim().toLowerCase();
 if(stage!=="staging")errors.push("CHRIS_ENVIRONMENT must be staging.");
 if(config.CHRIS_BILLING_STAGING_APPROVED!=="true")errors.push("Explicit CHRIS_BILLING_STAGING_APPROVED=true required.");
 let db;
 try{db=new URL(config.DATABASE_URL||"");if(!["postgres:","postgresql:"].includes(db.protocol))throw Error("protocol");}
 catch{errors.push("A valid staging PostgreSQL DATABASE_URL is required.");}
 if(db){
  const host=db.hostname.toLowerCase(),database=decodeURIComponent(db.pathname.replace(/^\//,"")).toLowerCase();
  if(!database||["postgres","production","prod","zermatt","chris"].includes(database))errors.push("Database name is ambiguous or production-like; use a dedicated staging database.");
  if(!/(staging|stage|test|sandbox|isolated)/.test(database))errors.push("Database name must explicitly identify staging/test isolation.");
  if(!config.CHRIS_BILLING_STAGING_DB_FINGERPRINT)errors.push("Operator must supply a staging database fingerprint after independent verification.");
  if(/localhost|127\.0\.0\.1/.test(host))warnings.push("Local PostgreSQL detected; this is not remote staging validation.");
 }
 if(!config.CHRIS_BILLING_STAGING_BACKUP_VERIFIED)errors.push("Confirm isolated staging restore/rollback plan before migration.");
 return {ready:errors.length===0,errors,warnings};
}
if(require.main===module){
 const result=assessStaging(process.env);
 console.log(JSON.stringify({ready:result.ready,errors:result.errors,warnings:result.warnings},null,2));
 process.exitCode=result.ready?0:1;
}
module.exports={assessStaging};
