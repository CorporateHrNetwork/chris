# CCA alert payload generator. Dry-run by default; never sends credentials or employee data.
# Input: JSON from Inspect-CCA-ScheduledOperations.ps1, supplied as a local file.
param([Parameter(Mandatory=$true)][string]$EvidencePath,[switch]$Send)
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath $EvidencePath -PathType Leaf)){throw 'CCA_ALERT_EVIDENCE_MISSING'}
$e=Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
if($e.scope -ne 'CCA_FICTIONAL_STAGING_ONLY' -or $e.schemaVersion -ne 1){
 throw 'CCA_ALERT_EVIDENCE_SCOPE_INVALID'
}
$allowed=@('MISSED','FAILED','MISCONFIGURED','TASK_UNAVAILABLE','LATE_EXECUTION')
$failures=@($e.checks | Where-Object {$allowed -contains $_.status} |
 ForEach-Object { [ordered]@{task=$_.task;status=$_.status;dueLocal=$_.dueLocal;lastRunLocal=$_.lastRunLocal;lastResult=$_.lastResult} })
if($e.status -eq 'ATTENTION' -and $failures.Count -eq 0){throw 'CCA_ALERT_EVIDENCE_INCONSISTENT'}
if($failures.Count -eq 0){
 [ordered]@{alert='NONE';sent=$false;reason='No actionable task failure';scope='CCA_FICTIONAL_STAGING_ONLY'} | ConvertTo-Json -Compress
 exit 0
}
$payload=[ordered]@{
 schemaVersion=1
 event='CCA_SCHEDULED_OPERATIONS_ATTENTION'
 scope='CCA_FICTIONAL_STAGING_ONLY'
 checkedLocal=[string]$e.checkedLocal
 severity='warning'
 failures=$failures
}
if(!$Send){
 [ordered]@{alert='DRY_RUN';sent=$false;payload=$payload} | ConvertTo-Json -Depth 6
 exit 0
}
# Opt-in delivery. HTTPS endpoint is configured locally, not in GitHub or CLI arguments.
$url=[Environment]::GetEnvironmentVariable('CCA_ALERT_WEBHOOK_URL','Process')
if([string]::IsNullOrWhiteSpace($url)){throw 'CCA_ALERT_WEBHOOK_NOT_CONFIGURED'}
$uri=$null
if(![Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or
    !$uri.Host -or $uri.UserInfo){throw 'CCA_ALERT_HTTPS_ENDPOINT_REQUIRED'}
$body=$payload|ConvertTo-Json -Depth 6 -Compress
Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 10 | Out-Null
[ordered]@{alert='DELIVERY_REQUEST_COMPLETED';sent=$true;failures=$failures.Count} | ConvertTo-Json -Compress
