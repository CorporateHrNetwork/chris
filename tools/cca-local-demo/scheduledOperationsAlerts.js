"use strict";
// Private CCA fictional staging. Alert decisions only; never sends network requests.
// A separately approved dispatcher may consume the returned sanitized payload.
const ALLOWED = new Set(["MISCONFIGURED","FAILED","MISSED","TASK_UNAVAILABLE"]);
const TASKS = new Set([
  "CRNETWORK-CCA-ManagedPostgres-Backup",
  "CRNETWORK-CCA-ManagedPostgres-Health-Audit"
]);
function buildScheduledOperationsAlert(report, {now=new Date(),maxAgeMinutes=30}={}){
  if (!report || report.scope!=="CCA_FICTIONAL_STAGING_ONLY" || !Array.isArray(report.checks))
    throw new Error("CCA_ALERT_SCOPE_INVALID");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isInteger(maxAgeMinutes) || maxAgeMinutes<1 || maxAgeMinutes>1440)
    throw new Error("CCA_ALERT_OPTIONS_INVALID");
  const checked=new Date(report.checkedLocal);
  if(!Number.isFinite(checked.getTime()) ||
     Math.abs(now.getTime()-checked.getTime())>maxAgeMinutes*60000)
    throw new Error("CCA_ALERT_REPORT_STALE");
  if(report.checks.length!==2 || new Set(report.checks.map(c=>c.task)).size!==2 ||
     report.checks.some(c=>!TASKS.has(c.task)))
    throw new Error("CCA_ALERT_TASK_SET_INVALID");
  const problems=report.checks.filter(c=>ALLOWED.has(c.status)).map(c=>({
    task:c.task, status:c.status, dueLocal:String(c.dueLocal||"").slice(0,19)
  }));
  if (report.checks.some(c=>typeof c.status!=="string" ||
     (!ALLOWED.has(c.status) && !["AWAITING_DAILY_WINDOW","AWAITING_EXECUTION","RUNNING","EXECUTED_SUCCESSFULLY"].includes(c.status))))
    throw new Error("CCA_ALERT_UNKNOWN_STATUS");
  const severity=problems.some(p=>p.status==="FAILED"||p.status==="MISSED")?"critical":"warning";
  return {
    schemaVersion:1,scope:"CCA_FICTIONAL_STAGING_ONLY",
    decision:problems.length?"ALERT":"NO_ALERT",
    severity:problems.length?severity:"none",
    subject:problems.length?"CCA staging scheduled operations require attention":"CCA staging scheduled operations nominal",
    checkedLocal:String(report.checkedLocal).slice(0,19),
    issues:problems,
    signedOutVerified:false,
    recoveryVerified:false
  };
}
module.exports={buildScheduledOperationsAlert};
