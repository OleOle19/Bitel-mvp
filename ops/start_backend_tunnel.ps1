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
    $host = String($uri.Host).ToLowerInvariant()
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
    [int]$TimeoutMs = 2500
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

function Get-LatestTryCloudflareUrl {
  param(
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][regex]$UrlRegex
  )

  if (-not (Test-Path $LogPath)) {
    return $null
  }

  try {
    $lines = Get-Content -Path $LogPath -Tail 300 -ErrorAction Stop
    if (-not $lines) {
      return $null
    }

    for ($lineIdx = $lines.Count - 1; $lineIdx -ge 0; $lineIdx--) {
      $line = [string]$lines[$lineIdx]
      if (-not $line) {
        continue
      }
      $matches = $UrlRegex.Matches($line)
      if ($matches.Count -eq 0) {
        continue
      }
      for ($idx = $matches.Count - 1; $idx -ge 0; $idx--) {
        $candidate = $matches[$idx].Value
        if (Is-TryCloudflarePublicUrl -Url $candidate) {
          return $candidate
        }
      }
    }
    return $null
  } catch {
    return $null
  }
}

& (Join-Path $PSScriptRoot "stop_backend_tunnel.ps1") | Out-Null

Remove-Item -Path $backendOutLog, $backendErrLog, $tunnelLog, $tunnelOutLog, $tunnelErrLog, $tunnelUrlFile -Force -ErrorAction SilentlyContinue

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "No se encontro cloudflared en PATH. Instala cloudflared o agrega su ruta al PATH."
}
$cloudflaredExe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source

$cloudflaredExeForRule = $cloudflaredExe
try {
  $cfItem = Get-Item -Path $cloudflaredExe -ErrorAction SilentlyContinue
  if ($cfItem -and $cfItem.LinkType -and $cfItem.Target) {
    $targetPath = $cfItem.Target | Select-Object -First 1
    if ($targetPath) {
      $cloudflaredExeForRule = [string]$targetPath
    }
  }
} catch {}
Write-Host "[CHECK] Verificando conectividad a api.trycloudflare.com:443 ..."
$canReachTunnelApi = Test-TcpQuick -RemoteHost "api.trycloudflare.com" -Port 443 -TimeoutMs 2500
if (-not $canReachTunnelApi) {
  Write-Host "[WARN] No se pudo confirmar salida TCP a api.trycloudflare.com:443."
  Write-Host "[WARN] Se continuara de todas formas para intentar crear el tunnel."
  Write-Host "[SUGERENCIA] Si falla, revisa firewall/antivirus/VPN/proxy."
  if ($cloudflaredExeForRule) {
    Write-Host "[SUGERENCIA] Regla sugerida (PowerShell como administrador):"
    Write-Host "New-NetFirewallRule -DisplayName 'Allow cloudflared outbound 443' -Direction Outbound -Action Allow -Program '$cloudflaredExeForRule' -Protocol TCP -RemotePort 443"
  }
}

$backendProc = Start-Process -FilePath "npm.cmd" -ArgumentList @("--prefix", "server", "run", "start:dev") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog -PassThru

$backendPort = 4000
$backendReady = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-TcpQuick -RemoteHost "127.0.0.1" -Port $backendPort -TimeoutMs 250) {
    $backendReady = $true
    break
  }
  if (-not (Get-Process -Id $backendProc.Id -ErrorAction SilentlyContinue)) {
    break
  }
}

$backendRuntimePid = $backendProc.Id
if (-not $backendReady) {
  $portPids = Get-ListeningPidsOnPort -Port $backendPort
  if ($portPids.Count -gt 0) {
    $backendRuntimePid = [int]$portPids[0]
    $backendReady = $true
    Write-Host "[INFO] Puerto 4000 ya en uso. Se reutilizara backend existente (PID $backendRuntimePid)."
  }
}

if (-not $backendReady) {
  $backendErrPreview = ""
  if (Test-Path $backendErrLog) {
    $backendErrPreview = (Get-Content -Path $backendErrLog -Tail 12 -ErrorAction SilentlyContinue | Out-String).Trim()
  }
  if ($backendErrPreview) {
    Write-Host "[ERROR] Detalle backend:"
    Write-Host $backendErrPreview
  }
  throw "Backend no quedo listo en puerto 4000. Revisa logs: $backendOutLog | $backendErrLog"
}

Set-Content -Path $backendPidFile -Value $backendRuntimePid -Encoding ascii
Write-Host "[START] Backend iniciado. PID: $backendRuntimePid"

$localApiUrl = "http://localhost:4000/api/v1"
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
Remove-Item -Path $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$regex = [regex]"https://[A-Za-z0-9-]+\.trycloudflare\.com"
$timeoutSeconds = 35
$maxAttempts = 8
$tunnelUrl = $null
$tunnelEndedEarly = $false
$tunnelActiveWithoutUrl = $false
$lastErrPreview = ""

