@echo off
rem BidaZoo Studio PC validation launcher.
rem Runs scripts\validate-studio.ps1 from the repository root as the CURRENT user (no elevation)
rem and forwards every argument unchanged, for example:
rem   validate-studio.bat -Cleanup
rem   validate-studio.bat -Recreate -Cleanup
rem   validate-studio.bat -PgHost localhost -PgPort 5432 -PgUser postgres
rem Paths with spaces are handled by the quoting below.

pushd "%~dp0.." || (
  echo Could not change to the repository root.
  exit /b 2
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate-studio.ps1" %*
set "RC=%ERRORLEVEL%"
popd

echo.
echo validate-studio finished with exit code %RC%.
pause
exit /b %RC%
