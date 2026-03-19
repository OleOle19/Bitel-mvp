$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$consoleLog = Join-Path $tmpDir "start-backend-tunnel.console.log"
Remove-Item -Path $consoleLog -Force -ErrorAction SilentlyContinue
try {
  Start-Transcript -Path $consoleLog -Force | Out-Null
} catch {}

$backendOutLog = Join-Path $tmpDir "server-start.out.log"
$backendErrLog = Join-Path $tmpDir "server-start.err.log"
$ngrokOutLog = Join-Path $tmpDir "ngrok-backend.out.log"
$ngrokErrLog = Join-Path $tmpDir "ngrok-backend.err.log"
$backendPidFile = Join-Path $tmpDir "backend.pid"
$tunnelPidFile = Join-Path $tmpDir "tunnel.pid"
$tunnelUrlFile = Join-Path $tmpDir "tunnel-url.txt"
$clientEnvLocal = Join-Path $root "client/.env.local"
$tunnelEnvFile = Join-Path $root "ops/tunnel.env"

function Exit-Script {
  param([int]$Code)

  try {
    Stop-Transcript | Out-Null
  } catch {}
  exit $Code
}

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

function Quote-CmdArg {
  param([string]$Value)

  if ($null -eq $Value) {
    return '""'
  }

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $escaped = $Value.Replace('"', '\"')
  return '"' + $escaped + '"'
}

