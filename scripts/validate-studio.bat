@echo off
rem BidaZoo Studio PC validation launcher. Runs scripts\validate-studio.ps1 from the repo root.
rem Any arguments are passed through, e.g.:  scripts\validate-studio.bat -Cleanup
rem NOTE: the elevation relaunch below cannot carry arguments; to use switches, run this from an
rem already-elevated terminal (then no relaunch happens).

rem --- Relaunch as administrator automatically if not already elevated ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

rem --- Run from the repository root (the parent of this scripts folder) ---
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate-studio.ps1" %*
set "RC=%ERRORLEVEL%"
popd

echo.
echo validate-studio finished with exit code %RC%.
pause
exit /b %RC%
