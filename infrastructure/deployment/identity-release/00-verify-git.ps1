# STEP 0.1 - read-only: candidate identity, lineage and dependency differences. Changes nothing.
#   run.bat 00-verify-git.ps1 -CandidateSha <40 lowercase hex>
# The candidate is immutable INPUT (see lib.ps1). This script refuses an empty or non-exact SHA, a dirty checkout,
# a checkout that is not exactly the candidate, and unexpected ancestry.
param([string]$CandidateSha = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
$ShaCandidate = Resolve-Candidate $CandidateSha
Initialize-Release '00-verify-git'
Note "release candidate (immutable input): $ShaCandidate"

# NOTE: deliberately NOT named Git: a function with that name would shadow git.exe (the original bug).
function Invoke-GitCmd { param([string[]]$A) return (Run-Native 'git' (@('-C', $Repo) + $A)) }

# --- Every reference commit must exist locally (class A: historical / rollback / lineage). ---
foreach ($pair in @(
        @('1a106bc (live beta; rollback target)', $ShaRollback),
        @('a283c24 (Checkpoint E identity milestone)', $ShaIdentity),
        @('856d012 (main at integration)', $ShaMain),
        @('bb8e14d (post-F6 docs reconciliation)', $ShaDocs),
        @('f3b5483 (F1-F6 runtime)', $ShaRuntime),
        @('d90f572 (release/identity-beta tooling tip)', $ShaTooling),
        @('release candidate', $ShaCandidate))) {
    $NativeResult = Invoke-GitCmd @('cat-file', '-t', $pair[1])
    Rec "commit exists locally: $($pair[0])" (($NativeResult.Code -eq 0) -and ($NativeResult.Out[0] -eq 'commit')) $pair[1]
}

# --- Historical lineage that is still true and still relied on. ---
$NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaIdentity, $ShaMain)
Rec 'a283c24 is an ancestor of 856d012 (identity milestone is inside main)' ($NativeResult.Code -eq 0)
$NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaRollback, $ShaIdentity)
Rec '1a106bc is an ancestor of a283c24' ($NativeResult.Code -eq 0)

# --- Candidate lineage: all six references are inside it, and application code is exactly the validated runtime. ---
Write-Host "`n--- candidate lineage ---"
Test-CandidateLineage -Dir $Repo -Sha $ShaCandidate

# --- The checkout this tooling runs from must BE the candidate, and be clean. ---
$head = Invoke-GitCmd @('rev-parse', 'HEAD')
$br   = Invoke-GitCmd @('symbolic-ref', '--short', 'HEAD')
$branchName = if ($br.Code -eq 0) { $br.Out[0] } else { '(detached)' }
Note "release worktree: $branchName at $($head.Out[0])"
Rec 'release worktree HEAD is exactly the candidate' ($head.Out[0] -ceq $ShaCandidate) $head.Out[0]
Rec "release worktree is detached or on $ReleaseBranch" (($branchName -ceq '(detached)') -or ($branchName -ceq $ReleaseBranch)) $branchName
$s = Invoke-GitCmd @('status', '--porcelain')
$dirtyLines = @($s.Out | Where-Object { $_ -ne '' })
Rec 'release worktree is clean (no modified or untracked files)' (($s.Code -eq 0) -and ($dirtyLines.Count -eq 0)) (($dirtyLines | Select-Object -First 5) -join ' ; ')

# --- Moving refs are checked, never trusted. ---
$relRef = Invoke-GitCmd @('rev-parse', '--verify', '--quiet', "refs/remotes/origin/$ReleaseBranch")
if ($relRef.Code -eq 0) {
    $NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaCandidate, "refs/remotes/origin/$ReleaseBranch")
    Rec "candidate is on origin/$ReleaseBranch (equal to it or an ancestor of it)" ($NativeResult.Code -eq 0) $relRef.Out[0]
    Note $(if ($relRef.Out[0] -ceq $ShaCandidate) { "origin/$ReleaseBranch is exactly the candidate" } else { "origin/$ReleaseBranch has moved past the candidate ($($relRef.Out[0])). That is allowed: the candidate is an exact SHA, never the branch." })
} else { Note "refs/remotes/origin/$ReleaseBranch not present in this clone (git fetch origin to see it); the candidate SHA is still checked exactly." }
$mainRef = Invoke-GitCmd @('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')
if ($mainRef.Code -ne 0) { $mainRef = Invoke-GitCmd @('rev-parse', '--verify', '--quiet', 'refs/heads/main') }
if ($mainRef.Code -eq 0) {
    $NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $mainRef.Out[0], $ShaCandidate)
    Rec 'main (as known to this clone) is an ancestor of the candidate: the candidate lacks nothing main has' ($NativeResult.Code -eq 0) $mainRef.Out[0]
    Note $(if ($mainRef.Out[0] -ceq $ShaMain) { 'main is exactly 856d012' } else { "main is $($mainRef.Out[0]), not 856d012. If the check above passed it is still contained in the candidate." })
} else { Rec 'main ref is readable' $false 'neither refs/remotes/origin/main nor refs/heads/main found' }
Note 'Runtime deployment target is exactly the candidate SHA (never a branch, never main).'

