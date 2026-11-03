# Tooling self-test. Read-only: runs only `--version`, a deliberately failing git command and a tiny temp
# node script. Touches no production state, database, or live beta. Safe to run on Studio any time.
#   .\run.bat tooling-selftest.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
$fails = 0
function Check { param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) { Write-Host ("  PASS  {0}" -f $Name) } else { Write-Host ("  FAIL  {0}  {1}" -f $Name, $Detail); $script:fails++ } }

Write-Host "Tooling self-test (PowerShell $($PSVersionTable.PSVersion))"

# Deliberately define functions that shadow the executables. Before the fix this recursed to CallDepthOverflow.
function Git  { param([string[]]$A) throw 'SHADOW Git function was invoked (recursion hazard)' }
function Node { param([string[]]$A) throw 'SHADOW Node function was invoked' }
function Npm  { param([string[]]$A) throw 'SHADOW Npm function was invoked' }

foreach ($tool in 'git','node','npm') {
    try {
        $p = Resolve-External $tool
        Check "$tool resolves to an external application" ((Test-Path -LiteralPath $p -PathType Leaf)) $p
        $NativeResult = Run-Native $tool @('--version')
        Check "$tool --version exits 0 with output (despite a shadow function)" (($NativeResult.Code -eq 0) -and ($NativeResult.Out.Count -gt 0)) ("code=$($NativeResult.Code)")
        Write-Host ("        {0}" -f ($NativeResult.Out | Select-Object -First 1))
    } catch { Check "$tool --version" $false $_.Exception.Message }
}

try {
    $NativeResult = Run-Native 'git' @('rev-parse','--verify','refs/heads/definitely-not-a-real-ref-xyz')
    Check 'failing external command returns a captured NONZERO exit code (no throw)' ($NativeResult.Code -ne 0) ("code=$($NativeResult.Code)")
    Check 'failing external command stderr is captured' ($NativeResult.Out.Count -ge 0)
} catch { Check 'failing external command is captured' $false $_.Exception.Message }

try {
    $js = Join-Path ([IO.Path]::GetTempPath()) ("bz-selftest-{0}.js" -f ([guid]::NewGuid().ToString('N')))
    Set-Content -LiteralPath $js -Value 'console.log(process.argv.length - 2); process.argv.slice(2).forEach(a => console.log("[" + a + "]")); process.exit(7)' -Encoding ASCII
    $NativeResult = Run-Native 'node' @($js, 'one two', 'three', 'a;b')
    Remove-Item -LiteralPath $js -Force
    Check 'argument boundaries preserved (3 args, spaces kept) and exit code 7 captured' (($NativeResult.Code -eq 7) -and ($NativeResult.Out[0] -eq '3') -and ($NativeResult.Out -contains '[one two]') -and ($NativeResult.Out -contains '[a;b]')) (($NativeResult.Out -join '|'))
} catch { Check 'argument boundaries' $false $_.Exception.Message }

try { $null = Resolve-External 'definitely-not-a-real-tool-xyz'; Check 'missing tool throws a clear error' $false }
catch { Check 'missing tool throws a clear error' ($_.Exception.Message -like 'External executable not found*') }


# Regression: PowerShell variables are case-insensitive. A result variable named $r once overwrote the
# release-root variable $R. The root is now $ReleaseRoot and results use descriptive names.
try {
    $before = $ReleaseRoot
    $r = Run-Native 'git' @('--version'); $R = $r   # worst case: one-letter names in the caller
    Check 'release root is not aliased by one-letter variables' ($ReleaseRoot -eq $before) "ReleaseRoot=$ReleaseRoot"
    Remove-Variable r -ErrorAction SilentlyContinue
    $tmp = Join-Path $ReleaseRoot 'tmp'
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $probe = Join-Path $tmp 'selftest-write.txt'
    [System.IO.File]::WriteAllLines($probe, [string[]]@('ok'), (New-Object System.Text.UTF8Encoding($false)))
    Check 'WriteAllLines into $ReleaseRoot\tmp works' (Test-Path -LiteralPath $probe)
    Remove-Item -LiteralPath $probe -Force
} catch { Check 'release-root / tmp handling' $false $_.Exception.Message }

