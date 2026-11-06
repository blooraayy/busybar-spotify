$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$major = [int]((& $node --version).TrimStart('v').Split('.')[0])
if ($major -lt 24 -or $major -ge 26) { throw 'Instala Node.js 24 LTS para ejecutar este proyecto.' }
Push-Location $project
try {
    if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules/@busy-app/cli/dist/index.js')) -or
        -not (Test-Path -LiteralPath (Join-Path $project 'node_modules/typescript/bin/tsc'))) {
        Write-Host 'Preparando las dependencias del puente en este PC...'
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias. Comprueba la conexion a Internet.' }
    }
    & $node tools/patch-busy-cli.mjs
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el compilador.' }
    $port = if ($env:BUSYBAR_SPOTIFY_PORT) { [int]$env:BUSYBAR_SPOTIFY_PORT } else { 8765 }
    $url = "http://localhost:$port/settings"
    $running = $false
    try {
        $null = Invoke-RestMethod "http://localhost:$port/settings/job" -TimeoutSec 2
        $running = $true
    } catch {}
    if (-not $running) {
        # Do not terminate an older bridge or an unrelated process automatically.
        try {
            $null = Invoke-WebRequest "http://localhost:$port/now-playing" -UseBasicParsing -TimeoutSec 2
            throw 'OLD_BRIDGE'
        } catch {
            if ($_.Exception.Message -eq 'OLD_BRIDGE') { throw 'El puente ya esta abierto con una version anterior. Reinicialo y vuelve a abrir esta pagina.' }
        }
        $logs = Join-Path $project '.busybar-config'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        $server = Join-Path $PSScriptRoot 'server.mjs'
        Start-Process -FilePath $node -ArgumentList ('"{0}"' -f $server) -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'bridge-out.log') -RedirectStandardError (Join-Path $logs 'bridge-error.log') | Out-Null
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 500
            try { $null = Invoke-RestMethod "http://localhost:$port/settings/job" -TimeoutSec 1; $running = $true; break } catch {}
        }
        if (-not $running) { throw 'No se pudo iniciar el puente. Consulta .busybar-config/bridge-error.log.' }
    }
    Start-Process $url
} finally { Pop-Location }
