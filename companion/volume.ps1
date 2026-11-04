param([ValidateRange(-10, 10)][int]$Steps = 0, [ValidateRange(1, 100)][int]$StepPercent = 5, [switch]$Worker)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'volume.cs')
if (-not $Worker) {
    $level = [BusyBarVolume]::Adjust($Steps, $StepPercent)
    @{ ok = $true; volume = $level } | ConvertTo-Json -Compress
    exit
}
[Console]::WriteLine('{"ready":true}')
# ReadLine blocks while idle; the adapter is compiled only once per bridge run.
while ($null -ne ($line = [Console]::ReadLine())) {
    $requestId = 0
    try {
        if ($line.Length -gt 256) { throw 'Volume request too large' }
        $request = $line | ConvertFrom-Json
        $requestId = [int]$request.id
        $level = [BusyBarVolume]::Adjust([int]$request.steps, [int]$request.stepPercent)
        $result = @{ id = $requestId; ok = $true; volume = $level }
    } catch {
        $result = @{ id = $requestId; ok = $false }
    }
    [Console]::WriteLine(($result | ConvertTo-Json -Compress))
}
