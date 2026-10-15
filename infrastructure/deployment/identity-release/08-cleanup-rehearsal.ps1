# Stops rehearsal processes (by recorded PID) and, only when asked, removes scratch databases / the scratch cluster.
# It NEVER deletes: backups, the rollback tree, the stage tree, the rollback kit, or anything under C:\BidaZoo-beta.
#   -DropRehearsalDbs        drops rehearsal_pre and rehearsal_migrated
#   -DropDb <name>           drops one named scratch DB (rehearsal_*, verify_*, final_verify_*)
#   -StopScratchCluster      stops the scratch PostgreSQL
#   -RemoveRehearsalMail     deletes the file-mail outbox of fake rehearsal messages
param([switch]$DropRehearsalDbs, [string]$DropDb = '', [switch]$StopScratchCluster, [switch]$RemoveRehearsalMail)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '08-cleanup-rehearsal'
foreach ($n in 'rollback-api', 'rollback-caddy', 'stage-api-off', 'stage-api-mailonly', 'stage-api-nomail', 'stage-api-id', 'stage-caddy', 'm6-api', 'm6-caddy') { Stop-Tracked $n }
Rec 'rehearsal ports free (3102-3105, 8481, 8482)' (-not ((3102, 3103, 3104, 3105, 8481, 8482) | Where-Object { Test-Listening $_ }))
if ($DropRehearsalDbs) { Start-ScratchCluster; foreach ($d in 'rehearsal_pre', 'rehearsal_migrated') { [void](Scr-Q 'postgres' "drop database if exists $d with (force)") }; Note 'rehearsal databases dropped' }
if ($DropDb -ne '') { Start-ScratchCluster; if ($DropDb -notmatch '^(rehearsal_|verify_|final_verify_)[a-z0-9_]+$') { throw 'not a scratch database name' }; [void](Scr-Q 'postgres' "drop database if exists $DropDb with (force)"); Note "dropped $DropDb" }
if ($StopScratchCluster) { Stop-ScratchCluster; Rec 'scratch cluster stopped' (-not (Test-Listening $ScratchPort)) }
if ($RemoveRehearsalMail -and (Test-Path "$ReleaseRoot\run\mail-outbox")) { Remove-Item "$ReleaseRoot\run\mail-outbox" -Recurse -Force; Note 'rehearsal mail outbox removed' }
Rec 'live stack untouched by this script' $true
Finish-Release
