param(
    [Parameter(Mandatory)][ValidateSet('InitializeKey', 'Backup', 'Restore')][string]$Action,
    [string]$OffSiteDestination
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging'
if (!(Test-Path (Join-Path $root 'pilot.ready'))) { throw 'Initialize the private Windows database pilot first.' }
$remote = $OffSiteDestination
if ($remote -and $remote -notmatch '^[A-Za-z0-9_-]+:CRNETWORK-CCA-Staging-Backups$') {
    throw 'Use an approved rclone remote and the dedicated CRNETWORK-CCA-Staging-Backups folder.'
}
$localStore = Join-Path $root 'scheduled-local-backups'
$keys = Join-Path $root 'backup-keys'
$cert = Join-Path $keys 'recovery-public.pem'
$key = Join-Path $keys 'recovery-private.encrypted.pem'
$secret = Join-Path $keys 'recovery-passphrase.dpapi'
$openssl = Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
if (!(Test-Path $openssl)) { $openssl = (Get-Command openssl.exe -CommandType Application).Source }
$pgBin = Split-Path -Parent (Get-Command psql.exe -CommandType Application).Source

function Invoke-Native($Path, [string[]]$Arguments) {
    & $Path @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$(Split-Path -Leaf $Path) failed with exit code $LASTEXITCODE." }
}
function Invoke-Pg($Name, [string[]]$Arguments) {
    Invoke-Native (Join-Path $pgBin "$Name.exe") $Arguments
}
function Invoke-Storage([string[]]$Arguments) {
    $rclone = (Get-Command rclone.exe -CommandType Application).Source
    Invoke-Native $rclone ($Arguments + @('--contimeout','15s','--timeout','1m','--retries','2','--log-level','ERROR'))
}
function Save-Artifact($Source, $Name) {
    if ($remote) { Invoke-Storage @('copyto',$Source,"$remote/$Name",'--immutable'); return }
    New-Item -ItemType Directory -Path $localStore -Force | Out-Null
    [IO.File]::Copy($Source, (Join-Path $localStore $Name), $false)
}
function Read-Artifact($Name, $Destination) {
    if ($remote) { Invoke-Storage @('copyto',"$remote/$Name",$Destination); return }
    [IO.File]::Copy((Join-Path $localStore $Name), $Destination, $false)
}
function Find-LatestBackupMarker {
    if ($remote) {
        Invoke-Storage @('lsf',$remote,'--files-only','--include','cca-staging-backup-success-*.json')
        return
    }
    Get-ChildItem -LiteralPath $localStore -File -Filter 'cca-staging-backup-success-*.json' |
        Select-Object -ExpandProperty Name
}
function New-RandomHex {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

$lock = [IO.File]::Open((Join-Path $root 'backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd-HHmmss')
$runId = "$stamp-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$work = Join-Path $root "backup-run-$runId"
$restoreData = Join-Path $work 'recovery-cluster'
$restoreStarted = $false
$archive = $null
try {
    New-Item -ItemType Directory -Path $work | Out-Null
    $passFile = Join-Path $work 'key-passphrase'
    if ($Action -eq 'InitializeKey') {
        if (@($key,$cert,$secret | Where-Object { Test-Path -LiteralPath $_ }).Count -ne 0) {
            throw 'Recovery key material already exists. Existing backup keys are never rotated by this command.'
        }
        New-Item -ItemType Directory -Path $keys -Force | Out-Null
        $phrase = New-RandomHex
        $phrase | Set-Content -LiteralPath $passFile -Encoding ASCII
        $nextKey = Join-Path $work 'key.pem'
        $nextCert = Join-Path $work 'cert.pem'
        Invoke-Native $openssl @('genpkey','-quiet','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-aes-256-cbc','-pass',"file:$passFile",'-out',$nextKey)
        Invoke-Native $openssl @('req','-new','-x509','-key',$nextKey,'-passin',"file:$passFile",'-days','1825','-subj','/CN=CRNETWORK CCA Staging Backup','-out',$nextCert)
        ConvertTo-SecureString $phrase -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $secret -Encoding ASCII
        Move-Item -LiteralPath $nextKey -Destination $key
        Move-Item -LiteralPath $nextCert -Destination $cert
        Write-Output 'Created an encrypted recovery key under the Windows pilot account.'
        return
    }

    foreach ($item in @($cert,$key,$secret)) {
        if (!(Test-Path -LiteralPath $item)) { throw 'Initialize the recovery key before scheduling backup or restore.' }
    }

    if ($Action -eq 'Backup') {
        & (Join-Path $PSScriptRoot 'Start-DatabaseStaging.ps1') -Action Start | Out-Null
        $archive = & (Join-Path $PSScriptRoot 'Start-DatabaseStaging.ps1') -Action Backup -CompressArchive -RecoveryCertificate $cert
        $name = "cca-staging-$runId.cms"
        $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        Save-Artifact $archive $name
        $download = Join-Path $work 'verified.cms'
        Read-Artifact $name $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
            throw 'Stored archive SHA-256 did not match.'
        }
        $marker = "cca-staging-backup-success-$runId.json"
    } else {
        $markers = @(Find-LatestBackupMarker | Sort-Object -Descending)
        if (!$markers.Count -or $markers[0] -notmatch '^cca-staging-backup-success-\d{4}-\d{2}-\d{2}-\d{6}-[a-f0-9]{8}\.json$') {
            throw 'No verified staging backup is available.'
        }
        $manifestPath = Join-Path $work "manifest.json"
        Read-Artifact $markers[0] $manifestPath
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $name = [string]$manifest.archive
        $hash = [string]$manifest.sha256
        if ($name -notmatch '^cca-staging-\d{4}-\d{2}-\d{2}-\d{6}-[a-f0-9]{8}\.cms$' -or $hash -notmatch '^[a-f0-9]{64}$') {
            throw 'Invalid staging backup manifest.'
        }
        $download = Join-Path $work 'restore.cms'
        Read-Artifact $name $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Archive SHA-256 did not match its manifest.' }

        $secure = Get-Content -LiteralPath $secret | ConvertTo-SecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) | Set-Content -LiteralPath $passFile -Encoding ASCII }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
        $payload = Join-Path $work 'archive.gz'
        Invoke-Native $openssl @('cms','-decrypt','-binary','-inform','DER','-in',$download,'-recip',$cert,'-inkey',$key,'-passin',"file:$passFile",'-out',$payload)
        Remove-Item -LiteralPath $passFile
        $dump = Join-Path $work 'archive.dump'
        $inputStream = [IO.File]::OpenRead($payload)
        try {
            $outputStream = [IO.File]::Create($dump)
            try {
                $gzip = [IO.Compression.GZipStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)
                try { $gzip.CopyTo($outputStream) } finally { $gzip.Dispose() }
            } finally { $outputStream.Dispose() }
        } finally { $inputStream.Dispose() }

        Get-ChildItem Env:PG* | ForEach-Object { Remove-Item "Env:$($_.Name)" }
        $env:PGHOST = '127.0.0.1'
        $env:PGPORT = '55435'
        $env:PGCONNECT_TIMEOUT = '5'
        $env:PGPASSFILE = Join-Path $work 'pgpass.conf'
        $adminPassword = New-RandomHex
        $appPassword = New-RandomHex
        $adminPassword | Set-Content -LiteralPath $passFile -Encoding ASCII
        @("127.0.0.1:55435:*:cca_recovery_admin:$adminPassword", "127.0.0.1:55435:chris_recovered:chris_staging_app:$appPassword") |
            Set-Content -LiteralPath $env:PGPASSFILE -Encoding ASCII
        Invoke-Pg 'initdb' @('-D',$restoreData,'-U','cca_recovery_admin','--auth=scram-sha-256',"--pwfile=$passFile",'--locale=C','--encoding=UTF8') | Out-Null
        Remove-Item -LiteralPath $passFile
        @("listen_addresses = '127.0.0.1'","port = 55435","shared_buffers = '24MB'","max_connections = 10") |
            Add-Content -LiteralPath (Join-Path $restoreData 'postgresql.conf') -Encoding ASCII
        $log = Join-Path $work 'postgres.log'
        $startArgs = '-D "{0}" -l "{1}" -w start' -f $restoreData,$log
        $starter = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $startArgs -NoNewWindow -PassThru `
            -RedirectStandardOutput (Join-Path $work 'start.out') -RedirectStandardError (Join-Path $work 'start.err')
        if (!$starter.WaitForExit(70000)) { throw 'Recovery database startup timed out.' }
        Invoke-Pg 'pg_ctl' @('-D',$restoreData,'status') | Out-Null
        $restoreStarted = $true
        @"
CREATE ROLE chris_staging_app LOGIN PASSWORD '$appPassword';
CREATE ROLE cca_staging_admin NOLOGIN;
CREATE DATABASE chris_recovered;
REVOKE CONNECT ON DATABASE postgres, template0, template1, chris_recovered FROM PUBLIC;
GRANT CONNECT ON DATABASE chris_recovered TO chris_staging_app;
"@ | & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -U cca_recovery_admin -d postgres
        if ($LASTEXITCODE -ne 0) { throw 'Recovery database provisioning failed.' }
        Invoke-Pg 'pg_restore' @('-w','--exit-on-error','--single-transaction','-U','cca_recovery_admin','-d','chris_recovered',$dump)
        $query = @'
SELECT o.slug || '|' || e."employeeNumber" || '|' || l.name || '|' || d.name
FROM employees e
JOIN organizations o ON o.id = e."organizationId"
JOIN organization_locations l ON l.id = e."locationId" AND l."organizationId" = o.id
JOIN departments d ON d.id = e."departmentId" AND d."organizationId" = o.id
WHERE o.slug IN ('cca-fictional-chris-staging', 'cca-fictional-other')
ORDER BY e."employeeNumber";
'@
        $records = $query | & (Join-Path $pgBin 'psql.exe') -X -w -qAt -v ON_ERROR_STOP=1 -U chris_staging_app -d chris_recovered
        $expected = @(
            'cca-fictional-chris-staging|CCA-101|Cedar Gate|Fictional Operations'
            'cca-fictional-chris-staging|CCA-102|North Wharf|Fictional Operations'
            'cca-fictional-chris-staging|CCA-103|Cedar Gate|Fictional Operations'
            'cca-fictional-other|CCA-201|Harbour Annex|Fictional Operations'
        )
        if ($LASTEXITCODE -ne 0 -or ($records -join "`n") -ne ($expected -join "`n")) {
            throw 'Recovered employee, organization, branch, or department records did not match.'
        }
        $marker = "cca-staging-restore-success-$runId.json"
    }

    $status = Join-Path $work $marker
    [ordered]@{
        action = $Action; storage = $(if ($remote) { "offsite" } else { "local" }); completedUtc = (Get-Date).ToUniversalTime().ToString('o'); archive = $name; sha256 = $hash
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $status -Encoding ASCII
    Save-Artifact $status $marker
    Write-Output "PASS: $Action completed and published $marker"
} finally {
    try {
        if ($restoreStarted -or (Test-Path (Join-Path $restoreData 'postmaster.pid'))) {
            Invoke-Pg 'pg_ctl' @('-D',$restoreData,'-m','fast','-w','stop') | Out-Null
        }
        if ($archive -and (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $archive }
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    } finally { $lock.Dispose() }
}
