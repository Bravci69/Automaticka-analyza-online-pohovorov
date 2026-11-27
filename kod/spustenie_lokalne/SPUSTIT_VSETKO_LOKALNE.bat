@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Rychly Start - Bakalarska Praca
color 0B

echo ======================================================================
echo    HLAVNY SPUSTAC PLATFORMY - BAKALARSKA PRACA
echo    Automaticka analyza online pohovorov (Server, Web ^& Klient)
echo ======================================================================
echo.

:: 1. Kontrola Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Node.js nie je nainstalovany alebo nie je v systemovej ceste PATH!
    echo Pre chod aplikacie si prosim stiahnite a nainstalujte Node.js verzia 22+:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Zisteny Node.js: !NODE_VERSION!

:: 2. Kontrola a priprava zavislosti servera
if not exist "%~dp0..\nova_implementacia\server\node_modules\nodemailer" (
    echo [INFO] Zavislosti servera neboli najdene. Spustam automaticku instalaciu...
    cd /d "%~dp0..\nova_implementacia\server"
    call npm install
    cd /d "%~dp0"
    echo [OK] Zavislosti servera pripravene.
)

:: 3. Kontrola zostavenia klienta
if not exist "%~dp0..\nova_implementacia\klient\dist\main.js" (
    echo [INFO] Zostavenie klienta nebolo najdene. Pripravujem klienta...
    cd /d "%~dp0..\nova_implementacia\klient"
    if not exist "node_modules\electron" call npm install
    call npm run build
    cd /d "%~dp0"
    echo [OK] Klient pripraveny.
)

:: 4. Zistenie portu z config.json
set "PORT=13191"
set "CFG_PATH=%~dp0..\nova_implementacia\server\config.json"
for /f "usebackq tokens=*" %%p in (`node -e "try{const f=require('fs').readFileSync(process.env.CFG_PATH,'utf8').replace(/^\uFEFF/,'');console.log(JSON.parse(f).port||13191)}catch{console.log(13191)}"`) do set "PORT=%%p"

echo.
echo ----------------------------------------------------------------------
echo [KROK 1] Spustam lokalny HTTPS server s SQLite databazou v novom okne...
echo ----------------------------------------------------------------------
start "[AutWorldBP - Server]" /D "%~dp0..\nova_implementacia\server" cmd /k "chcp 65001 >nul && title [AutWorldBP - Server] && node --experimental-sqlite server.js"

echo [KROK 2] Cakam 2 sekundy na inicializaciu servera...
timeout /t 2 /nobreak >nul

echo [KROK 3] Otvaram HR konzolu v predvolenom webovom prehliadaci...
start "" "https://localhost:!PORT!/admin.html"

:PANEL
cls
color 0A
echo ======================================================================
echo    PLATFORMA BOLA USPESNE SPUSTENA NA LOKALNOM POCITACI!
echo ======================================================================
echo.
echo  Webova HR Konzola:  https://localhost:!PORT!/admin.html
echo  Vstupna stranka:    https://localhost:!PORT!/
echo.
echo  [PRIHLASOVACIE UDAJE DO HR KONZOLY]:
echo    * Superadmin:  login: autworld       heslo: Captain99@
echo    * Admin:        login: admin          heslo: admin
echo.
echo  [BEZPECNOSTNE UPOZORNENIE PRE PREHLIADAC]:
echo    Ak prehliadac zobrazi upozornenie na lokalny certifikat:
echo    Kliknite na: "Rozsirene" -^> "Pokracovat na localhost (nebezpecne)".
echo.
echo ======================================================================
echo                       RYCHLE OVLADANIE:
echo ======================================================================
echo   [1] Spustit desktopoveho Electron klienta (emulator pohovoru)
echo   [2] Znova otvorit HR konzolu vo webovom prehliadaci
echo   [3] Spustit automatizovane testy celeho systemu (16 testov)
echo   [4] Otvorit menu Python AI modulov a hodnoteni
echo   [0] Zavriet tento panel (server bezi dalej v samostatnom okne)
echo ======================================================================
set /p CMD="Vasa volba (0-4): "

if "%CMD%"=="1" (
    echo [INFO] Spustam Electron klienta...
    start "[AutWorldBP - Klient]" /D "%~dp0..\nova_implementacia\klient" cmd /c "chcp 65001 >nul && npm start"
    goto PANEL
)

if "%CMD%"=="2" (
    start "" "https://localhost:!PORT!/admin.html"
    goto PANEL
)

if "%CMD%"=="3" (
    echo [INFO] Spustam testovaci suite...
    start "[AutWorldBP - Testy]" /D "%~dp0..\nova_implementacia\database" cmd /k "chcp 65001 >nul && node --experimental-sqlite test_db_and_api.js"
    goto PANEL
)

if "%CMD%"=="4" (
    call "%~dp05_SPUSTIT_AI_MODULY_PYTHON.bat"
    goto PANEL
)

if "%CMD%"=="0" (
    echo Koncim panel. Server bezi vo svojom vlastnom okne.
    timeout /t 1 >nul
    exit /b 0
)

echo Neplatna volba.
timeout /t 1 >nul
goto PANEL
