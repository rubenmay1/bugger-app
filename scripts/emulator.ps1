Set-Location "$PSScriptRoot\.."

Write-Host "Building and syncing..." -ForegroundColor Cyan
ionic build --prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

npx cap sync android

Write-Host "Launching on emulator..." -ForegroundColor Cyan
npx cap run android

Write-Host "Done." -ForegroundColor Green
