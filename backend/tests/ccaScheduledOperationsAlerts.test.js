"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {buildScheduledOperationsAlert:build}=require("../../tools/cca-local-demo/scheduledOperationsAlerts");
const fixed=new Date("2026-11-20T08:00:00");
const names=["CRNETWORK-CCA-ManagedPostgres-Backup","CRNETWORK-CCA-ManagedPostgres-Health-Audit"];
function report(statuses=["EXECUTED_SUCCESSFULLY","EXECUTED_SUCCESSFULLY"]){
 return {scope:"CCA_FICTIONAL_STAGING_ONLY",checkedLocal:"2026-11-20T08:00:00",checks:names.map((task,i)=>({task,status:statuses[i],dueLocal:"2026-11-20T06:30:00",account:"SECRET",details:"PASSWORD"}))};
}
test("successful runs and pending executions do not trigger alerts",()=>{
 assert.equal(build(report(),{now:fixed}).decision,"NO_ALERT");
 assert.equal(build(report(["AWAITING_EXECUTION","RUNNING"]),{now:fixed}).decision,"NO_ALERT");
});
test("missed or failed tasks produce redacted critical alert",()=>{
 const a=build(report(["MISSED","FAILED"]),{now:fixed});
 assert.equal(a.decision,"ALERT");
 assert.equal(a.severity,"critical");
 assert.equal(a.issues.length,2);
 assert.equal(a.signedOutVerified,false);
 assert.equal(a.recoveryVerified,false);
 assert.doesNotMatch(JSON.stringify(a),/PASSWORD|SECRET/);
});
test("configuration failures produce warnings",()=>{
 const a=build(report(["MISCONFIGURED","TASK_UNAVAILABLE"]),{now:fixed});
 assert.equal(a.severity,"warning");
 assert.equal(a.issues.length,2);
});
test("unexpected scope or task cannot trigger a spoofed alert",()=>{
 assert.throws(()=>build({...report(),scope:"CHRIS_PRODUCTION"},{now:fixed}),/SCOPE/);
 const a=report();a.checks[0].task="CHRIS-PRODUCTION-Backup";
 assert.throws(()=>build(a,{now:fixed}),/TASK_SET/);
});
test("stale evidence and unknown states fail closed",()=>{
 assert.throws(()=>build(report(),{now:new Date("2026-11-21T08:00:00")}),/STALE/);
 assert.throws(()=>build(report(["SUSPICIOUS","FAILED"]),{now:fixed}),/UNKNOWN_STATUS/);
});
