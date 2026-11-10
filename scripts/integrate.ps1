<#
.SYNOPSIS
  Merge one lane branch into integration/world-expedition with the CI gate (proposal section 7).

.DESCRIPTION
  Steps: git merge --no-ff --no-commit <lane>, typecheck, full Vitest on the integration test database,
  sharded Playwright (npm run test:e2e:sharded). All green: commit the merge with the lane, its tip SHA,
  the files changed and the CI result. Any red: git merge --abort. Never commits a red merge. Never pushes,
  never deploys, never touches another branch. Writes one log per run to .bake\logs\.

  Usage:
    scripts\integrate.ps1 -Lane lane/encounters                 # merge the lane tip, CI, commit or abort
    scripts\integrate.ps1 -Lane lane/encounters -Sha <sha>      # merge an exact commit of that lane
    scripts\integrate.ps1 -Lane lane/encounters -MergeOnly      # stop after the merge (apply cross-lane edits)
    scripts\integrate.ps1 -Lane lane/encounters -Continue       # CI + commit/abort on the merge already staged
  -Note "line" (repeatable) adds lines to the commit message (for example, cross-lane changes applied).
#>
param(
  [Parameter(Mandatory = $true)][string]$Lane,
  [string]$Sha = '',
  [switch]$MergeOnly,
  [switch]$Continue,
  [string[]]$Note = @(),
  [string]$PgUrl = 'postgres://postgres@127.0.0.1:54330',
  [string]$TestDb = 'build_integration_test'
)
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$Integration = 'integration/world-expedition'
$logs = Join-Path $root '.bake\logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$laneTag = ($Lane -replace '[^A-Za-z0-9]+', '-')
$log = Join-Path $logs "$stamp-integrate-$laneTag.log"
function Log([string]$m) { $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m; Write-Host $line; Add-Content -Path $log -Value $line }
function Quit([int]$code, [string]$m) { Log $m; Log "log: $log"; exit $code }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne $Integration) { Quit 2 "refusing: HEAD is '$branch', not $Integration" }
$mergeHead = Join-Path (git rev-parse --git-dir).Trim() 'MERGE_HEAD'

if (-not $Continue) {
  if (Test-Path $mergeHead) { Quit 2 'refusing: a merge is already in progress (use -Continue, or abort it by hand)' }
  if ((git status --porcelain --untracked-files=no) -ne $null) { Quit 2 'refusing: the working tree has uncommitted changes' }
  $target = if ($Sha) { $Sha } else { $Lane }
  $tip = (git rev-parse --verify "$target^{commit}" 2>$null)
  if (-not $tip) { Quit 2 "cannot resolve $target" }
  $tip = $tip.Trim()
  if ($Sha) {
    git merge-base --is-ancestor $tip $Lane
    if ($LASTEXITCODE -ne 0) { Quit 2 "$Sha is not on $Lane" }
  }
  $before = (git rev-parse HEAD).Trim()
  Log "integrate $Lane at $tip onto $Integration at $before"
  git merge --no-ff --no-commit $tip *>&1 | Tee-Object -Append -FilePath $log | Out-Host
  if ($LASTEXITCODE -ne 0) {
    git merge --abort *>&1 | Out-Null
    Quit 1 "MERGE CONFLICT: merge aborted; hand the conflict back to $Lane"
  }
  Set-Content -Path (Join-Path $logs 'integrate-pending.json') -Value (@{ lane = $Lane; tip = $tip; before = $before; stamp = $stamp } | ConvertTo-Json)
  if ($MergeOnly) { Quit 0 'merge staged (not committed). Apply cross-lane edits, git add them, then rerun with -Continue.' }
} else {
  if (-not (Test-Path $mergeHead)) { Quit 2 'refusing: -Continue but no merge is in progress' }
  $pending = Get-Content (Join-Path $logs 'integrate-pending.json') -Raw | ConvertFrom-Json
  if ($pending.lane -ne $Lane) { Quit 2 "refusing: the staged merge is for $($pending.lane), not $Lane" }
  $tip = $pending.tip; $before = $pending.before
  Log "continue: CI for $Lane at $tip onto $before"
  git add -u
}

$results = [ordered]@{}
function Step([string]$Name, [scriptblock]$Body) {
  $stepLog = Join-Path $logs "$stamp-integrate-$laneTag-$Name.log"
  Log "== $Name (log $stepLog)"
  $t = Get-Date
  & $Body *>&1 | Tee-Object -FilePath $stepLog | Out-Host
  $code = $LASTEXITCODE
  $mins = [math]::Round(((Get-Date) - $t).TotalMinutes, 1)
  $results[$Name] = if ($code -eq 0) { "PASS ($mins min)" } else { "FAIL (exit $code, $mins min, log $stepLog)" }
  Log "   $Name -> $($results[$Name])"
  return ($code -eq 0)
}

$ok = Step 'typecheck' { npm.cmd run typecheck }
if ($ok) {
  $ok = Step 'vitest' {
    $psqlUrl = "$PgUrl/postgres"
    node -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.argv[1]});await c.connect();await c.query('DROP DATABASE IF EXISTS $TestDb WITH (FORCE)');await c.query('CREATE DATABASE $TestDb');await c.end();})().catch(e=>{console.error(e);process.exit(1)})" $psqlUrl
    if ($LASTEXITCODE -ne 0) { return }
    $env:TEST_DATABASE_URL = "$PgUrl/$TestDb"
    npm.cmd test
    Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
  }
}
if ($ok) { $ok = Step 'e2e-sharded' { npm.cmd run test:e2e:sharded } }

$summary = ($results.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join '; '
if (-not $ok) {
  git merge --abort *>&1 | Tee-Object -Append -FilePath $log | Out-Host
  Remove-Item (Join-Path $logs 'integrate-pending.json') -ErrorAction SilentlyContinue
  Quit 1 "RED: merge aborted. $summary"
}

$files = (git diff --cached --stat $before) -join "`n"
$msgFile = Join-Path $logs "$stamp-integrate-$laneTag-message.txt"
$body = @(
  "merge: $Lane at $($tip.Substring(0,7)) into $Integration",
  '',
  "Lane: $Lane",
  "Tip: $tip",
  "CI ($stamp): $summary",
  ''
) + $Note + @('', 'Files changed:', $files, '', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
Set-Content -Path $msgFile -Value ($body -join "`n") -Encoding utf8
git commit -F $msgFile *>&1 | Tee-Object -Append -FilePath $log | Out-Host
if ($LASTEXITCODE -ne 0) { Quit 1 'commit failed (merge left staged); see log' }
Remove-Item (Join-Path $logs 'integrate-pending.json') -ErrorAction SilentlyContinue
Quit 0 ("GREEN: committed {0}. {1}" -f (git rev-parse --short HEAD).Trim(), $summary)
