@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title [AutWorldBP] Python AI Moduly a Offline Hodnotenia
color 0B

:MENU
cls
echo ======================================================================
echo    PYTHON AI MODULY A HODNOTENIA - BAKALARSKA PRACA
echo    Analyza tvare, reci, mimiky a kombinovane metriky pohovorov
echo ======================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [UPOZORNENIE] Prikaz 'python' sa nenasiel v systemovej ceste PATH.
    echo Pre spustenie Python skriptov je potrebny nainstalovany Python verzia 3.10+:
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version') do set PY_VER=%%v
echo [INFO] Zistena verzia: !PY_VER!
echo.
echo Vyberte akciu:
echo   [1] Spustit kombinovane hodnotenia (kombinovanie_hodnoteni.py)
echo   [2] Spustit hodnotenia reci a tvare (spusti_hodnotenia.py)
echo   [3] Vygenerovat vsetky grafy a metriky (vsetky_grafy.py)
echo   [4] Test audia (test_audio.py)
echo   [5] Test videa (test_videa.py)
echo   [0] Ukoncit
echo ======================================================================
set /p VOLBA="Zadajte cislo volby (0-5) a stlacte Enter: "

if "%VOLBA%"=="1" goto KOMB
if "%VOLBA%"=="2" goto HODN
if "%VOLBA%"=="3" goto GRAFY
if "%VOLBA%"=="4" goto AUDIO
if "%VOLBA%"=="5" goto VIDEO
if "%VOLBA%"=="0" exit /b 0

echo Neplatna volba. Skuste znova.
timeout /t 1 >nul
goto MENU

:KOMB
cls
echo [INFO] Spustam kombinovanie hodnoteni...
cd /d "%~dp0..\stara_implementacia\spustenie_vsetkeho"
python kombinovanie_hodnoteni.py
echo.
pause
goto MENU

:HODN
cls
echo [INFO] Spustam hodnotenia reci a tvare...
cd /d "%~dp0..\stara_implementacia\spustenie_vsetkeho"
python spusti_hodnotenia.py
echo.
pause
goto MENU

:GRAFY
cls
echo [INFO] Generujem grafy a vizualizacie...
cd /d "%~dp0..\stara_implementacia\spustenie_vsetkeho"
python vsetky_grafy.py
echo.
pause
goto MENU

:AUDIO
cls
echo [INFO] Testujem spracovanie audio nahravky...
cd /d "%~dp0..\stara_implementacia"
python test_audio.py
echo.
pause
goto MENU

:VIDEO
cls
echo [INFO] Testujem spracovanie video nahravky...
cd /d "%~dp0..\stara_implementacia"
python test_videa.py
echo.
pause
goto MENU
