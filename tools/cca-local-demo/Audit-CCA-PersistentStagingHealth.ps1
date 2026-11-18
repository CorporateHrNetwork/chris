# Read-only CRNETWORK-CCA persistent staging health audit.
# No database credentials, no tenant records, no destructive changes.
# Exit nonzero when not launch-healthy. Supports optional operator monitoring.
param([int]$MaxBackupAgeHours=28,[int]$MaxRestoreAgeDays=7)
$ErrorActionPreference='Stop'
if($MaxBackupAgeHours -lt 1 -or $MaxBackupAgeHours -gt 168 -or
   $MaxRestoreAgeDays -lt 1 -or $MaxRestoreAgeDays -gt 30){
 throw 'CCA_AUDIT_THRESHOLD_INVALID'
}
$now=(Get-Date).ToUniversalTime()
$root=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CRNETWORK-CCA-ManagedPostgres-Staging'
$statusFile=Join-Path $root 'status.json'
$manifestFolder=Join-Path $root 'encrypted-backups'
$readinessPath=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CRNetwork-CCA-Stage4D-Recovered\recovery-readiness.json'
$pgReady='C:\Program Files\PostgreSQL\16\bin\pg_isready.exe'
$issues=New-Object 'System.Collections.Generic.List[string]'
$backupAge=$null
$restoreAge=$null
$manifestVerified=$false
$pgHealthy=$false
$httpHealthy=$false
$unauthDenied=$false
$recoveredVaultPresent=$false
if(!(Test-Path $statusFile)){
 $issues.Add('PERSISTENT_POSTGRES_STATUS_MISSING')
}else{
 $meta=Get-Content $statusFile -Raw|ConvertFrom-Json
 if($meta.scope -ne 'FICTIONAL_STAGING_ONLY' -or
    $meta.host -ne '127.0.0.1' -or $meta.port -ne 55451 -or
    $meta.database -ne 'cca_fictional_services'){
   $issues.Add('PERSISTENT_POSTGRES_SCOPE_INVALID')
 }
 try{
  & $pgReady -h 127.0.0.1 -p 55451 -t 3 | Out-Null
  $pgHealthy=($LASTEXITCODE -eq 0)
 }catch{}
 if(!$pgHealthy){$issues.Add('PERSISTENT_POSTGRES_NOT_READY')}
 if($meta.backupCoverageVerified -ne $true){$issues.Add('RESTORE_NOT_VERIFIED')}
 if($meta.lastIsolatedOffsiteRestoreUtc){
   $restoreTime=([datetimeoffset]::Parse([string]$meta.lastIsolatedOffsiteRestoreUtc)).UtcDateTime
   $restoreAge=[math]::Round(($now-$restoreTime).TotalDays,2)
   if($restoreAge -lt 0 -or $restoreAge -gt $MaxRestoreAgeDays){
    $issues.Add('RESTORE_CHECK_STALE')
   }
 }else{$issues.Add('RESTORE_CHECK_MISSING')}
}
try{
 $response=Invoke-WebRequest -Uri 'http://127.0.0.2:4184/' -UseBasicParsing -TimeoutSec 4
 $httpHealthy=($response.StatusCode -eq 200)
}catch{}
if(!$httpHealthy){$issues.Add('PROTECTED_CCA_WEB_UNAVAILABLE')}
try{
 $response=Invoke-WebRequest -Uri 'http://127.0.0.2:4184/api/staging-postgres-requests' -UseBasicParsing -TimeoutSec 4
}catch{
 if($_.Exception.Response){
  $unauthDenied=([int]$_.Exception.Response.StatusCode -eq 401)
 }
}
if(!$unauthDenied){$issues.Add('CCA_PROTECTED_READ_AUTH_GATE_FAILED')}
if(Test-Path $readinessPath){
 $record=Get-Content $readinessPath -Raw | ConvertFrom-Json
 $recoveredVaultPresent=($record.scope -eq 'ISOLATED_RECOVERED_CCA_STAGING' -and
    $record.originalVaultUnchanged -eq $true -and
    $record.stagingOperatorUnaffected -eq $true -and
    $record.quarantinedAccounts -eq 2)
}
if(!$recoveredVaultPresent){$issues.Add('RECOVERED_IDENTITY_STATUS_MISSING')}
$manifests=@(Get-ChildItem $manifestFolder -File -Filter 'cca-managed-postgres-*.json' -ErrorAction SilentlyContinue|
 Sort-Object LastWriteTime -Descending)
foreach($entry in $manifests){
 try{
  $m=Get-Content $entry.FullName -Raw | ConvertFrom-Json
  if($m.scope -ne 'CCA_FICTIONAL_PERSISTENT_STAGING' -or
     $m.offsiteUploaded -ne $true -or
     [string]$m.encryptedFile -notmatch '^cca-managed-postgres-\d{8}-\d{6}-[a-f0-9]{8}\.cms$' -or
     [string]$m.archiveSha256 -notmatch '^[a-fA-F0-9]{64}$') {continue}
  $archive=Join-Path $manifestFolder $m.encryptedFile
  if(!(Test-Path $archive)){continue}
  $actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if($actual -ine [string]$m.archiveSha256){continue}
  $backupDate=([datetimeoffset]::Parse([string]$m.createdUtc)).UtcDateTime
  $backupAge=[math]::Round(($now-$backupDate).TotalHours,2)
  $manifestVerified=$true
  break
 }catch{continue}
}
if(!$manifestVerified){$issues.Add('OFFSITE_BACKUP_LOCAL_EVIDENCE_MISSING')}
elseif($backupAge -lt 0 -or $backupAge -gt $MaxBackupAgeHours){
 $issues.Add('OFFSITE_BACKUP_STALE')
}
$result=[ordered]@{
 schemaVersion=1
 checkedUtc=$now.ToString('o')
 status=if($issues.Count -eq 0){'PASS'}else{'ATTENTION'}
 postgresReady=$pgHealthy
 webReady=$httpHealthy
 unauthenticatedDatabaseReadDenied=$unauthDenied
 recoveredVaultEvidence=$recoveredVaultPresent
 encryptedBackupManifestAndLocalHashValid=$manifestVerified
 latestEncryptedBackupAgeHours=$backupAge
 latestIsolatedRestoreAgeDays=$restoreAge
 automatedBackupScheduled=$false
 authenticatedOperatorLoginVerified=$false
 publicHostingVerified=$false
 issues=@($issues)
}
$result | ConvertTo-Json -Depth 5
if($issues.Count -gt 0){exit 2}
