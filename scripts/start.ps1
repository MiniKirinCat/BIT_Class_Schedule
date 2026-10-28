param(
    [switch]$Foreground,
    [switch]$NoOpen,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
$pythonw = Join-Path $root ".venv\Scripts\pythonw.exe"
if (-not (Test-Path $python)) {
    throw "请先运行 scripts\setup.ps1"
}

$remaining = @($Arguments | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($Foreground -or $remaining.Count -gt 0) {
    & $python (Join-Path $root "scripts\run_server.py") @remaining
    exit $LASTEXITCODE
}

if (-not (Test-Path $pythonw)) {
    throw "请先运行 scripts\setup.ps1"
}
& $python -c "import pystray, PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "托盘依赖缺失，请重新运行 scripts\setup.ps1"
}

$trayScript = Join-Path $root "scripts\tray.py"
if (-not (Test-Path $trayScript)) {
    throw "找不到 scripts\tray.py"
}

$trayArguments = '"' + $trayScript + '"'
if (-not $NoOpen) {
    $trayArguments += " --open"
}
$tray = Start-Process -FilePath $pythonw `
    -ArgumentList $trayArguments `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

Write-Host "下一节托盘已启动（PID $($tray.Id)），可以关闭这个窗口。"
