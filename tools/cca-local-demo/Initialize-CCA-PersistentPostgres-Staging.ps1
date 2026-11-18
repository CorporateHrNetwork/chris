# CRNETWORK-CCA internal fictional PostgreSQL staging host. NOT a public host.
# Runs only on the authorized Windows staging workstation, with its own cluster.
# Secrets remain in user-scoped Windows DPAPI files; no production credentials.
param([switch]$Initialize)
$ErrorActionPreference = 'Stop'
if (!$Initialize) { throw 'Explicit -Initialize required. No changes made.' }
if ($env:NODE_ENV -eq 'production' -or $env:RENDER_SERVICE_ID -or $env:DATABASE_URL -or $env:SUPABASE_URL) {
 throw 'Production or application DB environment detected; refusing initialization.'
}
$pgBin='C:\Program Files\PostgreSQL\16\bin'
foreach($exe in @('initdb.exe','pg_ctl.exe','psql.exe','pg_isready.exe')) {
 if(!(Test-Path (Join-Path $pgBin $exe))) { throw 'PostgreSQL 16 installation required.' }
}
$root=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging'
$cluster=Join-Path $root 'cluster'
$keyRoot=Join-Path $root 'protected-credentials'
$port=55451
if(Test-Path $root) { throw 'CCA persistent staging already exists. Refusing overwrite.' }
if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
 throw 'CCA persistent staging port already in use.'
}
function New-Secret {
 $bytes=[byte[]]::new(48)
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 try { return [Convert]::ToBase64String($bytes) } finally { [Array]::Clear($bytes,0,$bytes.Length) }
}
Add-Type -AssemblyName System.Security
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
$entropy=[Text.Encoding]::UTF8.GetBytes('CCA managed postgres fictional staging credentials v1')
function Save-ProtectedSecret([string]$file,[string]$secret) {
 $plain=[Text.Encoding]::UTF8.GetBytes($secret)
 try {
  $blob=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,$scope)
  [IO.File]::WriteAllBytes($file,$blob)
 }finally{[Array]::Clear($plain,0,$plain.Length)}
}
# Owner-only directory: never give Users or Everyone access to database files.
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
 $sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
[IO.Directory]::CreateDirectory($root,$acl)|Out-Null
[IO.Directory]::CreateDirectory($keyRoot)|Out-Null
$admin=New-Secret
$reader=New-Secret
$pwFile=Join-Path $root 'initdb-temporary-password.txt'
$started=$false
try {
 Save-ProtectedSecret (Join-Path $keyRoot 'admin.dpapi') $admin
 Save-ProtectedSecret (Join-Path $keyRoot 'reader.dpapi') $reader
 [IO.File]::WriteAllText($pwFile,$admin+[Environment]::NewLine,[Text.Encoding]::ASCII)
 & (Join-Path $pgBin 'initdb.exe') -D $cluster -U cca_staging_admin '--auth=scram-sha-256' "--pwfile=$pwFile" '--encoding=UTF8' '--locale=C' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CCA_INITDB_FAILED'}
 Remove-Item -LiteralPath $pwFile -Force
 Add-Content -LiteralPath (Join-Path $cluster 'postgresql.conf') -Encoding ASCII @(
  "listen_addresses = '127.0.0.1'",
  "port = $port",
  "max_connections = 30",
  "password_encryption = 'scram-sha-256'"
 )
 $env:PGHOST='127.0.0.1';$env:PGPORT="$port";$env:PGUSER='cca_staging_admin';$env:PGPASSWORD=$admin
 # Redirect pg_ctl streams so the postgres daemon cannot hold the parent
 # PowerShell pipeline open after pg_ctl completes.
 $arguments=@('-D',('"'+$cluster+'"'),'-l',('"'+(Join-Path $root 'postgres.log')+'"'),
   '-o',('"'+("-p $port -h 127.0.0.1")+'"'),'-w','start')
 $pgctl=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $arguments `
   -RedirectStandardOutput (Join-Path $root 'pgctl-start.stdout.log') `
   -RedirectStandardError (Join-Path $root 'pgctl-start.stderr.log') -PassThru -NoNewWindow
 if(!$pgctl.WaitForExit(20000)){ $pgctl.Kill(); throw 'CCA_PERSISTENT_PG_START_TIMEOUT' }
 if($pgctl.ExitCode -ne 0){throw 'CCA_PERSISTENT_PG_START_FAILED'}
 $started=$true
 'CREATE DATABASE cca_fictional_services;' | & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -d postgres
 if($LASTEXITCODE -ne 0){throw 'CCA_PERSISTENT_PG_CREATE_DB_FAILED'}
 $sqlFile=Join-Path $PSScriptRoot '..\..\backend\sql\cca\001_fictional_staging_service_requests.sql'
 if(!(Test-Path $sqlFile)) { throw 'CCA_STAGING_MIGRATION_MISSING' }
 & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -d cca_fictional_services -f $sqlFile
 if($LASTEXITCODE -ne 0) { throw 'CCA_STAGING_MIGRATION_FAILED' }
 # Safe fixed role identifier; secret travels over standard input, not argv.
 $grants=@(
  ('CREATE ROLE cca_staging_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '+[char]39+$reader+[char]39+';'),
  'GRANT cca_staging_request_reader TO cca_staging_reader;',
  'GRANT CONNECT ON DATABASE cca_fictional_services TO cca_staging_reader;',
  'REVOKE ALL ON DATABASE cca_fictional_services FROM PUBLIC;'
 ) -join [Environment]::NewLine
 $grants | & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -d cca_fictional_services
 if($LASTEXITCODE -ne 0) { throw 'CCA_RESTRICTED_ROLE_SETUP_FAILED' }
 # Refuse privileged login; no real clients or payments are inserted.
 $check= 'SELECT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) FROM pg_roles WHERE rolname = '+"'cca_staging_reader'"+';'
 $unsafe=$check | & (Join-Path $pgBin 'psql.exe') -X -w -qAt -v ON_ERROR_STOP=1 -d cca_fictional_services
 if($LASTEXITCODE -ne 0 -or $unsafe.Trim() -ne 'f'){throw 'CCA_READER_PRIVILEGE_CHECK_FAILED'}
 $state=[ordered]@{version=1;scope='FICTIONAL_STAGING_ONLY';port=$port;host='127.0.0.1';database='cca_fictional_services';role='cca_staging_reader';liveServiceConfigured=$false;backupCoverageVerified=$false}
 $state | ConvertTo-Json | Set-Content (Join-Path $root 'status.json') -Encoding ASCII
 Write-Output 'PASS: Independent CCA fictional staging PostgreSQL created with persistent data, loopback host, DPAPI credentials, restricted login and forced tenant RLS.'
 Write-Output 'PASS: No production credentials, real customer data, payment or DNS changes. No CCA runtime cutover.'
 Write-Output ('CCA_STAGING_PORT='+$port)
}catch{
 Write-Warning ('CCA_PERSISTENT_PROVISION_FAILED: '+$_.Exception.Message)
 if($started){
  & (Join-Path $pgBin 'pg_ctl.exe') -D $cluster -m immediate -w stop | Out-Null
 }
 throw
}finally{
 Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:PGHOST -ErrorAction SilentlyContinue
 Remove-Item Env:PGPORT -ErrorAction SilentlyContinue
 Remove-Item Env:PGUSER -ErrorAction SilentlyContinue
 $admin=$null;$reader=$null;$grants=$null
}
