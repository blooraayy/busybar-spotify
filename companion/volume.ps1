param([ValidateRange(-10, 10)][int]$Steps = 0, [ValidateRange(1, 100)][int]$StepPercent = 5)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'volume.cs')
$level = [BusyBarVolume]::Adjust($Steps, $StepPercent)
@{ ok = $true; volume = $level } | ConvertTo-Json -Compress
