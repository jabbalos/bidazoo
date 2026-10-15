# STEP 0.1 - read-only: lineage and dependency differences. Changes nothing.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '00-verify-git'

# NOTE: deliberately NOT named Git: a function with that name would shadow git.exe (the original bug).
function Invoke-GitCmd { param([string[]]$A) return (Run-Native 'git' (@('-C', $Repo) + $A)) }

foreach ($pair in @(@('a283c24 (validated runtime)', $ShaStage), @('856d012 (docs closure / main)', $ShaDocs), @('1a106bc (live beta)', $ShaRollback))) {
    $NativeResult = Invoke-GitCmd @('cat-file', '-t', $pair[1])
    Rec "commit exists locally: $($pair[0])" (($NativeResult.Code -eq 0) -and ($NativeResult.Out[0] -eq 'commit')) $pair[1]
}
$NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaStage, $ShaDocs)
Rec 'a283c24 is an ancestor of 856d012' ($NativeResult.Code -eq 0)
$NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaRollback, $ShaStage)
Rec '1a106bc is an ancestor of a283c24' ($NativeResult.Code -eq 0)

# --- Branch lineage. The release branch may carry release-tooling-only commits ABOVE the closure commit. ---
$ReleaseBranch = 'release/identity-beta'
$head = Invoke-GitCmd @('rev-parse', 'HEAD')
$br   = Invoke-GitCmd @('symbolic-ref', '--short', 'HEAD')
$branchName = if ($br.Code -eq 0) { $br.Out[0] } else { '(detached)' }
Note "release worktree: branch $branchName at $($head.Out[0])"
Rec "release worktree is on branch $ReleaseBranch" ($branchName -ceq $ReleaseBranch) $branchName
$NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaDocs, 'HEAD')
Rec '856d012 is an ancestor of (or equal to) release worktree HEAD' ($NativeResult.Code -eq 0) $head.Out[0]
$above = Invoke-GitCmd @('log', '--oneline', "$ShaDocs..HEAD")
Note "commits above 856d012 on this branch: $(@($above.Out | Where-Object { $_ -ne '' }).Count)"
$above.Out | Where-Object { $_ -ne '' } | ForEach-Object { Write-Host "      $_" }
$aboveNames = Invoke-GitCmd @('diff', '--name-only', $ShaDocs, 'HEAD')
$ToolingPrefix = 'infrastructure/deployment/identity-release/'
$outsideTooling = @($aboveNames.Out | Where-Object { $_ -ne '' -and -not $_.StartsWith($ToolingPrefix, [StringComparison]::Ordinal) })
Rec 'commits above 856d012 touch ONLY infrastructure/deployment/identity-release/' ($outsideTooling.Count -eq 0) ("files outside: " + ($outsideTooling -join ', '))
$mainRef = Invoke-GitCmd @('rev-parse', '--verify', 'refs/heads/main')
if ($mainRef.Code -eq 0) {
    $NativeResult = Invoke-GitCmd @('merge-base', '--is-ancestor', $ShaDocs, 'refs/heads/main')
    Rec 'main is at or descends from 856d012 (closure state intact)' ($NativeResult.Code -eq 0) $mainRef.Out[0]
    Note $(if ($mainRef.Out[0] -eq $ShaDocs) { 'main is exactly 856d012' } else { "main has moved past 856d012: $($mainRef.Out[0])" })
} else { Rec 'main ref is readable' $false 'refs/heads/main not found' }
Note 'Runtime deployment target is unchanged and exact: a283c24 (not the release branch HEAD).'

# --- Docs-only closure: explicit allowlist, case-sensitive, no extension wildcards. ---
Write-Host "`n--- git diff --name-status a283c24 856d012 ---"
$ns = Invoke-GitCmd @('diff', '--name-status', $ShaStage, $ShaDocs); $ns.Out | Where-Object { $_ -ne '' } | ForEach-Object { Write-Host "  $_" }
$st = Invoke-GitCmd @('diff', '--stat', $ShaStage, $ShaDocs); $st.Out | ForEach-Object { Write-Host "  $_" }
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

Write-Host "`n--- 1a106bc..a283c24: changed paths by top-level folder ---"
$all = Invoke-GitCmd @('diff', '--name-only', $ShaRollback, $ShaStage)
$all.Out | Where-Object { $_ -ne '' } | ForEach-Object { ($_ -split '/')[0] } | Group-Object | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-16} {1} file(s)" -f $_.Name, $_.Count) }
Write-Host "`n--- migrations: 1a106bc vs a283c24 ---"
foreach ($sha in $ShaRollback, $ShaStage) {
    $t = Invoke-GitCmd @('ls-tree', '-r', '--name-only', $sha, '--', 'database/migrations')
    Write-Host "  ${sha}:"; $t.Out | Where-Object { $_ -match '\.sql$' } | ForEach-Object { Write-Host "    $_" }
}
Write-Host "`n--- package.json / lockfile differences, 1a106bc -> a283c24 ---"
$pk = Invoke-GitCmd @('diff', '--stat', $ShaRollback, $ShaStage, '--', 'package.json', 'package-lock.json', 'apps/*/package.json', 'packages/*/package.json', 'games/*/package.json', 'database/package.json', 'tests/package.json')
$pk.Out | ForEach-Object { Write-Host "  $_" }
$enc = New-Object System.Text.UTF8Encoding($false)
$TmpDir = Join-Path $ReleaseRoot 'tmp'
if (-not (Test-Path -LiteralPath $TmpDir -PathType Container)) { New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null }   # Step 00 owns this scratch folder
if (-not (Test-Path -LiteralPath $TmpDir -PathType Container)) { throw "temp folder could not be created: $TmpDir" }
$LockFiles = @{}
foreach ($pair in @(@('old', $ShaRollback), @('new', $ShaStage))) {
    $LockResult = Invoke-GitCmd @('show', "$($pair[1]):package-lock.json")
    if ($LockResult.Code -ne 0) { throw "could not read package-lock.json at $($pair[1])" }
    $LockFiles[$pair[0]] = Join-Path $TmpDir ("lock-{0}.json" -f $pair[0])
    [System.IO.File]::WriteAllLines($LockFiles[$pair[0]], [string[]]$LockResult.Out, $enc)
}
$DepDiffResult = Run-Native $NodeExe @((Join-Path $Tools 'depdiff.mjs'), $LockFiles['old'], $LockFiles['new'])
$DepDiffResult.Out | ForEach-Object { Write-Host "  $_" }
Rec 'dependency diff produced' ($DepDiffResult.Code -eq 0)
Note 'Review the ADDED/CHANGED lists above. This is supplemental information only: the rollback design does NOT assume 1a106bc runs on the newer node_modules.'

$s = Invoke-GitCmd @('status', '--porcelain')
Note "release worktree status lines: $(@($s.Out | Where-Object { $_ -ne '' }).Count) (new files under infrastructure/deployment/identity-release are expected)"
Finish-Release
