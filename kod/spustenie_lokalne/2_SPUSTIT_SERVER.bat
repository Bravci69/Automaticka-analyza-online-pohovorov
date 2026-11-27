@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Lokalny Server a Databaza
color 0B

echo ======================================================================
echo    LOKALNY BACKEND SERVER - AUTOMATICKA ANALYZA ONLINE POHOVOROV
echo    Node.js HTTPS Server + SQLite DB + Real-time SSE Stream
echo ======================================================================
echo.

:: 1. Kontrola Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [CHYBA] Node.js nie je nainstalovany alebo nie je v premennej PATH!
    echo Prosim, nainstalujte Node.js verzia 22+: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Prechod do priecinka servera
cd /d "%~dp0..\nova_implementacia\server"

:: 3. Kontrola zavislosti
if not exist "node_modules\nodemailer" (
    echo [INFO] Zavislosti servera neboli najdene. Spustam automaticku instalaciu...
    call npm install
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [CHYBA] Instalacia zavislosti zlyhala.
        pause
        exit /b 1
    )
    echo [OK] Zavislosti uspesne pripravene.
    echo.
)

:: 4. Zistenie portu z config.json alebo default 13191
set PORT=13191
for /f "usebackq delims=" %%p in (`node -e "try{const f=require('fs').readFileSync('config.json','utf8').replace(/^\uFEFF/,'');console.log(JSON.parse(f).port||13191)}catch{console.log(13191)}"`) do set PORT=%%p

echo [INFO] Spustam zabezpeceny HTTPS server na: https://localhost:!PORT!
echo.
echo [PRIHLASOVACIE UDAJE DO HR KONZOLY]:
echo   1. Superadmin:  login: autworld       heslo: Captain99@
echo   2. Admin:        login: admin          heslo: admin
echo.
echo [UPOZORNENIE PRE PREHLIADAC]:
echo   Prehliadac zobrazi bezpecnostne upozornenie na lokalny SSL certifikat.
echo   Kliknite na "Rozsirene" -^> "Pokracovat na localhost (nebezpecne)".
echo ======================================================================
echo.

:: 5. Otvorenie prehliadaca na pozadi po 2 sekundach
start "" cmd /c "timeout /t 2 /nobreak >nul & start https://localhost:!PORT!/admin.html"

:: 6. Spustenie samotneho Node.js servera s podporou SQLite
node --experimental-sqlite server.js

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [CHYBA] Server bol ukonceny s chybovym kodom %ERRORLEVEL%.
    pause
)
