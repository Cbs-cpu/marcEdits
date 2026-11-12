@echo off
chcp 65001 >nul
title Instalar Marc Edits
cd /d "%~dp0"
echo.
echo  Instalando Marc Edits y todo lo que necesita...
echo  (la primera vez tarda 10-20 minutos; no cierres esta ventana)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
echo.
pause
