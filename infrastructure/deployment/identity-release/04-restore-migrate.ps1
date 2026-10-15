# STEP 0.7-0.10 - restore the REHEARSAL dump into scratch, apply migrations 0003/0004 to a copy, verify.
#   rehearsal_pre      = pure restore (the pre-migration reference, also used by the rollback proof)
#   rehearsal_migrated  = restore + `npm run db:migrate` from the exact a283c24 tree
# Touches only the scratch cluster (54341). The live database is not read here at all.
param([string]$Dump = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '04-restore-migrate'

if ($Dump -eq '') {
    $latest = Get-ChildItem "$ReleaseRoot\rehearsal-backups\rehearsal-*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw 'No rehearsal dump found. Run 03-backup-verify.ps1 -Mode Rehearsal first.' }
    $Dump = $latest.FullName
}
Note "using dump $Dump"
Note ("dump sha256: " + (Get-FileHash -LiteralPath $Dump -Algorithm SHA256).Hash)
$tree = "$ReleaseRoot\trees\stage"
if (-not (Test-Path "$tree\database\migrations")) { throw 'Build the stage tree first: 01-build-tree.ps1 -Name stage' }
$h = (Run-Native 'git' @('-C', $tree, 'rev-parse', 'HEAD')).Out[0]
Rec 'stage tree is exactly a283c24' ($h -eq $ShaStage) $h

Start-ScratchCluster
foreach ($db in 'rehearsal_pre', 'rehearsal_migrated') {
    New-ScratchDb $db
    $rs = Restore-Dump -Dump $Dump -Db $db
    Rec "restore into $db" ($rs.Code -eq 0) "exit=$($rs.Code)"
    if ($rs.Code -ne 0) { Show-Tail $rs; Finish-Release }
}
$preQ = { param($s) Scr-Q 'rehearsal_pre' $s }
$migQ = { param($s) Scr-Q 'rehearsal_migrated' $s }
Write-Host "`n--- BEFORE migration: rehearsal_pre fingerprint ---"
$fpPre = Get-Fingerprint $preQ; Show-Fingerprint $fpPre
$fpMig0 = Get-Fingerprint $migQ
Rec 'the two restores are identical before migrating' ((($fpPre.Keys | ForEach-Object { "$_=$($fpPre[$_])" }) -join ';') -eq (($fpMig0.Keys | ForEach-Object { "$_=$($fpMig0[$_])" }) -join ';'))
$mBefore = [int]@(& $migQ 'select count(*) from drizzle.__drizzle_migrations')[0]
Note "drizzle migration rows before: $mBefore"

Write-Host "`n--- apply migrations to rehearsal_migrated (exact a283c24 tree) ---"
$pw = Read-Secret "$ReleaseRoot\secrets\pg-scratch.pw"
$url = "postgres://bidazoo_app:$pw@127.0.0.1:$ScratchPort/rehearsal_migrated"   # same non-superuser role production uses
if ($url -notmatch ":$ScratchPort/rehearsal_migrated$") { throw 'refusing: DATABASE_URL is not the scratch database' }
$env:DATABASE_URL = $url
Push-Location $tree
try { $m = Run-Native 'npm' @('run', 'db:migrate') -LogName 'db-migrate-rehearsal' } finally { Pop-Location; Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
Show-Tail $m 8
Rec 'npm run db:migrate completed' ($m.Code -eq 0) "exit=$($m.Code)"
if ($m.Code -ne 0) { Finish-Release }
$mAfter = [int]@(& $migQ 'select count(*) from drizzle.__drizzle_migrations')[0]
Rec 'exactly two migrations were applied (0003, 0004)' (($mAfter - $mBefore) -eq 2) "before=$mBefore after=$mAfter"

Write-Host "`n--- AFTER migration: schema objects ---"
$newTables = Test-IdentitySchema -Q $migQ -MigrationsDir "$tree\database\migrations"

Write-Host "`n--- AFTER migration: pre-E data intact? ---"
$fpPost = Get-Fingerprint $migQ; Show-Fingerprint $fpPost
$bad = @()
foreach ($k in $fpPre.Keys) {
    if ($k -match 'migrat') { continue }
    if (-not $fpPost.Contains($k) -or $fpPost[$k] -ne $fpPre[$k]) { $bad += $k }
}
Rec 'every pre-E table has identical row count AND content after migrating' ($bad.Count -eq 0) ($bad -join ',')
$added = @($fpPost.Keys | Where-Object { -not $fpPre.Contains($_) } | ForEach-Object { ($_ -replace '^public\.', '') })
$expected = @($newTables)
Rec 'the only new tables are the declared identity tables' ((($added | Sort-Object) -join ',') -eq (($expected | Sort-Object) -join ',')) "new=$($added.Count)"
$nonEmpty = @($newTables | Where-Object { [int]@(& $migQ "select count(*) from public.$_")[0] -ne 0 })
Rec 'new identity tables start empty (no identity data created by migrating)' ($nonEmpty.Count -eq 0) ($nonEmpty -join ',')
$fk = @(& $migQ "select count(*) from pg_constraint where conname='child_profiles_player_id_players_id_fk'")[0]
Rec 'child_profiles -> players foreign key present (additive link into existing data)' ([int]$fk -eq 1)
Note 'Databases rehearsal_pre and rehearsal_migrated are KEPT for the rollback proof (05) and runtime proof (06).'
Finish-Release
