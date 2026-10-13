# STEP 0.2-0.5 and 0.11 - build an exact commit in its OWN folder under C:\BidaZoo-release\trees.
#   -Name stage     builds a283c24 (the release candidate)
#   -Name rollback  builds 1a106bc (the independent rollback tree)
# Runs as the normal user. Never touches C:\BidaZoo-beta. Refuses to overwrite an existing tree.
param([ValidateSet('stage', 'rollback')][string]$Name = 'stage')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release "01-build-$Name"

$sha = $ShaStage
if ($Name -eq 'rollback') { $sha = $ShaRollback }
$dest = "$ReleaseRoot\trees\$Name"
if (Test-Path -LiteralPath $dest) { throw "$dest already exists. Nothing here deletes it; remove it yourself for a fresh build." }

$nv = (Run-Native $NodeExe @('--version')).Out[0]
$ok = $false
if ($nv -match '^v(\d+)\.(\d+)') { $ok = ([int]$Matches[1] -gt 22) -or (([int]$Matches[1] -eq 22) -and ([int]$Matches[2] -ge 12)) }
Rec "node $nv satisfies engines >=22.12.0" $ok

$c = Run-Native 'git' @('clone', '--quiet', '--no-checkout', $MainRepo, $dest) -LogName "git-clone-$Name"
Rec 'local clone created' ($c.Code -eq 0) $dest
$c = Run-Native 'git' @('-C', $dest, 'checkout', '--quiet', '--detach', $sha)
Rec "checked out $($sha.Substring(0,7))" ($c.Code -eq 0)
$h = (Run-Native 'git' @('-C', $dest, 'rev-parse', 'HEAD')).Out[0]
Rec 'HEAD equals the exact full SHA' ($h -eq $sha) $h
$st = Run-Native 'git' @('-C', $dest, 'status', '--porcelain')
Rec 'working tree is clean' (@($st.Out | Where-Object { $_ -ne '' }).Count -eq 0)
Note ("package-lock.json SHA-256: " + (Get-FileHash -LiteralPath "$dest\package-lock.json" -Algorithm SHA256).Hash)

Push-Location $dest
try {
    $NativeResult = Run-Native 'npm' @('ci') -LogName "npm-ci-$Name";             Show-Tail $NativeResult 6; Rec 'npm ci' ($NativeResult.Code -eq 0) "exit=$($NativeResult.Code) (log: $ReleaseRoot\logs\npm-ci-$Name.log)"
    if ($NativeResult.Code -eq 0) {
        $NativeResult = Run-Native 'npm' @('run', 'build') -LogName "npm-build-$Name"; Show-Tail $NativeResult 6; Rec 'npm run build' ($NativeResult.Code -eq 0) "exit=$($NativeResult.Code)"
    }
    if ($NativeResult.Code -eq 0) {
        $NativeResult = Run-Native 'npm' @('run', 'scan:client') -LogName "scan-$Name"; Show-Tail $NativeResult 8
        Rec 'npm run scan:client reports CLEAN' (($NativeResult.Code -eq 0) -and (($NativeResult.Out -join "`n") -match '(?i)clean')) "exit=$($NativeResult.Code)"
    }
} finally { Pop-Location }

$apiJs = "$dest\apps\api\dist\server.js"; $idx = "$dest\apps\play\dist\index.html"
Rec 'built API present (apps\api\dist\server.js)' (Test-Path $apiJs)
Rec 'built play client present (apps\play\dist\index.html)' (Test-Path $idx)
$man = "$ReleaseRoot\evidence\dist-manifest-$Name.txt"
Get-ChildItem -Recurse -File "$dest\apps\api\dist", "$dest\apps\play\dist" | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash, $_.FullName.Substring($dest.Length + 1) } | Set-Content -LiteralPath $man -Encoding ASCII
Note "dist SHA-256 manifest: $man (builds are not guaranteed byte-identical across machines/paths; it documents what was verified)"
$lnk = Get-Item "$dest\node_modules\@bidazoo\api" -ErrorAction SilentlyContinue
if ($lnk) { Note "workspace link type: $($lnk.LinkType); target: $($lnk.Target)  (absolute target => this tree must stay where it was built; do not relocate it)" }
Finish-Release
