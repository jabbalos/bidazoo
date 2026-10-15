# READ-ONLY (SELECT only) check of the LIVE database AFTER the live migration.
# -BaselineDb is the verify DB kept by `03-backup-verify.ps1 -Mode Final` (the exact pre-migration state).
param([Parameter(Mandatory = $true)][string]$BaselineDb, [string]$CandidateSha = '', [string]$MigrationsDir = 'C:\BidaZoo-beta\app\database\migrations')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
$ShaCandidate = Resolve-Candidate $CandidateSha
Initialize-Release 'live-verify-migration'
Note "release candidate (immutable input): $ShaCandidate"
if ($BaselineDb -notmatch '^final_verify_|^verify_final_') { throw 'BaselineDb must be the verify database kept by the Final backup run' }
$live = { param($s) Live-Q $s }
$base = { param($s) Scr-Q $BaselineDb $s }.GetNewClosure()
Start-ScratchCluster
$gotHead = (Run-Native 'git' @('-C', 'C:\BidaZoo-beta\app', 'rev-parse', 'HEAD')).Out[0]
Rec 'live checkout is exactly the release candidate' ($gotHead -ceq $ShaCandidate) $gotHead
$newTables = Test-IdentitySchema -Q $live -MigrationsDir $MigrationsDir
$fpBase = Get-Fingerprint $base; $fpLive = Get-Fingerprint $live
$bad = @(); foreach ($k in $fpBase.Keys) { if ($k -match 'migrat') { continue }; if (-not $fpLive.Contains($k) -or $fpLive[$k] -ne $fpBase[$k]) { $bad += $k } }
Rec 'every pre-E table unchanged (rows and content) versus the pre-migration backup' ($bad.Count -eq 0) ($bad -join ',')
$mb = [int]@(& $base 'select count(*) from drizzle.__drizzle_migrations')[0]; $ml = [int]@(& $live 'select count(*) from drizzle.__drizzle_migrations')[0]
Rec 'exactly two migrations applied to live' (($ml - $mb) -eq 2) "baseline=$mb live=$ml"
$ne = @($newTables | Where-Object { [int]@(& $live "select count(*) from public.$_")[0] -ne 0 })
Rec 'identity tables are empty (identity not in use yet)' ($ne.Count -eq 0) ($ne -join ',')
Finish-Release
