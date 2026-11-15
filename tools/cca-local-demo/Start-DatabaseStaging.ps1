param(
    [ValidateSet('Start', 'Verify', 'Stop', 'Backup')]
    [string]$Action = 'Start',
    [string]$RecoveryCertificate,
    [switch]$CompressArchive
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'CRNETWORK-CCA-Database-Staging'
$data = Join-Path $root 'data'
$pgpass = Join-Path $root 'pgpass.conf'
$ready = Join-Path $root 'pilot.ready'
$port = 55434
$admin = 'cca_staging_admin'
$chris = 'chris_staging_app'
$cedar = 'cedar_staging_app'
$pgBin = Split-Path -Parent (Get-Command psql.exe -CommandType Application).Source

function Invoke-Pg($Program, [string[]]$Arguments) {
    & (Join-Path $pgBin "$Program.exe") @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE." }
}

function New-Password {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Invoke-Sql($User, $Database, $Sql) {
    Invoke-Pg 'psql' @('-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database, '-c', $Sql)
}

function Assert-ConnectionDenied($User, $Database, $ExpectedError) {
    $ErrorActionPreference = 'Continue'
    $output = & (Join-Path $pgBin 'psql.exe') -X -w -qAt -U $User -d $Database -c 'SELECT 1' 2>&1
    if ($LASTEXITCODE -eq 0 -or ($output -join ' ') -notmatch $ExpectedError) {
        throw "Expected access denial for $User on $Database."
    }
}

Get-ChildItem Env:PG* | ForEach-Object { Remove-Item "Env:$($_.Name)" }
$env:PGHOST = '127.0.0.1'
$env:PGPORT = "$port"
$env:PGPASSFILE = $pgpass
$env:PGCONNECT_TIMEOUT = '5'

if ($Action -eq 'Start') {
    if (!(Test-Path $root)) {
        New-Item -ItemType Directory -Path $root | Out-Null
        $acl = Get-Acl -LiteralPath $root
        $acl.SetAccessRuleProtection($true, $false)
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
        Set-Acl -LiteralPath $root -AclObject $acl

        $adminSecret = New-Password
        $chrisSecret = New-Password
        $cedarSecret = New-Password
        @(
            "127.0.0.1:${port}:*:${admin}:$adminSecret"
            "127.0.0.1:${port}:chris_staging:${chris}:$chrisSecret"
            "127.0.0.1:${port}:cedar_staging:${cedar}:$cedarSecret"
        ) | Set-Content -LiteralPath $pgpass -Encoding ASCII
        $passwordFile = Join-Path $root 'init-password'
        $adminSecret | Set-Content -LiteralPath $passwordFile -Encoding ASCII
        try {
            Invoke-Pg 'initdb' @('-D', $data, '-U', $admin, '--auth=scram-sha-256', "--pwfile=$passwordFile", '--locale=C', '--encoding=UTF8') | Out-Null
        } finally {
            Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue
        }
        @("listen_addresses = '127.0.0.1'", "port = $port", "shared_buffers = '32MB'", "max_connections = 15", "lc_messages = 'C'") |
            Add-Content -LiteralPath (Join-Path $data 'postgresql.conf') -Encoding ASCII
    }
    if (!(Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
        throw "The staging cluster is incomplete. Inspect $root before retrying."
    }
    & (Join-Path $pgBin 'pg_ctl.exe') -D $data status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # Use file redirects so the server cannot hold the terminal's output pipe open.
        $stdout = Join-Path $root 'start.stdout.log'
        $stderr = Join-Path $root 'start.stderr.log'
        $command = '-D "{0}" -l "{1}" -w start' -f $data, (Join-Path $root 'postgres.log')
        $starter = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $command `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr -NoNewWindow -PassThru
        if (!$starter.WaitForExit(70000)) {
            throw "PostgreSQL failed to start. Inspect $stderr and postgres.log."
        }
        Invoke-Pg 'pg_ctl' @('-D', $data, 'status') | Out-Null
    }
    if (!(Test-Path $ready)) {
        $serverDirectory = (Invoke-Sql $admin 'postgres' 'SHOW data_directory').Replace('/', '\')
        if ($serverDirectory -ne $data) { throw 'Connected server is outside the staging directory.' }
        $entries = Get-Content -LiteralPath $pgpass
        $chrisSecret = (($entries | Where-Object { $_ -like "*:chris_staging:${chris}:*" }) -split ':', 5)[4]
        $cedarSecret = (($entries | Where-Object { $_ -like "*:cedar_staging:${cedar}:*" }) -split ':', 5)[4]
        if ($chrisSecret -notmatch '^[a-f0-9]{64}$' -or $cedarSecret -notmatch '^[a-f0-9]{64}$') {
            throw 'Invalid staging credential file.'
        }
        # Pass role passwords over stdin, so they stay out of process arguments.
        foreach ($entry in @(@($chris, $chrisSecret), @($cedar, $cedarSecret))) {
            $role, $secret = $entry
            if (!(Invoke-Sql $admin 'postgres' "SELECT 1 FROM pg_roles WHERE rolname = '$role'")) {
                "CREATE ROLE $role LOGIN PASSWORD '$secret';" |
                    & (Join-Path $pgBin 'psql.exe') -X -w -q -v ON_ERROR_STOP=1 -U $admin -d postgres
                if ($LASTEXITCODE -ne 0) { throw 'Role provisioning failed.' }
            }
        }
        foreach ($database in @('chris_staging', 'cedar_staging')) {
            if (!(Invoke-Sql $admin 'postgres' "SELECT 1 FROM pg_database WHERE datname = '$database'")) {
                Invoke-Sql $admin 'postgres' "CREATE DATABASE $database"
            }
        }
        Invoke-Sql $admin 'postgres' "REVOKE CONNECT ON DATABASE postgres, template0, template1, chris_staging, cedar_staging FROM PUBLIC; GRANT CONNECT ON DATABASE chris_staging TO $chris; GRANT CONNECT ON DATABASE cedar_staging TO $cedar;"
        Invoke-Sql $admin 'chris_staging' "CREATE TABLE IF NOT EXISTS pilot_record (label text PRIMARY KEY); INSERT INTO pilot_record VALUES ('fictional-chris-staging') ON CONFLICT DO NOTHING; GRANT SELECT ON pilot_record TO $chris;"
        Invoke-Sql $admin 'cedar_staging' "CREATE TABLE IF NOT EXISTS pilot_record (label text PRIMARY KEY); INSERT INTO pilot_record VALUES ('fictional-cedar-staging') ON CONFLICT DO NOTHING; GRANT SELECT ON pilot_record TO $cedar;"
        New-Item -ItemType File -Path $ready -Force | Out-Null
    }
    if ((Invoke-Sql $chris 'chris_staging' 'SELECT label FROM pilot_record') -ne 'fictional-chris-staging') {
        throw 'CHRiS staging marker is missing.'
    }
    Write-Output 'PASS: Persistent PostgreSQL staging is running on 127.0.0.1:55434'
    return
}

if (!(Test-Path $ready)) { throw 'Start the database staging pilot first.' }
if ($Action -eq 'Stop') {
    Invoke-Pg 'pg_ctl' @('-D', $data, '-m', 'fast', '-w', 'stop')
    return
}

if ($Action -eq 'Verify') {
    # Valid Cedar credentials are needed to test PostgreSQL's CONNECT denial.
    $cedarEntry = Get-Content -LiteralPath $pgpass | Where-Object { $_ -like "*:cedar_staging:${cedar}:*" }
    $env:PGPASSWORD = ($cedarEntry -split ':', 5)[4]
    try {
        Assert-ConnectionDenied $cedar 'chris_staging' 'permission denied for database'
    } finally {
        Remove-Item Env:PGPASSWORD
    }
    if ((Invoke-Sql $cedar 'cedar_staging' 'SELECT label FROM pilot_record') -ne 'fictional-cedar-staging') { throw 'Cedar marker is missing.' }
    Invoke-Sql $admin 'postgres' "ALTER ROLE $cedar NOLOGIN; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '$cedar';" | Out-Null
    try {
        Assert-ConnectionDenied $cedar 'cedar_staging' 'is not permitted to log in'
        if ((Invoke-Sql $chris 'chris_staging' 'SELECT label FROM pilot_record') -ne 'fictional-chris-staging') { throw 'CHRiS access failed during Cedar suspension.' }
    } finally {
        Invoke-Sql $admin 'postgres' "ALTER ROLE $cedar LOGIN"
    }
    Write-Output 'PASS: Cedar cannot connect to CHRiS. Cedar suspension leaves CHRiS available.'
    return
}

$cert = (Resolve-Path -LiteralPath $RecoveryCertificate).Path
$openssl = Get-Command openssl.exe -CommandType Application -ErrorAction SilentlyContinue
$opensslPath = if ($openssl) { $openssl.Source } else { Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe' }
if (!(Test-Path -LiteralPath $opensslPath)) { throw 'OpenSSL is required for the encrypted backup.' }
$archive = Join-Path $root ('recovery-' + [Guid]::NewGuid().ToString('N') + '.cms')
$plain = Join-Path $root ('recovery-' + [Guid]::NewGuid().ToString('N') + '.dump')
$compressed = "$plain.gz"
try {
    Invoke-Pg 'pg_dump' @('-w', '-U', $admin, '-Fc', '-f', $plain, 'chris_staging')
    $payload = $plain
    if ($CompressArchive) {
        $inputStream = [IO.File]::OpenRead($plain)
        try {
            $outputStream = [IO.File]::Create($compressed)
            try {
                $gzip = [IO.Compression.GZipStream]::new($outputStream, [IO.Compression.CompressionLevel]::Optimal)
                try { $inputStream.CopyTo($gzip) } finally { $gzip.Dispose() }
            } finally {
                $outputStream.Dispose()
            }
        } finally {
            $inputStream.Dispose()
        }
        $payload = $compressed
    }
    & $opensslPath cms -encrypt -binary -aes-256-gcm -outform DER -in $payload -out $archive $cert
    if ($LASTEXITCODE -ne 0) { throw 'Backup encryption failed.' }
    Write-Output $archive
} catch {
    Remove-Item -LiteralPath $archive -ErrorAction SilentlyContinue
    throw
} finally {
    Remove-Item -LiteralPath $plain, $compressed -ErrorAction SilentlyContinue
}
