param([switch]$Once, [switch]$ListSessions)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-WinRT($Operation, $ResultType) {
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(10000)) { throw 'Windows media request timed out' }
    return $task.Result
}
$manager = Wait-WinRT ($managerType::RequestAsync()) $managerType
if ($ListSessions) {
    [Console]::WriteLine('Session count: ' + $manager.GetSessions().Count)
    foreach ($entry in $manager.GetSessions()) { [Console]::WriteLine($entry.SourceAppUserModelId) }
    Get-Process Spotify -ErrorAction SilentlyContinue | Select-Object -First 1 ProcessName, SessionId | Format-List
    exit
}
do {
    try {
        $sessions = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'Spotify' })
        $session = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' } | Select-Object -First 1
        if (-not $session) { $session = $sessions | Select-Object -First 1 }
        if ($session) {
            $media = Wait-WinRT ($session.TryGetMediaPropertiesAsync()) $propertiesType
            $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
            $state = if ($status -eq 'Playing') { 'playing' } elseif ($status -eq 'Paused') { 'paused' } else { 'idle' }
            $result = @{ state = $state; title = ([string]$media.Title); artist = ([string]$media.Artist) }
        } else { $result = @{ state = 'idle'; title = ''; artist = '' } }
    } catch {
        [Console]::Error.WriteLine('busybar-spotify: Windows media read failed: ' + $_.Exception.Message)
        $result = @{ state = 'error'; title = ''; artist = '' }
    }
    $result | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
    if (-not $Once) { Start-Sleep -Seconds 5 }
} while (-not $Once)
