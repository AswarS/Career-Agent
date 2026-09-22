param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8791
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$server = Join-Path $repoRoot 'trajectory_gen\viewer\server.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found in PATH.'
}

Write-Host "Starting Plan Trace Inspector at http://127.0.0.1:$Port"
Write-Host 'Press Ctrl+C to stop.'
& node $server --port $Port
exit $LASTEXITCODE
