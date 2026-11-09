@echo off
title LoreCraft // Poligonal
cd /d "%~dp0"

echo ========================================================
echo   LORECRAFT // WIKI & WORLDBUILDING (STANDALONE)
echo ========================================================
echo.
echo [+] Iniciando servidor e abrindo LoreCraft em http://127.0.0.1:1420...
echo.

start /min cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:1420"
npm run dev

pause
