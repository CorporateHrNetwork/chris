# Independent encrypted backup of the recovered CCA Stage4D identity workspace.
# The source workspace remains in use and is never modified. Fictional staging ONLY.
param([switch]$UploadAndTestOffsite)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source=Join-Path $env:LOCALAPPDATA 'CRNetwork-CCA-Stage4D-Recovered'
$store=Join-Path $env:LOCALAPPDATA 'CRNetwork-CCA-Stage4D-RecoveryBackups'
$keys=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging\backup-keys'
$cert=Join-Path $keys 'recovery-public.pem'
$key=Join-Path $keys 'recovery-private.encrypted.pem'
$passSecret=Join-Path $keys 'recovery-passphrase.dpapi'
$openssl=Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
$remote='cca_backup:CRNETWORK-CCA-Staging-Backups/Recovered-CCA-Identity'
$relative=@(
 'recovery-readiness.json',
 'host-security\staging-key.dpapi',
 'host-security\state-checkpoint.json',
 'state\cca-identities.enc.json',
 'state\cca-identities.previous.enc.json',
 'state\auth-audit.log',
 'state\source-throttle.json',
 'fictional-support\state.json',
 'fictional-support\state.backup.json'
)
foreach($p in @($source,$cert,$key,$passSecret,$openssl)){
 if(!(Test-Path -LiteralPath $p)){throw 'CCA_RECOVERED_BACKUP_PREREQUISITE_MISSING'}
}
$metadata=Get-Content (Join-Path $source 'recovery-readiness.json') -Raw | ConvertFrom-Json
if($metadata.scope -ne 'ISOLATED_RECOVERED_CCA_STAGING' -or
   $metadata.quarantinedAccounts -ne 2 -or
   $metadata.stagingOperatorUnaffected -ne $true){throw 'CCA_RECOVERED_SCOPE_INVALID'}
if(!(Test-Path $store)){New-Item -ItemType Directory -Path $store -Force | Out-Null}
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$id='cca-recovered-identity-'+$stamp+'-'+([guid]::NewGuid().ToString('N').Substring(0,8))
$temp=Join-Path $env:TEMP ($id+'-work')
$payload=Join-Path $temp 'payload'
$zip=Join-Path $temp 'source.zip'
$encrypted=Join-Path $store ($id+'.cms')
$manifest=Join-Path $store ($id+'.json')
$phrase=Join-Path $temp 'private-key-passphrase.tmp'
$download=Join-Path $temp 'download.cms'
$unpackedZip=Join-Path $temp 'verified.zip'
$unpacked=Join-Path $temp 'verified-extracted'
$created=$false
$hashes=[ordered]@{}
New-Item -ItemType Directory -Path $payload -Force | Out-Null
try {
 foreach($rel in $relative){
  $src=Join-Path $source $rel
  if(!(Test-Path $src)){throw 'CCA_RECOVERED_SOURCE_FILE_MISSING'}
  $item=Get-Item $src -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
     $item.Length -gt 1024*1024){throw 'CCA_RECOVERED_SOURCE_FILE_UNSAFE'}
  $dest=Join-Path $payload $rel
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item $src $dest -ErrorAction Stop
  $hashes[$rel]=(Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
  if((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -ne $hashes[$rel]){
   throw 'CCA_RECOVERED_COPY_INTEGRITY_FAILED'
  }
 }
 [IO.Compression.ZipFile]::CreateFromDirectory($payload,$zip)
 $zipHash=(Get-FileHash $zip -Algorithm SHA256).Hash
 & $openssl cms -encrypt -binary -aes-256-gcm -outform DER -in $zip -out $encrypted $cert
 if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_CMS_ENCRYPT_FAILED'}
 & $openssl cms -cmsout -inform DER -in $encrypted -noout 2>$null
 if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_CMS_INVALID'}
 $encryptedHash=(Get-FileHash $encrypted -Algorithm SHA256).Hash
 [ordered]@{
  schemaVersion=1
  scope='CCA_RECOVERED_IDENTITY_STAGING'
  createdUtc=(Get-Date).ToUniversalTime().ToString('o')
  encryptedFile=([IO.Path]::GetFileName($encrypted))
  encryptedSha256=$encryptedHash
  originalZipSha256=$zipHash
  files=$hashes
  offsiteUploaded=$false
  offsiteExtractionVerified=$false
 } | ConvertTo-Json -Depth 6 | Set-Content $manifest -Encoding UTF8
 $created=$true
 if($UploadAndTestOffsite){
  $rclone=(Get-Command rclone.exe -CommandType Application -ErrorAction Stop).Source
  & $rclone copyto $encrypted ($remote+'/'+[IO.Path]::GetFileName($encrypted)) --retries 3 --low-level-retries 5 --contimeout 15s --timeout 45s --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_OFFSITE_UPLOAD_FAILED'}
  & $rclone copyto ($remote+'/'+[IO.Path]::GetFileName($encrypted)) $download --retries 3 --low-level-retries 5 --contimeout 15s --timeout 45s --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_OFFSITE_DOWNLOAD_FAILED'}
  if((Get-FileHash $download -Algorithm SHA256).Hash -ne $encryptedHash){
   throw 'CCA_RECOVERED_OFFSITE_HASH_MISMATCH'
  }
  $secure=(Get-Content -LiteralPath $passSecret | ConvertTo-SecureString)
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) | Set-Content -LiteralPath $phrase -Encoding ASCII}
  finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
  & $openssl cms -decrypt -binary -inform DER -in $download -recip $cert -inkey $key -passin "file:$phrase" -out $unpackedZip
  if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_OFFSITE_DECRYPT_FAILED'}
  Remove-Item $phrase -Force
  if((Get-FileHash $unpackedZip -Algorithm SHA256).Hash -ne $zipHash){
   throw 'CCA_RECOVERED_OFFSITE_CONTENT_HASH_MISMATCH'
  }
  [IO.Compression.ZipFile]::ExtractToDirectory($unpackedZip,$unpacked)
  foreach($rel in $relative){
   $restored=Join-Path $unpacked $rel
   if(!(Test-Path $restored) -or
      (Get-FileHash $restored -Algorithm SHA256).Hash -ne $hashes[$rel]){
    throw 'CCA_RECOVERED_OFFSITE_FILE_INTEGRITY_FAILED'
   }
  }
  if((Get-ChildItem $unpacked -File -Recurse).Count -ne $relative.Count){
   throw 'CCA_RECOVERED_OFFSITE_UNEXPECTED_CONTENT'
  }
  $record=Get-Content $manifest -Raw | ConvertFrom-Json
  $record.offsiteUploaded=$true
  $record.offsiteExtractionVerified=$true
  $record | ConvertTo-Json -Depth 6 | Set-Content $manifest -Encoding UTF8
  & $rclone copyto $manifest ($remote+'/'+[IO.Path]::GetFileName($manifest)) --retries 3 --low-level-retries 5 --contimeout 15s --timeout 45s --log-level ERROR
  if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_MANIFEST_UPLOAD_FAILED'}
 }
 Write-Output ('PASS: Recovered CCA encrypted workspace backed up. OFFSITE_VERIFIED='+[bool]$UploadAndTestOffsite)
 Write-Output ('RECOVERED_FILES='+$relative.Count)
 Write-Output ('ARCHIVE='+[IO.Path]::GetFileName($encrypted))
 Write-Output 'NOTE: Actual restored server boot and interactive MFA remain separate acceptance checks.'
}finally{
 Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
 if(!$created -and (Test-Path $encrypted)){Remove-Item $encrypted -Force -ErrorAction SilentlyContinue}
}
