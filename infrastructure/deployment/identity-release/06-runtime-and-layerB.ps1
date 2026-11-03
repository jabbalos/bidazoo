# STEP 0.13 (rehearsal part) - the exact release-candidate build, on scratch, proving:
#   run.bat 06-runtime-and-layerB.ps1 -CandidateSha <40 lowercase hex>
#  1. identity stays OFF unless IDENTITY_SECRET is set (nothing turns on by deploying the runtime)
#  2. production + IDENTITY_SECRET without SMTP refuses to start (cannot half-enable identity)
#  3. LAYER B: real identity throttling behind a rehearsal Caddy that mirrors Caddyfile.beta
# Ports: API 3103 / 3104 / 3105, Caddy 8482. Scratch DB rehearsal_migrated only.
param([string]$CandidateSha = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
$ShaCandidate = Resolve-Candidate $CandidateSha
Initialize-Release '06-runtime-and-layerB'
Note "release candidate (immutable input): $ShaCandidate"

$tree = "$ReleaseRoot\trees\stage"
if (-not (Test-Path "$tree\apps\api\dist\server.js")) { throw 'Build the stage tree first: 01-build-tree.ps1 -Name stage' }
$h = (Run-Native 'git' @('-C', $tree, 'rev-parse', 'HEAD')).Out[0]
Rec 'stage tree is exactly the release candidate' ($h -ceq $ShaCandidate) $h
Start-ScratchCluster
$migCount = [int]@(Scr-Q 'rehearsal_migrated' 'select count(*) from pg_class where relname = $$guardians$$')[0]
Rec 'rehearsal_migrated has the identity schema (run 04 first)' ($migCount -ge 1)
if ($migCount -lt 1) { Finish-Release }

$secret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })   # throwaway, rehearsal only, never printed

Write-Host "`n=== 1. production-style settings, identity OFF (the state right after the application release) ==="
$p = Start-RehearsalApi -Name 'stage-api-off' -Tree $tree -Port 3103 -Db 'rehearsal_migrated'
try {
    $up = Wait-Http 'http://127.0.0.1:3103/health' 40
    Rec 'candidate API (identity unset) starts' $up
    if (-not $up) { Get-Content "$ReleaseRoot\logs\stage-api-off.err.log" -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "      $_" }; Finish-Release }
    Rec '/ready is 200' ((Get-Status 'http://127.0.0.1:3103/ready') -eq 200)
    Rec 'guardian sign-in route does NOT exist (404): identity is off' ((Get-Status 'http://127.0.0.1:3103/api/v1/guardian/email-links' 'POST' @{ Origin = 'http://127.0.0.1:3103' } '{"email":"a@example.test"}') -eq 404)
    $pt = Invoke-Playthrough -Tree $tree -Port 3103 -Db 'rehearsal_migrated' -LogName 'stage-playthrough-off'
    Rec-Playthrough $pt 'candidate guest-only'
} finally { Stop-Tracked 'stage-api-off' }

Write-Host "`n=== 1b. mail settings present but IDENTITY_SECRET unset: identity must still be OFF ==="
$extra = @{ MAIL_TRANSPORT = 'smtp'; MAIL_FROM = 'no-reply@notify.bidazoo.com'; MAIL_FROM_NAME = 'BidaZoo'; MAIL_SMTP_HOST = 'smtp.invalid'; MAIL_SMTP_PORT = '587'; MAIL_SMTP_SECURITY = 'starttls'; MAIL_SMTP_USER = 'x'; MAIL_SMTP_PASSWORD = 'x'; PUBLIC_BASE_URL = 'https://play.bidazoo.com' }
$p = Start-RehearsalApi -Name 'stage-api-mailonly' -Tree $tree -Port 3103 -Db 'rehearsal_migrated' -Extra $extra
try {
    $up = Wait-Http 'http://127.0.0.1:3103/health' 40
    Rec 'starts with mail settings but no IDENTITY_SECRET' $up
    if ($up) { Rec 'identity still OFF (sign-in route 404)' ((Get-Status 'http://127.0.0.1:3103/api/v1/guardian/email-links' 'POST' @{ Origin = 'http://127.0.0.1:3103' } '{"email":"a@example.test"}') -eq 404) }
} finally { Stop-Tracked 'stage-api-mailonly' }

Write-Host "`n=== 2. IDENTITY_SECRET set in production WITHOUT working mail config: must refuse to start ==="
$extra = @{ IDENTITY_SECRET = $secret; PUBLIC_BASE_URL = 'https://play.bidazoo.com' }
$p = Start-RehearsalApi -Name 'stage-api-nomail' -Tree $tree -Port 3105 -Db 'rehearsal_migrated' -Extra $extra
$p.WaitForExit(15000) | Out-Null
Rec 'API exits instead of running half-configured' ($p.HasExited -and $p.ExitCode -ne 0) "exited=$($p.HasExited) code=$(if ($p.HasExited) { $p.ExitCode })"
$err = (Get-Content "$ReleaseRoot\logs\stage-api-nomail.err.log" -Raw -ErrorAction SilentlyContinue)
Rec 'the error names MAIL_TRANSPORT and does not echo the secret' (($err -match 'MAIL_TRANSPORT') -and ($err -notmatch [regex]::Escape($secret)))
Rec 'nothing is listening on 3105' (-not (Test-Listening 3105))
Stop-Tracked 'stage-api-nomail'

