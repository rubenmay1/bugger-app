# Runs the unit tests once (no watch) and keeps the window open if anything fails.
#
# Karma's ChromeHeadless launcher needs a Chromium binary. This machine doesn't
# have Chrome installed, so we point CHROME_BIN at the Edge executable — same
# rendering engine, same headless protocol.

$ErrorActionPreference = 'Stop'

$candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)

$browser = $null
foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
        $browser = $candidate
        break
    }
}

if (-not $browser) {
    Write-Host 'No Chrome or Edge binary found in standard locations.' -ForegroundColor Red
    Write-Host 'Install Chrome or set $env:CHROME_BIN manually before running this script.'
    Read-Host 'Press Enter to close'
    exit 1
}

$env:CHROME_BIN = $browser
Write-Host "Using browser: $browser" -ForegroundColor DarkGray
Write-Host ''

# Run from this script's directory so it works whether invoked from repo root
# or from anywhere else.
Push-Location (Split-Path -Parent $PSCommandPath)
try {
    Set-Location ..
    & npx ng test --browsers=ChromeHeadless --watch=false
    $exit = $LASTEXITCODE
} finally {
    Pop-Location
}

Write-Host ''
if ($exit -ne 0) {
    Write-Host "Tests FAILED (exit code $exit)." -ForegroundColor Red
    Read-Host 'Press Enter to close this window'
    exit $exit
}

Write-Host 'All tests passed.' -ForegroundColor Green
exit 0
