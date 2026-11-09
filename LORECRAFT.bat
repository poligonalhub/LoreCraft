@echo off
title LoreCraft // Poligonal
cd /d "%~dp0"

echo ========================================================
echo   LORECRAFT // WIKI & WORLDBUILDING (STANDALONE)
echo ========================================================
echo.
echo [+] Abrindo LoreCraft em http://localhost:1420...
echo.

start http://localhost:1420
npm run dev

pause
