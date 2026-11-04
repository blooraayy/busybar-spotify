$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'BUSY Bar Spotify Bridge' -ErrorAction SilentlyContinue
if ($task -and $task.Description -eq 'Starts the local BUSY Bar Spotify companion at user logon.') {
    Stop-ScheduledTask -TaskName $task.TaskName
}
# Stopping the scheduler's WScript wrapper can leave its Node child alive.
# Match this checkout's exact server path before terminating its process tree.
$server = [regex]::Escape((Join-Path $PSScriptRoot 'server.mjs'))
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -match ('(?:^|\s)"?' + $server + '"?\s*$')
} | ForEach-Object {
    & taskkill.exe /PID $_.ProcessId /T /F | Out-Null
}