Write-Host "`n=== 3. LAYER B: real identity throttling behind a Caddy that mirrors Caddyfile.beta ==="
$cmp = Join-Path $ReleaseRoot 'run\Caddyfile.compare-ref'
$cmpLog = "$ReleaseRoot\logs\caddy-access-compare-ref.log"
$lv = Get-CaddyfileValues (Get-LiveCaddyfileText)
# generate the rehearsal file with the LIVE port/root values (nothing is started), then compare on canonical form
New-RehearsalCaddyfile -Port ([int]$lv.Listen) -ApiPort ([int]$lv.Api) -DistDir $lv.Root -Path $cmp -LogPath $cmpLog
$fid = Compare-RehearsalCaddyfile -RehearsalPath $cmp -Port ([int]$lv.Listen) -ApiPort ([int]$lv.Api) -DistDir $lv.Root -LogPath $cmpLog
Write-Host '      canonical live Caddyfile.beta (approved values replaced by <LISTEN_PORT> <API_PORT> <STATIC_ROOT> <ACCESS_LOG>):'
$fid.Live | ForEach-Object { Write-Host "        $_" }
Rec 'rehearsal Caddyfile is semantically identical to live Caddyfile.beta (canonical, ordered comparison)' $fid.Ok ("$($fid.Diff.Count) unexpected difference(s): " + ($fid.Diff -join ' ; '))
$v = Run-Native "$Beta\bin\caddy.exe" @('validate', '--config', $cmp, '--adapter', 'caddyfile') -LogName 'caddy-validate-compare-ref'
Rec 'rehearsal Caddyfile validates with the beta caddy.exe' ($v.Code -eq 0) "exit=$($v.Code)"
$liveText = Get-LiveCaddyfileText
Note ('live Caddyfile.beta facts: CF-Visitor redirect rule = ' + $(if ($liveText -match 'CF-Visitor') { 'PRESENT' } else { 'ABSENT (plain requests are served, not redirected, by Caddy; HTTPS enforcement is the edge job)' }) + '; X-Forwarded-Host = ' + $(if ($liveText -match 'header_up X-Forwarded-Host play\.bidazoo\.com') { 'fixed literal play.bidazoo.com' } else { 'see canonical text above' }))
New-Item -ItemType Directory -Force -Path "$ReleaseRoot\run\mail-outbox" | Out-Null
$extra = @{ NODE_ENV = 'development'; COOKIE_SECURE = $null; IDENTITY_SECRET = $secret; PUBLIC_BASE_URL = 'http://localhost:5173'; MAIL_TRANSPORT = 'file'; MAIL_OUTBOX_DIR = "$ReleaseRoot\run\mail-outbox"; IDENTITY_RATE_LOGIN_IP_MAX = '3'; IDENTITY_RATE_LOGIN_IP_WINDOW_SECONDS = '600' }
$p = Start-RehearsalApi -Name 'stage-api-id' -Tree $tree -Port 3104 -Db 'rehearsal_migrated' -Extra $extra
try {
    $up = Wait-Http 'http://127.0.0.1:3104/health' 40
    Rec 'identity-ON rehearsal API starts (dev env, FILE mail, scratch DB, TRUST_PROXY=loopback)' $up
    if (-not $up) { Get-Content "$ReleaseRoot\logs\stage-api-id.err.log" -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "      $_" }; Finish-Release }
    $cd = Start-RehearsalCaddy -Name 'stage-caddy' -Port 8482 -ApiPort 3104 -DistDir "$tree\apps\play\dist"
    try {
        Start-Sleep -Seconds 2
        $hdr = @('--host', 'play.bidazoo.com', '--cf-https', '--hdr', 'CF-Connecting-IP: 203.0.113.99')
        Rec 'chain works end to end through Caddy (/api/v1/me -> 401)' ((Probe-Status (Probe 8482 'GET' '/api/v1/me' $hdr)) -eq 401)
        $lb = Run-Native $NodeExe @("$Tools\layerB.mjs", '--caddy-port', '8482', '--max', '3') -LogName 'layerB'
        $lb.Out | ForEach-Object { Write-Host "      $_" }
        Rec 'LAYER B (rehearsal): per-IP throttling keys on the real visitor and ignores forged headers' ($lb.Code -eq 0)
    } finally { Stop-Tracked 'stage-caddy' }
} finally { Stop-Tracked 'stage-api-id' }
$mails = @(Get-ChildItem "$ReleaseRoot\run\mail-outbox" -ErrorAction SilentlyContinue).Count
Note "file-mail outbox now holds $mails rehearsal message(s) to example.test addresses (scratch only; removed by 08-cleanup)"
Rec 'all rehearsal ports released' (-not (Test-Listening 3103) -and -not (Test-Listening 3104) -and -not (Test-Listening 3105) -and -not (Test-Listening 8482))
Note 'LAYER B limits: this proves the application + a Caddy built from the same rules. The SAME checks must still be repeated through the real Cloudflare path in the maintenance window (see checklist).'
Finish-Release
