# Minor bump: 1.2 -> 1.3 (or x -> x.1 if there's no minor segment).
Set-Location "$PSScriptRoot\.."

$gradleContent = [System.IO.File]::ReadAllText((Resolve-Path "android\app\build.gradle"), [System.Text.UTF8Encoding]::new($true))
if ($gradleContent -notmatch 'versionName\s+"([^"]+)"') {
    Write-Host "Could not find versionName in android\app\build.gradle." -ForegroundColor Red
    exit 1
}
$oldName = $Matches[1]
$parts = $oldName -split '\.'
if ($parts.Count -ge 2) {
    $newName = "$($parts[0]).$([int]$parts[1] + 1)"
} else {
    $newName = "$oldName.1"
}

& "$PSScriptRoot\publish-base.ps1" -NewVersionName $newName
exit $LASTEXITCODE
