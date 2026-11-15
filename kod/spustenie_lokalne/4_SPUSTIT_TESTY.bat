@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Automatizovan? Integra?n? Testy
color 0B

echo ======================================================================
echo    AUTOMATIZOVANE INTEGRACNE TESTY - BAKALARSKA PRACA
echo    Overenie SQLite DB, migracii, relacii, prav, e-mailov a kalendarov
echo ======================================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Node.js nie je nainstalovany alebo nie je v premennej PATH!
    pause
    exit /b 1
)

cd /d "%~dp0..\nova_implementacia\database"

echo [INFO] Spustam testovaci balik test_db_and_api.js...
echo.

node --experimental-sqlite test_db_and_api.js

if %ERRORLEVEL% equ 0 (
    color 0A
    echo.
    echo ======================================================================
    echo    VSETKY TESTY PREBEHLI USPESNE! INTEGRITA SYSTEMU OVERENA.
    echo ======================================================================
) else (
    color 0C
    echo.
    echo ======================================================================
    echo    NIEKTORY Z TESTOV ZLYHAL! Skontrolujte chybovu hlasku vyssie.
    echo ======================================================================
)

echo.
pause
