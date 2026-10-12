@echo off
rem BidaZoo closed beta - step 0: READ-ONLY preflight. Changes nothing.
rem Relaunches itself as administrator (you are the administrator); arguments are preserved.
rem ASCII only. Writes one log file under %TEMP% and prints it.

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0' -ArgumentList '%*'"
  exit /b
)

set "LOG=%TEMP%\bidazoo-preflight-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Continue';" ^
 "'=== BidaZoo closed-beta preflight (read-only) ===';" ^
 "'--- Ports 3101, 8480, 54340 (must print nothing) ---';" ^
 "Get-NetTCPConnection -LocalPort 3101,8480,54340 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -Auto | Out-String;" ^
 "'--- Existing scheduled tasks that look related (record, do not change) ---';" ^
 "Get-ScheduledTask | Where-Object { $_.TaskName -match 'BidaZoo|cloudflared|Tunnel|Caddy' } | Select-Object TaskName,State | Format-Table -Auto | Out-String;" ^
 "'--- Existing services that look related (record, do not change) ---';" ^
 "Get-Service | Where-Object { $_.Name -match 'cloudflared|caddy' -or $_.DisplayName -match 'Cloudflare|Caddy' } | Select-Object Name,Status | Format-Table -Auto | Out-String;" ^
 "'--- Running cloudflared / caddy processes ---';" ^
 "Get-Process cloudflared,caddy -ErrorAction SilentlyContinue | Select-Object Name,Id,Path | Format-Table -Auto | Out-String;" ^
 "'--- Existing cloudflared certificate (do NOT run tunnel login if present) ---';" ^
 "Test-Path (Join-Path $env:USERPROFILE '.cloudflared\cert.pem');" ^
 "'--- Tooling ---';" ^
 "'node: ' + (& node --version 2>&1); 'git: ' + (& git --version 2>&1);" ^
 "'--- Does C:\BidaZoo-beta already exist? ---';" ^
 "Test-Path 'C:\BidaZoo-beta'" ^
 > "%LOG%" 2>&1

type "%LOG%"
echo.
echo Log saved to %LOG%
echo Nothing was changed. Paste the output back (it contains no secrets).
pause
