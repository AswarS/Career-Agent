[CmdletBinding()]
param(
  [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $projectRoot 'start_windows.ps1'

if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
  throw "Base launcher does not exist: $launcher"
}

# This entry point always starts the backend with Conversation Memory disabled.
# Child service windows inherit this environment variable.
$env:CAREER_AGENT_CONVERSATION_MEMORY_ENABLED = 'false'
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'

Write-Host '[Conversation Memory] disabled for this startup.' -ForegroundColor Yellow

if ($InstallDependencies) {
  & $launcher -InstallDependencies
} else {
  & $launcher
}

exit $LASTEXITCODE
