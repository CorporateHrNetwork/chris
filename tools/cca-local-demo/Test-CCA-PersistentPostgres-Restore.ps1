# CRNETWORK CCA isolated restore test: offsite CMS -> decrypted PG dump -> real temporary PG restore.
# CCA fictional staging only. Never connects to Zermatt or active databases.
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging'
$keys=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging\backup-keys'
$cert=Join-Path $keys 'recovery-public.pem'
$key=Join-Path $keys 'recovery-private.encrypted.pem'
$secret=Join-Path $keys 'recovery-passphrase.dpapi'
$openssl=Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
$pgBin='C:\Program Files\PostgreSQL\16\bin'
$remote='cca_backup:CRNETWORK-CCA-Staging-Backups/Managed-Postgres-CCA'
$rclone=(Get-Command rclone.exe -CommandType Application -ErrorAction Stop).Source
$work=Join-Path $root ('isolated-restore-'+[guid]::NewGuid().ToString('N'))
$data=Join-Path $work 'cluster'
$pass=Join-Path $work 'recovery-passphrase.tmp'
$pwfile=Join-Path $work 'admin-password.tmp'
$dump=Join-Path $work 'archive.dump'
$port=55453
$started=$false
foreach($file in @($cert,$key,$secret,$openssl,(Join-Path $root 'status.json'))) {
 if(!(Test-Path $file)){throw 'CCA_RECOVERY_PREREQUISITE_MISSING'}
}
if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){
 throw 'CCA_TEST_RESTORE_PORT_OCCUPIED'
}
$found=$null
foreach($entry in @(Get-ChildItem (Join-Path $root 'encrypted-backups') -File -Filter 'cca-managed-postgres-*.json' | Sort-Object LastWriteTime -Descending)){
 $candidate=Get-Content $entry.FullName -Raw | ConvertFrom-Json
 if($candidate.offsiteUploaded -eq $true -and $candidate.scope -eq 'CCA_FICTIONAL_PERSISTENT_STAGING'){
  $found=$candidate;break
 }
}
if(!$found){throw 'CCA_VERIFIED_OFFSITE_BACKUP_NOT_FOUND'}
$name=[string]$found.encryptedFile
if($name -notmatch '^cca-managed-postgres-\d{8}-\d{6}-[0-9a-f]{8}\.cms$' -or
 [string]$found.archiveSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
 [string]$found.sourceDumpSha256 -notmatch '^[0-9a-fA-F]{64}$'){throw 'CCA_BACKUP_MANIFEST_INVALID'}
New-Item -ItemType Directory -Path $work -Force | Out-Null
try{
 $download=Join-Path $work $name
 & $rclone copyto ($remote+'/'+$name) $download --retries 3 --low-level-retries 5 --contimeout 15s --timeout 40s --log-level ERROR
 if($LASTEXITCODE -ne 0){throw 'CCA_OFFSITE_DOWNLOAD_FAILED'}
 if((Get-FileHash $download -Algorithm SHA256).Hash -ne $found.archiveSha256){throw 'CCA_OFFSITE_ARCHIVE_HASH_MISMATCH'}
 $secure=(Get-Content -LiteralPath $secret | ConvertTo-SecureString)
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) | Set-Content -LiteralPath $pass -Encoding ASCII}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
 & $openssl cms -decrypt -binary -inform DER -in $download -recip $cert -inkey $key -passin "file:$pass" -out $dump
 if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERY_DECRYPT_FAILED'}
 Remove-Item $pass -Force
 if((Get-FileHash $dump -Algorithm SHA256).Hash -ne $found.sourceDumpSha256){throw 'CCA_RECOVERED_DUMP_HASH_MISMATCH'}
 & (Join-Path $pgBin 'pg_restore.exe') -l $dump | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CCA_PG_DUMP_FORMAT_INVALID'}
 Add-Type -AssemblyName System.Security
 $random=[byte[]]::new(48)
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($random)}finally{$rng.Dispose()}
 try{$password=[Convert]::ToBase64String($random)}finally{[Array]::Clear($random,0,$random.Length)}
 [IO.File]::WriteAllText($pwfile,$password+[Environment]::NewLine,[Text.Encoding]::ASCII)
 $env:PGHOST='127.0.0.1';$env:PGPORT="$port";$env:PGUSER='cca_restore_probe';$env:PGPASSWORD=$password
 & (Join-Path $pgBin 'initdb.exe') -D $data -U cca_restore_probe '--auth=scram-sha-256' "--pwfile=$pwfile" '--encoding=UTF8' '--locale=C' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CCA_RESTORE_INITDB_FAILED'}
 Remove-Item $pwfile -Force
 @("listen_addresses = '127.0.0.1'","port = $port","max_connections = 10") | Add-Content (Join-Path $data 'postgresql.conf') -Encoding ASCII
 $arguments=@('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $work 'postgres.log')+'"'),'-o',('"'+("-p $port -h 127.0.0.1")+'"'),'-w','start')
 $starter=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $arguments -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $work 'start.out') -RedirectStandardError (Join-Path $work 'start.err')
 if(!$starter.WaitForExit(20000)){ $starter.Kill();throw 'CCA_RESTORE_START_TIMEOUT'}
 & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $port -t 3 | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CCA_RESTORE_PG_NOT_READY'}
 $started=$true
 @'
CREATE ROLE cca_staging_request_reader NOLOGIN;
CREATE DATABASE cca_restored_fictional;
'@ | & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -d postgres
 if($LASTEXITCODE -ne 0){throw 'CCA_RESTORE_PROVISION_FAILED'}
 & (Join-Path $pgBin 'pg_restore.exe') -w --exit-on-error --single-transaction -d cca_restored_fictional $dump
 if($LASTEXITCODE -ne 0){throw 'CCA_PG_RESTORE_FAILED'}
 $count=@('SELECT COUNT(*) FROM public.cca_service_requests;' | & (Join-Path $pgBin 'psql.exe') -X -w -qAt -v ON_ERROR_STOP=1 -d cca_restored_fictional)
 $query=@'
SET ROLE cca_staging_request_reader;
BEGIN READ ONLY;
SELECT COUNT(*) FROM public.cca_service_requests;
SELECT set_config('cca.tenant_id','demo-cedar',true);
SELECT COUNT(*) FROM public.cca_service_requests;
SELECT set_config('cca.tenant_id','demo-atlas',true);
SELECT COUNT(*) FROM public.cca_service_requests;
COMMIT;
'@
 $result=@($query | & (Join-Path $pgBin 'psql.exe') -X -w -qAt -v ON_ERROR_STOP=1 -d cca_restored_fictional)
 if($LASTEXITCODE -ne 0){throw 'CCA_RECOVERED_RLS_QUERY_FAILED'}
 $counts=@($result | Where-Object {$_ -match '^\d+$'})
 if($count[-1].Trim() -ne '2' -or ($counts -join ',') -ne '0,1,1'){throw 'CCA_RESTORED_DATA_OR_ISOLATION_INVALID'}
 Write-Output 'PASS: Off-site CMS downloaded, SHA256 validated, decrypted with escrowed CCA recovery key, and PostgreSQL dump restored into independent isolated cluster.'
 Write-Output 'PASS: Two fictional requests recovered; RLS unscoped=0, Cedar=1, Atlas=1. No current database changed.'
}finally{
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m immediate -w stop | Out-Null}
 Remove-Item Env:PGHOST,Env:PGPORT,Env:PGUSER,Env:PGPASSWORD -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
 Write-Output 'CLEANUP: temporary restore cluster, decrypted dump and passphrase files removed.'
}
