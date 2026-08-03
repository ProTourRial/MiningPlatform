param(
  [ValidateSet('plan', 'cleanup', 'organize', 'all')]
  [string]$Command = 'plan',
  [string]$Root = '.',
  [switch]$Apply,
  [switch]$AllowDirty,
  [switch]$Validate,
  [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
$ScriptPath = Join-Path $PSScriptRoot 'miningplatform-structure-maintenance.mjs'
if (-not (Test-Path $ScriptPath)) {
  throw "Maintenance script not found: $ScriptPath"
}

$Arguments = @($ScriptPath, $Command, '--root', $Root)
if ($Apply) { $Arguments += '--apply' }
if ($AllowDirty) { $Arguments += '--allow-dirty' }
if ($Validate) { $Arguments += '--validate' }
if ($NoBackup) { $Arguments += '--no-backup' }

& node @Arguments
if ($LASTEXITCODE -ne 0) {
  throw "MiningPlatform maintenance failed with exit code $LASTEXITCODE"
}
