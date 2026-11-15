param([switch]$GeneratePassword, [switch]$PilotProfile, [switch]$EnrollCedarApprover)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$node = (Get-Command node.exe -CommandType Application).Source
$profileName = if ($PilotProfile) { 'CRNetwork-CCA-Stage4D-Pilot' } else { 'CRNetwork-CCA-Stage4D' }
$directory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $profileName
$security = Join-Path $directory 'host-security'
$state = Join-Path $directory 'state'
$keyFile = Join-Path $security 'staging-key.dpapi'
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
$entropy = [Text.Encoding]::UTF8.GetBytes('CRNetwork CCA isolated local staging key v1')
$entry = Join-Path $PSScriptRoot 'runStaging.js'
function Invoke-StagingNode([string]$Mode, [byte[]]$Key, [string]$Password) {
    $info = [Diagnostics.ProcessStartInfo]::new($node)
    $info.Arguments = '"' + $entry + '" "' + $directory + '" ' + $Mode
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        $payload = @{master = [Convert]::ToBase64String($Key)}
        if ($Mode -in 'enroll', 'enroll-approver') {
            if ($GeneratePassword) { $payload.generatePassword = $true }
            else { $payload.password = $Password }
        }
        $encoded = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
        try {
            $process.StandardInput.BaseStream.Write($encoded, 0, $encoded.Length)
        } finally {
            $process.StandardInput.BaseStream.Close()
            [Array]::Clear($encoded, 0, $encoded.Length)
            [Array]::Clear($Key, 0, $Key.Length)
            $payload.Clear()
        }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'CCA staging halted. Preserve its state for review.' }
    } finally { $process.Dispose() }
}

function Assert-PrivateDirectory([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'CCA staging directory is redirected.' }
    $acl = Get-Acl -LiteralPath $Path
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $currentSid -or
        ($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
            Where-Object { $_.IdentityReference.Value -ne $currentSid -and $_.AccessControlType -eq 'Allow' })) {
        throw 'CCA staging directory has unexpected Windows access permissions.'
    }
}

if (!(Test-Path -LiteralPath $directory)) {
    if ($EnrollCedarApprover) { throw 'Start and enroll the staging operator first.' }
    $first = $null
    if (!$GeneratePassword) {
        $password = Read-Host 'Set a unique staging password (14-256 characters)' -AsSecureString
        $repeat = Read-Host 'Repeat the staging password' -AsSecureString
        try {
            $first = [Net.NetworkCredential]::new('', $password).Password
            $second = [Net.NetworkCredential]::new('', $repeat).Password
            if ($first.Length -lt 14 -or $first.Length -gt 256 -or $first -cne $second) {
                throw 'Staging passwords must match and contain 14-256 characters.'
            }
        } finally {
            $password.Dispose()
            $repeat.Dispose()
            Remove-Variable second -ErrorAction SilentlyContinue
        }
    }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    [IO.Directory]::CreateDirectory($directory, $acl) | Out-Null
    Assert-PrivateDirectory $directory
    [IO.Directory]::CreateDirectory($security) | Out-Null
    [IO.Directory]::CreateDirectory($state) | Out-Null
    $master = [byte[]]::new(32)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($master) } finally { $rng.Dispose() }
    try {
        $wrapped = [Security.Cryptography.ProtectedData]::Protect($master, $entropy, $scope)
        $file = [IO.File]::Open($keyFile, 'CreateNew', 'Write', 'None')
        try { $file.Write($wrapped, 0, $wrapped.Length); $file.Flush($true) }
        finally { $file.Dispose() }
        Invoke-StagingNode 'enroll' $master $first
    } finally {
        [Array]::Clear($master, 0, $master.Length)
        Remove-Variable first
    }
}

foreach ($private in @($directory, $security, $state)) { Assert-PrivateDirectory $private }
$keyItem = Get-Item -LiteralPath $keyFile -Force
if ($keyItem.PSIsContainer -or $keyItem.Length -gt 4096 -or
    ($keyItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'CCA staging key file is invalid.' }
$master = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyFile), $entropy, $scope)
try {
    if ($EnrollCedarApprover) {
        $first = $null
        if (!$GeneratePassword) {
            $password = Read-Host 'Set a separate Cedar approver password (14-256 characters)' -AsSecureString
            $repeat = Read-Host 'Repeat the Cedar approver password' -AsSecureString
            try {
                $first = [Net.NetworkCredential]::new('', $password).Password
                $second = [Net.NetworkCredential]::new('', $repeat).Password
                if ($first.Length -lt 14 -or $first.Length -gt 256 -or $first -cne $second) {
                    throw 'Approver passwords must match and contain 14-256 characters.'
                }
            } finally {
                $password.Dispose()
                $repeat.Dispose()
                Remove-Variable second -ErrorAction SilentlyContinue
            }
        }
        try { Invoke-StagingNode 'enroll-approver' $master $first }
        finally { Remove-Variable first }
    } else {
        Invoke-StagingNode 'serve' $master
    }
} finally { [Array]::Clear($master, 0, $master.Length) }
