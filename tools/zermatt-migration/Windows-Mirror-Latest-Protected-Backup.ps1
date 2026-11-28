# Read-only protected backup mirror. GitHub encrypted artifact -> Google Drive.
# Never connects to the live database or stores a plaintext PostgreSQL dump.
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'CHRiS-Zermatt\SecureBackup'
$gh='C:\Program Files\GitHub CLI\gh.exe'
$rclone=Join-Path $env:LOCALAPPDATA 'Programs\rclone\rclone.exe'
$folder='1sHYVo11b6D_U2g-9PEEqKQpa9s1-ra0X'
$work=Join-Path $base ('protected-mirror-'+[guid]::NewGuid().ToString('N'))
$state=Join-Path $base 'last-protected-backup-mirror.json'
if(!(Test-Path $gh) -or !(Test-Path $rclone)){throw 'MIRROR_REQUIRED_TOOL_MISSING'}
New-Item -ItemType Directory $work -Force|Out-Null
$rights="$($env:COMPUTERNAME)\$($env:USERNAME):(OI)(CI)F"
& icacls.exe $work /inheritance:r /grant:r $rights 'SYSTEM:(OI)(CI)F' 1>$null
if($LASTEXITCODE -ne 0){throw 'PRIVATE_MIRROR_DIRECTORY_ACL_FAILED'}
try {
 $raw=& $gh api 'repos/CorporateHrNetwork/chris/actions/artifacts?per_page=100'
 if($LASTEXITCODE -ne 0){throw 'GITHUB_ARTIFACT_LIST_FAILED'}
 $candidates=@(($raw|ConvertFrom-Json).artifacts|Where-Object{
  $_.name -match '^zermatt-live-encrypted-(\d+)$' -and !$_.expired -and
  $_.size_in_bytes -gt 100000 -and $_.workflow_run.id -and
  $_.workflow_run.head_branch -eq 'fix/zermatt-supabase-pilot-transfer'
 }|Sort-Object created_at -Descending)
 if(!$candidates.Count){throw 'NO_ELIGIBLE_PROTECTED_PRODUCTION_BACKUP'}
 $latest=$candidates[0]
 $run=[string]$latest.workflow_run.id
 if(([DateTime]::UtcNow-[DateTime]$latest.created_at).TotalHours -gt 48){throw 'PROTECTED_BACKUP_TOO_OLD'}
 $remoteName='zermatt-protected-github-'+$run+'-'+([DateTime]$latest.created_at).ToString('yyyyMMdd')+'.dump.enc'
 $manifestName=$remoteName+'.manifest.json'
 if(Test-Path $state){
  $previous=Get-Content $state -Raw|ConvertFrom-Json
  if($previous.runId -eq $run -and $previous.offsiteHashVerified -eq $true){
   $files=@(& $rclone lsf 'chrisdrive:' --drive-root-folder-id $folder --files-only 2>$null)
   if($LASTEXITCODE -eq 0 -and $files -contains $remoteName){
    Write-Output ('PASS: ENCRYPTED_PRODUCTION_MIRROR_ALREADY_VERIFIED; run='+$run)
    exit 0
   }
  }
 }
 & $gh run download $run --repo CorporateHrNetwork/chris --name ([string]$latest.name) --dir $work
 if($LASTEXITCODE -ne 0){throw 'GITHUB_BACKUP_DOWNLOAD_FAILED'}
 $encrypted=Join-Path $work 'zermatt-live.dump.enc'
 if(!(Test-Path $encrypted) -or (Get-Item $encrypted).Length -lt 100000){throw 'ENCRYPTED_BACKUP_NOT_FOUND'}
 $hash=(Get-FileHash $encrypted -Algorithm SHA256).Hash
 & $rclone copyto $encrypted ('chrisdrive:'+$remoteName) --drive-root-folder-id $folder --retries 3 --log-level ERROR
 if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_BACKUP_UPLOAD_FAILED'}
 $returned=Join-Path $work 'offsite-check.enc'
 & $rclone copyto ('chrisdrive:'+$remoteName) $returned --drive-root-folder-id $folder --retries 3 --log-level ERROR
 if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_BACKUP_READBACK_FAILED'}
 if((Get-FileHash $returned -Algorithm SHA256).Hash -ne $hash){throw 'GOOGLE_DRIVE_BACKUP_HASH_MISMATCH'}
 $m=[ordered]@{runId=$run;sourceBranch='fix/zermatt-supabase-pilot-transfer';scope='CHRIS_ZERMATT_PRODUCTION_PUBLIC_SCHEMA';sha256=$hash;bytes=(Get-Item $encrypted).Length;createdAt=$latest.created_at;mirroredAt=[DateTime]::UtcNow.ToString('o');offsiteHashVerified=$true;fullSupabaseDisasterRecoveryCertified=$false}
 $manifest=Join-Path $work $manifestName
 $m|ConvertTo-Json|Set-Content $manifest -Encoding UTF8
 & $rclone copyto $manifest ('chrisdrive:'+$manifestName) --drive-root-folder-id $folder --retries 3 --log-level ERROR
 if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_MANIFEST_UPLOAD_FAILED'}
 $m|ConvertTo-Json|Set-Content $state -Encoding UTF8
 Write-Output ('PASS: PROTECTED_GITHUB_BACKUP_MIRRORED_TO_GOOGLE_DRIVE; run='+$run+'; sha256='+$hash+'; bytes='+$m.bytes)
}finally{
 Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
 Write-Output ('CLEANUP: TEMPORARY_MIRROR_WORKSPACE_REMOVED='+(!(Test-Path $work)))
}