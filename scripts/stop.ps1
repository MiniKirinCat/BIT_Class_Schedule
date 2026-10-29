$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "paths.ps1")
$runtime = Join-Path (Get-NextClassDataDir -Root $root) "runtime.json"

if (-not (Test-Path $runtime)) {
    Write-Host "下一节未运行。"
    exit 0
}

$data = Get-Content $runtime -Raw | ConvertFrom-Json
$proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($data.pid)" -ErrorAction SilentlyContinue

if ($proc) {
    if ($proc.CommandLine -match "run_server\.py|uvicorn") {
        Stop-Process -Id $data.pid -Force
        Write-Host "已停止下一节。"
    } else {
        Write-Warning "PID $($data.pid) 不是下一节进程，未结束。"
    }
} else {
    Write-Host "进程已退出。"
}

Remove-Item $runtime -ErrorAction SilentlyContinue
