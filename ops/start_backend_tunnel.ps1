$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$backendOutLog = Join-Path $tmpDir "server-start.out.log"
$backendErrLog = Join-Path $tmpDir "server-start.err.log"
$tunnelLog = Join-Path $tmpDir "cloudflared-backend.log"
$tunnelOutLog = Join-Path $tmpDir "cloudflared-backend.out.log"
$tunnelErrLog = Join-Path $tmpDir "cloudflared-backend.err.log"
$backendPidFile = Join-Path $tmpDir "backend.pid"
$tunnelPidFile = Join-Path $tmpDir "tunnel.pid"
$tunnelUrlFile = Join-Path $tmpDir "tunnel-url.txt"
$clientEnvLocal = Join-Path $root "client/.env.local"

function Is-TryCloudflarePublicUrl {
  param([string]$Url)
  if (-not $Url) { return $false }
  try {
    $uri = [System.Uri]$Url
    $host = [string]$uri.Host
    if (-not $host) { return $false }
    $host = $host.ToLowerInvariant()
    if (-not $host.EndsWith(".trycloudflare.com")) { return $false }
    if ($host -eq "api.trycloudflare.com" -or $host -eq "trycloudflare.com") { return $false }
    return $true
  } catch {
    return $false
  }
}

function Test-TcpQuick {
  param(
    [Parameter(Mandatory = $true)][string]$RemoteHost,
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutMs = 1500
  )

  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $task = $client.ConnectAsync($RemoteHost, $Port)
    if (-not $task.Wait($TimeoutMs)) {
      return $false
    }
    return $client.Connected
  } catch {
    return $false
  } finally {
    if ($client) {
      $client.Dispose()
    }
  }
}

function Test-LocalHttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$Url
  )

  try {
    $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    if ($_.Exception.Response) {
      return $true
    }
    return $false
  }
}

function Get-ListeningPidsOnPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $pidSet = New-Object "System.Collections.Generic.HashSet[int]"

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
      $null = $pidSet.Add([int]$conn.OwningProcess)
    }
  } catch {}

  if ($pidSet.Count -eq 0) {
    $netstatLines = netstat -ano -p tcp | Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$" -ErrorAction SilentlyContinue
    foreach ($line in $netstatLines) {
      $m = [regex]::Match([string]$line, "LISTENING\s+(\d+)\s*$")
      if ($m.Success) {
        $null = $pidSet.Add([int]$m.Groups[1].Value)
      }
    }
  }

  return @($pidSet)
}

function Get-ProcessCommandLine {
  param(
    [Parameter(Mandatory = $true)][int]$Pid
  )

  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$Pid" -ErrorAction Stop
    return [string]$proc.CommandLine
  } catch {
    return $null
  }
}

function Get-LastLogLines {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Lines = 12
  )

  if (-not (Test-Path $Path)) {
    return ""
  }

  try {
    return (Get-Content -Path $Path -Tail $Lines -ErrorAction Stop | Out-String).Trim()
  } catch {
    return ""
  }
}

function Get-LatestTryCloudflareUrl {
  param(
    [Parameter(Mandatory = $true)][string[]]$Paths
  )

  $regex = [regex]"https://[A-Za-z0-9-]+\.trycloudflare\.com"

  foreach ($path in $Paths) {
    if (-not (Test-Path $path)) {
      continue
    }

    try {
      $lines = Get-Content -Path $path -Tail 400 -ErrorAction Stop
      if (-not $lines) {
        continue
      }

      for ($lineIdx = $lines.Count - 1; $lineIdx -ge 0; $lineIdx--) {
        $line = [string]$lines[$lineIdx]
        if (-not $line) {
          continue
        }
        $matches = $regex.Matches($line)
        if ($matches.Count -eq 0) {
          continue
        }
        for ($idx = $matches.Count - 1; $idx -ge 0; $idx--) {
          $candidate = [string]$matches[$idx].Value
          if (Is-TryCloudflarePublicUrl -Url $candidate) {
            return $candidate
          }
        }
      }
    } catch {}
  }

  return $null
}

& (Join-Path $PSScriptRoot "stop_backend_tunnel.ps1") | Out-Null

Remove-Item -Path $backendOutLog, $backendErrLog, $tunnelLog, $tunnelOutLog, $tunnelErrLog, $backendPidFile, $tunnelPidFile, $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$cloudflaredExe = $null
$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflaredCommand) {
  $cloudflaredExe = [string]$cloudflaredCommand.Source
}
if (-not $cloudflaredExe) {
  $localCloudflared = Join-Path $root "tools/cloudflared.exe"
  if (Test-Path $localCloudflared) {
    $cloudflaredExe = $localCloudflared
  }
}
if (-not $cloudflaredExe) {
  throw "No se encontro cloudflared. Instala cloudflared y agrega su ruta al PATH."
}

Write-Host "[START] Iniciando backend..."
$backendProc = Start-Process -FilePath "npm.cmd" -ArgumentList @("--prefix", "server", "run", "start:dev") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog -PassThru
Set-Content -Path $backendPidFile -Value $backendProc.Id -Encoding ascii

