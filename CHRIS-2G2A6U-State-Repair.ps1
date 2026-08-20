param([string]$ProjectRoot="C:\Dev\chris")
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "CHRIS 2G.2A6U - Missing Section State Repair" -ForegroundColor Green
Write-Host "Root cause: setSectionDataForm was referenced but its useState declaration was never added." -ForegroundColor DarkGreen

$page = Join-Path $ProjectRoot "src\pages\EmployeeOnboarding.jsx"

if(!(Test-Path $page)){
  throw "EmployeeOnboarding.jsx not found."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $ProjectRoot ".chris-backups\sprint-2g2a6u-$stamp"

New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $page (Join-Path $backup "EmployeeOnboarding.jsx") -Force

$p = [IO.File]::ReadAllText($page)

Write-Host ""
Write-Host "=== 1. VERIFY ROOT CAUSE ===" -ForegroundColor Cyan

$hasSetterReference =
  $p -match '\bsetSectionDataForm\s*\('

$hasStateDeclaration =
  $p -match 'const\s*\[\s*sectionDataForm\s*,\s*setSectionDataForm\s*,?\s*\]\s*=\s*useState'

if($hasSetterReference){
  Write-Host "PASS: setSectionDataForm references are present." -ForegroundColor Green
}
else{
  throw "setSectionDataForm is not referenced; this does not match the reported console error."
}

if($hasStateDeclaration){
  Write-Host "INFO: sectionDataForm state declaration already exists." -ForegroundColor Yellow
}
else{
  Write-Host "CONFIRMED: sectionDataForm state declaration is missing." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 2. INSERT MISSING STATE DECLARATION ===" -ForegroundColor Cyan

if(-not $hasStateDeclaration){
  $anchor = @'
  const [
    sectionForm,
    setSectionForm,
  ] = useState(
    EMPTY_PERSONAL_FORM
  );
'@

  if(-not $p.Contains($anchor)){
    throw "sectionForm state anchor not found. No source changes made."
  }

  $replacement = $anchor + @'

  const [
    sectionDataForm,
    setSectionDataForm,
  ] = useState({});
'@

  $p = $p.Replace(
    $anchor,
    $replacement
  )

  Write-Host "PASS: sectionDataForm/useState declaration inserted." -ForegroundColor Green
}
else{
  Write-Host "OK: No duplicate state declaration added." -ForegroundColor DarkGreen
}

Write-Host ""
Write-Host "=== 3. STATIC SCOPE ASSERTIONS ===" -ForegroundColor Cyan

$checks = @(
  'const\s*\[\s*sectionDataForm\s*,\s*setSectionDataForm',
  'setSectionDataForm\s*\(',
  'value=\{sectionDataForm\}',
  'onChange=\{\s*setSectionDataForm\s*\}'
)

foreach($pattern in $checks){
  if($p -notmatch $pattern){
    throw "Static assertion failed: $pattern"
  }

  Write-Host "PASS: $pattern" -ForegroundColor Green
}

[IO.File]::WriteAllText(
  $page,
  $p,
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== 4. ASCII SOURCE SAFETY ===" -ForegroundColor Cyan

$bytes = [IO.File]::ReadAllBytes($page)
$bad = 0

foreach($byte in $bytes){
  if($byte -gt 127){
    $bad++
  }
}

if($bad -gt 0){
  throw "EmployeeOnboarding.jsx contains $bad non-ASCII source bytes."
}

Write-Host "PASS: EmployeeOnboarding.jsx remains ASCII-safe." -ForegroundColor Green

Write-Host ""
Write-Host "=== 5. FRONTEND BUILD ===" -ForegroundColor Cyan

Push-Location $ProjectRoot
try{
  npm run build

  if($LASTEXITCODE -ne 0){
    throw "Frontend build failed."
  }
}
finally{
  Pop-Location
}

Write-Host ""
Write-Host "============================================================"
Write-Host "CHRIS 2G.2A6U - MISSING SECTION STATE REPAIR PASSED" -ForegroundColor Green
Write-Host "============================================================"
Write-Host ""
Write-Host "The exact console ReferenceError has been addressed."
Write-Host "Backup: $backup"