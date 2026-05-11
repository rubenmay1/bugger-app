Set-Location "$PSScriptRoot\.."

$gradlePath = "android\app\build.gradle"
$gradleContent = [System.IO.File]::ReadAllText((Resolve-Path $gradlePath), [System.Text.UTF8Encoding]::new($false))

if (-not ($gradleContent -match 'versionName\s+"([^"]+)"')) {
    Write-Host "Could not find versionName in build.gradle" -ForegroundColor Red
    exit 1
}

$version = $Matches[1]

foreach ($envPath in @("src\environments\environment.ts", "src\environments\environment.prod.ts")) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $envPath), [System.Text.UTF8Encoding]::new($false))
    $content = $content -replace "version:\s*'[^']*'", "version: '$version'"
    [System.IO.File]::WriteAllText((Resolve-Path $envPath), $content, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "Version synced to environment files: $version" -ForegroundColor Green
