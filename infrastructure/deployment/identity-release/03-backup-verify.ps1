# STEP 0.6-0.8 (Rehearsal) and the FINAL pre-cutover backup (Final). Same verification either way:
# pg_dump -Fc -> pg_restore --list -> restore into a scratch DB -> table/row/content comparison -> SHA-256.
#
#   -Mode Rehearsal   dump goes to C:\BidaZoo-release\rehearsal-backups. NOT the rollback anchor. Live may drift.
#   -Mode Final       MAINTENANCE WINDOW ONLY. Refuses to run unless beta API/Caddy are fully stopped.
#                     dump goes to C:\BidaZoo-beta\backups-release (outside nightly retention) and must be
#                     copied OFF this PC (-OffPcDestination) and re-hashed there before the gate opens.
# The dump never deletes anything. Existing backups are never touched. The live DB is only read.
param(
    [ValidateSet('Rehearsal', 'Final')][string]$Mode = 'Rehearsal',
    [string]$OffPcDestination = '',
    [switch]$AcceptSyncedLocalFolder
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release "03-backup-$Mode"
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not (Test-Listening $LivePort)) { throw 'Live PostgreSQL (54340) is not listening; cannot take a backup.' }
Start-ScratchCluster

if ($Mode -eq 'Final') {
    Rec 'running elevated (needed to see SYSTEM-owned beta processes)' (Test-Admin)
    Rec 'port 8480 (beta Caddy) is NOT listening' (-not (Test-Listening 8480))
    Rec 'port 3101 (beta API) is NOT listening' (-not (Test-Listening 3101))
    $procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'BidaZoo-beta\\(app|bin\\run-(api|caddy)|config\\(api\.env|Caddyfile)') })
    Rec 'no beta API/Caddy process or restart-loop remains' ($procs.Count -eq 0) (($procs | ForEach-Object { "$($_.Name)#$($_.ProcessId)" }) -join ', ')
    if ($OffPcDestination -eq '') { throw '-OffPcDestination is required in Final mode (a path that is NOT on this PC).' }
    if (-not (Test-Path -LiteralPath $OffPcDestination)) { throw "Off-PC destination not found: $OffPcDestination" }
    $drive = (Get-Item -LiteralPath $OffPcDestination).PSDrive.Name + ':'
    $ld = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"
    $isUnc = $OffPcDestination.StartsWith('\\')
    $offBox = $isUnc -or ($ld -and ($ld.DriveType -eq 4 -or $ld.DriveType -eq 2))
    if (-not $offBox) {
        Write-Host "WARNING: $OffPcDestination is on a fixed local disk. That is NOT off the Studio PC unless it is a folder that syncs elsewhere."
        if (-not $AcceptSyncedLocalFolder) { throw 'Refusing. Use a network/removable destination, or re-run with -AcceptSyncedLocalFolder after confirming the sync has completed.' }
    }
    if (@($Results | Where-Object { -not $_.Ok }).Count -gt 0) { Finish-Release }
    $dir = "$Beta\backups-release"; $prefix = 'prerelease-identity'
} else {
    $dir = "$ReleaseRoot\rehearsal-backups"; $prefix = 'rehearsal'
}
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dump = Join-Path $dir "$prefix-$ts.dump"
if (Test-Path -LiteralPath $dump) { throw "Refusing to overwrite $dump" }

$liveQ = { param($s) Live-Q $s }
Write-Host "`n--- live fingerprint BEFORE dump (SELECT only) ---"
$fpBefore = Get-Fingerprint $liveQ; Show-Fingerprint $fpBefore

$env:PGPASSWORD = Read-Secret "$Beta\config\pg-app.pw"
try { $NativeResult = Run-Native "$PgBin\pg_dump.exe" @('-h', '127.0.0.1', '-p', "$LivePort", '-U', 'bidazoo_app', '-Fc', '-f', $dump, 'bidazoo') -LogName "pg_dump-$Mode" }
finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
$size = 0; if (Test-Path -LiteralPath $dump) { $size = (Get-Item -LiteralPath $dump).Length }
Rec 'pg_dump -Fc succeeded' (($NativeResult.Code -eq 0) -and ($size -gt 1024)) "exit=$($NativeResult.Code) bytes=$size"
if ($NativeResult.Code -ne 0) { Show-Tail $NativeResult; Finish-Release }

