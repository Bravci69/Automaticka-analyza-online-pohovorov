@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Desktop Klient (Electron Emulator)
color 0B

echo ======================================================================
echo    DESKTOP KLIENT - EMULATOR PRACOVNEHO PROSTREDIA POHOVORU
echo    Electron + TypeScript Desktop Application
echo ======================================================================
echo.

:: 1. Kontrola Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Node.js nie je nainstalovany alebo nie je v premennej PATH!
    echo Prosim, nainstalujte Node.js (verzia 22+): https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Prechod do priecinka klienta
cd /d "%~dp0..\nova_implementacia\klient"

:: 3. Kontrola zavislosti
if not exist "node_modules\electron" (
    echo [INFO] Kniznice Electronu neboli najdene. Spustam automaticku instalaciu...
    call npm install
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [CHYBA] Instalacia zavislosti klienta zlyhala.
        pause
        exit /b 1
    )
    echo [OK] Zavislosti uspesne pripravene.
    echo.
)

:: 4. Kontrola a kompilacia TypeScriptu
if not exist "dist\main.js" (
    echo [INFO] Prekladam TypeScript kod klienta...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [CHYBA] Kompilacia TypeScriptu zlyhala!
        pause
        exit /b 1
    )
    echo [OK] TypeScript kod bol skompilovany.
    echo.
)

echo [INFO] Spustam desktopovu aplikaciu klienta...
echo.

:: 5. Spustenie Electron aplikacie
call npm start

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [CHYBA] Klient bol ukonceny s chybou.
    pause
)