$backendPort = 4000
$backendReady = $false
$backendProbeUrl = "http://127.0.0.1:4000/api/v1"
for ($i = 0; $i -lt 70; $i++) {
  Start-Sleep -Seconds 1

  if (Test-LocalHttpReady -Url $backendProbeUrl) {
    $backendReady = $true
    break
  }

  if (-not (Get-Process -Id $backendProc.Id -ErrorAction SilentlyContinue)) {
    break
  }
}

if (-not $backendReady) {
  $backendErrPreview = Get-LastLogLines -Path $backendErrLog -Lines 20
  if ($backendErrPreview) {
    Write-Host "[ERROR] Ultimas lineas backend stderr:"
    Write-Host $backendErrPreview
  }

  $portPids = Get-ListeningPidsOnPort -Port $backendPort
  if ($portPids.Count -gt 0) {
    foreach ($pid in $portPids) {
      if ($pid -eq $backendProc.Id) {
        continue
      }
      $cmd = Get-ProcessCommandLine -Pid $pid
      Write-Host "[ERROR] Puerto 4000 ocupado por PID $pid."
      if ($cmd) {
        Write-Host "[ERROR] Comando PID ${pid}: $cmd"
      }
    }
  }

  throw "Backend no quedo listo en http://127.0.0.1:4000. Revisa logs: $backendOutLog | $backendErrLog"
}

Write-Host "[OK] Backend listo. PID: $($backendProc.Id)"

$localApiUrl = "http://127.0.0.1:4000/api/v1"
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
Remove-Item -Path $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$attemptProfiles = @(
  @(
    "tunnel",
    "--url", "http://127.0.0.1:4000",
    "--edge-ip-version", "4",
    "--protocol", "http2",
    "--no-autoupdate"
  ),
  @(
    "tunnel",
    "--url", "http://127.0.0.1:4000",
    "--edge-ip-version", "4",
    "--no-autoupdate"
  )
)

$tunnelUrl = $null
$lastErrPreview = ""
$maxSecondsPerAttempt = 75

for ($attempt = 1; $attempt -le $attemptProfiles.Count -and -not $tunnelUrl; $attempt++) {
  if ($attempt -gt 1) {
    Write-Host "[RETRY] Reintentando tunnel ($attempt/$($attemptProfiles.Count))..."
  }

  Remove-Item -Path $tunnelLog, $tunnelOutLog, $tunnelErrLog -Force -ErrorAction SilentlyContinue

  $tunnelArgs = $attemptProfiles[$attempt - 1]
  $tunnelProc = Start-Process -FilePath $cloudflaredExe -ArgumentList $tunnelArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -PassThru
  Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
  Write-Host "[START] Tunnel iniciado. PID: $($tunnelProc.Id)"

  for ($sec = 1; $sec -le $maxSecondsPerAttempt; $sec++) {
    Start-Sleep -Seconds 1

    $tunnelUrl = Get-LatestTryCloudflareUrl -Paths @($tunnelErrLog, $tunnelOutLog, $tunnelLog)
    if ($tunnelUrl) {
      break
    }

    if (($sec % 15) -eq 0) {
      Write-Host "[INFO] Esperando URL publica del tunnel..."
    }

    if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
      break
    }
  }

  if ($tunnelUrl) {
    break
  }

  $lastErrPreview = Get-LastLogLines -Path $tunnelErrLog -Lines 14

  $tunnelAlive = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
  if ($tunnelAlive) {
    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
}

if (-not $tunnelUrl) {
  Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii

  if ($lastErrPreview) {
    Write-Host "[ERROR] Ultimas lineas cloudflared stderr:"
    Write-Host $lastErrPreview
    $errLower = $lastErrPreview.ToLowerInvariant()
    if ($errLower.Contains("socket no permitido") -or $errLower.Contains("not permitted")) {
      Write-Host "[SUGERENCIA] Parece bloqueo de red/firewall/antivirus/VPN hacia api.trycloudflare.com:443."
    }
    if ($errLower.Contains("dial tcp [::1]:4000")) {
      Write-Host "[SUGERENCIA] Se detecto IPv6 (::1). Este script usa 127.0.0.1 para evitar ese problema."
    }
  }

  Write-Host "[ERROR] No se obtuvo URL publica del tunnel."
  Write-Host "[INFO] Prueba manual:"
  Write-Host "cloudflared tunnel --url http://127.0.0.1:4000 --edge-ip-version 4 --no-autoupdate"
  Write-Host "[INFO] El backend queda corriendo en http://127.0.0.1:4000"
  exit 1
}

$apiUrl = "$tunnelUrl/api/v1"
Set-Content -Path $tunnelUrlFile -Value @(
  "TUNNEL_URL=$tunnelUrl",
  "VITE_API_URL=$apiUrl"
) -Encoding ascii
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$apiUrl" -Encoding ascii

try {
  Set-Clipboard -Value $tunnelUrl -ErrorAction Stop
  Write-Host "[OK] URL copiada al portapapeles."
} catch {
  Write-Host "[INFO] No se pudo copiar URL al portapapeles desde PowerShell."
}

Write-Host "[OK] URL tunnel: $tunnelUrl"
Write-Host "[OK] API URL: $apiUrl"
Write-Host "[OK] Archivo actualizado: client/.env.local"
