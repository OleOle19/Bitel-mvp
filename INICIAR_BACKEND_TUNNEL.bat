@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo [INFO] Iniciando backend + tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ops\start_backend_tunnel.ps1"
set "EXITCODE=%ERRORLEVEL%"
set "TUNNEL_URL="
if exist ".\tmp\tunnel-url.txt" (
  for /f "usebackq tokens=1,* delims==" %%A in (".\tmp\tunnel-url.txt") do (
    if /I "%%A"=="TUNNEL_URL" set "TUNNEL_URL=%%B"
  )
)
if not defined TUNNEL_URL (
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$p='.\\tmp\\cloudflared-backend.err.log'; if(Test-Path $p){$m=Select-String -Path $p -Pattern 'https://[A-Za-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Where-Object { $_ -ne 'https://api.trycloudflare.com' } | Select-Object -Last 1; if($m){$m}}"`) do (
    set "TUNNEL_URL=%%U"
  )
)
echo.
set "FINAL_URL="
if defined TUNNEL_URL (
  if /I "%TUNNEL_URL%"=="PENDING" (
    echo [INFO] URL del tunnel: pendiente de asignacion. Esperando publicacion...
    set "WAIT_URL="
    for /L %%I in (1,1,30) do (
      for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$p='.\\tmp\\cloudflared-backend.err.log'; if(Test-Path $p){$m=Select-String -Path $p -Pattern 'https://[A-Za-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Where-Object { $_ -ne 'https://api.trycloudflare.com' } | Select-Object -Last 1; if($m){$m}}"`) do (
        set "WAIT_URL=%%U"
      )
      if defined WAIT_URL (
        set "FINAL_URL=!WAIT_URL!"
        goto :resolved_url
      )
      >nul timeout /t 2 /nobreak
    )
    echo [WARN] No se pudo leer la URL publica todavia. Revisa .\tmp\cloudflared-backend.err.log
  ) else (
    set "FINAL_URL=%TUNNEL_URL%"
  )
) else (
  echo [INFO] No se encontro URL en .\tmp\tunnel-url.txt
)
:resolved_url
if defined FINAL_URL (
  echo [INFO] URL del tunnel: !FINAL_URL!
  >nul echo !FINAL_URL!| clip
  if errorlevel 1 (
    echo [INFO] No se pudo copiar la URL al portapapeles desde .bat.
  ) else (
    echo [OK] URL copiada al portapapeles.
  )
  if "%EXITCODE%"=="2" (
    set "EXITCODE=0"
  )
)
if /I not "%~1"=="--no-pause" (
  echo.
  if "%EXITCODE%"=="2" (
    echo [WARN] Backend iniciado, pero aun no hay URL publica del tunnel.
    echo [WARN] Puedes reintentar en unos segundos o revisar:
    echo [WARN]   .\tmp\cloudflared-backend.err.log
  ) else (
    if not "%EXITCODE%"=="0" (
      echo [WARN] El inicio termino con codigo %EXITCODE%.
      echo [WARN] Revisa logs en:
      echo [WARN]   .\tmp\server-start.err.log
      echo [WARN]   .\tmp\cloudflared-backend.out.log
      echo [WARN]   .\tmp\cloudflared-backend.err.log
      echo.
      echo [INFO] Ultimo error detectado:
      powershell -NoProfile -Command "$paths=@('.\\tmp\\server-start.err.log','.\\tmp\\cloudflared-backend.err.log'); $shown=$false; foreach($p in $paths){ if(Test-Path $p){ $t=(Get-Content -Path $p -Tail 12 -ErrorAction SilentlyContinue | Out-String).Trim(); if($t){ Write-Host ('--- ' + $p + ' ---'); Write-Host $t; $shown=$true } } }; if(-not $shown){ Write-Host 'No se encontro detalle adicional en logs de error.' }"
    ) else (
      echo [OK] Proceso de inicio finalizado.
    )
  )
  echo.
  pause
)
exit /b %EXITCODE%
endlocal
