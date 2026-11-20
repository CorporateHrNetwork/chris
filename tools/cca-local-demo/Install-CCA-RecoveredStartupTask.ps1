# Run elevated as original Windows DPAPI owner. Password stays at local console.
param([switch]$InspectOnly,[switch]$Install)
$ErrorActionPreference='Stop'
if ($InspectOnly -eq $Install) {throw 'SELECT_INSPECT_ONLY_OR_INSTALL'}
$name='CRNETWORK-CCA-Recovered-Staging-Startup'
$script=Join-Path $PSScriptRoot 'Start-CCA-AfterBoot.ps1'
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($InspectOnly) {
 if (!$existing) {Write-Output 'NOT_INSTALLED';exit 0}
 $info=Get-ScheduledTaskInfo -TaskName $name
 [pscustomobject]@{Task=$name;State=[string]$existing.State;LogonType=[string]$existing.Principal.LogonType;User=$existing.Principal.UserId;LastResult=$info.LastTaskResult;LastRun=$info.LastRunTime;NextRun=$info.NextRunTime} | ConvertTo-Json
 exit 0
}
if ($existing) {throw 'CCA_AUTOSTART_TASK_ALREADY_EXISTS'}
$user=[Security.Principal.WindowsIdentity]::GetCurrent()
if ($user.IsSystem) {throw 'CCA_AUTOSTART_SYSTEM_FORBIDDEN'}
$p=[Security.Principal.WindowsPrincipal]::new($user)
if (!$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {throw 'CCA_AUTOSTART_ADMIN_REQUIRED'}
if (!(Test-Path $script)) {throw 'CCA_AUTOSTART_SCRIPT_MISSING'}
$metadata=Get-Content (Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging\status.json') -Raw | ConvertFrom-Json
if ($metadata.scope -ne 'FICTIONAL_STAGING_ONLY' -or $metadata.database -ne 'cca_fictional_services' -or $metadata.port -ne 55451) {throw 'CCA_AUTOSTART_SCOPE_INVALID'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "'+$script+'"') -WorkingDirectory $PSScriptRoot
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([timespan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2)
$secure=Read-Host ('Windows password for '+$user.Name) -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 if (!$plain) {throw 'CCA_AUTOSTART_PASSWORD_REQUIRED'}
 Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -User $user.Name -Password $plain -Description 'Private CCA fictional staging recovery; owner-scoped credentials' | Out-Null
 $task=Get-ScheduledTask -TaskName $name
 if ([string]$task.Principal.LogonType -ne 'Password') {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  throw 'CCA_AUTOSTART_PASSWORD_LOGON_NOT_CONFIRMED'
 }
 Write-Output 'PASS: CCA private staging startup registered. Restart validation still pending.'
} finally {
 if ($ptr -ne [IntPtr]::Zero) {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $secure.Dispose()
 Remove-Variable plain -ErrorAction SilentlyContinue
}