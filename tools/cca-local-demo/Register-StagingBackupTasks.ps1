param([string]$OffSiteDestination)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging'
$runner = Join-Path $PSScriptRoot 'Invoke-StagingBackup.ps1'
$logDir = Join-Path $root 'backup-task-logs'
if (!(Test-Path (Join-Path $root 'pilot.ready')) -or !(Test-Path $runner)) {
    throw 'Initialize the Windows pilot and place both backup scripts in the same directory.'
}
if ($OffSiteDestination -and $OffSiteDestination -notmatch '^[A-Za-z0-9_-]+:CRNETWORK-CCA-Staging-Backups$') {
    throw 'Use an approved rclone remote and the dedicated CRNETWORK-CCA-Staging-Backups folder.'
}
if ((Get-TimeZone).Id -ne 'W. Central Africa Standard Time') {
    throw 'Convert the Lagos schedule to the Windows host timezone before registration.'
}
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$engine = Join-Path $PSHOME 'powershell.exe'
$runLiteral = $runner.Replace("'", "''")
$logLiteral = $logDir.Replace("'", "''")
$destinationArgument = if ($OffSiteDestination) { " -OffSiteDestination '$OffSiteDestination'" } else { '' }

$jobs = @(
    @{ Name = 'CRNETWORK-CCA-Staging-Backup'; Operation = 'Backup'; Trigger = (New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(8))) }
    @{ Name = 'CRNETWORK-CCA-Staging-Restore'; Operation = 'Restore'; Trigger = (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At ([datetime]::Today.AddHours(10))) }
)
foreach ($job in $jobs) {
    $operation = $job.Operation
    $command = @"
`$ErrorActionPreference = 'Stop'
`$log = Join-Path '$logLiteral' ('$operation-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -LiteralPath `$log | Out-Null
try {
    & '$runLiteral' -Action '$operation'$destinationArgument
} catch {
    Write-Host `$_.Exception.Message
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $action = New-ScheduledTaskAction -Execute $engine -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"
    Register-ScheduledTask -TaskName $job.Name -Action $action -Trigger $job.Trigger -Principal $principal -Settings $settings `
        -Description 'Fictional CRNETWORK CCA PostgreSQL staging only' -Force | Out-Null
    Get-ScheduledTaskInfo -TaskName $job.Name | Select-Object TaskName, NextRunTime
}
