@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo [INFO] Iniciando backend + ngrok...
if not exist ".\tmp" mkdir ".\tmp"
set "CONSOLE_LOG=.\tmp\start-backend-tunnel.console.log"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ops\start_backend_tunnel.ps1"
set "EXITCODE=%ERRORLEVEL%"

set "TUNNEL_URL="
set "TUNNEL_PROVIDER="
if exist ".\tmp\tunnel-url.txt" (
  for /f "usebackq tokens=1,* delims==" %%A in (".\tmp\tunnel-url.txt") do (
    if /I "%%A"=="TUNNEL_URL" set "TUNNEL_URL=%%B"
    if /I "%%A"=="TUNNEL_PROVIDER" set "TUNNEL_PROVIDER=%%B"
  )
)

echo.
if defined TUNNEL_URL (
  if not defined TUNNEL_PROVIDER set "TUNNEL_PROVIDER=tunnel"
  echo [INFO] Proveedor: !TUNNEL_PROVIDER!
  echo [INFO] URL publica: !TUNNEL_URL!
  >nul echo !TUNNEL_URL!| clip
  if errorlevel 1 (
    echo [INFO] No se pudo copiar la URL al portapapeles desde .bat.
  ) else (
    echo [OK] URL copiada al portapapeles.
  )
) else (
  echo [WARN] No se encontro URL en .\tmp\tunnel-url.txt
)

if /I not "%~1"=="--no-pause" (
  echo.
  if not "%EXITCODE%"=="0" (
    echo [WARN] El inicio termino con codigo %EXITCODE%.
    echo [WARN] Revisa logs en:
    echo [WARN]   .\tmp\start-backend-tunnel.console.log
    echo [WARN]   .\tmp\server-start.err.log
    echo [WARN]   .\tmp\ngrok-backend.out.log
    echo [WARN]   .\tmp\ngrok-backend.err.log
  ) else (
    echo [OK] Proceso de inicio finalizado.
  )
  echo.
  pause
)

exit /b %EXITCODE%
endlocal
