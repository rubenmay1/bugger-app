# Patch bump: 1.2.5 -> 1.2.6 (or 1.2 -> 1.2.1 if there's no patch segment yet).
Set-Location "$PSScriptRoot\.."

$gradleContent = [System.IO.File]::ReadAllText((Resolve-Path "android\app\build.gradle"), [System.Text.UTF8Encoding]::new($true))
if ($gradleContent -notmatch 'versionName\s+"([^"]+)"') {
    Write-Host "Could not find versionName in android\app\build.gradle." -ForegroundColor Red
    exit 1
}
$oldName = $Matches[1]
$parts = $oldName -split '\.'
if ($parts.Count -lt 3) {
    $newName = "$oldName.1"
} else {
    $parts[-1] = [string]([int]$parts[-1] + 1)
    $newName = $parts -join '.'
}

& "$PSScriptRoot\publish-base.ps1" -NewVersionName $newName
exit $LASTEXITCODE
