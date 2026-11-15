@echo off
chcp 65001 >nul
cd /d "%~dp0kod\spustenie_lokalne"
call SPUSTIT_VSETKO_LOKALNE.bat
