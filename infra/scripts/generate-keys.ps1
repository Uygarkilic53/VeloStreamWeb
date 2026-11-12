param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "generate-keys.mjs"

if ($Force) {
  & node $scriptPath --force
} else {
  & node $scriptPath
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
