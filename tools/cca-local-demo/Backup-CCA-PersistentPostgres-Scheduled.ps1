# Staging-only scheduled backup wrapper. No production database access.
$ErrorActionPreference='Stop'
$child=Join-Path $PSScriptRoot 'Backup-CCA-PersistentPostgres-Staging.ps1'
$logDir=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging\task-logs'
if(!(Test-Path $child)){throw 'CCA_SCHEDULED_BACKUP_SCRIPT_MISSING'}
New-Item -ItemType Directory -Path $logDir -Force|Out-Null
$log=Join-Path $logDir 'managed-postgres-backup.log'
function Record($line){
 $msg=[string]$line
 if($msg -match '(?i)password|passphrase|token|secret|database_url|credential'){$msg='[REDACTED_DIAGNOSTIC]'}
 Add-Content -LiteralPath $log -Value ((Get-Date).ToUniversalTime().ToString('o')+' '+$msg)
}
try {
 Record 'TASK_START'
 & $child -UploadOffsite 2>&1 | ForEach-Object {Record $_}
 if($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0){throw 'CCA_BACKUP_CHILD_EXIT_NONZERO'}
 Record 'TASK_SUCCESS'
 exit 0
}catch{
 Record ('TASK_FAILED '+$_.Exception.GetType().Name)
 exit 1
}
