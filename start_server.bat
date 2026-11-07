@echo off
setlocal
cd /d "%~dp0"

:: 1. Automatická kontrola a nastavenie firewall pravidla AutWorldBP podľa config.json
if exist "%~dp0nastav_firewall.bat" (
    call "%~dp0nastav_firewall.bat"
)

:: 2. Spustenie Node servera s experimental-sqlite
cd /d "%~dp0kod\nova_implementacia\server"
node --experimental-sqlite server.js
pause

