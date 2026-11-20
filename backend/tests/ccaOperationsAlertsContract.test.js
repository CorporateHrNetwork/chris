"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const script=fs.readFileSync(path.resolve(__dirname,"../../tools/cca-local-demo/Inspect-CCA-ScheduledOperations.ps1"),"utf8");
const alert=fs.readFileSync(path.resolve(__dirname,"../../tools/cca-local-demo/Publish-CCA-OperationsAlert.ps1"),"utf8");
test("CCA monitor flags successful runs after the daily deadline as late",()=>{
 assert.match(script,/LATE_EXECUTION/);
 assert.match(script,/\$lastRun -gt \$deadline/);
 assert.match(script,/\$lastResult -ne 0/);
 assert.match(script,/unattendedSignedOutVerified=\$false/);
});
test("CCA notification publisher is dry run by default and only publishes actionable failures",()=>{
 assert.match(alert,/if\(!\$Send\)/);
 for(const s of ["MISSED","FAILED","MISCONFIGURED","TASK_UNAVAILABLE","LATE_EXECUTION"])assert.ok(alert.includes(s),s);
 assert.match(alert,/if\(\$failures.Count -eq 0\)/);
 assert.match(alert,/CCA_FICTIONAL_STAGING_ONLY/);
 assert.match(alert,/CCA_ALERT_WEBHOOK_NOT_CONFIGURED/);
});
test("CCA notification publisher requires HTTPS and uses bounded network timeout",()=>{
 assert.match(alert,/\$uri.Scheme -ne 'https'/);
 assert.match(alert,/\$uri.UserInfo/);
 assert.match(alert,/TimeoutSec 10/);
 assert.match(alert,/CCA_ALERT_WEBHOOK_URL/);
 assert.doesNotMatch(alert,/password|api[_-]?key|otp|recovery.?key/i);
});
