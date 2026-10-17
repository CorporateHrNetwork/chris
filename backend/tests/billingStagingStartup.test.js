"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {stagingStart}=require("../scripts/start-billing-staging.cjs");
const base={CHRIS_ENVIRONMENT:"staging",CHRIS_BILLING_STAGING_APPROVED:"true",DATABASE_URL:"postgresql://test:secret@staging.invalid/chris_billing_staging",CHRIS_BILLING_STAGING_DB_FINGERPRINT:"operator-verified",CHRIS_BILLING_STAGING_BACKUP_VERIFIED:"true"};
test("billing staging startup refuses missing approvals before migration",()=>{
 let called=0;
 assert.throws(()=>stagingStart({env:{},spawn:()=>{called++;return {status:0}},serve:()=>{called++}}),/blocked/);
 assert.equal(called,0);
});
test("billing staging startup blocks unrelated Zermatt activation mode",()=>{
 let called=0;
 assert.throws(()=>stagingStart({env:{...base,ZERMATT_EMPLOYMENT_LEVEL_V3_MODE:"APPLY"},spawn:()=>{called++;return {status:0}}}),/forbidden/);
 assert.equal(called,0);
});
test("billing staging startup runs migration before server and stops on failure",()=>{
 const calls=[];
 assert.throws(()=>stagingStart({env:base,spawn:(cmd,args)=>{calls.push(args.slice(-2).join(" "));return {status:1}},serve:()=>calls.push("server")}),/migration failed/);
 assert.deepEqual(calls,["migrate deploy"]);
});
test("billing staging startup starts server only after successful isolated migration",()=>{
 const calls=[];
 stagingStart({env:base,spawn:(cmd,args)=>{calls.push(args.slice(-2).join(" "));return {status:0}},serve:()=>calls.push("server")});
 assert.deepEqual(calls,["migrate deploy","server"]);
});
