# Shared publish pipeline. Called by publish-apk-{patch,minor,major}.ps1.
# Those scripts decide the new versionName; everything else lives here:
# tests -> bump versionCode -> write versionName -> sync-version -> build -> cap sync
# -> open Android Studio.

param(
    [Parameter(Mandatory = $true)]
    [string]$NewVersionName
)

Set-Location "$PSScriptRoot\.."

Write-Host "Running unit tests before publish..." -ForegroundColor Cyan
& "$PSScriptRoot\test.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed - aborting publish." -ForegroundColor Red
    exit $LASTEXITCODE
}

$gradlePath = "android\app\build.gradle"
$gradleContent = [System.IO.File]::ReadAllText((Resolve-Path $gradlePath), [System.Text.UTF8Encoding]::new($true))
$gradleContent = $gradleContent.TrimStart([char]0xFEFF)

if ($gradleContent -notmatch 'versionCode\s+(\d+)') {
    Write-Host "Could not find versionCode in $gradlePath." -ForegroundColor Red
    exit 1
}
$oldCode = [int]$Matches[1]
$newCode = $oldCode + 1
$gradleContent = $gradleContent -replace "versionCode\s+$oldCode", "versionCode $newCode"

if ($gradleContent -notmatch 'versionName\s+"([^"]+)"') {
    Write-Host "Could not find versionName in $gradlePath." -ForegroundColor Red
    exit 1
}
$oldName = $Matches[1]
$gradleContent = $gradleContent -replace "versionName\s+`"$([regex]::Escape($oldName))`"", "versionName `"$NewVersionName`""

[System.IO.File]::WriteAllText((Resolve-Path $gradlePath), $gradleContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "Version bumped: $oldName -> $NewVersionName (code $oldCode -> $newCode)" -ForegroundColor Green

& "$PSScriptRoot\sync-version.ps1"

Write-Host "Bundling background runner..." -ForegroundColor Cyan
npm run build:verify
if ($LASTEXITCODE -ne 0) {
    Write-Host "Runner bundle failed." -ForegroundColor Red
    exit 1
}

Write-Host "Building and syncing for release..." -ForegroundColor Cyan
ionic build --prod
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "Sync failed." -ForegroundColor Red
    exit 1
}

Write-Host "Opening Android Studio for APK packaging..." -ForegroundColor Cyan
npx cap open android

Write-Host "In Android Studio: Build > Generate Signed Bundle/APK" -ForegroundColor Yellow