$fpAfter = Get-Fingerprint $liveQ
if ($Mode -eq 'Final') { Rec 'live data unchanged between fingerprint and dump (no writes)' ((($fpBefore.Keys | ForEach-Object { "$_=$($fpBefore[$_])" }) -join ';') -eq (($fpAfter.Keys | ForEach-Object { "$_=$($fpAfter[$_])" }) -join ';')) }

$toc = Run-Native "$PgBin\pg_restore.exe" @('--list', $dump)
Rec 'pg_restore --list reads the dump' ($toc.Code -eq 0) "entries=$($toc.Out.Count)"
$sha = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash
"$sha  $(Split-Path $dump -Leaf)" | Set-Content -LiteralPath "$dump.sha256" -Encoding ASCII
Write-Host "      dump   : $dump"; Write-Host "      bytes  : $size"; Write-Host "      sha256 : $sha"

$vdb = "verify_${Mode}_$($ts -replace '-','')".ToLower()
New-ScratchDb $vdb
$rs = Restore-Dump -Dump $dump -Db $vdb
Rec "restore into scratch database $vdb" ($rs.Code -eq 0) "exit=$($rs.Code)"
if ($rs.Code -ne 0) { Show-Tail $rs; Finish-Release }
$scrQ = { param($s) Scr-Q $vdb $s }.GetNewClosure()
$fpScr = Get-Fingerprint $scrQ
Write-Host "`n--- restored fingerprint ---"; Show-Fingerprint $fpScr
Rec 'table lists identical (live vs restored)' ((($fpBefore.Keys) -join ',') -eq (($fpScr.Keys) -join ',') -and $fpScr.Count -gt 0) "tables=$($fpScr.Count)"
$cm = @(); $hm = @()
foreach ($k in $fpBefore.Keys) {
    $a = $fpBefore[$k].Split('|'); $b = $fpScr[$k].Split('|')
    if ($a[0] -ne $b[0]) { $cm += $k } elseif ($a[1] -ne $b[1]) { $hm += $k }
}
if ($Mode -eq 'Final') {
    Rec 'row counts identical for every table' ($cm.Count -eq 0) ($cm -join ',')
    Rec 'row CONTENT checksums identical for every table' ($hm.Count -eq 0) ($hm -join ',')
} else {
    Rec 'row counts match live (rehearsal tolerates live drift)' $true $(if ($cm.Count -eq 0 -and $hm.Count -eq 0) { 'identical' } else { "drift in: " + (($cm + $hm) -join ',') })
}
Rec 'drizzle migrations table present' (@($fpScr.Keys | Where-Object { $_ -match 'migrat' }).Count -ge 1)

if ($Mode -eq 'Final') {
    $dst = Join-Path $OffPcDestination (Split-Path $dump -Leaf)
    if (Test-Path -LiteralPath $dst) { throw "Refusing to overwrite $dst" }
    Copy-Item -LiteralPath $dump -Destination $dst
    Copy-Item -LiteralPath "$dump.sha256" -Destination "$dst.sha256"
    $dsha = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
    Rec 'OFF-PC copy hash equals source hash' ($dsha -eq $sha) "dest=$dst"
    Write-Host "      dest sha256: $dsha"
    Note "Keep scratch database '$vdb' until the post-migration comparison (live-verify-migration.ps1 -BaselineDb $vdb) is done."
} else {
    [void](Scr-Q 'postgres' "drop database if exists $vdb with (force)")
    Note 'rehearsal verification database dropped (evidence is in the transcript)'
}
$fails = @($Results | Where-Object { -not $_.Ok }).Count
if ($Mode -eq 'Final') { if ($fails -eq 0) { Write-Host "`nMIGRATION GATE: OPEN (backup proven, restored, hashed, copied off-PC and re-hashed)" } else { Write-Host "`nMIGRATION GATE: CLOSED - do not migrate" } }
Finish-Release
