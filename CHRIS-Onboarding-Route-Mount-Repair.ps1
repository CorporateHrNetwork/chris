param([string]$ProjectRoot="C:\Dev\chris")
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "CHRIS Onboarding Route Mount Repair" -ForegroundColor Green
Write-Host "Root cause: onboarding routes were removed from server.js but are not mounted in app.js." -ForegroundColor DarkGreen

$appFile = Join-Path $ProjectRoot "backend\src\app.js"

if(!(Test-Path $appFile)){
  throw "backend\src\app.js not found."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $ProjectRoot ".chris-backups\onboarding-route-mount-$stamp"

New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $appFile (Join-Path $backup "app.js") -Force

$app = [IO.File]::ReadAllText($appFile)

Write-Host ""
Write-Host "=== 1. ADD ONBOARDING ROUTE IMPORT ===" -ForegroundColor Cyan

if($app -notmatch 'const\s+onboardingRoutes\s*=\s*require\('){
  $anchor = 'const employeeRoutes = require("./routes/employeeRoutes");'

  if(-not $app.Contains($anchor)){
    throw "employeeRoutes import anchor not found."
  }

  $replacement = $anchor + "`r`n" +
    'const onboardingRoutes = require("./routes/onboardingRoutes");'

  $app = $app.Replace(
    $anchor,
    $replacement
  )

  Write-Host "PASS: onboardingRoutes import added." -ForegroundColor Green
}
else{
  Write-Host "OK: onboardingRoutes import already present." -ForegroundColor DarkGreen
}

Write-Host ""
Write-Host "=== 2. MOUNT ONBOARDING BEFORE GENERIC EMPLOYEE ROUTER ===" -ForegroundColor Cyan

if($app -notmatch '"/api/employees/onboarding"'){
  $anchor = @'
app.use(
  "/api/employees",
  employeeRoutes
);
'@

  if(-not $app.Contains($anchor)){
    throw "Generic employee router mount anchor not found."
  }

  $replacement = @'
app.use(
  "/api/employees/onboarding",
  onboardingRoutes
);

app.use(
  "/api/employees",
  employeeRoutes
);
'@

  $app = $app.Replace(
    $anchor,
    $replacement
  )

  Write-Host "PASS: onboarding routes mounted before /api/employees." -ForegroundColor Green
}
else{
  Write-Host "OK: onboarding route mount already present." -ForegroundColor DarkGreen
}

[IO.File]::WriteAllText(
  $appFile,
  $app,
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== 3. BACKEND SYNTAX CHECK ===" -ForegroundColor Cyan

Push-Location (Join-Path $ProjectRoot "backend")
try{
  node --check src\app.js
  if($LASTEXITCODE -ne 0){
    throw "app.js syntax check failed."
  }

  node --check src\routes\onboardingRoutes.js
  if($LASTEXITCODE -ne 0){
    throw "onboardingRoutes.js syntax check failed."
  }
}
finally{
  Pop-Location
}

Write-Host "PASS: Backend syntax valid." -ForegroundColor Green

Write-Host ""
Write-Host "=== 4. STATIC ROUTE ORDER CHECK ===" -ForegroundColor Cyan

$app = [IO.File]::ReadAllText($appFile)

$onboardingIndex =
  $app.IndexOf(
    '"/api/employees/onboarding"'
  )

$employeeIndex =
  $app.IndexOf(
    '"/api/employees"'
  )

if(
  $onboardingIndex -lt 0 -or
  $employeeIndex -lt 0 -or
  $onboardingIndex -ge $employeeIndex
){
  throw "Onboarding route must be mounted before the generic employee router."
}

Write-Host "PASS: Route order is correct." -ForegroundColor Green

Write-Host ""
Write-Host "============================================================"
Write-Host "CHRIS ONBOARDING ROUTE MOUNT REPAIR PASSED" -ForegroundColor Green
Write-Host "============================================================"
Write-Host ""
Write-Host "Now stop the backend completely with Ctrl+C and restart it:"
Write-Host "  cd C:\Dev\chris\backend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Then hard-refresh CHRIS with Ctrl+F5."
Write-Host ""
Write-Host "Backup: $backup"