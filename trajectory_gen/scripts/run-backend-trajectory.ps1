[CmdletBinding()]
param(
  [string]$EnvFile = 'Gateway/.env.training',
  [string[]]$Task,
  [string]$Output,
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot 'CrescoAI-Backend\backend'
$runner = Join-Path $PSScriptRoot 'run-backend-trajectory.ts'

function Resolve-RepoPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
  return [IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string]$Path)
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { throw "Invalid .env line in $Path" }
    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Test-BackendReady {
  try {
    $headers = @{ Authorization = "Bearer $env:GATEWAY_HARNESS_TOKEN" }
    $result = Invoke-RestMethod -Uri "$($env:GATEWAY_HARNESS_URL.TrimEnd('/'))/runs/readiness" -Headers $headers -TimeoutSec 3
    return $result.implementation -eq 'career-agent-nestjs' -and $result.databaseReachable -eq $true
  } catch { return $false }
}

$envPath = Resolve-RepoPath -Path $EnvFile
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "Training environment file not found: $envPath" }
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Trajectory runner not found: $runner" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24+ was not found in PATH.' }
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { throw 'Bun was not found in PATH.' }

Import-DotEnv -Path $envPath
if (-not $env:GATEWAY_HARNESS_URL -or -not $env:GATEWAY_HARNESS_TOKEN) {
  throw 'GATEWAY_HARNESS_URL and GATEWAY_HARNESS_TOKEN are required in the training environment file.'
}

$backend = $null
try {
  if (-not (Test-BackendReady)) {
    Write-Host '[Backend] Starting training backend without the frontend...'
    $backend = Start-Process -FilePath 'bun' `
      -ArgumentList @("--env-file=$envPath", 'run', 'network:start') `
      -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline -and -not (Test-BackendReady)) {
      if ($backend.HasExited) { throw 'Backend exited during startup. Install dependencies and run network:migrate first.' }
      Start-Sleep -Milliseconds 500
    }
    if (-not (Test-BackendReady)) { throw 'Backend readiness timed out after 60 seconds.' }
    Write-Host "[Backend] Ready (PID=$($backend.Id))."
  } else {
    Write-Host '[Backend] Reusing the running training backend.'
  }

  $taskPaths = if ($Task) { @($Task | ForEach-Object { Resolve-RepoPath -Path $_ }) } else { @($null) }
  $outputRoot = if ($Output) { Resolve-RepoPath -Path $Output } else { $null }
  $exitCode = 0
  $rejected = 0
  foreach ($taskPath in $taskPaths) {
    $arguments = @("--env-file=$envPath", $runner)
    if ($taskPath) { $arguments += @('--task', $taskPath) }
    if ($outputRoot) {
      $leaf = if ($taskPath) { [IO.Path]::GetFileNameWithoutExtension($taskPath) } else { 'default' }
      $arguments += @('--output', (Join-Path $outputRoot $leaf))
    }
    if ($Cleanup) { $arguments += '--cleanup' }
    & node @arguments
    if ($LASTEXITCODE -ne 0) {
      $exitCode = 1
      $rejected++
      Write-Warning "Trajectory rejected for $taskPath; continuing with the remaining batch."
    }
  }
  Write-Host "Batch complete: $($taskPaths.Count) processed, $rejected rejected."
} finally {
  if ($backend -and -not $backend.HasExited) {
    Write-Host "[Backend] Stopping PID=$($backend.Id)."
    Stop-Process -Id $backend.Id
    $backend.WaitForExit(5000) | Out-Null
  }
}
exit $exitCode
