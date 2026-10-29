param(
    [string]$Version = "",
    [switch]$SkipFrontend,
    [switch]$SkipRuntimeSmoke
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "缺少 .venv，请先运行 scripts\setup.ps1"
}

$forward = @()
if ($Version) {
    $forward += @("--version", $Version)
}
if ($SkipFrontend) {
    $forward += "--skip-frontend"
}
if ($SkipRuntimeSmoke) {
    $forward += "--skip-runtime-smoke"
}

& $python -u (Join-Path $PSScriptRoot "build_installer.py") @forward
exit $LASTEXITCODE
