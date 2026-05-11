Set-Location "$PSScriptRoot\.."

# Pin the port so the origin (and therefore localStorage / CapacitorPreferences
# data) stays the same across restarts.
ionic serve --port 8101