for ($attempt = 1; $attempt -le $maxAttempts -and -not $tunnelUrl; $attempt++) {
  if ($attempt -gt 1) {
    Write-Host "[RETRY] Reintentando tunnel ($attempt/$maxAttempts)..."
  }

  Remove-Item -Path $tunnelLog, $tunnelOutLog, $tunnelErrLog -Force -ErrorAction SilentlyContinue

  $tunnelArgs = @(
    "tunnel",
    "--url", "http://127.0.0.1:4000",
    "--edge-ip-version", "4",
    "--no-autoupdate"
  )
  $tunnelProc = Start-Process -FilePath "cloudflared" -ArgumentList $tunnelArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -PassThru
  Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
  Write-Host "[START] Tunnel iniciado. PID: $($tunnelProc.Id)"

  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  $tunnelEndedEarly = $false
  $tunnelUrlSources = @($tunnelErrLog, $tunnelOutLog, $tunnelLog)
  $iteration = 0

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $iteration++

    $logFiles = $tunnelUrlSources | Where-Object { Test-Path $_ }
    if ($logFiles.Count -gt 0) {
      if (-not $tunnelUrl) {
        $matches = Select-String -Path $logFiles -Pattern $regex.ToString() -AllMatches -ErrorAction SilentlyContinue
        if ($matches) {
          for ($mIdx = $matches.Count - 1; $mIdx -ge 0; $mIdx--) {
            $matchItem = $matches[$mIdx]
            if ($matchItem.Matches -and $matchItem.Matches.Count -gt 0) {
              for ($vIdx = $matchItem.Matches.Count - 1; $vIdx -ge 0; $vIdx--) {
                $candidate = $matchItem.Matches[$vIdx].Value
                if (Is-TryCloudflarePublicUrl -Url $candidate) {
                  $tunnelUrl = $candidate
                  break
                }
              }
            }
            if ($tunnelUrl) {
              break
            }
          }
        }
      }
    }

    if ($tunnelUrl) {
      break
    }

    if (($iteration % 20) -eq 0) {
      if (-not $tunnelUrl) {
        Write-Host "[INFO] Esperando URL publica del tunnel..."
      }
    }

    $tunnelStillRunning = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
    if (-not $tunnelStillRunning) {
      Write-Warning "El proceso cloudflared termino antes de publicar URL."
      $tunnelEndedEarly = $true
      break
    }
  }

  if ($tunnelUrl) {
    break
  }

  $attemptTunnelAlive = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
  if ($attemptTunnelAlive) {
    $tunnelActiveWithoutUrl = $true
    break
  }

  if (Test-Path $tunnelErrLog) {
    $lastErrPreview = (Get-Content -Path $tunnelErrLog -Tail 8 -ErrorAction SilentlyContinue | Out-String).Trim()
  }

  if ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 2
  }
}

if (-not $tunnelUrl) {
  if (-not $tunnelEndedEarly) {
    Write-Warning "No se pudo leer la URL publica del tunnel en $timeoutSeconds segundos por intento."
  }
  if ($tunnelActiveWithoutUrl) {
    Set-Content -Path $tunnelUrlFile -Value @(
      "TUNNEL_URL=PENDING",
      "VITE_API_URL=$localApiUrl"
    ) -Encoding ascii
    Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
    Write-Host "[INFO] El proceso tunnel sigue activo, pero aun no publica URL."
    Write-Host "[INFO] Revisa logs: $tunnelErrLog | $tunnelOutLog"
    Write-Host "[INFO] Se dejo VITE_API_URL local temporalmente en client/.env.local"
    exit 2
  }

  $tunnelAlive = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
  if ($tunnelAlive) {
    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
  }
  Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
  $errPreview = $lastErrPreview
  if ($errPreview) {
    Write-Host "[ERROR] Detalle cloudflared:"
    Write-Host $errPreview
    if ($errPreview.Contains("[::1]:4000")) {
      Write-Host "[SUGERENCIA] Se detecto intento a IPv6 (::1:4000). Este script ya usa 127.0.0.1:4000; relanza el inicio."
    }
    if ($errPreview.ToLower().Contains("socket no permitido") -or $errPreview.ToLower().Contains("not permitted")) {
      Write-Host "[SUGERENCIA] Parece bloqueo de red/firewall/antivirus/VPN hacia api.trycloudflare.com:443."
      Write-Host "[SUGERENCIA] Prueba permitir cloudflared.exe en firewall o ejecutar terminal como administrador."
    }
  } else {
    Write-Host "[ERROR] No hubo salida de error en cloudflared stderr."
  }
  Write-Host "[ERROR] El tunnel no quedo en ejecucion."
  Write-Host "[ERROR] Revisa logs: $tunnelErrLog | $tunnelOutLog"
  Write-Host "[INFO] El backend queda activo en http://localhost:4000 para abrir tunnel manual si lo necesitas."
  exit 1
}

$apiUrl = "$tunnelUrl/api/v1"

Set-Content -Path $tunnelUrlFile -Value @(
  "TUNNEL_URL=$tunnelUrl",
  "VITE_API_URL=$apiUrl"
) -Encoding ascii

Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$apiUrl" -Encoding ascii

Write-Host "[OK] URL tunnel: $tunnelUrl"
Write-Host "[OK] API URL: $apiUrl"
Write-Host "[OK] Archivo actualizado: client/.env.local"
Write-Host "[INFO] Si el frontend ya estaba corriendo, reinicialo para aplicar la nueva VITE_API_URL."
