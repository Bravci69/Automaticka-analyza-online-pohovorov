@echo off
setlocal
cd /d "%~dp0"

:: Kontrola administrátorských práv
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [AutWorldBP] Vyzaduju sa administratorske prava pre upravu Windows Firewall.
    echo [AutWorldBP] Vyziadavanie administratorskych prav...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

if exist "%~dp0nastav_firewall.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nastav_firewall.ps1"
) else (
    echo [AutWorldBP] Chyba: Subor nastav_firewall.ps1 sa nenasiel.
)

pause