# --- Historical record: the identity milestone was merged to main with documentation-only changes after a283c24. ---
Write-Host "`n--- git diff --name-status a283c24 856d012 (historical: docs closure of the identity milestone) ---"
$ns = Invoke-GitCmd @('diff', '--name-status', $ShaIdentity, $ShaMain); $ns.Out | Where-Object { $_ -ne '' } | ForEach-Object { Write-Host "  $_" }
$DocsExactFiles = @('README.md')          # the only root-level file allowed
$DocsPrefix     = 'docs/'                 # anything under docs/
$unexpected = @()
foreach ($line in @($ns.Out | Where-Object { $_ -ne '' })) {
    $parts  = $line -split "`t"
    $status = $parts[0]
    $paths  = @($parts | Select-Object -Skip 1)
    $statusOk = ($status -ceq 'M') -or ($status -ceq 'A')          # no delete/rename/copy/type-change
    $pathsOk = $true
    foreach ($changedPath in $paths) {
        $isAllowed = ($DocsExactFiles -ccontains $changedPath) -or ($changedPath.StartsWith($DocsPrefix, [StringComparison]::Ordinal) -and -not $changedPath.Contains('..'))
        if (-not $isAllowed) { $pathsOk = $false }
    }
    if (-not ($statusOk -and $pathsOk)) { $unexpected += $line }
}
Rec 'a283c24..856d012 changes ONLY README.md and files under docs/ (status M/A only)' (($ns.Code -eq 0) -and ($unexpected.Count -eq 0)) ("unexpected: " + ($unexpected -join ' ; '))

# --- What the release changes relative to the LIVE beta (1a106bc) - the real upgrade surface. ---
Write-Host "`n--- 1a106bc (live) .. candidate: changed paths by top-level folder ---"
$all = Invoke-GitCmd @('diff', '--name-only', $ShaRollback, $ShaCandidate)
$all.Out | Where-Object { $_ -ne '' } | ForEach-Object { ($_ -split '/')[0] } | Group-Object | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-16} {1} file(s)" -f $_.Name, $_.Count) }

Write-Host "`n--- migrations: 1a106bc (live) vs candidate ---"
$migNames = @{}
foreach ($pair in @(@('live', $ShaRollback), @('candidate', $ShaCandidate))) {
    $t = Invoke-GitCmd @('ls-tree', '-r', '--name-only', $pair[1], '--', 'database/migrations')
    $migNames[$pair[0]] = @($t.Out | Where-Object { $_ -match '\.sql$' } | ForEach-Object { ($_ -split '/')[-1] })
    Write-Host "  $($pair[1]):"; $migNames[$pair[0]] | ForEach-Object { Write-Host "    $_" }
}
$addedMig   = @($migNames['candidate'] | Where-Object { $migNames['live'] -cnotcontains $_ } | Sort-Object)
$removedMig = @($migNames['live'] | Where-Object { $migNames['candidate'] -cnotcontains $_ })
$expectedMig = @('0003_identity_family_tables.sql', '0004_identity_guards.sql')
Rec 'migrations added since the live beta are exactly 0003_identity_family_tables.sql and 0004_identity_guards.sql; none removed or renamed' ((($addedMig -join ',') -ceq ($expectedMig -join ',')) -and ($removedMig.Count -eq 0)) ("added=[" + ($addedMig -join ',') + "] removed=[" + ($removedMig -join ',') + "]")

Write-Host "`n--- package.json / lockfile differences, 1a106bc (live) -> candidate ---"
$pk = Invoke-GitCmd @('diff', '--stat', $ShaRollback, $ShaCandidate, '--', 'package.json', 'package-lock.json', 'apps/*/package.json', 'packages/*/package.json', 'games/*/package.json', 'database/package.json', 'tests/package.json')
$pk.Out | ForEach-Object { Write-Host "  $_" }
$enc = New-Object System.Text.UTF8Encoding($false)
$TmpDir = Join-Path $ReleaseRoot 'tmp'
if (-not (Test-Path -LiteralPath $TmpDir -PathType Container)) { New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null }   # Step 00 owns this scratch folder
if (-not (Test-Path -LiteralPath $TmpDir -PathType Container)) { throw "temp folder could not be created: $TmpDir" }
$LockFiles = @{}
foreach ($pair in @(@('old', $ShaRollback), @('new', $ShaCandidate))) {
    $LockResult = Invoke-GitCmd @('show', "$($pair[1]):package-lock.json")
    if ($LockResult.Code -ne 0) { throw "could not read package-lock.json at $($pair[1])" }
    $LockFiles[$pair[0]] = Join-Path $TmpDir ("lock-{0}.json" -f $pair[0])
    [System.IO.File]::WriteAllLines($LockFiles[$pair[0]], [string[]]$LockResult.Out, $enc)
}
$DepDiffResult = Run-Native $NodeExe @((Join-Path $Tools 'depdiff.mjs'), $LockFiles['old'], $LockFiles['new'])
$DepDiffResult.Out | ForEach-Object { Write-Host "  $_" }
Rec 'dependency diff produced' ($DepDiffResult.Code -eq 0)
Note 'Review the ADDED/CHANGED lists above. This is supplemental information only: the rollback design does NOT assume 1a106bc runs on the newer node_modules.'
Finish-Release
