[CmdletBinding()]
param(
  [string]$EnvFile = 'Gateway/.env.training',
  [string]$Range = '',
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$requests = Join-Path $repoRoot 'trajectory_gen\trajectories\syn-tasks\requests'
$output = Join-Path $repoRoot 'trajectory_gen\trajectories\syn-tasks\runs'

# Rematerialize the requests from the source packages on every generation, so the
# runner never reads a stale or absent request. -Range selects tasks by their
# 1-based sort ordinal, e.g. '1-100', '101-', '7', '1,3,5-9' or 'all'.
$sourceRelative = if ($env:SYN_TASK_SOURCE) { $env:SYN_TASK_SOURCE } else { 'trajectory_gen\syn_tasks\eduagentworld_taskset_v1_1868_20261002' }
$packageSource = Join-Path $repoRoot $sourceRelative
if (Test-Path $packageSource) {
  $prepareArgs = @((Join-Path $repoRoot 'trajectory_gen\scripts\prepare-syn-task-runs.ts'))
  if ($Range) { $prepareArgs += @('--range', $Range) }
  & bun @prepareArgs
  if ($LASTEXITCODE -ne 0) { throw 'Request materialization failed.' }
}

$tasks = @(& bun (Join-Path $repoRoot 'trajectory_gen\scripts\list-manifest-requests.ts'))
if ($LASTEXITCODE -ne 0 -or -not $tasks.Count) { throw 'Cannot resolve the task list from the manifest.' }
foreach ($task in $tasks) {
  if (-not (Test-Path $task)) {
    throw "Missing materialized request: $task. Generate it with: bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range $Range"
  }
}

& (Join-Path $PSScriptRoot 'run-backend-trajectory.ps1') `
  -EnvFile $EnvFile -Task $tasks -Output $output -Cleanup:$Cleanup
exit $LASTEXITCODE
