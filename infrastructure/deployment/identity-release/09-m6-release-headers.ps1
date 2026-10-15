# STEP 0.14 - M6 RELEASE GATE, rehearsal part: cache and security headers of the EXACT release-candidate build,
# served by a rehearsal Caddy that is derived from the live Caddyfile.beta (only listen/API port, static root and log
# path differ), with the candidate API behind it. Identity stays OFF. Scratch database rehearsal_migrated only.
#   run.bat 09-m6-release-headers.ps1 -CandidateSha <40 lowercase hex>
# Ports: API 3103, Caddy 8482 (the same rehearsal ports step 06 uses; run this after 06 has finished).
# Proves the headers the PROXY RULES produce for this build. It does NOT prove Cloudflare: the same tool must be run
# against the public URL in the maintenance window (MAINTENANCE-WINDOW-CHECKLIST W8).
param([string]$CandidateSha = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
$ShaCandidate = Resolve-Candidate $CandidateSha
Initialize-Release '09-m6-release-headers'
Note "release candidate (immutable input): $ShaCandidate"

$tree = "$ReleaseRoot\trees\stage"
if (-not (Test-Path "$tree\apps\api\dist\server.js")) { throw 'Build the stage tree first: 01-build-tree.ps1 -Name stage -CandidateSha <sha>' }
$h = (Run-Native 'git' @('-C', $tree, 'rev-parse', 'HEAD')).Out[0]
Rec 'stage tree is exactly the release candidate' ($h -ceq $ShaCandidate) $h
Rec 'stage tree has the built play client (apps\play\dist\index.html)' (Test-Path "$tree\apps\play\dist\index.html")
Start-ScratchCluster
$migCount = [int]@(Scr-Q 'rehearsal_migrated' 'select count(*) from pg_class where relname = $$guardians$$')[0]
Rec 'rehearsal_migrated has the identity schema (run 04 first)' ($migCount -ge 1)
if ($migCount -lt 1) { Finish-Release }

$p = Start-RehearsalApi -Name 'm6-api' -Tree $tree -Port 3103 -Db 'rehearsal_migrated'   # production-style env, IDENTITY_SECRET unset
try {
    $up = Wait-Http 'http://127.0.0.1:3103/health' 40
    Rec 'candidate API (identity unset) starts' $up
    if (-not $up) { Get-Content "$ReleaseRoot\logs\m6-api.err.log" -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "      $_" }; Finish-Release }
    Rec 'identity is OFF (guardian sign-in route 404)' ((Get-Status 'http://127.0.0.1:3103/api/v1/guardian/email-links' 'POST' @{ Origin = 'http://127.0.0.1:3103' } '{"email":"a@example.test"}') -eq 404)
    $cd = Start-RehearsalCaddy -Name 'm6-caddy' -Port 8482 -ApiPort 3103 -DistDir "$tree\apps\play\dist"
    try {
        Start-Sleep -Seconds 2
        Write-Host "`n--- M6 header verification (tools\m6-headers.mjs) ---"
        $m6 = Run-Native $NodeExe @("$Tools\m6-headers.mjs", '--base', 'http://127.0.0.1:8482', '--host', 'play.bidazoo.com', '--cf-https') -LogName 'm6-headers-rehearsal'
        $m6.Out | ForEach-Object { Write-Host "      $_" }
        Rec 'M6 (rehearsal, Caddy rules): shell no-cache; hashed assets and character PNGs immutable; nosniff; frame protection; Permissions-Policy; strict CSP; API own CSP + no-store' ($m6.Code -eq 0) "exit=$($m6.Code)"
    } finally { Stop-Tracked 'm6-caddy' }
} finally { Stop-Tracked 'm6-api' }
Rec 'all rehearsal ports released' (-not (Test-Listening 3103) -and -not (Test-Listening 8482))
Note 'NOT proven here: Cloudflare (Browser Cache TTL, Cache Rules, edge header rewrites). Repeat with --base https://play.bidazoo.com in the maintenance window.'
Finish-Release