function Test-NgrokCliAvailable {
  param([string]$NgrokCommand = "ngrok")

  try {
    & cmd.exe /d /c ($NgrokCommand + " version >nul 2>nul") | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

& (Join-Path $PSScriptRoot "stop_backend_tunnel.ps1") | Out-Null

Remove-Item -Path $backendOutLog, $backendErrLog, $ngrokOutLog, $ngrokErrLog, $backendPidFile, $tunnelPidFile, $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$pathExtras = @(
  (Join-Path $env:ProgramFiles "WinGet\Links"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links")
)
foreach ($extra in $pathExtras) {
  if ($extra -and (Test-Path $extra)) {
    $alreadyInPath = $false
    foreach ($segment in ($env:PATH -split ';')) {
      if ($segment -and ($segment.TrimEnd('\') -ieq $extra.TrimEnd('\'))) {
        $alreadyInPath = $true
        break
      }
    }
    if (-not $alreadyInPath) {
      $env:PATH = "$extra;$env:PATH"
    }
  }
}

$ngrokCommand = $null
$ngrokCandidates = New-Object System.Collections.Generic.List[string]
$ngrokCandidates.Add("ngrok") | Out-Null

$machineNgrok = Join-Path $env:ProgramFiles "WinGet\Links\ngrok.exe"
if (Test-Path $machineNgrok) {
  $ngrokCandidates.Add((Quote-CmdArg -Value $machineNgrok)) | Out-Null
}

$userNgrok = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe"
if (Test-Path $userNgrok) {
  $ngrokCandidates.Add((Quote-CmdArg -Value $userNgrok)) | Out-Null
}

$repoNgrokExe = Join-Path $root "tools\ngrok.exe"
if (Test-Path $repoNgrokExe) {
  $ngrokCandidates.Add((Quote-CmdArg -Value $repoNgrokExe)) | Out-Null
}

foreach ($candidate in $ngrokCandidates) {
  if (Test-NgrokCliAvailable -NgrokCommand $candidate) {
    $ngrokCommand = $candidate
    break
  }
}

if (-not $ngrokCommand) {
  Write-Output "[ERROR] No se pudo ejecutar ngrok desde CMD."
  if (-not (Test-Path $repoNgrokExe)) {
    Write-Output "[SUGERENCIA] Puedes poner ngrok.exe en tools/ngrok.exe para evitar problemas de PATH/permisos."
  }
  Write-Output "[SUGERENCIA] Prueba en CMD normal: ngrok version"
  Write-Output "[SUGERENCIA] Si falla, reinstala: winget uninstall Ngrok.Ngrok && winget install Ngrok.Ngrok"
  Exit-Script 1
}

$configMap = Load-KeyValueFile -Path $tunnelEnvFile
$ngrokAuthToken = Get-ConfigValue -Map $configMap -Key "NGROK_AUTHTOKEN"
$ngrokDomain = Get-ConfigValue -Map $configMap -Key "NGROK_DOMAIN"
$ngrokApiPortRaw = Get-ConfigValue -Map $configMap -Key "NGROK_API_PORT"
$ngrokApiPort = 4040
if ($ngrokApiPortRaw) {
  $parsed = 0
  if ([int]::TryParse([string]$ngrokApiPortRaw, [ref]$parsed) -and $parsed -gt 0) {
    if ($parsed -ne 4040) {
      Write-Output "[WARN] NGROK_API_PORT distinto de 4040 no aplica en ngrok v3 para este flujo."
      Write-Output "[WARN] Se usara 4040 para leer la API local de ngrok."
    }
  }
}

if ($ngrokAuthToken) {
  Write-Output "[INFO] Configurando authtoken de ngrok..."
  try {
    $tokenArg = Quote-CmdArg -Value $ngrokAuthToken
    & cmd.exe /d /c ($ngrokCommand + " config add-authtoken " + $tokenArg) | Out-Null
  } catch {
    Write-Output "[WARN] No se pudo aplicar authtoken automaticamente."
    Write-Output "[SUGERENCIA] Ejecuta manual: ngrok config add-authtoken <TU_TOKEN>"
  }
}

Write-Output "[START] Iniciando backend..."
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
    Write-Output "[ERROR] Ultimas lineas backend stderr:"
    Write-Output $backendErrPreview
  }
  Write-Output "[ERROR] Backend no quedo listo en http://127.0.0.1:4000."
  Write-Output "[ERROR] Revisa logs: $backendOutLog | $backendErrLog"
  Exit-Script 1
}

Write-Output "[OK] Backend listo. PID: $($backendProc.Id)"

$localApiUrl = "http://127.0.0.1:4000/api/v1"
Set-Content -Path $clientEnvLocal -Value "VITE_API_URL=$localApiUrl" -Encoding ascii
Remove-Item -Path $tunnelUrlFile -Force -ErrorAction SilentlyContinue

$ngrokArgs = @("http", "127.0.0.1:4000", "--log", "stdout", "--log-format", "logfmt", "--log-level", "info")
if ($ngrokDomain) {
  $ngrokArgs += @("--domain", $ngrokDomain)
}
$ngrokCommandLine = ($ngrokCommand + " " + (($ngrokArgs | ForEach-Object { Quote-CmdArg -Value $_ }) -join " "))

Write-Output "[START] Iniciando ngrok..."
$tunnelProc = $null
try {
  $tunnelProc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", $ngrokCommandLine) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $ngrokOutLog -RedirectStandardError $ngrokErrLog -PassThru
} catch {
  Write-Output "[ERROR] No se pudo iniciar ngrok: $($_.Exception.Message)"
  Write-Output "[SUGERENCIA] Cierra terminales viejas, abre una nueva como usuario normal y reintenta."
  Exit-Script 1
}
Set-Content -Path $tunnelPidFile -Value $tunnelProc.Id -Encoding ascii
Write-Output "[START] Ngrok iniciado. PID: $($tunnelProc.Id)"

$resolvedTunnelUrl = $null
for ($sec = 1; $sec -le 45; $sec++) {
  Start-Sleep -Seconds 1

  $resolvedTunnelUrl = Get-NgrokPublicUrl -Port $ngrokApiPort
  if ($resolvedTunnelUrl) {
    break
  }

  if (($sec % 10) -eq 0) {
    Write-Output "[INFO] Esperando URL publica de ngrok..."
  }

  if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
    break
  }
}

if (-not $resolvedTunnelUrl) {
  $errPreview = Get-LastLogLines -Path $ngrokErrLog -Lines 20
  $detectedNetworkBlock = $false
  if ($errPreview) {
    Write-Output "[ERROR] Ultimas lineas ngrok stderr:"
    Write-Output $errPreview
    $errLower = $errPreview.ToLowerInvariant()
    if ($errLower.Contains("connect.ngrok-agent.com:443") -or $errLower.Contains("connectex")) {
      $detectedNetworkBlock = $true
    }
  } else {
    $outPreview = Get-LastLogLines -Path $ngrokOutLog -Lines 20
    if ($outPreview) {
      Write-Output "[ERROR] Ultimas lineas ngrok log:"
      Write-Output $outPreview
      $outLower = $outPreview.ToLowerInvariant()
      if ($outLower.Contains("connect.ngrok-agent.com:443") -or $outLower.Contains("connectex")) {
        $detectedNetworkBlock = $true
      }
    }
  }
  if (-not $detectedNetworkBlock -and (Test-Path $ngrokOutLog)) {
    $networkHints = Select-String -Path $ngrokOutLog -Pattern "connect\.ngrok-agent\.com:443|connectex|failed to reconnect session" -ErrorAction SilentlyContinue
    if ($networkHints) {
      $detectedNetworkBlock = $true
    }
  }
  if ($detectedNetworkBlock) {
    Write-Output "[SUGERENCIA] Se detecto bloqueo de red/firewall hacia connect.ngrok-agent.com:443."
    Write-Output "[SUGERENCIA] Prueba en PowerShell (Administrador):"
    Write-Output "New-NetFirewallRule -DisplayName 'Allow ngrok outbound 443' -Direction Outbound -Action Allow -Program '$repoNgrokExe' -Protocol TCP -RemotePort 443"
  }
  Write-Output "[ERROR] No se obtuvo URL publica de ngrok."
  Write-Output "[SUGERENCIA] Si es tu primera vez, configura token: ngrok config add-authtoken <TOKEN>"
  Exit-Script 1
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
  Write-Output "[OK] URL copiada al portapapeles."
} catch {
  Write-Output "[INFO] No se pudo copiar URL al portapapeles desde PowerShell."
}

Write-Output "[OK] URL tunnel: $resolvedTunnelUrl"
Write-Output "[OK] API URL: $resolvedApiUrl"
Write-Output "[OK] Archivo actualizado: client/.env.local"

try {
  Stop-Transcript | Out-Null
} catch {}

