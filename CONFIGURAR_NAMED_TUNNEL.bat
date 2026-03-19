@echo off
setlocal
cd /d "%~dp0"
echo [INFO] Configurando named tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ops\configure_named_tunnel.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
if "%EXITCODE%"=="0" (
  echo [OK] Configuracion completada.
) else (
  echo [WARN] La configuracion termino con codigo %EXITCODE%.
)
echo.
pause
exit /b %EXITCODE%
endlocal

