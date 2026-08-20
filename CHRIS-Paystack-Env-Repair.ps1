param([string]$ProjectRoot="C:\Dev\chris")
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "CHRIS Paystack Environment Load Repair" -ForegroundColor Green

$server = Join-Path $ProjectRoot "backend\src\server.js"
$envFile = Join-Path $ProjectRoot "backend\.env"

if(!(Test-Path $server)){
  throw "backend\src\server.js not found."
}

if(!(Test-Path $envFile)){
  throw "backend\.env not found."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $ProjectRoot ".chris-backups\paystack-env-repair-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $server (Join-Path $backup "server.js") -Force

Write-Host ""
Write-Host "=== 1. VERIFY KEY EXISTS WITHOUT DISPLAYING IT ===" -ForegroundColor Cyan

$envText = [IO.File]::ReadAllText($envFile)

$match = [regex]::Match(
  $envText,
  '(?m)^PAYSTACK_SECRET_KEY=(.+)$'
)

if(-not $match.Success){
  throw "PAYSTACK_SECRET_KEY was not found in backend\.env."
}

$key = $match.Groups[1].Value.Trim()

if(
  -not (
    $key.StartsWith("sk_test_") -or
    $key.StartsWith("sk_live_")
  )
){
  throw "PAYSTACK_SECRET_KEY exists but does not have the expected Paystack secret-key prefix."
}

Write-Host "PASS: PAYSTACK_SECRET_KEY exists in backend\.env." -ForegroundColor Green

Write-Host ""
Write-Host "=== 2. FORCE BACKEND TO LOAD ITS OWN .ENV FILE ===" -ForegroundColor Cyan

$content = @'
const path = require("path");

require("dotenv").config({
  path: path.join(
    __dirname,
    "../.env"
  ),
});

const app = require("./app");

const PORT =
  process.env.PORT || 5000;

const paystackConfigured =
  Boolean(
    String(
      process.env
        .PAYSTACK_SECRET_KEY ||
        ""
    ).trim()
  );

console.log(
  `CHRIS Paystack configured: ${
    paystackConfigured
      ? "YES"
      : "NO"
  }`
);

app.listen(PORT, () => {
  console.log(
    `CHRIS API running on http://localhost:${PORT}`
  );
});
'@

[IO.File]::WriteAllText(
  $server,
  $content,
  [Text.UTF8Encoding]::new($false)
)

Write-Host "PASS: server.js now loads backend\.env by explicit absolute path." -ForegroundColor Green

Write-Host ""
Write-Host "=== 3. BACKEND ENV LOAD TEST ===" -ForegroundColor Cyan

$testCode = @'
const path = require("path");
require("dotenv").config({
  path: path.join(
    process.cwd(),
    ".env"
  ),
});
const configured =
  Boolean(
    String(
      process.env.PAYSTACK_SECRET_KEY || ""
    ).trim()
  );
console.log(
  configured
    ? "PAYSTACK_ENV_TEST=PASS"
    : "PAYSTACK_ENV_TEST=FAIL"
);
process.exit(
  configured ? 0 : 1
);
'@

$testFile = Join-Path $ProjectRoot "backend\.paystack-env-test.cjs"

[IO.File]::WriteAllText(
  $testFile,
  $testCode,
  [Text.UTF8Encoding]::new($false)
)

Push-Location (Join-Path $ProjectRoot "backend")
try{
  node .paystack-env-test.cjs
  if($LASTEXITCODE -ne 0){
    throw "Node could not load PAYSTACK_SECRET_KEY from backend\.env."
  }

  node --check src\server.js
  if($LASTEXITCODE -ne 0){
    throw "server.js syntax check failed."
  }
}
finally{
  Pop-Location
  Remove-Item $testFile -Force -ErrorAction SilentlyContinue
}

Write-Host "PASS: Node can read PAYSTACK_SECRET_KEY from backend\.env." -ForegroundColor Green

Write-Host ""
Write-Host "============================================================"
Write-Host "CHRIS PAYSTACK ENVIRONMENT REPAIR PASSED" -ForegroundColor Green
Write-Host "============================================================"
Write-Host ""
Write-Host "IMPORTANT: Stop the currently running backend completely, then start it again."
Write-Host ""
Write-Host "Run:"
Write-Host "  cd C:\Dev\chris\backend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "At startup you should see:"
Write-Host "  CHRIS Paystack configured: YES"
Write-Host ""
Write-Host "Backup: $backup"