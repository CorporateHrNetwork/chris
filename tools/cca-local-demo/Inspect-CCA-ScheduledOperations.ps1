# Read-only CCA scheduled-operations evidence monitor. Does not change task state.
# Reports scheduler execution, not proof that Windows was signed out.
param([int]$GraceMinutes=90,[switch]$Strict)
$ErrorActionPreference='Stop'
if($GraceMinutes -lt 0 -or $GraceMinutes -gt 360){throw 'CCA_MONITOR_GRACE_INVALID'}
$now=Get-Date
$tasks=@(
 @{Name='CRNETWORK-CCA-ManagedPostgres-Backup';At='06:30'},
 @{Name='CRNETWORK-CCA-ManagedPostgres-Health-Audit';At='07:15'}
)
$issues=New-Object 'System.Collections.Generic.List[string]'
$checks=@(foreach($spec in $tasks){
 $name=$spec.Name
 $due=[datetime]::Today.Add([timespan]::Parse($spec.At))
 $deadline=$due.AddMinutes($GraceMinutes)
 $state='PENDING'
 $lastRun=$null
 $lastResult=$null
 $nextRun=$null
 $logon=$null
 try {
  $task=Get-ScheduledTask -TaskName $name -ErrorAction Stop
  $info=Get-ScheduledTaskInfo -TaskName $name -ErrorAction Stop
  $logon=[string]$task.Principal.LogonType
  $lastResult=$info.LastTaskResult
  $lastRun=$info.LastRunTime
  $nextRun=$info.NextRunTime
  $daily=@($task.Triggers | Where-Object {
   $_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' -and $_.Enabled
  }).Count -gt 0
  if(-not $task.Settings.Enabled -or $logon -ne 'Password' -or -not $daily){
   $state='MISCONFIGURED'
   $issues.Add($name+':MISCONFIGURED')
  }elseif($now -lt $due){
   $state='AWAITING_DAILY_WINDOW'
  }elseif($lastRun -ge $due){
   if($task.State -eq 'Running'){$state='RUNNING'}
   elseif($lastResult -eq 0){$state='EXECUTED_SUCCESSFULLY'}
   else{$state='FAILED';$issues.Add($name+':FAILED')}
  }elseif($now -gt $deadline){
   $state='MISSED'
   $issues.Add($name+':MISSED')
  }else{
   $state='AWAITING_EXECUTION'
  }
 }catch{
  $state='TASK_UNAVAILABLE'
  $issues.Add($name+':TASK_UNAVAILABLE')
 }
 [pscustomobject][ordered]@{
  task=$name
  status=$state
  dueLocal=$due.ToString('s')
  deadlineLocal=$deadline.ToString('s')
  lastRunLocal=if($lastRun){$lastRun.ToString('s')}else{$null}
  lastResult=$lastResult
  nextRunLocal=if($nextRun){$nextRun.ToString('s')}else{$null}
  logonType=$logon
 }
})
$overall=if($issues.Count){'ATTENTION'}elseif(@($checks|Where-Object {$_.status -ne 'EXECUTED_SUCCESSFULLY'}).Count){'PENDING'}else{'PASS'}
[ordered]@{
 schemaVersion=1
 checkedLocal=$now.ToString('s')
 status=$overall
 scope='CCA_FICTIONAL_STAGING_ONLY'
 unattendedSignedOutVerified=$false
 reminder='Task Scheduler success alone cannot verify signed-out execution or offsite recovery.'
 checks=$checks
 issues=@($issues)
} | ConvertTo-Json -Depth 5
if($Strict -and $issues.Count){exit 2}
