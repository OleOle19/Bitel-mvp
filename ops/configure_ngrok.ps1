param(
  [string]$AuthToken,
  [string]$Domain
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$target = Join-Path $root "ops/tunnel.env"

if (-not $AuthToken) {
  $AuthToken = Read-Host "Pega NGROK_AUTHTOKEN (obligatorio)"
}
if (-not $Domain) {
  $Domain = Read-Host "NGROK_DOMAIN (opcional, Enter para omitir)"
}

$AuthToken = [string]$AuthToken
$Domain = [string]$Domain

if (-not $AuthToken.Trim()) {
  throw "NGROK_AUTHTOKEN no puede estar vacio."
}

$lines = @(
  "NGROK_AUTHTOKEN=$AuthToken",
  "NGROK_DOMAIN=$Domain",
  "NGROK_API_PORT=4040"
)

Set-Content -Path $target -Value $lines -Encoding ascii

Write-Host "[OK] Archivo guardado: $target"
Write-Host "[SIGUIENTE] Ejecuta: INICIAR_BACKEND_TUNNEL.bat"

