param([ValidateRange(-10, 10)][int]$Steps = 0)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'volume.cs')
$level = [BusyBarVolume]::Adjust($Steps)
@{ ok = $true; volume = $level } | ConvertTo-Json -Compress
