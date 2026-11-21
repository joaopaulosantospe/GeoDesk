@echo off
REM ==================================================================
REM [LEGADO - NAO USAR EM NOVOS RELEASES]
REM Pipeline antigo: electron-packager + Inno Setup.
REM O empacotamento atual e o electron-builder (electron-builder.yml,
REM script npm "dist:win"). Mantido apenas como reserva.
REM ==================================================================
chcp 65001 >nul
setlocal
title GeoDesk - Gerador do Instalador Windows
cd /d "%~dp0"

echo =======================================================
echo          GeoDesk - Gerador do Instalador Windows (.exe)
echo =======================================================
echo.

REM ------------------------------------------------------------------
REM Versao da aplicacao: o package.json e a fonte unica de verdade.
REM O valor e passado ao Inno Setup via /DMyAppVersion=...
REM ------------------------------------------------------------------
for /f "usebackq delims=" %%v in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw 'package.json' | ConvertFrom-Json).version"`) do set "APPVER=%%v"
if not defined APPVER set "APPVER=1.0.0"
echo Versao detectada no package.json: %APPVER%
echo.

echo [1/2] Compilando frontend (Vite) e gerando pacote standalone (Electron Packager)...
call npm run package:win
if %errorlevel% neq 0 (
    echo [ERRO] Falha na geracao do pacote executavel!
    pause
    exit /b %errorlevel%
)

if not exist "dist-win\GeoDesk-win32-x64\GeoDesk.exe" (
    echo [ERRO] GeoDesk.exe nao foi encontrado em dist-win\GeoDesk-win32-x64!
    pause
    exit /b 1
)

echo.
echo [2/2] Compilando instalador com Inno Setup...

REM Procura o ISCC.exe - Inno Setup 7 tem prioridade sobre o 6
set "ISCC="
if exist "%LocalAppData%\Programs\Inno Setup 7\ISCC.exe" set "ISCC=%LocalAppData%\Programs\Inno Setup 7\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 7\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 7\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles(x86)%\Inno Setup 7\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 7\ISCC.exe"
if not defined ISCC if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
    echo [AVISO] Compilador Inno Setup ^(6.3+ ou 7.x^) nao foi encontrado.
    echo.
    echo O pacote standalone ja esta pronto para uso em:
    echo   dist-win\GeoDesk-win32-x64\GeoDesk.exe
    echo.
    echo Para gerar o instalador .exe:
    echo   1. Instale o Inno Setup gratuito: https://jrsoftware.org/isdl.php
    echo   2. Abra "installer.iss" e pressione F9 ^(Compile^),
    echo      ou execute novamente este script.
    pause
    exit /b 0
)

echo Inno Setup Compiler: "%ISCC%"
"%ISCC%" /DMyAppVersion=%APPVER% installer.iss
if %errorlevel% neq 0 (
    echo [ERRO] Falha na compilacao do Inno Setup!
    pause
    exit /b %errorlevel%
)

echo.
echo =======================================================
echo [SUCESSO] Instalador gerado com sucesso!
echo Arquivo: dist-installer\GeoDesk_Instalador_v%APPVER%.exe
echo =======================================================
explorer "%~dp0dist-installer"

pause
