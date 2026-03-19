$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$backendOutLog = Join-Path $tmpDir "server-start.out.log"
$backendErrLog = Join-Path $tmpDir "server-start.err.log"
$tunnelOutLog = Join-Path $tmpDir "cloudflared-backend.out.log"
$tunnelErrLog = Join-Path $tmpDir "cloudflared-backend.err.log"
$backendPidFile = Join-Path $tmpDir "backend.pid"
$tunnelPidFile = Join-Path $tmpDir "tunnel.pid"
$tunnelUrlFile = Join-Path $tmpDir "tunnel-url.txt"
$clientEnvLocal = Join-Path $root "client/.env.local"
$tunnelEnvFile = Join-Path $root "ops/tunnel.env"

function Get-LastLogLines {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Lines = 16
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

function Load-KeyValueFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  foreach ($rawLine in (Get-Content -Path $Path -ErrorAction SilentlyContinue)) {
    if ($null -eq $rawLine) {
      continue
    }
    $line = [string]$rawLine
    $trimmed = $line.Trim()
    if (-not $trimmed) {
      continue
    }
    if ($trimmed.StartsWith("#")) {
      continue
    }

    $eqIndex = $trimmed.IndexOf("=")
    if ($eqIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $eqIndex).Trim()
    if (-not $key) {
      continue
    }

    $value = $trimmed.Substring($eqIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      if ($value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $map[$key] = $value
  }

  return $map
}

function Get-ConfigValue {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Map,
    [Parameter(Mandatory = $true)][string]$Key
  )

  $fromEnv = [Environment]::GetEnvironmentVariable($Key)
  if ($fromEnv) {
    return [string]$fromEnv
  }

  if ($Map.ContainsKey($Key)) {
    return [string]$Map[$Key]
  }

  return $null
}

function Normalize-BaseUrl {
  param([string]$Url)

  if (-not $Url) {
    return $null
  }
  $normalized = $Url.Trim()
  if (-not $normalized) {
    return $null
  }
  if (-not $normalized.StartsWith("http://") -and -not $normalized.StartsWith("https://")) {
    $normalized = "https://$normalized"
  }
  return $normalized.TrimEnd("/")
}

function Build-ApiUrl {
  param([string]$BaseUrl)

  $normalized = Normalize-BaseUrl -Url $BaseUrl
  if (-not $normalized) {
    return $null
  }
  return "$normalized/api/v1"
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
      $lines = Get-Content -Path $path -Tail 300 -ErrorAction Stop
      for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        $line = [string]$lines[$i]
        if (-not $line) {
          continue
        }
        $matches = $regex.Matches($line)
        if ($matches.Count -eq 0) {
          continue
        }
        for ($j = $matches.Count - 1; $j -ge 0; $j--) {
          $candidate = [string]$matches[$j].Value
          try {
            $uri = [System.Uri]$candidate
            $host = [string]$uri.Host
            if ($host -and $host.ToLowerInvariant() -ne "api.trycloudflare.com") {
              return $candidate
            }
          } catch {}
        }
      }
    } catch {}
  }
  return $null
}

& (Join-Path $PSScriptRoot "stop_backend_tunnel.ps1") | Out-Null

Remove-Item -Path $backendOutLog, $backendErrLog, $tunnelOutLog, $tunnelErrLog, $backendPidFile, $tunnelPidFile, $tunnelUrlFile -Force -ErrorAction SilentlyContinue

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

$backendProbeUrl = "http://127.0.0.1:4000/api/v1"
$backendReady = $false
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
  throw "Backend no quedo listo en http://127.0.0.1:4000. Revisa logs: $backendOutLog | $backendErrLog"
}

Write-Host "[OK] Backend listo. PID: $($backendProc.Id)"

$configMap = Load-KeyValueFile -Path $tunnelEnvFile
$modeRaw = Get-ConfigValue -Map $configMap -Key "CF_TUNNEL_MODE"
if (-not $modeRaw) {
  $modeRaw = "quick"
}
$tunnelMode = $modeRaw.Trim().ToLowerInvariant()

$namedToken = Get-ConfigValue -Map $configMap -Key "CF_TUNNEL_TOKEN"
$publicUrlRaw = Get-ConfigValue -Map $configMap -Key "CF_TUNNEL_PUBLIC_URL"
$publicUrl = Normalize-BaseUrl -Url $publicUrlRaw

$localApiUrl = "http://127.0.0.1:4000/api/v1"
$resolvedTunnelUrl = $null
$resolvedApiUrl = $localApiUrl

Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
Remove-Item -Path $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$namedRequested = $false
if ($tunnelMode -eq "named") {
  $namedRequested = $true
}
if ($namedToken) {
  $namedRequested = $true
}

