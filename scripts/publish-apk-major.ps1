# Major bump: 1.9.3 -> 2.0.0 (increment first segment, zero the rest).
Set-Location "$PSScriptRoot\.."

$gradleContent = [System.IO.File]::ReadAllText((Resolve-Path "android\app\build.gradle"), [System.Text.UTF8Encoding]::new($true))
if ($gradleContent -notmatch 'versionName\s+"([^"]+)"') {
    Write-Host "Could not find versionName in android\app\build.gradle." -ForegroundColor Red
    exit 1
}
$oldName = $Matches[1]
$parts = $oldName -split '\.'
$parts[0] = [string]([int]$parts[0] + 1)
for ($i = 1; $i -lt $parts.Count; $i++) { $parts[$i] = "0" }
$newName = $parts -join '.'

& "$PSScriptRoot\publish-base.ps1" -NewVersionName $newName
exit $LASTEXITCODE
