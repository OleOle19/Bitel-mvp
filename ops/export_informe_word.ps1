$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

$mdPath = Join-Path $root "docs\\INFORME_SISTEMA_DEMO.md"
$htmlPath = Join-Path $root "docs\\INFORME_SISTEMA_DEMO.from-md.html"
$outDoc = Join-Path $root "docs\\INFORME_SISTEMA_DEMO.doc"

$title = "Informe del Sistema Demo BITEL (MVP)"
$subtitle = "Exportado desde docs/INFORME_SISTEMA_DEMO.md"

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
node $nodeScript $mdPath $htmlPath $title $subtitle | Out-Host

if (-not (Test-Path $htmlPath)) {
  throw "No se genero el HTML: $htmlPath"
}

Copy-Item -Force $htmlPath $outDoc
Write-Host "OK (Word-compatible): $outDoc"
Write-Host "Abre el .doc en Word y si deseas, usa Guardar como -> .docx"