if ($namedRequested) {
  if (-not $namedToken) {
    throw "Modo named activado pero falta CF_TUNNEL_TOKEN. Crea ops/tunnel.env usando ops/tunnel.env.example."
  }
  if (-not $publicUrl) {
    throw "Modo named activado pero falta CF_TUNNEL_PUBLIC_URL. Crea ops/tunnel.env usando ops/tunnel.env.example."
  }

  Write-Host "[START] Iniciando named tunnel..."
  $tunnelProc = Start-Process -FilePath $cloudflaredExe -ArgumentList @("tunnel", "run", "--token", $namedToken) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -PassThru
  Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
  Write-Host "[START] Tunnel iniciado. PID: $($tunnelProc.Id)"

  $stable = $false
  for ($sec = 1; $sec -le 20; $sec++) {
    Start-Sleep -Seconds 1
    if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
      break
    }
    if ($sec -ge 6) {
      $stable = $true
      break
    }
  }

  if (-not $stable) {
    $errPreview = Get-LastLogLines -Path $tunnelErrLog -Lines 18
    if ($errPreview) {
      Write-Host "[ERROR] Ultimas lineas cloudflared stderr:"
      Write-Host $errPreview
    }
    throw "Named tunnel no se mantuvo activo. Revisa token/hostname y logs: $tunnelErrLog"
  }

  $resolvedTunnelUrl = $publicUrl
  $resolvedApiUrl = Build-ApiUrl -BaseUrl $resolvedTunnelUrl
} else {
  Write-Host "[INFO] Modo quick tunnel activo (fallback)."

  $attemptProfiles = @(
    @("tunnel", "--url", "http://127.0.0.1:4000", "--edge-ip-version", "4", "--protocol", "http2", "--no-autoupdate"),
    @("tunnel", "--url", "http://127.0.0.1:4000", "--edge-ip-version", "4", "--no-autoupdate")
  )

  $maxSecondsPerAttempt = 75
  $lastErrPreview = ""

  for ($attempt = 1; $attempt -le $attemptProfiles.Count -and -not $resolvedTunnelUrl; $attempt++) {
    if ($attempt -gt 1) {
      Write-Host "[RETRY] Reintentando tunnel ($attempt/$($attemptProfiles.Count))..."
    }

    Remove-Item -Path $tunnelOutLog, $tunnelErrLog -Force -ErrorAction SilentlyContinue

    $tunnelArgs = $attemptProfiles[$attempt - 1]
    $tunnelProc = Start-Process -FilePath $cloudflaredExe -ArgumentList $tunnelArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -PassThru
    Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
    Write-Host "[START] Tunnel iniciado. PID: $($tunnelProc.Id)"

    for ($sec = 1; $sec -le $maxSecondsPerAttempt; $sec++) {
      Start-Sleep -Seconds 1

      $foundUrl = Get-LatestTryCloudflareUrl -Paths @($tunnelErrLog, $tunnelOutLog)
      if ($foundUrl) {
        $resolvedTunnelUrl = $foundUrl
        break
      }

      if (($sec % 15) -eq 0) {
        Write-Host "[INFO] Esperando URL publica del tunnel..."
      }

      if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
        break
      }
    }

    if ($resolvedTunnelUrl) {
      break
    }

    $lastErrPreview = Get-LastLogLines -Path $tunnelErrLog -Lines 18
    $tunnelAlive = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
    if ($tunnelAlive) {
      Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $resolvedTunnelUrl) {
    if ($lastErrPreview) {
      Write-Host "[ERROR] Ultimas lineas cloudflared stderr:"
      Write-Host $lastErrPreview
    }
    Write-Host "[ERROR] No se obtuvo URL publica del quick tunnel."
    Write-Host "[SUGERENCIA] Configura named tunnel en ops/tunnel.env para evitar este problema."
    exit 1
  }

  $resolvedApiUrl = Build-ApiUrl -BaseUrl $resolvedTunnelUrl
}

Set-Content -Path $tunnelUrlFile -Value @(
  "TUNNEL_URL=$resolvedTunnelUrl",
  "VITE_API_URL=$resolvedApiUrl",
  "MODE=$tunnelMode"
) -Encoding ascii
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$resolvedApiUrl" -Encoding ascii

try {
  Set-Clipboard -Value $resolvedTunnelUrl -ErrorAction Stop
  Write-Host "[OK] URL copiada al portapapeles."
} catch {
  Write-Host "[INFO] No se pudo copiar URL al portapapeles desde PowerShell."
}

Write-Host "[OK] URL tunnel: $resolvedTunnelUrl"
Write-Host "[OK] API URL: $resolvedApiUrl"
Write-Host "[OK] Archivo actualizado: client/.env.local"
