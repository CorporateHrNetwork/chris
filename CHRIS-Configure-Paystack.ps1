param([string]$ProjectRoot="C:\Dev\chris")
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "CHRIS Paystack Configuration" -ForegroundColor Green
Write-Host "This stores the Paystack secret key only in backend\.env." -ForegroundColor DarkGreen

$envFile = Join-Path $ProjectRoot "backend\.env"

if(!(Test-Path (Join-Path $ProjectRoot "backend"))){
  throw "CHRIS backend folder not found."
}

Write-Host ""
Write-Host "Enter your Paystack SECRET key." -ForegroundColor Cyan
Write-Host "Use sk_test_... while developing CHRIS." -ForegroundColor Yellow
Write-Host "The key will not be displayed on screen." -ForegroundColor DarkGray

$secureKey =
  Read-Host "Paystack Secret Key" -AsSecureString

$ptr =
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
    $secureKey
  )

try{
  $key =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
      $ptr
    )
}
finally{
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
    $ptr
  )
}

$key =
  String($key).Trim()

if(
  -not (
    $key.StartsWith("sk_test_") -or
    $key.StartsWith("sk_live_")
  )
){
  throw "That does not look like a Paystack secret key. Expected sk_test_... or sk_live_..."
}

$existing =
  if(Test-Path $envFile){
    [IO.File]::ReadAllText($envFile)
  }
  else{
    ""
  }

$line =
  "PAYSTACK_SECRET_KEY=$key"

if(
  $existing -match '(?m)^PAYSTACK_SECRET_KEY=.*$'
){
  $updated =
    [regex]::Replace(
      $existing,
      '(?m)^PAYSTACK_SECRET_KEY=.*$',
      $line
    )
}
else{
  $separator =
    if(
      $existing -and
      -not $existing.EndsWith("`n")
    ){
      "`r`n"
    }
    else{
      ""
    }

  $updated =
    $existing +
    $separator +
    $line +
    "`r`n"
}

[IO.File]::WriteAllText(
  $envFile,
  $updated,
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "PASS: PAYSTACK_SECRET_KEY saved to backend\.env." -ForegroundColor Green

Write-Host ""
Write-Host "=== SECURITY CHECK ===" -ForegroundColor Cyan

Push-Location $ProjectRoot
try{
  $ignored =
    git check-ignore "backend/.env" 2>$null

  if($LASTEXITCODE -eq 0){
    Write-Host "PASS: backend/.env is ignored by Git." -ForegroundColor Green
  }
  else{
    Write-Host "WARNING: backend/.env does not appear to be ignored by Git." -ForegroundColor Yellow
    Write-Host "Do not commit this file until .gitignore is corrected." -ForegroundColor Yellow
  }
}
finally{
  Pop-Location
}

Write-Host ""
Write-Host "=== PAYSTACK AUTHENTICATION TEST ===" -ForegroundColor Cyan

try{
  $headers = @{
    Authorization = "Bearer $key"
  }

  $response =
    Invoke-RestMethod `
      -Method Get `
      -Uri "https://api.paystack.co/bank?country=nigeria&perPage=5" `
      -Headers $headers

  if(
    $response.status -eq $true
  ){
    Write-Host "PASS: Paystack accepted the secret key." -ForegroundColor Green
    Write-Host "PASS: Nigeria bank API is reachable." -ForegroundColor Green
  }
  else{
    throw "Paystack did not return a successful response."
  }
}
catch{
  Write-Host "Paystack test failed: $($_.Exception.Message)" -ForegroundColor Red
  throw "The key was saved, but Paystack authentication could not be verified."
}

Write-Host ""
Write-Host "============================================================"
Write-Host "CHRIS PAYSTACK CONFIGURATION PASSED" -ForegroundColor Green
Write-Host "============================================================"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Restart the CHRIS backend."
Write-Host "  2. Open Payment Details."
Write-Host "  3. Select a bank."
Write-Host "  4. Enter a 10-digit account number."
Write-Host "  5. CHRIS should populate Account Name automatically."