# Private fictional CCA staging only; run as Windows DPAPI owner.
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging'
$metaPath = Join-Path $root 'status.json'
$webRoot = Join-Path $env:LOCALAPPDATA 'CRNetwork-CCA-Stage4D-Recovered'
$launcher = Join-Path $PSScriptRoot 'Start-CCA-Staging.ps1'
$pgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
$pgReady = 'C:\Program Files\PostgreSQL\16\bin\pg_isready.exe'
if (!(Test-Path $metaPath) -or !(Test-Path $launcher) -or !(Test-Path $pgCtl)) {throw 'CCA_AUTOSTART_PREREQUISITES_MISSING'}
$m = Get-Content $metaPath -Raw | ConvertFrom-Json
if ($m.scope -ne 'FICTIONAL_STAGING_ONLY' -or $m.database -ne 'cca_fictional_services' -or $m.host -ne '127.0.0.1' -or $m.port -ne 55451) {throw 'CCA_AUTOSTART_SCOPE_INVALID'}
& $pgReady -h 127.0.0.1 -p 55451 -t 3 | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl -D (Join-Path $root 'cluster') -l (Join-Path $root 'postgres.log') -o '-p 55451 -h 127.0.0.1' -w start
  if ($LASTEXITCODE -ne 0) {throw 'CCA_AUTOSTART_POSTGRES_FAILED'}
}
& $pgReady -h 127.0.0.1 -p 55451 -t 3 | Out-Null
if ($LASTEXITCODE -ne 0) {throw 'CCA_AUTOSTART_POSTGRES_NOT_READY'}
try {
  $w = Invoke-WebRequest 'http://127.0.0.2:4184/' -UseBasicParsing -TimeoutSec 3
  if ($w.StatusCode -eq 200) { Write-Output 'PASS: CCA staging web already online'; exit 0 }
} catch { }
$active = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'runStaging\.js' })
if ($active.Count -ne 0) {throw 'CCA_AUTOSTART_STAGING_PROCESS_EXISTS'}
$lock = Join-Path $webRoot 'host-security\writer.lock'
if (Test-Path $lock) {
  $item = Get-Item -LiteralPath $lock
  if (!$item.PSIsContainer -or $item.CreationTime -gt (Get-Date).AddMinutes(-2)) {throw 'CCA_AUTOSTART_LOCK_NOT_STALE'}
  $new = 'writer.lock.stale-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  Rename-Item -LiteralPath $lock -NewName $new -ErrorAction Stop
  Write-Output ('PRESERVED_STALE_LOCK=' + $new)
}
Write-Output 'Starting CCA private recovered web server on 127.0.0.2:4184'
& $launcher -UseRecoveredVault -UsePersistentPostgres
if ($LASTEXITCODE -ne 0) {throw 'CCA_AUTOSTART_STAGING_EXITED'}