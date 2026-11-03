# STEP 0.12 - PROVE the independent 1a106bc rollback tree starts and plays, on alternate ports and scratch DBs.
#   A) 1a106bc API on rehearsal_pre      (today's production code on today's schema)
#   B) 1a106bc API on rehearsal_migrated (OLD code on the NEW schema: proves the additive identity tables
#                                         are harmless to the pre-E application, so rollback never drops them)
# plus a rehearsal Caddy serving the rollback tree's play client and proxying its API.
# Ports: API 3102, Caddy 8481. Nothing live is touched.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '05-rollback-proof'

$tree = "$ReleaseRoot\trees\rollback"
if (-not (Test-Path "$tree\apps\api\dist\server.js")) { throw 'Build the rollback tree first: 01-build-tree.ps1 -Name rollback' }
$h = (Run-Native 'git' @('-C', $tree, 'rev-parse', 'HEAD')).Out[0]
Rec 'rollback tree is exactly 1a106bc' ($h -eq $ShaRollback) $h
Start-ScratchCluster

foreach ($db in 'rehearsal_pre', 'rehearsal_migrated') {
    Write-Host "`n=== 1a106bc rollback tree against $db ==="
    $p = Start-RehearsalApi -Name 'rollback-api' -Tree $tree -Port 3102 -Db $db
    try {
        $up = Wait-Http 'http://127.0.0.1:3102/health' 40
        Rec "[$db] rollback API answers /health" $up
        if (-not $up) { Get-Content "$ReleaseRoot\logs\rollback-api.err.log" -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "      $_" }; Finish-Release }
        Rec "[$db] rollback API /ready is 200 (database reachable)" ((Get-Status 'http://127.0.0.1:3102/ready') -eq 200)
        Rec "[$db] identity routes absent in the old code (404)" ((Get-Status 'http://127.0.0.1:3102/api/v1/guardian/email-links' 'POST' @{ Origin = 'http://127.0.0.1:3102' } '{"email":"a@example.test"}') -eq 404)
        $pt = Invoke-Playthrough -Tree $tree -Port 3102 -Db $db -LogName "rollback-playthrough-$db"
        Rec-Playthrough $pt "[$db] 1a106bc"
        if ($db -eq 'rehearsal_pre') {
            $cd = Start-RehearsalCaddy -Name 'rollback-caddy' -Port 8481 -ApiPort 3102 -DistDir "$tree\apps\play\dist"
            try {
                Start-Sleep -Seconds 2
                $hdr = @('--host', 'play.bidazoo.com', '--cf-https', '--hdr', 'CF-Connecting-IP: 203.0.113.9')
                $root = Probe 8481 'GET' '/' $hdr
                Rec 'rollback client served through Caddy (200 + client CSP)' ((Probe-Status $root) -eq 200 -and (($root -join ' ') -match "script-src 'self'"))
                $me = Probe 8481 'GET' '/api/v1/me' $hdr
                Rec 'rollback API reachable through Caddy (401 for a guest-less /me)' ((Probe-Status $me) -eq 401)
                $api = ($me -join ' ')
                Rec 'API response keeps the API CSP (default-src none), not the client policy' ($api -match "default-src 'none'" -and $api -notmatch "script-src 'self'")
                $plain = Probe 8481 'GET' '/' @('--host', 'play.bidazoo.com')
                # The LIVE Caddyfile.beta has no CF-Visitor redirect rule (rehearsal Caddyfiles are derived from it), so a plain request is served, not redirected.
                $plainHasRule = (Get-LiveCaddyfileText) -match 'CF-Visitor'
                $expectPlain = if ($plainHasRule) { 308 } else { 200 }
                Rec "request without CF-Visitor behaves as the live Caddyfile does (expect $expectPlain)" ((Probe-Status $plain) -eq $expectPlain) "status=$(Probe-Status $plain)"

            } finally { Stop-Tracked 'rollback-caddy' }
        }
    } finally { Stop-Tracked 'rollback-api' }
    Rec "[$db] rollback API stopped" (-not (Test-Listening 3102))
}
Write-Host ''
Note 'Rollback tree location (do NOT move it; npm workspace links may be absolute): C:\BidaZoo-release\trees\rollback'
Note 'Next: 07-prepare-rollback-kit.ps1 builds the ready-to-copy run-api / Caddyfile variants that point at this tree.'
Finish-Release
