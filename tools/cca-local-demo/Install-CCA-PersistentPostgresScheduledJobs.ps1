# CRNETWORK-CCA independent persistent staging job installation.
# Run interactively on authorized Windows machine as same DPAPI owner, elevated.
# Never modifies existing CRNETWORK-CCA-Staging-* jobs.
param([switch]$Install,[switch]$InspectOnly)
$ErrorActionPreference='Stop'
if($Install -eq $InspectOnly){throw 'Choose exactly -Install or -InspectOnly'}
$backupTask='CRNETWORK-CCA-ManagedPostgres-Backup'
$auditTask='CRNETWORK-CCA-ManagedPostgres-Health-Audit'
$names=@($backupTask,$auditTask)
$backup=Join-Path $PSScriptRoot 'Backup-CCA-PersistentPostgres-Staging.ps1'
$audit=Join-Path $PSScriptRoot 'Audit-CCA-PersistentStagingHealth.ps1'
$base=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CRNETWORK-CCA-ManagedPostgres-Staging'
$status=Join-Path $base 'status.json'
function Get-State {
 foreach($name in $names) {
  $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if(!$task){[pscustomobject]@{TaskName=$name;Exists=$false};continue}
  $info=Get-ScheduledTaskInfo -TaskName $name
  [pscustomobject]@{
    TaskName=$name;Exists=$true;State=[string]$task.State;
    LogonType=[string]$task.Principal.LogonType;
    LastResult=$info.LastTaskResult;
    LastRun=$info.LastRunTime.ToString('s');NextRun=$info.NextRunTime.ToString('s')
  }
 }
}
if($InspectOnly){Get-State | ConvertTo-Json -Compress;exit 0}
$user=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($user)
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 throw 'CCA_TASK_ADMINISTRATOR_REQUIRED'
}
if($user.IsSystem){throw 'CCA_TASK_SYSTEM_ACCOUNT_FORBIDDEN'}
foreach($name in $names){
 if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
  throw 'CCA_MANAGED_POSTGRES_TASK_ALREADY_EXISTS'
 }
}
if(!(Test-Path $status) -or !(Test-Path $backup) -or !(Test-Path $audit)){
 throw 'CCA_TASK_PREREQUISITES_MISSING'
}
$metadata=Get-Content $status -Raw|ConvertFrom-Json
if($metadata.scope -ne 'FICTIONAL_STAGING_ONLY' -or
   $metadata.database -ne 'cca_fictional_services' -or
   $metadata.port -ne 55451 -or $metadata.backupCoverageVerified -ne $true){
 throw 'CCA_PERSISTENT_POSTGRES_SCOPE_OR_RECOVERY_UNVERIFIED'
}
$actionBackup=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "'+$backup+'" -UploadOffsite') -WorkingDirectory $PSScriptRoot
$actionAudit=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "'+$audit+'"') -WorkingDirectory $PSScriptRoot
$triggerBackup=New-ScheduledTaskTrigger -Daily -At '06:30'
$triggerAudit=New-ScheduledTaskTrigger -Daily -At '07:15'
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
# Secure interactive Windows prompt, never pass credentials through ChatGPT.
$secure=Read-Host ('Windows password for '+$user.Name+' (Windows Task Scheduler logon)') -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$created=@()
try{
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 if(!$plain){throw 'CCA_WINDOWS_PASSWORD_REQUIRED'}
 $params=@{TaskName=$backupTask;Action=$actionBackup;Trigger=$triggerBackup;Settings=$settings;User=$user.Name;Password=$plain;Description='Encrypted off-site CCA managed PostgreSQL staging backup'}
 Register-ScheduledTask @params | Out-Null
 $created+= $backupTask
 $params=@{TaskName=$auditTask;Action=$actionAudit;Trigger=$triggerAudit;Settings=$settings;User=$user.Name;Password=$plain;Description='Read-only CCA managed PostgreSQL staging health audit'}
 Register-ScheduledTask @params | Out-Null
 $created+= $auditTask
 foreach($name in $names){
  $task=Get-ScheduledTask -TaskName $name -ErrorAction Stop
  if([string]$task.Principal.LogonType -ne 'Password'){
   throw 'CCA_TASK_PASSWORD_LOGON_NOT_CONFIRMED'
  }
 }
 Write-Output 'PASS: Dedicated backup and health-audit tasks installed.'
 Write-Output 'NOTE: Still requires signed-out run, alert and reboot validation.'
 Get-State|ConvertTo-Json -Compress
}catch{
 foreach($name in $created){Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 throw
}finally{
 if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $secure.Dispose()
 Remove-Variable plain -ErrorAction SilentlyContinue
}
