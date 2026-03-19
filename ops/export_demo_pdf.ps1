$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mdPath = Join-Path $root "docs\\DEMO_MEET.md"
$htmlPath = Join-Path $root "docs\\DEMO_MEET.from-md.html"
$outPdf = Join-Path $root "docs\\DEMO_MEET.pdf"

if (-not (Test-Path $mdPath)) {
  throw "No existe el archivo Markdown: $mdPath"
}

$nodeScript = Join-Path $root "ops\\render_demo_meet_from_md.js"
if (-not (Test-Path $nodeScript)) {
  throw "No existe el script de render HTML: $nodeScript"
}

Write-Host "Renderizando HTML desde Markdown..."
Write-Host "MD: $mdPath"
Write-Host "HTML: $htmlPath"
node $nodeScript $mdPath $htmlPath | Out-Host

if (-not (Test-Path $htmlPath)) {
  throw "No se genero el HTML: $htmlPath"
}
function Get-AppPathFromRegistry([string]$exeName) {
  $keys = @(
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$exeName",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$exeName"
  )
  foreach ($k in $keys) {
    try {
      $p = (Get-ItemProperty -Path $k -ErrorAction Stop)."(default)"
      if ($p -and (Test-Path $p)) { return $p }
    } catch {}
  }
  return $null
}
function Find-BrowserExe {
  $candidates = @()
  foreach ($name in @("msedge.exe", "chrome.exe")) {
    try {
      $cmd = Get-Command $name -ErrorAction Stop
      if ($cmd.Source) { $candidates += $cmd.Source }
    } catch {}
    $reg = Get-AppPathFromRegistry $name
    if ($reg) { $candidates += $reg }
  }
  $candidates += @(
    "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
    "$env:ProgramFiles(x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "$env:LocalAppData\\Microsoft\\Edge\\Application\\msedge.exe",
    "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
    "$env:ProgramFiles(x86)\\Google\\Chrome\\Application\\chrome.exe",
    "$env:LocalAppData\\Google\\Chrome\\Application\\chrome.exe"
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}
$browserExe = Find-BrowserExe
if (-not $browserExe) {
  Write-Host "No se encontro Edge/Chrome para exportar automaticamente."
  Write-Host "Abre este archivo en el navegador y usa Imprimir -> Guardar como PDF:"
  Write-Host "  $htmlPath"
  exit 2
}
if (Test-Path $outPdf) { Remove-Item -Force $outPdf }
$htmlUri = (New-Object System.Uri($htmlPath)).AbsoluteUri
Write-Host "Generando PDF..."
Write-Host "Browser: $browserExe"
Write-Host "HTML: $htmlUri"
Write-Host "OUT: $outPdf"
& $browserExe `
  --headless `
  --disable-gpu `
  --no-first-run `
  --no-default-browser-check `
  --no-pdf-header-footer `
  --print-to-pdf-no-header `
  "--print-to-pdf=$outPdf" `
  $htmlUri | Out-Null
if (-not (Test-Path $outPdf)) {
  throw "No se genero el PDF. Revisa si tu browser soporta --print-to-pdf."
}
Write-Host "OK: $outPdf"
