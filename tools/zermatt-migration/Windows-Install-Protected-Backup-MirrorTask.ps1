# Run in elevated PowerShell on the authorized Windows backup workstation.
# The password is entered locally and never written to logs, files, GitHub or chat.
$ErrorActionPreference='Stop'
if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'LOCAL_ADMIN_POWERSHELL_REQUIRED'}
$base=Join-Path $env:LOCALAPPDATA 'CHRiS-Zermatt\SecureBackup'
$mirror=Join-Path $base 'Mirror-Latest-Protected-Backup.ps1'
if(!(Test-Path $mirror)){throw 'BACKUP_MIRROR_SCRIPT_MISSING'}
$task='CHRiS Zermatt Protected Backup Mirror'
$acct="$env:COMPUTERNAME\$env:USERNAME"
if(Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue){throw 'TASK_ALREADY_EXISTS_REVIEW_BEFORE_REPLACE'}
$action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$mirror+'"') -WorkingDirectory $base
$morning=New-ScheduledTaskTrigger -Daily -At '07:00'
$evening=New-ScheduledTaskTrigger -Daily -At '18:30'
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$secret=Read-Host "Enter the Windows sign-in password for $acct locally (never send it to ChatGPT)" -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try{
 $password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 Register-ScheduledTask -TaskName $task -Action $action -Trigger @($morning,$evening) -Settings $settings -User $acct -Password $password -Description 'Mirror latest encrypted verified Zermatt public-schema GitHub backup to Drive, confirm SHA256; never connect to live production DB.' -ErrorAction Stop|Out-Null
 Write-Output ('SCHEDULED_MIRROR_REGISTERED '+$task)
}finally{
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
 $password=$null
 $secret.Dispose()
}
Write-Output 'READY_FOR_TASK_SCHEDULER_TEST'