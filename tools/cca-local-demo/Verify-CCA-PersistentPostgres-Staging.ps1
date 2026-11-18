# Local-only operator verification of CRNETWORK CCA fictional PostgreSQL staging.
# Reads DPAPI encrypted credentials as same Windows user. Never outputs secrets.
param([switch]$SeedFictional)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-ManagedPostgres-Staging'
$protected=Join-Path $root 'protected-credentials'
$bin='C:\Program Files\PostgreSQL\16\bin'
$port=55451
$env:PGHOST='127.0.0.1';$env:PGPORT="$port";$env:PGCONNECT_TIMEOUT='3'
$entropy=[Text.Encoding]::UTF8.GetBytes('CCA managed postgres fictional staging credentials v1')
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
function Get-DpapiSecret([string]$name) {
 $blob=[IO.File]::ReadAllBytes((Join-Path $protected $name))
 $bytes=[Security.Cryptography.ProtectedData]::Unprotect($blob,$entropy,$scope)
 try{return [Text.Encoding]::UTF8.GetString($bytes)}
 finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Invoke-Query([string]$statement,[bool]$expectSuccess=$true) {
 $out=@($statement | & (Join-Path $bin 'psql.exe') -X -qAt -w -v ON_ERROR_STOP=1 -d cca_fictional_services 2>$null)
 if($expectSuccess -and $LASTEXITCODE -ne 0){throw 'CCA_STAGING_SQL_FAILED'}
 if(!$expectSuccess -and $LASTEXITCODE -eq 0){throw 'CCA_STAGING_WRITE_UNEXPECTEDLY_PERMITTED'}
 return $out
}
try{
 if(!(Test-Path (Join-Path $root 'status.json'))){throw 'CCA_PERSISTENT_STAGING_NOT_PROVISIONED'}
 $meta=Get-Content (Join-Path $root 'status.json') -Raw | ConvertFrom-Json
 if($meta.scope -ne 'FICTIONAL_STAGING_ONLY' -or $meta.port -ne 55451 -or
    $meta.database -ne 'cca_fictional_services'){throw 'CCA_STAGING_SCOPE_INVALID'}
 & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p $port -t 3 | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CCA_PERSISTENT_PG_UNAVAILABLE'}
 $env:PGUSER='cca_staging_admin'
 $env:PGPASSWORD=Get-DpapiSecret 'admin.dpapi'
 if($SeedFictional){
  $query=@'
INSERT INTO public.cca_service_requests(id,tenant_id,service_code,status)
VALUES ('fictional-cca-cedar-01','demo-cedar','MANAGED_POSTGRESQL','REQUEST_ONLY'),
       ('fictional-cca-atlas-01','demo-atlas','SSL_TLS_CERTIFICATE','REQUEST_ONLY')
ON CONFLICT (id) DO NOTHING;
'@
  Invoke-Query $query | Out-Null
 }
 $overall=@(Invoke-Query 'SELECT COUNT(*) FROM public.cca_service_requests')
 $env:PGUSER='cca_staging_reader'
 $env:PGPASSWORD=Get-DpapiSecret 'reader.dpapi'
 $noTenant=@(Invoke-Query 'SELECT COUNT(*) FROM public.cca_service_requests')
 $cedar=@(Invoke-Query "BEGIN READ ONLY; SELECT set_config('cca.tenant_id','demo-cedar',true); SELECT COUNT(*) FROM public.cca_service_requests; COMMIT;")
 $atlas=@(Invoke-Query "BEGIN READ ONLY; SELECT set_config('cca.tenant_id','demo-atlas',true); SELECT COUNT(*) FROM public.cca_service_requests; COMMIT;")
 $role=@(Invoke-Query "SELECT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)::int FROM pg_roles WHERE rolname=current_user;")
 Write-Output ('SAFE_FICTIONAL_COUNTS: total='+($overall -join ',')+'; noTenant='+($noTenant -join ',')+'; Cedar='+($cedar -join ',')+'; Atlas='+($atlas -join ',')+'; privilegedRole='+($role -join ','))
 if($overall[-1].Trim() -ne '2' -or $noTenant[-1].Trim() -ne '0' -or
  $cedar[-2].Trim() -ne '1' -or $atlas[-2].Trim() -ne '1' -or
  $role[-1].Trim() -ne '0') {throw 'CCA_PERSISTENT_TENANT_ISOLATION_FAILED'}
 Write-Output 'PASS: Persistent CCA PostgreSQL accepts independent restricted login; unscoped rows 0, Cedar 1, Atlas 1; 2 fictional requests persisted.'
 Write-Output 'PASS: No customer, Zermatt or other CCA database records inspected.'
}finally {
 Remove-Item Env:PGPASSWORD,Env:PGUSER,Env:PGHOST,Env:PGPORT,Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
}
