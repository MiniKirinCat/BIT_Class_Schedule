function Get-NextClassDataDir {
    param([Parameter(Mandatory = $true)][string]$Root)

    if ($env:NEXT_CLASS_DATA_DIR) {
        return $env:NEXT_CLASS_DATA_DIR
    }
    if ((Test-Path (Join-Path $Root "runtime\python.exe")) -and $env:LOCALAPPDATA) {
        return (Join-Path $env:LOCALAPPDATA "NextClass\data")
    }
    return (Join-Path $Root "data")
}
