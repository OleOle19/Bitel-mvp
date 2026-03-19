$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$backendOutLog = Join-Path $tmpDir "server-start.out.log"
$backendErrLog = Join-Path $tmpDir "server-start.err.log"
$ngrokOutLog = Join-Path $tmpDir "ngrok-backend.out.log"
$ngrokErrLog = Join-Path $tmpDir "ngrok-backend.err.log"
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

function Get-NgrokPublicUrl {
  param([int]$Port = 4040)

  try {
    $resp = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/tunnels" -f $Port) -TimeoutSec 2 -ErrorAction Stop
    if (-not $resp -or -not $resp.tunnels) {
      return $null
    }

    foreach ($t in $resp.tunnels) {
      $url = [string]$t.public_url
      if ($url -and $url.StartsWith("https://")) {
        return $url.TrimEnd("/")
      }
    }

    return $null
  } catch {
    return $null
  }
}

function Test-NgrokExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$ExePath
  )

  if (-not (Test-Path $ExePath)) {
    return $false
  }

  try {
    & $ExePath version | Out-Null
    return $true
  } catch {
    return $false
  }
}

& (Join-Path $PSScriptRoot "stop_backend_tunnel.ps1") | Out-Null

Remove-Item -Path $backendOutLog, $backendErrLog, $ngrokOutLog, $ngrokErrLog, $backendPidFile, $tunnelPidFile, $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
$ngrokExe = $null

$candidateSet = New-Object "System.Collections.Generic.HashSet[string]"
$candidates = New-Object System.Collections.Generic.List[string]

if ($ngrokCmd -and $ngrokCmd.Source) {
  $source = [string]$ngrokCmd.Source
  if ($candidateSet.Add($source)) { $candidates.Add($source) | Out-Null }
}

$wingetLink = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe"
if ($candidateSet.Add($wingetLink)) { $candidates.Add($wingetLink) | Out-Null }

$windowsAppsAlias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\ngrok.exe"
if ($candidateSet.Add($windowsAppsAlias)) { $candidates.Add($windowsAppsAlias) | Out-Null }

$wingetPackageBins = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "ngrok.exe" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -like "*Ngrok.Ngrok*" } |
  Sort-Object LastWriteTime -Descending
foreach ($item in $wingetPackageBins) {
  $full = [string]$item.FullName
  if ($candidateSet.Add($full)) {
    $candidates.Add($full) | Out-Null
  }
}

foreach ($candidate in $candidates) {
  if (-not (Test-Path $candidate -PathType Leaf)) {
    continue
  }

  if (Test-NgrokExecutable -ExePath $candidate) {
    $ngrokExe = $candidate
    break
  }

  $localFallback = Join-Path $tmpDir "ngrok-runtime.exe"
  try {
    Copy-Item -Path $candidate -Destination $localFallback -Force -ErrorAction Stop
    if (Test-NgrokExecutable -ExePath $localFallback) {
      $ngrokExe = $localFallback
      break
    }
  } catch {}
}

if (-not $ngrokExe) {
  Write-Host "[ERROR] No se pudo ejecutar ngrok desde las rutas detectadas."
  Write-Host "[SUGERENCIA] Abre CMD/PowerShell normal (no administrador) y prueba: ngrok version"
  Write-Host "[SUGERENCIA] Si sigue fallando, reinstala con: winget uninstall Ngrok.Ngrok && winget install Ngrok.Ngrok"
  Write-Host "[SUGERENCIA] Si usas siempre terminal administrador, instala en scope machine:"
  Write-Host "             winget install --id Ngrok.Ngrok -e --scope machine --accept-source-agreements --accept-package-agreements"
  exit 1
}

$configMap = Load-KeyValueFile -Path $tunnelEnvFile
$ngrokAuthToken = Get-ConfigValue -Map $configMap -Key "NGROK_AUTHTOKEN"
$ngrokDomain = Get-ConfigValue -Map $configMap -Key "NGROK_DOMAIN"
$ngrokApiPortRaw = Get-ConfigValue -Map $configMap -Key "NGROK_API_PORT"
$ngrokApiPort = 4040
if ($ngrokApiPortRaw) {
  $parsed = 0
  if ([int]::TryParse([string]$ngrokApiPortRaw, [ref]$parsed) -and $parsed -gt 0) {
    $ngrokApiPort = $parsed
  }
}

if ($ngrokAuthToken) {
  Write-Host "[INFO] Configurando authtoken de ngrok..."
  try {
    & $ngrokExe config add-authtoken $ngrokAuthToken | Out-Null
  } catch {
    Write-Host "[WARN] No se pudo aplicar authtoken automaticamente."
    Write-Host "[SUGERENCIA] Ejecuta manual: ngrok config add-authtoken <TU_TOKEN>"
  }
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
  Write-Host "[ERROR] Backend no quedo listo en http://127.0.0.1:4000."
  Write-Host "[ERROR] Revisa logs: $backendOutLog | $backendErrLog"
  exit 1
}

Write-Host "[OK] Backend listo. PID: $($backendProc.Id)"

$localApiUrl = "http://127.0.0.1:4000/api/v1"
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
Remove-Item -Path $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$ngrokArgs = @("http", "127.0.0.1:4000", "--log", "stdout", "--log-format", "logfmt", "--log-level", "info", "--web-addr", "127.0.0.1:$ngrokApiPort")
if ($ngrokDomain) {
  $ngrokArgs += @("--domain", $ngrokDomain)
}

Write-Host "[START] Iniciando ngrok..."
$tunnelProc = $null
try {
  $tunnelProc = Start-Process -FilePath $ngrokExe -ArgumentList $ngrokArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $ngrokOutLog -RedirectStandardError $ngrokErrLog -PassThru
} catch {
  Write-Host "[ERROR] No se pudo iniciar ngrok: $($_.Exception.Message)"
  Write-Host "[SUGERENCIA] Cierra terminales viejas, abre una nueva como usuario normal y reintenta."
  exit 1
}
Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
Write-Host "[START] Ngrok iniciado. PID: $($tunnelProc.Id)"

$resolvedTunnelUrl = $null
for ($sec = 1; $sec -le 45; $sec++) {
  Start-Sleep -Seconds 1

  $resolvedTunnelUrl = Get-NgrokPublicUrl -Port $ngrokApiPort
  if ($resolvedTunnelUrl) {
    break
  }

  if (($sec % 10) -eq 0) {
    Write-Host "[INFO] Esperando URL publica de ngrok..."
  }

  if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
    break
  }
}

if (-not $resolvedTunnelUrl) {
  $errPreview = Get-LastLogLines -Path $ngrokErrLog -Lines 20
  if ($errPreview) {
    Write-Host "[ERROR] Ultimas lineas ngrok stderr:"
    Write-Host $errPreview
  } else {
    $outPreview = Get-LastLogLines -Path $ngrokOutLog -Lines 20
    if ($outPreview) {
      Write-Host "[ERROR] Ultimas lineas ngrok log:"
      Write-Host $outPreview
    }
  }
  Write-Host "[ERROR] No se obtuvo URL publica de ngrok."
  Write-Host "[SUGERENCIA] Si es tu primera vez, configura token: ngrok config add-authtoken <TOKEN>"
  exit 1
}

$resolvedApiUrl = "$resolvedTunnelUrl/api/v1"

Set-Content -Path $tunnelUrlFile -Value @(
  "TUNNEL_PROVIDER=ngrok",
  "TUNNEL_URL=$resolvedTunnelUrl",
  "VITE_API_URL=$resolvedApiUrl"
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
