param([switch]$Once, [switch]$ListSessions, [switch]$TogglePlayPause, [switch]$SkipNext)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
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
# The native adapter projects WinRT streams into .NET's image decoder.
if (-not ($TogglePlayPause -or $SkipNext)) {
    Add-Type -Path (Join-Path $PSScriptRoot 'thumbnail.cs') -ReferencedAssemblies System.Drawing
}
function Read-Cover($Thumbnail) {
    if (-not $Thumbnail) { return '' }
    $random = $null
    try {
        $streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
        $random = Wait-WinRT ($Thumbnail.OpenReadAsync()) $streamType
        return [BusyBarThumbnail]::Read($random)
    } finally {
        if ($null -ne $random -and [System.Runtime.InteropServices.Marshal]::IsComObject($random)) {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($random)
        }
    }
}
$manager = Wait-WinRT ($managerType::RequestAsync()) $managerType
if ($ListSessions) {
    [Console]::WriteLine('Session count: ' + $manager.GetSessions().Count)
    foreach ($entry in $manager.GetSessions()) { [Console]::WriteLine($entry.SourceAppUserModelId) }
    Get-Process Spotify -ErrorAction SilentlyContinue | Select-Object -First 1 ProcessName, SessionId | Format-List
    exit
}
$coverKey = ''; $cover = ''
$events = $null
if (-not ($Once -or $TogglePlayPause -or $SkipNext)) {
    Add-Type -Path (Join-Path $PSScriptRoot 'media-events.cs')
    $events = [BusyBarMediaEvents]::new()
}
try {
do {
    try {
        if ($events) {
            $events.Clear()
            $events.Watch($manager, $managerType, 'SessionsChanged')
            $events.Watch($manager, $managerType, 'CurrentSessionChanged')
        }
        $sessions = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'Spotify' })
        $session = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' } | Select-Object -First 1
        if (-not $session) { $session = $sessions | Select-Object -First 1 }
        if ($SkipNext) {
            if (-not $session) { throw 'No Spotify media session' }
            $accepted = Wait-WinRT ($session.TrySkipNextAsync()) ([bool])
            if (-not $accepted) { throw 'Spotify rejected next track' }
            @{ ok = $true; state = $session.GetPlaybackInfo().PlaybackStatus.ToString().ToLowerInvariant() } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
            exit
        }
        if ($TogglePlayPause) {
            if (-not $session) { throw 'No Spotify media session' }
            $expected = if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { 'Paused' } else { 'Playing' }
            $accepted = Wait-WinRT ($session.TryTogglePlayPauseAsync()) ([bool])
            if (-not $accepted) { throw 'Spotify rejected playback control' }
            # Acceptance precedes the state change; wait briefly without reissuing it.
            for ($attempt = 0; $attempt -lt 20; $attempt++) {
                if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq $expected) { break }
                Start-Sleep -Milliseconds 100
            }
            @{ ok = $true; state = $session.GetPlaybackInfo().PlaybackStatus.ToString().ToLowerInvariant() } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
            exit
        }
        if ($session) {
            if ($events) {
                $sessionType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType = WindowsRuntime]
                $events.Watch($session, $sessionType, 'MediaPropertiesChanged')
                $events.Watch($session, $sessionType, 'PlaybackInfoChanged')
            }
            $media = Wait-WinRT ($session.TryGetMediaPropertiesAsync()) $propertiesType
            $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
            $state = if ($status -eq 'Playing') { 'playing' } elseif ($status -eq 'Paused') { 'paused' } else { 'idle' }
            $key = "$($media.Title)`n$($media.Artist)`n$($media.AlbumTitle)"
            if ($key -ne $coverKey -or -not $cover) {
                if ($key -ne $coverKey -and -not $Once) {
                    # Publish text immediately; thumbnail I/O must not hold it up.
                    @{ state = $state; title = ([string]$media.Title); artist = ([string]$media.Artist); cover_rgb = '' } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
                }
                $cover = ''
                try { $cover = Read-Cover $media.Thumbnail } catch {
                    [Console]::Error.WriteLine('busybar-spotify: cover unavailable: ' + $_.Exception.Message)
                }
                $coverKey = $key
            }
            $result = @{ state = $state; title = ([string]$media.Title); artist = ([string]$media.Artist); cover_rgb = $cover }
        } else { $coverKey = ''; $cover = ''; $result = @{ state = 'idle'; title = ''; artist = '' } }
    } catch {
        [Console]::Error.WriteLine('busybar-spotify: Windows media read failed: ' + $_.Exception.Message)
        $result = @{ state = 'error'; title = ''; artist = '' }
    }
    $result | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
    # Events wake this immediately; the coarse timeout is a health/recovery check.
    if ($events) { [void]$events.Wait(15000) }
} while (-not $Once)
} finally { if ($events) { $events.Dispose() } }
