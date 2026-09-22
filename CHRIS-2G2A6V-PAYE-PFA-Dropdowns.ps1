param([string]$ProjectRoot="C:\Dev\chris")
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "CHRIS 2G.2A6V - Nigeria PAYE State and PFA Dropdowns" -ForegroundColor Green

$page = Join-Path $ProjectRoot "src\pages\EmployeeOnboarding.jsx"

if(!(Test-Path $page)){
  throw "EmployeeOnboarding.jsx not found."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $ProjectRoot ".chris-backups\sprint-2g2a6v-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $page (Join-Path $backup "EmployeeOnboarding.jsx") -Force

$p = [IO.File]::ReadAllText($page)

Write-Host ""
Write-Host "=== 1. ADD CURRENT NIGERIA PFA CATALOG ===" -ForegroundColor Cyan

if($p -notmatch 'const\s+NIGERIA_PFAS\s*='){
  $anchor = 'const WORKFLOW_NAME_OPTIONS = ['

  $idx = $p.IndexOf($anchor)

  if($idx -lt 0){
    throw "WORKFLOW_NAME_OPTIONS anchor not found."
  }

  $catalog = @'
const NIGERIA_PFAS = [
  "Access ARM Pensions Limited",
  "Cardinal Stone Pensions Limited",
  "Citizens Pensions Limited",
  "Crusader Sterling Pensions Limited",
  "FCMB Pensions Limited",
  "Fidelity Pension Managers Limited",
  "Guaranty Trust Pension Managers Limited",
  "Leadway PFA Limited",
  "Nigerian University Pension Management Company (NUPEMCO)",
  "NLPC Pension Fund Administrators Limited",
  "Norrenberger Pensions Limited",
  "NPF Pension Managers Limited",
  "OAK Pensions Limited",
  "Parthian Pensions Limited",
  "Premium Pension Limited",
  "Stanbic IBTC Pension Managers Limited",
  "Tangerine APT Pensions Limited",
  "Trustfund Pensions Limited",
  "Veritas Glanvills Pensions Limited",
];

'@

  $p = $p.Insert(
    $idx,
    $catalog
  )

  Write-Host "PASS: Nigeria PFA catalog added." -ForegroundColor Green
}
else{
  Write-Host "OK: Nigeria PFA catalog already exists." -ForegroundColor DarkGreen
}

Write-Host ""
Write-Host "=== 2. CHANGE PAYE STATE TO DROPDOWN ===" -ForegroundColor Cyan

$oldPaye = @'
      <Field label="PAYE State / Tax Authority">
        <input
          value={
            data.payeState || ""
          }
          onChange={(event) =>
            setField(
              "payeState",
              event.target.value
            )
          }
          style={inputStyle}
        />
      </Field>
'@

$newPaye = @'
      <Field label="PAYE State / Tax Authority">
        <select
          value={
            data.payeState || ""
          }
          onChange={(event) =>
            setField(
              "payeState",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select PAYE state
          </option>

          {NIGERIA_STATES.map(
            (state) => (
              <option
                key={state}
                value={state}
              >
                {state}
              </option>
            )
          )}
        </select>
      </Field>
'@

if($p.Contains($oldPaye)){
  $p = $p.Replace(
    $oldPaye,
    $newPaye
  )
  Write-Host "PASS: PAYE State is now a dropdown using all 36 states plus FCT." -ForegroundColor Green
}
elseif($p -match 'Select PAYE state'){
  Write-Host "OK: PAYE State dropdown already present." -ForegroundColor DarkGreen
}
else{
  throw "PAYE State field anchor not found."
}

Write-Host ""
Write-Host "=== 3. CHANGE PFA TO DROPDOWN ===" -ForegroundColor Cyan

$oldPfa = @'
      <Field label="Pension Fund Administrator (PFA)">
        <input
          value={
            data.pensionPfa || ""
          }
          onChange={(event) =>
            setField(
              "pensionPfa",
              event.target.value
            )
          }
          style={inputStyle}
        />
      </Field>
'@

$newPfa = @'
      <Field label="Pension Fund Administrator (PFA)">
        <select
          value={
            data.pensionPfa || ""
          }
          onChange={(event) =>
            setField(
              "pensionPfa",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select Pension Fund Administrator
          </option>

          {NIGERIA_PFAS.map(
            (pfa) => (
              <option
                key={pfa}
                value={pfa}
              >
                {pfa}
              </option>
            )
          )}
        </select>
      </Field>
'@

if($p.Contains($oldPfa)){
  $p = $p.Replace(
    $oldPfa,
    $newPfa
  )
  Write-Host "PASS: PFA is now a dropdown using the current PenCom PFA list." -ForegroundColor Green
}
elseif($p -match 'Select Pension Fund Administrator'){
  Write-Host "OK: PFA dropdown already present." -ForegroundColor DarkGreen
}
else{
  throw "PFA field anchor not found."
}

[IO.File]::WriteAllText(
  $page,
  $p,
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== 4. STATIC ASSERTIONS ===" -ForegroundColor Cyan

$checks = @(
  'const NIGERIA_PFAS =',
  'Select PAYE state',
  'NIGERIA_STATES.map',
  'Select Pension Fund Administrator',
  'NIGERIA_PFAS.map'
)

foreach($check in $checks){
  if($p -notmatch [regex]::Escape($check)){
    throw "Static assertion failed: $check"
  }

  Write-Host "PASS: $check" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 5. ASCII SOURCE SAFETY ===" -ForegroundColor Cyan

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
Write-Host "=== 6. FRONTEND BUILD ===" -ForegroundColor Cyan

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
Write-Host "CHRIS 2G.2A6V - PAYE / PFA DROPDOWNS PASSED" -ForegroundColor Green
Write-Host "============================================================"
Write-Host ""
Write-Host "PAYE State: 36 Nigerian states + FCT from existing CHRIS location data."
Write-Host "PFA: Current Pension Fund Administrators listed by PenCom."
Write-Host ""
Write-Host "Backup: $backup"