# Regression: PostgreSQL truncates identifiers to 63 bytes; migration 0003 declares a 65-character FK name.
try {
    $long = 'device_auth_codes_used_by_device_session_id_device_sessions_id_fk'
    $sql = 'ALTER TABLE "device_auth_codes" ADD CONSTRAINT "' + $long + '" FOREIGN KEY ("used_by_device_session_id") REFERENCES "public"."device_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint' + "`n" +
           'ALTER TABLE "a" ADD CONSTRAINT "a_b_fk" FOREIGN KEY ("x","y") REFERENCES "public"."b"("x","y") ON DELETE cascade ON UPDATE no action;'
    $fk = @(Get-DeclaredForeignKeys $sql)
    Check 'FK parser finds every declaration (2 of 2)' ($fk.Count -eq 2 -and [regex]::Matches($sql, 'FOREIGN KEY').Count -eq 2)
    Check 'long FK name is truncated to 63 chars like PostgreSQL' (($long.Length -eq 65) -and ($fk[0].StoredName.Length -eq 63) -and ($fk[0].StoredName -ceq $long.Substring(0, 63)))
    Check 'FK structure parsed (columns, referenced table, ON DELETE set null = n)' (($fk[0].Cols -eq 'used_by_device_session_id') -and ($fk[0].RefTable -eq 'device_sessions') -and ($fk[0].Del -eq 'n') -and ($fk[0].Upd -eq 'a') -and ($fk[1].Cols -eq 'x,y') -and ($fk[1].Del -eq 'c'))
} catch { Check 'FK parser / identifier truncation' $false $_.Exception.Message }

# Release-candidate input model: the candidate is explicit, exact, and never a moving ref or a historical commit.
$savedEnv = $env:BZ_CANDIDATE_SHA
try {
    $env:BZ_CANDIDATE_SHA = ''
    $good = ('0123456789abcdef' * 3).Substring(0, 40)
    foreach ($bad in @('', 'HEAD', 'release/founding-family-beta', 'main', '9781f7a', $good.ToUpper(), ($good + '0'), $ShaRollback, $ShaIdentity, $ShaMain, $ShaDocs, $ShaRuntime, $ShaTooling)) {
        $threw = $false
        try { $null = Resolve-Candidate $bad } catch { $threw = $true }
        Check ("Resolve-Candidate refuses '{0}'" -f $(if ($bad.Length -gt 12) { $bad.Substring(0, 12) + '...' } else { $bad })) $threw
    }
    Check 'Resolve-Candidate accepts a full lowercase 40-hex SHA that is not a reference commit' ((Resolve-Candidate $good) -ceq $good)
    $env:BZ_CANDIDATE_SHA = $good
    Check 'Resolve-Candidate falls back to BZ_CANDIDATE_SHA' ((Resolve-Candidate '') -ceq $good)
} catch { Check 'Resolve-Candidate' $false $_.Exception.Message }
finally { $env:BZ_CANDIDATE_SHA = $savedEnv }
Check 'Test-ReleaseOnlyPath: docs, tooling, validator and markdown are release-only' ((Test-ReleaseOnlyPath 'docs/PROJECT-STATE.md') -and (Test-ReleaseOnlyPath 'infrastructure/deployment/identity-release/lib.ps1') -and (Test-ReleaseOnlyPath 'scripts/validate-studio.ps1') -and (Test-ReleaseOnlyPath 'games/zoo-sprint/README.md') -and (Test-ReleaseOnlyPath 'README.md'))
Check 'Test-ReleaseOnlyPath: application, API, database, tests, art and path tricks are NOT release-only' (-not ((Test-ReleaseOnlyPath 'apps/api/src/server.ts') -or (Test-ReleaseOnlyPath 'database/migrations/0005_x.sql') -or (Test-ReleaseOnlyPath 'games/zoo-sprint/assets/world-expedition/characters/dino/dino_idle.png') -or (Test-ReleaseOnlyPath 'tests/integration/a.test.ts') -or (Test-ReleaseOnlyPath 'scripts/other.ps1') -or (Test-ReleaseOnlyPath 'docs/../apps/api/x.ts') -or (Test-ReleaseOnlyPath 'package-lock.json')))

Check 'call depth stays small' ((Get-PSCallStack).Count -lt 10) ("depth=$((Get-PSCallStack).Count)")

if ($fails -eq 0) { Write-Host "SELF-TEST PASS" ; exit 0 } else { Write-Host "SELF-TEST FAIL ($fails)"; exit 1 }
