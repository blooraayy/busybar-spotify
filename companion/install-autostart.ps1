param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'BUSY Bar Spotify Bridge'
$description = 'Starts the local BUSY Bar Spotify companion at user logon.'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) {
    throw 'A different task already uses this name; it has not been changed.'
}
if ($Remove) {
    if ($existing) {
        Stop-ScheduledTask -TaskName $taskName
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Write-Output 'Spotify bridge autostart removed.'
    exit
}

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$serverPath = Join-Path $PSScriptRoot 'server.mjs'
$runnerPath = Join-Path $PSScriptRoot 'run-hidden.vbs'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '//B //Nologo "{0}" "{1}" "{2}"' -f $runnerPath, $nodePath, $serverPath
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
# WinRT media metadata belongs to the interactive user session, not SYSTEM.
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Description $description -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Autostart installed for $userId. Task: $taskName"
Write-Output 'Starts hidden at the next logon. Use Start-ScheduledTask to start it now.'
