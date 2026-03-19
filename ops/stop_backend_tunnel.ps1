$ErrorActionPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$stopped = New-Object "System.Collections.Generic.HashSet[int]"

function Stop-FromPidFile {
  param(
    [Parameter(Mandatory = $true)][string]$PidFile,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not (Test-Path $PidFile)) {
    return
  }

  $rawPid = (Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $pid = 0
  if ([int]::TryParse([string]$rawPid, [ref]$pid) -and $pid -gt 0) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
      # Use taskkill /T so child processes (npm/node) also stop.
      & taskkill /PID $pid /T /F | Out-Null
      if ($stopped.Add($pid)) {
        Write-Host "[STOP] $Label PID $pid detenido."
      }
    }
  }

  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

function Get-ListeningPidsOnPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $pidSet = New-Object "System.Collections.Generic.HashSet[int]"
  $netstatLines = netstat -ano -p tcp | Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$" -ErrorAction SilentlyContinue
  foreach ($line in $netstatLines) {
    $m = [regex]::Match([string]$line, "LISTENING\s+(\d+)\s*$")
    if ($m.Success) {
      $null = $pidSet.Add([int]$m.Groups[1].Value)
    }
  }
  return @($pidSet)
}

$backendPidFile = Join-Path $tmpDir "backend.pid"
$tunnelPidFile = Join-Path $tmpDir "tunnel.pid"

Stop-FromPidFile -PidFile $backendPidFile -Label "Backend"
Stop-FromPidFile -PidFile $tunnelPidFile -Label "Tunnel"

$patterns = @(
  "cloudflared tunnel --url http://localhost:4000",
  "cloudflared tunnel --url http://127.0.0.1:4000",
  "cloudflared tunnel run --token",
  "ngrok http 127.0.0.1:4000",
  "ngrok http localhost:4000",
  "npm --prefix server run start:dev",
  "nest start --watch"
)

$matchedProcesses = Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) {
    return $false
  }
  foreach ($pattern in $patterns) {
    if ($cmd -like "*$pattern*") {
      return $true
    }
  }
  return $false
}

foreach ($proc in $matchedProcesses) {
  $pid = [int]$proc.ProcessId
  if ($stopped.Contains($pid)) {
    continue
  }
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  $stopped.Add($pid) | Out-Null
  Write-Host "[STOP] Proceso relacionado PID $pid detenido."
}

$backendPortPids = Get-ListeningPidsOnPort -Port 4000
foreach ($pid in $backendPortPids) {
  if ($stopped.Contains($pid)) {
    continue
  }
  & taskkill /PID $pid /T /F | Out-Null
  $stopped.Add($pid) | Out-Null
  Write-Host "[STOP] Proceso en puerto 4000 (PID $pid) detenido."
}

Remove-Item -Path (Join-Path $tmpDir "tunnel-url.txt") -Force -ErrorAction SilentlyContinue

Write-Host "[OK] Backend y tunnel detenidos."
