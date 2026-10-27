param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "请先运行 scripts\setup.ps1"
}

& .\.venv\Scripts\python.exe scripts\run_server.py @Arguments
