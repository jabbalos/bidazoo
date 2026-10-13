# STEP 0.1 - read-only: lineage and dependency differences. Changes nothing.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release '00-verify-git'

function Git { param([string[]]$A) return (Run-Native 'git' (@('-C', $Repo) + $A)) }

foreach ($pair in @(@('a283c24 (validated runtime)', $ShaStage), @('856d012 (docs closure / main)', $ShaDocs), @('1a106bc (live beta)', $ShaRollback))) {
    $r = Git @('cat-file', '-t', $pair[1])
    Rec "commit exists locally: $($pair[0])" (($r.Code -eq 0) -and ($r.Out[0] -eq 'commit')) $pair[1]
}
$r = Git @('merge-base', '--is-ancestor', $ShaStage, $ShaDocs)
Rec 'a283c24 is an ancestor of 856d012' ($r.Code -eq 0)
$r = Git @('merge-base', '--is-ancestor', $ShaRollback, $ShaStage)
Rec '1a106bc is an ancestor of a283c24' ($r.Code -eq 0)

$head = Git @('rev-parse', 'HEAD'); $br = Git @('rev-parse', '--abbrev-ref', 'HEAD')
Note "release worktree: branch $($br.Out[0]) at $($head.Out[0])"
Rec 'release worktree HEAD is 856d012 (main)' ($head.Out[0] -eq $ShaDocs)

Write-Host "`n--- git diff --stat a283c24 856d012 ---"
$st = Git @('diff', '--stat', $ShaStage, $ShaDocs); $st.Out | ForEach-Object { Write-Host "  $_" }
$names = Git @('diff', '--name-only', $ShaStage, $ShaDocs)
$nonDocs = @($names.Out | Where-Object { $_ -ne '' -and $_ -notmatch '^docs/' })
Rec 'a283c24..856d012 changes ONLY files under docs/' ($nonDocs.Count -eq 0) ("non-docs files: " + ($nonDocs -join ', '))

Write-Host "`n--- 1a106bc..a283c24: changed paths by top-level folder ---"
$all = Git @('diff', '--name-only', $ShaRollback, $ShaStage)
$all.Out | Where-Object { $_ -ne '' } | ForEach-Object { ($_ -split '/')[0] } | Group-Object | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-16} {1} file(s)" -f $_.Name, $_.Count) }
Write-Host "`n--- migrations: 1a106bc vs a283c24 ---"
foreach ($sha in $ShaRollback, $ShaStage) {
    $t = Git @('ls-tree', '-r', '--name-only', $sha, '--', 'database/migrations')
    Write-Host "  ${sha}:"; $t.Out | Where-Object { $_ -match '\.sql$' } | ForEach-Object { Write-Host "    $_" }
}
Write-Host "`n--- package.json / lockfile differences, 1a106bc -> a283c24 ---"
$pk = Git @('diff', '--stat', $ShaRollback, $ShaStage, '--', 'package.json', 'package-lock.json', 'apps/*/package.json', 'packages/*/package.json', 'games/*/package.json', 'database/package.json', 'tests/package.json')
$pk.Out | ForEach-Object { Write-Host "  $_" }
$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($pair in @(@('old', $ShaRollback), @('new', $ShaStage))) {
    $s = Git @('show', "$($pair[1]):package-lock.json")
    if ($s.Code -ne 0) { throw "could not read package-lock.json at $($pair[1])" }
    [System.IO.File]::WriteAllLines("$R\tmp\lock-$($pair[0]).json", $s.Out, $enc)
}
$d = Run-Native $NodeExe @("$Tools\depdiff.mjs", "$R\tmp\lock-old.json", "$R\tmp\lock-new.json")
$d.Out | ForEach-Object { Write-Host "  $_" }
Rec 'dependency diff produced' ($d.Code -eq 0)
Note 'Review the ADDED/CHANGED lists above. This is supplemental information only: the rollback design does NOT assume 1a106bc runs on the newer node_modules.'

$s = Git @('status', '--porcelain')
Note "release worktree status lines: $(@($s.Out | Where-Object { $_ -ne '' }).Count) (new files under infrastructure/deployment/identity-release are expected)"
Finish-Release
