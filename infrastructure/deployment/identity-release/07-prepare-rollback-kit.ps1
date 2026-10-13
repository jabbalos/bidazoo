# Builds the ready-to-use ROLLBACK KIT in C:\BidaZoo-release\rollback-kit. Read-only against the live stack:
# it READS run-api.cmd, run-caddy.cmd and Caddyfile.beta and WRITES modified COPIES under C:\BidaZoo-release.
# Nothing is copied over a live file by this script. The rollback checklist does that, by hand, if ever needed.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '07-prepare-rollback-kit'

$tree = "$R\trees\rollback"
if (-not (Test-Path "$tree\apps\api\dist\server.js")) { throw 'Build and prove the rollback tree first (01 -Name rollback, then 05).' }
$kit = "$R\rollback-kit"
$apiCmd = Get-Content -LiteralPath "$Beta\bin\run-api.cmd" -Raw
$caddyFile = Get-Content -LiteralPath "$Beta\config\Caddyfile.beta" -Raw
$liveApiDir = 'C:\BidaZoo-beta\app\apps\api'
$liveDist = 'C:/BidaZoo-beta/app/apps/play/dist'
Rec 'live run-api.cmd points at the live app folder' ($apiCmd.Contains($liveApiDir))
Rec 'live Caddyfile.beta serves the live dist folder' ($caddyFile.Contains($liveDist))
$apiNew = $apiCmd.Replace($liveApiDir, "$tree\apps\api")
$caddyNew = $caddyFile.Replace($liveDist, ("$tree\apps\play\dist").Replace('\', '/'))
Set-Content -LiteralPath "$kit\run-api.rollback.cmd" -Value $apiNew -Encoding ASCII
Set-Content -LiteralPath "$kit\Caddyfile.beta.rollback" -Value $caddyNew -Encoding ASCII
Copy-Item -LiteralPath "$Beta\bin\run-api.cmd" -Destination "$kit\run-api.cmd.current-copy" -Force
Copy-Item -LiteralPath "$Beta\config\Caddyfile.beta" -Destination "$kit\Caddyfile.beta.current-copy" -Force
Rec 'rollback run-api.cmd differs only in the app path' ($apiNew -ne $apiCmd)
Rec 'rollback Caddyfile differs only in the dist path' ($caddyNew -ne $caddyFile)
$v = Run-Native "$Beta\bin\caddy.exe" @('validate', '--config', "$kit\Caddyfile.beta.rollback", '--adapter', 'caddyfile') -LogName 'caddy-validate-rollback-kit'
Rec 'rollback Caddyfile validates with the beta caddy.exe (nothing started)' ($v.Code -eq 0)
Note "Kit files are in $kit :"
Get-ChildItem $kit | ForEach-Object { Write-Host ("      {0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.Substring(0, 12), $_.Name) }
Note 'The rollback API still reads C:\BidaZoo-beta\config\api.env; the old code ignores IDENTITY_* / MAIL_* keys it does not know (proved in 05 for the schema; confirm for env in the checklist step).'
Finish-Release
