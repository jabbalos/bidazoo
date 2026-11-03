@echo off
rem Runs one of the release scripts as the NORMAL user (deliberately not elevated: these wrappers run
rem npm / node / git tooling). Arguments are passed through.
rem   run.bat 01-build-tree.ps1 -Name stage
setlocal
set "SCRIPT=%~1"
if "%SCRIPT%"=="" (
  echo Usage: run.bat ^<script.ps1^> [arguments]
  exit /b 2
)
shift
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%SCRIPT%" %1 %2 %3 %4 %5 %6 %7 %8 %9
set "RC=%ERRORLEVEL%"
echo.
echo Exit code: %RC%
exit /b %RC%
