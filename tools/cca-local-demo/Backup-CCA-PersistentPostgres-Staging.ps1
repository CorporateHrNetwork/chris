# Internal-only encrypted backup of CRNETWORK CCA fictional PostgreSQL staging.
# Uses existing CCA public recovery certificate; no changes to CHRiS databases.
param([switch]$UploadOffsite)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging'
$original=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging'
$cert=Join-Path $original 'backup-keys\recovery-public.pem'
$openssl=Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
$pgBin='C:\Program Files\PostgreSQL\16\bin'
$remote='cca_backup:CRNETWORK-CCA-Staging-Backups/Managed-Postgres-CCA'
$store=Join-Path $root 'encrypted-backups'
$working=Join-Path $store ('work-'+[Guid]::NewGuid().ToString('N'))
$timestamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$basename='cca-managed-postgres-'+$timestamp+'-'+([guid]::NewGuid().ToString('N').Substring(0,8))
$publicArchive=Join-Path $store ($basename+'.cms')
$manifest=Join-Path $store ($basename+'.json')
$plaintext=Join-Path $working 'db.dump'
$recipient=[IO.Path]::GetFullPath($cert)
$dpapiPath=Join-Path $root 'protected-credentials\admin.dpapi'
$entropy=[Text.Encoding]::UTF8.GetBytes('CCA managed postgres fictional staging credentials v1')
if(!(Test-Path (Join-Path $root 'status.json')) -or !(Test-Path $dpapiPath) -or
   !(Test-Path $cert) -or !(Test-Path $openssl)) {throw 'CCA_BACKUP_PREREQUISITE_MISSING'}
$status=Get-Content (Join-Path $root 'status.json') -Raw | ConvertFrom-Json
if($status.scope -ne 'FICTIONAL_STAGING_ONLY' -or $status.database -ne 'cca_fictional_services' -or
   $status.port -ne 55451) { throw 'CCA_BACKUP_SCOPE_INVALID' }
if(!(Test-Path $store)){New-Item -ItemType Directory -Path $store -Force | Out-Null}
New-Item -ItemType Directory -Path $working -Force | Out-Null
$blob=[IO.File]::ReadAllBytes($dpapiPath)
$plain=[Security.Cryptography.ProtectedData]::Unprotect($blob,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$env:PGHOST='127.0.0.1';$env:PGPORT='55451';$env:PGUSER='cca_staging_admin'
$env:PGPASSWORD=[Text.Encoding]::UTF8.GetString($plain)
try {
 & (Join-Path $pgBin 'pg_dump.exe') -w -Fc -d cca_fictional_services -f $plaintext
 if($LASTEXITCODE -ne 0){throw 'CCA_PERSISTENT_PG_DUMP_FAILED'}
 $plaintextHash=(Get-FileHash -LiteralPath $plaintext -Algorithm SHA256).Hash
 & $openssl cms -encrypt -binary -aes-256-gcm -outform DER -in $plaintext -out $publicArchive $recipient
 if($LASTEXITCODE -ne 0){throw 'CCA_PERSISTENT_BACKUP_ENCRYPTION_FAILED'}
 # Validate CMS DER structure without exposing or decrypting document contents.
 & $openssl cms -cmsout -inform DER -in $publicArchive -noout 2>$null
 if($LASTEXITCODE -ne 0){throw 'CCA_PERSISTENT_CMS_STRUCTURE_INVALID'}
 $sha=(Get-FileHash -LiteralPath $publicArchive -Algorithm SHA256).Hash
 [ordered]@{
  schemaVersion=1
  scope='CCA_FICTIONAL_PERSISTENT_STAGING'
  database='cca_fictional_services'
  createdUtc=(Get-Date).ToUniversalTime().ToString('o')
  encryptedFile=([IO.Path]::GetFileName($publicArchive))
  encryption='CMS_AES_256_GCM'
  publicCertificateSource='CCA_STAGING_RECOVERY_PUBLIC'
  archiveSha256=$sha
  sourceDumpSha256=$plaintextHash
  offsiteUploaded=$false
 } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifest -Encoding ASCII
 if($UploadOffsite){
  $rclone=(Get-Command rclone.exe -CommandType Application -ErrorAction Stop).Source
  & $rclone copyto $publicArchive ($remote+'/'+[IO.Path]::GetFileName($publicArchive)) --retries 3 --low-level-retries 5 --contimeout 15s --timeout 40s --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_OFFSITE_ARCHIVE_UPLOAD_FAILED'}
  $data=Get-Content $manifest -Raw | ConvertFrom-Json
  $data.offsiteUploaded=$true
  $data | ConvertTo-Json -Depth 3 | Set-Content $manifest -Encoding ASCII
  & $rclone copyto $manifest ($remote+'/'+[IO.Path]::GetFileName($manifest)) --retries 3 --low-level-retries 5 --contimeout 15s --timeout 40s --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_OFFSITE_MANIFEST_UPLOAD_FAILED'}
  $checkFolder=Join-Path $working 'verification'
  New-Item -ItemType Directory -Path $checkFolder -Force | Out-Null
  Copy-Item $publicArchive,$manifest -Destination $checkFolder
  & $rclone check $checkFolder $remote --one-way --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_OFFSITE_HASH_VERIFICATION_FAILED'}
 }
 Write-Output ('PASS: CCA persistent staging encrypted PostgreSQL backup verified. OFFSITE='+[bool]$UploadOffsite)
 Write-Output ('ARCHIVE='+[IO.Path]::GetFileName($publicArchive))
 Write-Output ('MANIFEST='+[IO.Path]::GetFileName($manifest))
 Write-Output 'NOTE: This does not prove recovery-key decryption or isolated restore; a separate restore test remains mandatory.'
}finally{
 [Array]::Clear($plain,0,$plain.Length)
 Remove-Item Env:PGPASSWORD,Env:PGUSER,Env:PGHOST,Env:PGPORT -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $working -Recurse -Force -ErrorAction SilentlyContinue
}
