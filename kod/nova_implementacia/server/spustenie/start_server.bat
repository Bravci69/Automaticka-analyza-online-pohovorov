@echo off
setlocal
cd /d "%~dp0"

echo [AutWorldBP] Kontrola a synchronizacia Windows Firewall podla config.json...
if exist "%~dp0nastav_firewall.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nastav_firewall.ps1"
)

echo.
echo [AutWorldBP] Prechadzam do priecinka servera a spustam server...
cd /d "%~dp0.."
node --experimental-sqlite server.js
pause

