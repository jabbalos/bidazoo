@echo off
rem MAINTENANCE-WINDOW use only (window-guard.ps1, 03-backup-verify.ps1 -Mode Final). Relaunches itself as
rem administrator automatically and passes the arguments through. Do not use it for npm/build steps.
rem   run-admin.bat window-guard.ps1 -Expect Stopped
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "$a='%*'; if ($a) { Start-Process -FilePath '%~f0' -ArgumentList $a -Verb RunAs } else { Start-Process -FilePath '%~f0' -Verb RunAs }"
  exit /b
)
cd /d "%~dp0"
set "SCRIPT=%~1"
if "%SCRIPT%"=="" (
  echo Usage: run-admin.bat ^<script.ps1^> [arguments]
  pause
  exit /b 2
)
shift
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%SCRIPT%" %1 %2 %3 %4 %5 %6 %7 %8 %9
set "RC=%ERRORLEVEL%"
echo.
echo Exit code: %RC%
pause
exit /b %RC%
