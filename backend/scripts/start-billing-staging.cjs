"use strict";
// Staging-only startup. Existing production start command remains untouched.
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const {assessStaging}=require("./billing-staging-preflight.cjs");
function stagingStart({env=process.env,spawn=spawnSync,serve=()=>require("../src/server.js")}={}){
 const check=assessStaging(env);
 if(!check.ready)throw new Error("Billing staging startup blocked: "+check.errors.join(" "));
 if(String(env.ZERMATT_EMPLOYMENT_LEVEL_V3_MODE||"OFF").toUpperCase()!=="OFF")
  throw new Error("Zermatt V3 activation/preview is forbidden during billing staging startup.");
 const prismaCli=require.resolve("prisma/build/index.js");
 const result=spawn(process.execPath,[prismaCli,"migrate","deploy"],{cwd:path.join(__dirname,".."),env,stdio:"inherit"});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error("Staging Prisma migration failed: "+result.status);
 return serve();
}
if(require.main===module){
 try{stagingStart()}catch(e){console.error(e.message);process.exitCode=1}
}
module.exports={stagingStart};
