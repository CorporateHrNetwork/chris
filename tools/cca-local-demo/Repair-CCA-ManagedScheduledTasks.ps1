# Local interactive repair for the existing CCA fictional-staging schedules.
# DO NOT enter Windows password into chat, GitHub, CLI arguments or logs.
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'RUN_LOCAL_POWERSHELL_AS_ADMINISTRATOR'}
$items=@(
 @{Name='CRNETWORK-CCA-ManagedPostgres-Backup';Script='Backup-CCA-PersistentPostgres-Scheduled.ps1'},
 @{Name='CRNETWORK-CCA-ManagedPostgres-Health-Audit';Script='Audit-CCA-PersistentStagingHealth.ps1'}
)
$base=$PSScriptRoot
$original=Get-ScheduledTask -TaskName $items[0].Name -ErrorAction Stop
$user=[string]$original.Principal.UserId
if(!$user -or $user -match '(?i)^(SYSTEM|NT AUTHORITY\\SYSTEM)$'){throw 'SCHEDULED_TASK_ACCOUNT_UNEXPECTED'}
foreach($item in $items){
 $task=Get-ScheduledTask -TaskName $item.Name -ErrorAction Stop
 if($task.Principal.LogonType.ToString() -ne 'Password' -or
   [string]$task.Principal.UserId -ne $user){throw 'CCA_SCHEDULED_TASK_ACCOUNT_MISMATCH'}
 if(!(Test-Path (Join-Path $base $item.Script))){throw 'CCA_SCHEDULED_TASK_SCRIPT_MISSING'}
}
$secret=Read-Host "Enter Windows sign-in password for $user locally (never in chat)" -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
 $password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 foreach($item in $items){
  $file=Join-Path $base $item.Script
  $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "'+$file+'"') -WorkingDirectory $base
  Set-ScheduledTask -TaskName $item.Name -Action $action -User $user -Password $password -ErrorAction Stop|Out-Null
  Write-Output ('CCA_SCHEDULE_REPAIRED '+$item.Name)
 }
}finally{
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 $password=$null
 $secret.Dispose()
}
Write-Output 'CCA_SCHEDULE_REPAIR_COMPLETED; must verify a real Task Scheduler run and offsite hash.'
