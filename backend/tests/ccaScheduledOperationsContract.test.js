"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const src=fs.readFileSync(path.resolve(__dirname,"../../tools/cca-local-demo/Inspect-CCA-ScheduledOperations.ps1"),"utf8");
test("CCA scheduled operations monitor is read-only and restricted to dedicated jobs",()=>{
 assert.match(src,/CRNETWORK-CCA-ManagedPostgres-Backup/);
 assert.match(src,/CRNETWORK-CCA-ManagedPostgres-Health-Audit/);
 assert.match(src,/Get-ScheduledTaskInfo/);
 assert.match(src,/Get-ScheduledTask/);
 for(const action of ["Start-ScheduledTask","Register-ScheduledTask","Unregister-ScheduledTask","Stop-ScheduledTask","Remove-Item","Invoke-WebRequest"])assert.doesNotMatch(src,new RegExp(action));
});
test("CCA monitor distinguishes pending, missed, failed and misconfigured execution",()=>{
 for(const status of ["AWAITING_DAILY_WINDOW","AWAITING_EXECUTION","MISSED","FAILED","MISCONFIGURED","TASK_UNAVAILABLE","EXECUTED_SUCCESSFULLY"])assert.ok(src.includes(status),status);
 assert.match(src,/LastTaskResult/);
 assert.match(src,/LastRunTime/);
 assert.match(src,/MSFT_TaskDailyTrigger/);
 assert.match(src,/LogonType/);
 assert.match(src,/if\(\$Strict -and \$issues.Count\)\{exit 2\}/);
});
test("CCA monitor never claims signed-out or restoration assurance from task success",()=>{
 assert.match(src,/unattendedSignedOutVerified=\$false/);
 assert.match(src,/Task Scheduler success alone cannot verify signed-out execution or offsite recovery/);
 assert.match(src,/CCA_FICTIONAL_STAGING_ONLY/);
});
