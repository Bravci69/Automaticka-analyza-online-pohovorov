@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Instalacia zavislosti
color 0B

echo ======================================================================
echo    AUTORIZOVANY INSTALATOR ZAVISLOSTII - BAKALARSKA PRACA
echo    Automaticka analyza online pohovorov (Server ^& Klient)
echo ======================================================================
echo.

:: 1. Kontrola pritomnosti Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Node.js nie je nainstalovany alebo nie je v systemovej premennej PATH!
    echo Prosim, stiahnite a nainstalujte Node.js (verzia 22+):
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
for /f "tokens=*" %%v in ('npm -v') do set NPM_VERSION=%%v

echo [INFO] Zistene prostredie:
echo        - Node.js: !NODE_VERSION!
echo        - npm:     !NPM_VERSION!
echo.

:: 2. Instalacia zavislosti pre SERVER
echo ----------------------------------------------------------------------
echo [1/2] Instalujem zavislosti pre Backend SERVER (kod/nova_implementacia/server)...
echo ----------------------------------------------------------------------
cd /d "%~dp0..\nova_implementacia\server"
if not exist "package.json" (
    color 0C
    echo [CHYBA] Subor package.json pre server sa nenasiel v:
    echo %CD%
    pause
    exit /b 1
)

call npm install
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Instalacia npm zavislosti pre server zlyhala!
    pause
    exit /b 1
)
echo [OK] Zavislosti servera uspesne nainstalovane.
echo.

:: 3. Instalacia zavislosti a zostavenie KLIENTA (Electron + TypeScript)
echo ----------------------------------------------------------------------
echo [2/2] Instalujem zavislosti a zostavujem KLIENTA (kod/nova_implementacia/klient)...
echo ----------------------------------------------------------------------
cd /d "%~dp0..\nova_implementacia\klient"
if not exist "package.json" (
    color 0C
    echo [CHYBA] Subor package.json pre klienta sa nenasiel v:
    echo %CD%
    pause
    exit /b 1
)

call npm install
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Instalacia npm zavislosti pre klienta zlyhala!
    pause
    exit /b 1
)

echo.
echo [INFO] Prekladam TypeScript kod klienta (npm run build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Zostavenie TypeScriptu klienta zlyhalo!
    pause
    exit /b 1
)
echo [OK] Klient uspesne zostaveny do dist/.
echo.

:: 4. Dokoncenie
cd /d "%~dp0"
color 0A
echo ======================================================================
echo    VSETKY ZAVISLOSTI BOLI USPESNE NAINSTALOVANE A ZOSTAVENE!
echo ======================================================================
echo Teraz mozete aplikaciu spustit jednym z nasledujucich sposobov:
echo   - SPUSTIT_VSETKO_LOKALNE.bat (odporucane: server + web konzola)
echo   - 2_SPUSTIT_SERVER.bat       (samotny HTTPS server)
echo   - 3_SPUSTIT_KLIENTA.bat      (samotny Electron emulator)
echo ======================================================================
echo.
pause
