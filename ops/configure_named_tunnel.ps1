param(
  [string]$Token,
  [string]$PublicUrl
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$target = Join-Path $root "ops/tunnel.env"

if (-not $Token) {
  $Token = Read-Host "Pega CF_TUNNEL_TOKEN"
}
if (-not $PublicUrl) {
  $PublicUrl = Read-Host "Pega CF_TUNNEL_PUBLIC_URL (ej: https://api.tudominio.com)"
}

$Token = [string]$Token
$PublicUrl = [string]$PublicUrl

if (-not $Token.Trim()) {
  throw "CF_TUNNEL_TOKEN no puede estar vacio."
}
if (-not $PublicUrl.Trim()) {
  throw "CF_TUNNEL_PUBLIC_URL no puede estar vacio."
}

if (-not $PublicUrl.StartsWith("http://") -and -not $PublicUrl.StartsWith("https://")) {
  $PublicUrl = "https://$PublicUrl"
}
$PublicUrl = $PublicUrl.TrimEnd("/")

$content = @(
  "CF_TUNNEL_MODE=named",
  "CF_TUNNEL_TOKEN=$Token",
  "CF_TUNNEL_PUBLIC_URL=$PublicUrl"
)

Set-Content -Path $target -Value $content -Encoding ascii

Write-Host "[OK] Archivo guardado: $target"
Write-Host "[OK] URL publica configurada: $PublicUrl"
Write-Host "[SIGUIENTE] Ejecuta: INICIAR_BACKEND_TUNNEL.bat"
