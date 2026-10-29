param(
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
    $Root = Split-Path -Parent $PSScriptRoot
}
$Root = [System.IO.Path]::GetFullPath($Root)
. (Join-Path $PSScriptRoot "paths.ps1")
$runtimeFile = Join-Path (Get-NextClassDataDir -Root $Root) "runtime.json"

function Get-NextClassProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.IndexOf($Root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            ($_.CommandLine -match 'scripts[\\/]+tray\.py|scripts[\\/]+run_server\.py')
        }
}

$processes = @(Get-NextClassProcesses)
foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

for ($attempt = 0; $attempt -lt 25; $attempt++) {
    if (@(Get-NextClassProcesses).Count -eq 0) {
        break
    }
    Start-Sleep -Milliseconds 200
}

Remove-Item $runtimeFile -ErrorAction SilentlyContinue

if ($processes.Count -gt 0) {
    Write-Host "已停止下一节（$($processes.Count) 个进程）。"
} else {
    Write-Host "下一节未运行。"
}
