@echo off
setlocal
cd /d "%~dp0"
echo [INFO] Deteniendo backend + tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ops\stop_backend_tunnel.ps1"
set "EXITCODE=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" (
  echo.
  if not "%EXITCODE%"=="0" (
    echo [WARN] La detencion termino con codigo %EXITCODE%.
  ) else (
    echo [OK] Proceso de detencion finalizado.
  )
  echo.
  pause
)
exit /b %EXITCODE%
endlocal
