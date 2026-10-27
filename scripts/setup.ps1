$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "需要 Python 3.13，请先安装并确保 py 可用"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "需要 Node.js，请先安装"
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    py -3.13 -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Push-Location frontend
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
    npm run build:local
} finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path data | Out-Null
Write-Host "初始化完成。运行 scripts\start.ps1 启动下一节。"
