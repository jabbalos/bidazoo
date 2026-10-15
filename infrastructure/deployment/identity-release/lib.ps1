# Shared helpers for the founding-family-beta release-candidate REHEARSAL tooling. ASCII only.
# (Originally written for the Checkpoint E identity-only candidate; retargeted October 15, 2026.)
# Dot-source from the numbered scripts:  . "$PSScriptRoot\lib.ps1"
#
# CANDIDATE INPUT MODEL (no self-referential SHA)
#  - The release candidate is NEVER stored in this tooling. A script commit cannot contain its own SHA.
#  - Scripts that build or test the candidate take it as immutable input: -CandidateSha <40 lowercase hex>
#    (or the environment variable BZ_CANDIDATE_SHA). Resolve-Candidate refuses empty input, branch names,
#    tags, abbreviations and upper case. Test-CandidateLineage then refuses unexpected ancestry.
#  - The constants below are HISTORICAL / ROLLBACK / LINEAGE references only. None of them is the candidate.
#
# SAFETY MODEL
#  - The live beta database is opened SELECT-only (Invoke-Psql refuses anything else on port 54340).
#  - Every rehearsal runs against a throwaway PostgreSQL cluster on port 54341 under C:\BidaZoo-release.
#  - Rehearsal processes use ports 3102-3105 / 8481-8482 only, and are stopped by recorded PID, never by name.
#  - Nothing here edits api.env, Caddyfile.beta, run-*.cmd, scheduled tasks, DNS, Cloudflare or the live checkout.
#  - Secrets are read from files into process environment variables and are never echoed.

$ErrorActionPreference = 'Stop'

$Beta        = 'C:\BidaZoo-beta'
$ReleaseRoot           = 'C:\BidaZoo-release'
if ($env:BZ_RELEASE_ROOT) { $ReleaseRoot = $env:BZ_RELEASE_ROOT }   # test hook only; unset on Studio
$Repo        = 'C:\Users\jonat\Documents\BidaZoo-Identity-Release'
if ($env:BZ_REPO_DIR) { $Repo = $env:BZ_REPO_DIR }   # test hook only; unset on Studio
$MainRepo    = 'C:\Users\jonat\Documents\BidaZoo'
$PgBin       = "$Beta\pg\pgsql\bin"
$LivePort    = 54340
$ScratchPort = 54341
# --- Immutable reference commits. Class A (historical / rollback / lineage). NONE of these is the release candidate. ---
$ShaRollback = '1a106bc328ed0d544d4c49b61f3a1c2071ae65b7'   # the live beta today: the ONLY rollback target
$ShaIdentity = 'a283c2470fe5abcb47f49d3f5753dea1bd881e78'   # Checkpoint E identity milestone (old identity-only candidate); lineage only
$ShaMain     = '856d012d3139735d7f13ffeebabb723222fba2e1'   # main when the candidate was integrated
$ShaDocs     = 'bb8e14d668324d3dfdd77d07dda84dd47cb04ee5'   # post-F6 documentation reconciliation (docs only)
$ShaRuntime  = 'f3b5483c2b253f0ccb0ee9b62060379b7575fb08'   # F1-F6 runtime tip, officially Studio-validated
$ShaTooling  = 'd90f572c8de1804314c2edf520cc9199446aded7'   # release/identity-beta tip (this tooling's original branch)
$ReleaseBranch = 'release/founding-family-beta'
$ReleaseDir  = $PSScriptRoot
$Tools       = Join-Path $ReleaseDir 'tools'
$NodeExe     = $null   # resolved below, once Resolve-External exists

function Initialize-Release {
    param([string]$Step)
    $ErrorActionPreference = 'Stop'
    foreach ($d in 'evidence','run','logs','trees','rehearsal-backups','secrets','tmp','rollback-kit') {
        New-Item -ItemType Directory -Force -Path "$ReleaseRoot\$d" | Out-Null
    }
    $global:StepName = $Step
    $global:Results = New-Object System.Collections.ArrayList
    $global:EvidenceFile = "$ReleaseRoot\evidence\$Step-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    Start-Transcript -Path $global:EvidenceFile | Out-Null
    Write-Host "Step $Step started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') as $env:USERNAME on $env:COMPUTERNAME"
}

function Rec {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    $tag = 'FAIL'
    if ($Ok) { $tag = 'PASS' }
    $line = ('{0,-5} {1}' -f $tag, $Name)
    if ($Detail -ne '') { $line = $line + '  -> ' + $Detail }
    Write-Host $line
    [void]$global:Results.Add(@{ Ok = $Ok; Line = $line })
}

function Note { param([string]$Text) Write-Host "INFO  $Text" }

function Finish-Release {
    $fails = @($global:Results | Where-Object { -not $_.Ok }).Count
    $verdict = 'PASS'
    if ($fails -ne 0) { $verdict = "FAIL ($fails failed)" }
    Write-Host ''
    Write-Host "=== RESULT $($global:StepName): $verdict ==="
    foreach ($r in $global:Results) { Write-Host $r.Line }
    Write-Host "Evidence file: $($global:EvidenceFile)"
    Stop-Transcript | Out-Null
    if ($fails -ne 0) { exit 1 }
}

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-Secret { param([string]$Path) return (Get-Content -LiteralPath $Path -Raw).Trim() }

# Resolves a command name to an EXTERNAL APPLICATION only (never a function, alias, cmdlet or .ps1 wrapper).
# PowerShell command lookup is case-insensitive and ranks alias > function > cmdlet > application, so a
# function named Git (or any helper that shares a name with an executable) would otherwise capture
# `& 'git'` and, if it calls the helper again, recurse until CallDepthOverflow. Application-only lookup
# makes that impossible. A name containing a path separator is used as given (it must be an existing file).
function Resolve-External {
    param([string]$Name)
    if ($Name -match '[\\/]') {
        if (-not (Test-Path -LiteralPath $Name -PathType Leaf)) { throw "External executable not found: $Name" }
        return (Resolve-Path -LiteralPath $Name).ProviderPath
    }
    try { $cmd = Get-Command -Name $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1 }
    catch { throw "External executable not found on PATH: $Name" }
    return $cmd.Source
}
$NodeExe = Resolve-External 'node'

# Runs an external program without PowerShell 5.1 turning stderr lines into terminating errors.
# Set $env:RELEASE_TOOL_DEBUG=1 to print the resolved path, argument COUNT and call depth (arguments are
# never printed: some carry scratch-only passwords).
function Run-Native {
    param([string]$Exe, [string[]]$ArgList, [string]$LogName = '')
    $path = Resolve-External $Exe
    if ($env:RELEASE_TOOL_DEBUG -eq '1') {
        $n = 0; if ($null -ne $ArgList) { $n = $ArgList.Count }
        Write-Host ("DEBUG Run-Native: '{0}' -> {1}; {2} argument(s); call depth {3}" -f $Exe, $path, $n, (Get-PSCallStack).Count)
    }
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $o = & $path @ArgList 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    $lines = @($o | ForEach-Object { "$_" })
    if ($LogName -ne '') { $lines | Set-Content -LiteralPath "$ReleaseRoot\logs\$LogName.log" -Encoding ASCII }
    return [pscustomobject]@{ Code = $code; Out = $lines }
}

function Show-Tail { param($Result, [int]$Lines = 12) $Result.Out | Select-Object -Last $Lines | ForEach-Object { Write-Host "      $_" } }

# ---------------------------------------------------------------- release candidate input
# Runs git against an explicit directory. Deliberately NOT named Git (a function with that name shadows git.exe).
function Invoke-GitIn { param([string]$Dir, [string[]]$GitArgs) return (Run-Native 'git' (@('-C', $Dir) + $GitArgs)) }

# Returns the release-candidate SHA, or throws. The value is immutable INPUT, never derived from a moving ref.
function Resolve-Candidate {
    param([string]$Sha = '')
    if ([string]::IsNullOrWhiteSpace($Sha)) { $Sha = $env:BZ_CANDIDATE_SHA }
    if ([string]::IsNullOrWhiteSpace($Sha)) { throw 'The release-candidate SHA is required: pass -CandidateSha <40 lowercase hex> (or set BZ_CANDIDATE_SHA). Nothing is guessed from a branch.' }
    $Sha = $Sha.Trim()
    if ($Sha -cnotmatch '^[0-9a-f]{40}$') { throw "The release-candidate SHA must be the full 40-character lowercase hex commit id (a branch name, tag, HEAD or abbreviation is refused). Got: '$Sha'" }
    foreach ($ref in $ShaRollback, $ShaIdentity, $ShaMain, $ShaDocs, $ShaRuntime, $ShaTooling) {
        if ($Sha -ceq $ref) { throw "Refusing: $($Sha.Substring(0, 7)) is a historical reference commit, not the combined release candidate." }
    }
    return $Sha
}

# True for paths that cannot change application behavior: documentation, deployment tooling, the Studio validator.
function Test-ReleaseOnlyPath {
    param([string]$Path)
    if ($Path.Contains('..')) { return $false }
    if ($Path -ceq 'README.md') { return $true }
    if ($Path.StartsWith('docs/', [StringComparison]::Ordinal)) { return $true }
    if ($Path.StartsWith('infrastructure/deployment/', [StringComparison]::Ordinal)) { return $true }
    if (@('scripts/validate-studio.ps1', 'scripts/validate-studio.bat', 'scripts/validate-studio-selftest.ps1') -ccontains $Path) { return $true }
    if ($Path.EndsWith('.md', [StringComparison]::Ordinal)) { return $true }
    return $false
}

# Refuses unexpected ancestry. Every check is DERIVED from the supplied candidate and the reference constants above.
function Test-CandidateLineage {
    param([string]$Dir, [string]$Sha)
    $c = Invoke-GitIn $Dir @('rev-parse', '--verify', '--quiet', "$Sha^{commit}")
    $isCommit = ($c.Code -eq 0) -and ($c.Out.Count -gt 0) -and ($c.Out[0] -ceq $Sha)
    Rec 'candidate exists as a COMMIT and resolves to exactly itself' $isCommit $Sha
    if (-not $isCommit) { return }
    $refs = @(
        @('1a106bc (live beta; rollback target)', $ShaRollback),
        @('a283c24 (Checkpoint E identity milestone)', $ShaIdentity),
        @('856d012 (main at integration)', $ShaMain),
        @('bb8e14d (post-F6 documentation reconciliation)', $ShaDocs),
        @('f3b5483 (F1-F6 runtime, Studio-validated)', $ShaRuntime),
        @('d90f572 (release/identity-beta tooling tip)', $ShaTooling)
    )
    foreach ($r in $refs) {
        $a = Invoke-GitIn $Dir @('merge-base', '--is-ancestor', $r[1], $Sha)
        Rec "$($r[0]) is an ancestor of the candidate" ($a.Code -eq 0)
    }
    $d = Invoke-GitIn $Dir @('diff', '--name-only', $ShaRuntime, $Sha)
    $changed = @($d.Out | Where-Object { $_ -ne '' })
    $appTouched = @($changed | Where-Object { -not (Test-ReleaseOnlyPath $_) })
    Rec 'candidate differs from the Studio-validated runtime (f3b5483) ONLY in docs, deployment tooling and the validator' (($d.Code -eq 0) -and ($appTouched.Count -eq 0)) ("application paths changed: " + (($appTouched | Select-Object -First 10) -join ', '))
    Note "files differing from f3b5483: $($changed.Count) (all release-only when the line above passes)"
}

# ---------------------------------------------------------------- PostgreSQL
function Invoke-Psql {
    param([int]$Port, [string]$Db, [string]$User, [string]$PwFile, [string]$Sql)
    if ($Port -eq $LivePort) {
        $s = $Sql.Trim().TrimEnd(';')
        if ($User -ne 'bidazoo_app' -or $s -notmatch '^(?i)select\s' -or $s.Contains(';')) {
            throw 'Refusing: the live database is single-statement SELECT-only in this tooling.'
        }
    } elseif ($Port -ne $ScratchPort) { throw "Refusing: unexpected database port $Port" }
    $env:PGPASSWORD = Read-Secret $PwFile
    try {
        $r = Run-Native "$PgBin\psql.exe" @('-h','127.0.0.1','-p',"$Port",'-U',$User,'-d',$Db,'-At','-v','ON_ERROR_STOP=1','-c',$Sql)
        if ($r.Code -ne 0) { throw ("psql failed on port $Port db ${Db}: " + (($r.Out -join ' ').Trim())) }
        return @($r.Out)
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}
function Live-Q { param([string]$Sql) return @(Invoke-Psql -Port $LivePort -Db 'bidazoo' -User 'bidazoo_app' -PwFile "$Beta\config\pg-app.pw" -Sql $Sql) }
function Scr-Q  { param([string]$Db, [string]$Sql) return @(Invoke-Psql -Port $ScratchPort -Db $Db -User 'postgres' -PwFile "$ReleaseRoot\secrets\pg-scratch.pw" -Sql $Sql) }

# name -> "rowcount|md5-of-all-rows" for every user table. $Q is a scriptblock: { param($s) Live-Q $s }
function Get-Fingerprint {
    param([scriptblock]$Q)
    $tables = @(& $Q "select quote_ident(schemaname)||'.'||quote_ident(relname) from pg_stat_user_tables order by 1")
    $map = [ordered]@{}
    foreach ($t in $tables) {
        $c = @(& $Q "select count(*) from $t")[0]
        $h = @(& $Q "select coalesce(md5(string_agg(x::text, '|' order by x::text)),'empty') from $t x")[0]
        $map[$t] = "$c|$h"
    }
    return $map
}
function Show-Fingerprint { param($Map) foreach ($k in $Map.Keys) { Write-Host ('      {0,-42} rows={1}' -f $k, ($Map[$k].Split('|')[0])) } }

# ---------------------------------------------------------------- scratch cluster
function Test-Listening { param([int]$Port) return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }

function Initialize-ScratchCluster {
    if (Test-Path "$ReleaseRoot\pg-scratch\data\PG_VERSION") { Note 'scratch cluster already initialized'; return }
    if (Test-Listening $ScratchPort) { throw "Port $ScratchPort is already in use." }
    New-Item -ItemType Directory -Force -Path "$ReleaseRoot\pg-scratch","$ReleaseRoot\secrets" | Out-Null
    & icacls "$ReleaseRoot\secrets" /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
    $bytes = New-Object byte[] 24
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $pw = (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
    Set-Content -LiteralPath "$ReleaseRoot\secrets\pg-scratch.pw" -Value $pw -NoNewline -Encoding ASCII
    $r = Run-Native "$PgBin\initdb.exe" @('-D',"$ReleaseRoot\pg-scratch\data",'-U','postgres','--auth=scram-sha-256',"--pwfile=$ReleaseRoot\secrets\pg-scratch.pw",'-E','UTF8') -LogName 'scratch-initdb'
    if ($r.Code -ne 0) { Show-Tail $r; throw 'initdb failed' }
    Add-Content -LiteralPath "$ReleaseRoot\pg-scratch\data\postgresql.conf" -Value @('', "listen_addresses = '127.0.0.1'", "port = $ScratchPort") -Encoding ASCII
    Note 'scratch cluster initialized (scram-sha-256, loopback only, port 54341)'
}
function Ensure-ScratchRole {
    # Mirrors production privileges: databases are OWNED by a non-superuser role named bidazoo_app, and
    # restores / migrations / rehearsal APIs run as that role (scratch password only, never reused elsewhere).
    $have = @(Scr-Q 'postgres' "select count(*) from pg_roles where rolname = 'bidazoo_app'")[0]
    if ([int]$have -eq 0) {
        $pw = Read-Secret "$ReleaseRoot\secrets\pg-scratch.pw"
        [void](Scr-Q 'postgres' "create role bidazoo_app login password '$pw'")
        Note 'scratch role bidazoo_app created (non-superuser)'
    }
}
function Start-ScratchCluster {
    Initialize-ScratchCluster
    if (Test-Listening $ScratchPort) { Ensure-ScratchRole; Note 'scratch cluster already running'; return }
    $p = Start-Process -FilePath "$PgBin\postgres.exe" -ArgumentList @('-D',"$ReleaseRoot\pg-scratch\data") -WindowStyle Hidden -PassThru -RedirectStandardOutput "$ReleaseRoot\logs\pg-scratch.out.log" -RedirectStandardError "$ReleaseRoot\logs\pg-scratch.err.log"
    Set-Content -LiteralPath "$ReleaseRoot\run\pg-scratch.pid" -Value $p.Id
    $end = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $end) {
        $r = Run-Native "$PgBin\pg_isready.exe" @('-h','127.0.0.1','-p',"$ScratchPort")
        if ($r.Code -eq 0) { Note 'scratch cluster accepting connections'; Ensure-ScratchRole; return }
        Start-Sleep -Seconds 1
    }
    throw 'scratch cluster did not become ready (see C:\BidaZoo-release\logs\pg-scratch.err.log)'
}
function Stop-ScratchCluster {
    if (-not (Test-Path "$ReleaseRoot\pg-scratch\data\PG_VERSION")) { return }
    if (Test-Listening $ScratchPort) {
        $r = Run-Native "$PgBin\pg_ctl.exe" @('stop','-D',"$ReleaseRoot\pg-scratch\data",'-m','fast','-w')
        if ($r.Code -ne 0) { Show-Tail $r; throw 'pg_ctl stop failed' }
    }
    Remove-Item -LiteralPath "$ReleaseRoot\run\pg-scratch.pid" -Force -ErrorAction SilentlyContinue
}
function New-ScratchDb {
    param([string]$Name)
    if ($Name -notmatch '^(rehearsal_|verify_|final_verify_)[A-Za-z0-9_]+$') { throw 'scratch database names must start with rehearsal_, verify_ or final_verify_' }
    [void](Scr-Q 'postgres' "drop database if exists $Name with (force)")
    [void](Scr-Q 'postgres' "create database $Name owner bidazoo_app")
}
function Restore-Dump {
    param([string]$Dump, [string]$Db)
    $env:PGPASSWORD = Read-Secret "$ReleaseRoot\secrets\pg-scratch.pw"
    try {
        return (Run-Native "$PgBin\pg_restore.exe" @('-h','127.0.0.1','-p',"$ScratchPort",'-U','postgres','-d',$Db,'--no-owner','--no-privileges','--role=bidazoo_app','--exit-on-error',$Dump) -LogName "restore-$Db")
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}

# ---------------------------------------------------------------- tracked processes (by PID only)
function Start-Tracked {
    param([string]$Name, [string]$File, [string[]]$ArgList, [string]$WorkDir, [hashtable]$EnvVars)
    $saved = @{}
    foreach ($k in $EnvVars.Keys) {
        $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
        $v = $null
        if ($null -ne $EnvVars[$k]) { $v = [string]$EnvVars[$k] }
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
    try {
        $p = Start-Process -FilePath $File -ArgumentList $ArgList -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$ReleaseRoot\logs\$Name.out.log" -RedirectStandardError "$ReleaseRoot\logs\$Name.err.log"
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    Set-Content -LiteralPath "$ReleaseRoot\run\$Name.pid" -Value $p.Id
    return $p
}
function Stop-Tracked {
    param([string]$Name)
    $f = "$ReleaseRoot\run\$Name.pid"
    if (-not (Test-Path -LiteralPath $f)) { return }
    $id = [int](Get-Content -LiteralPath $f -Raw).Trim()
    $written = (Get-Item -LiteralPath $f).LastWriteTime
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) {
        # Only stop it if it really is the process we started (guards against PID reuse).
        if ($p.StartTime -le $written.AddSeconds(5) -and $p.StartTime -ge $written.AddSeconds(-120)) { Stop-Process -Id $id -Force }
        else { Note "PID $id for $Name is not the process we started; left alone" }
    }
    Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
}

function Assert-RehearsalPort {
    param([int]$Port)
    if ($Port -in 3101, 8480, 54340) { throw "Refusing: port $Port belongs to the live beta stack." }
    if (Test-Listening $Port) { throw "Rehearsal port $Port is already in use." }
}

# Starts an API from a built tree against a SCRATCH database. Production-like env, rehearsal ports only.
function Start-RehearsalApi {
    param([string]$Name, [string]$Tree, [int]$Port, [string]$Db, [hashtable]$Extra = @{})
    if ($Db -notmatch '^rehearsal_') { throw 'rehearsal APIs may only use rehearsal_* databases' }
    Assert-RehearsalPort $Port
    $pw = Read-Secret "$ReleaseRoot\secrets\pg-scratch.pw"
    $e = @{
        NODE_ENV = 'production'; API_HOST = '127.0.0.1'; API_PORT = "$Port"
        DATABASE_URL = "postgres://bidazoo_app:$pw@127.0.0.1:$ScratchPort/$Db"
        COOKIE_SECURE = 'true'; TRUST_PROXY = 'loopback'; HSTS_MAX_AGE_SECONDS = '0'
    }
    foreach ($k in 'IDENTITY_SECRET','LEGACY_MATCH_PEPPER','PUBLIC_BASE_URL','MAIL_TRANSPORT','MAIL_OUTBOX_DIR','MAIL_FROM','MAIL_FROM_NAME','MAIL_SMTP_HOST','MAIL_SMTP_PORT','MAIL_SMTP_SECURITY','MAIL_SMTP_USER','MAIL_SMTP_PASSWORD','ALLOWED_ORIGINS','RATE_GUEST_CREATE_BURST_MAX') { $e[$k] = $null }
    foreach ($k in $Extra.Keys) { $e[$k] = $Extra[$k] }
    return (Start-Tracked -Name $Name -File $NodeExe -ArgList @('dist\server.js') -WorkDir "$Tree\apps\api" -EnvVars $e)
}

function Wait-Http {
    param([string]$Url, [int]$Seconds = 30, [int]$Want = 200)
    $end = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $end) {
        try { $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3; if ([int]$r.StatusCode -eq $Want) { return $true } } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $false
}
function Get-Status {
    param([string]$Url, [string]$Method = 'GET', [hashtable]$Headers = @{}, [string]$Body = '')
    try {
        $p = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true; TimeoutSec = 10; Headers = $Headers }
        if ($Body -ne '') { $p['Body'] = $Body; $p['ContentType'] = 'application/json' }
        $r = Invoke-WebRequest @p
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return -1
    }
}

# Runs tests\scripts\api-playthrough.mjs from a tree against a rehearsal API. Returns the Run-Native result.
function Invoke-Playthrough {
    param([string]$Tree, [int]$Port, [string]$Db, [string]$LogName)
    if ($Db -notmatch '^rehearsal_') { throw 'playthrough may only target rehearsal_* databases' }
    $pw = Read-Secret "$ReleaseRoot\secrets\pg-scratch.pw"
    $env:API_URL = "http://127.0.0.1:$Port"
    $env:DATABASE_URL = "postgres://bidazoo_app:$pw@127.0.0.1:$ScratchPort/$Db"
    Push-Location $Tree
    try { return (Run-Native $NodeExe @('tests\scripts\api-playthrough.mjs') -LogName $LogName) }
    finally { Pop-Location; Remove-Item Env:API_URL -ErrorAction SilentlyContinue; Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
}
function Rec-Playthrough {
    param($Result, [string]$Label)
    $pass = @($Result.Out | Where-Object { $_ -match '^PASS' }).Count
    $fail = @($Result.Out | Where-Object { $_ -match '^FAIL' }).Count
    Rec "$Label playthrough" (($Result.Code -eq 0) -and ($fail -eq 0) -and ($pass -gt 0)) "exit=$($Result.Code) PASS=$pass FAIL=$fail"
    if ($fail -gt 0 -or $Result.Code -ne 0) { Show-Tail $Result 15 }
}

# ---------------------------------------------------------------- rehearsal Caddy (mirrors Caddyfile.beta, other ports)
# ---- Caddy fidelity: the LIVE Caddyfile.beta is the authority. The rehearsal Caddyfile is DERIVED from it by
# substituting only four approved values (listen port, API port, static root, access-log path). Nothing else is
# written by hand, so proxy/header/CSP/redirect behavior cannot drift from what runs live.
function Get-LiveCaddyfileText {
    $p = Join-Path $Beta 'config\Caddyfile.beta'
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "Live Caddyfile.beta not readable at $p (it is the authority for rehearsal fidelity)" }
    return (Get-Content -LiteralPath $p -Raw)
}
function Get-CaddyfileValues {
    param([string]$Text)
    $listen = [regex]::Matches($Text, '(?m)^\s*http://(?:play\.bidazoo\.com)?:(\d+)\s*\{')
    $api    = [regex]::Matches($Text, 'reverse_proxy\s+127\.0\.0\.1:(\d+)')
    $root   = [regex]::Matches($Text, '(?m)^\s*root\s+\*\s+(\S+)\s*$')
    $log    = [regex]::Matches($Text, '(?m)^\s*output\s+file\s+(\S+)\s*\{')
    if ($listen.Count -ne 2 -or $api.Count -ne 1 -or $root.Count -ne 1 -or $log.Count -ne 1) {
        throw "Unexpected Caddyfile shape (listen sites=$($listen.Count) want 2, reverse_proxy=$($api.Count) want 1, root=$($root.Count) want 1, log=$($log.Count) want 1)"
    }
    $lp = @($listen | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    if ($lp.Count -ne 1) { throw "The two site blocks do not share one listen port: $($lp -join ',')" }
    return [pscustomobject]@{ Listen = $lp[0]; Api = $api[0].Groups[1].Value; Root = $root[0].Groups[1].Value; Log = $log[0].Groups[1].Value }
}
# Canonical form: CRLF/LF, indentation, blank lines and comment lines normalized; the four approved values replaced
# by placeholders. Line ORDER is preserved and compared.
function Get-CanonicalCaddyfile {
    param([string]$Text, $Values)
    $t = $Text.Replace($Values.Root, '<STATIC_ROOT>').Replace($Values.Log, '<ACCESS_LOG>')
    $t = [regex]::Replace($t, ':' + $Values.Listen + '(?!\d)', ':<LISTEN_PORT>')
    $t = [regex]::Replace($t, '127\.0\.0\.1:' + $Values.Api + '(?!\d)', '127.0.0.1:<API_PORT>')
    return @($t -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' -and -not $_.StartsWith('#') })
}
function New-RehearsalCaddyfile {
    param([int]$Port, [int]$ApiPort, [string]$DistDir, [string]$Path, [string]$LogPath = '')
    if ($LogPath -eq '') { $LogPath = "$ReleaseRoot\logs\caddy-access-rehearsal.log" }
    $live = Get-LiveCaddyfileText
    $v = Get-CaddyfileValues $live
    $text = $live.Replace($v.Root, $DistDir.Replace('\', '/')).Replace($v.Log, $LogPath.Replace('\', '/'))
    $text = [regex]::Replace($text, ':' + $v.Listen + '(?!\d)', ":$Port")
    $text = [regex]::Replace($text, '127\.0\.0\.1:' + $v.Api + '(?!\d)', "127.0.0.1:$ApiPort")
    Set-Content -LiteralPath $Path -Value $text -Encoding ASCII
}
# Compares a generated rehearsal Caddyfile with the live one on canonical form. Returns Ok, the canonical lines of
# both, and every unexpected difference (an empty list means semantically identical apart from the 4 approved values).
function Compare-RehearsalCaddyfile {
    param([string]$RehearsalPath, [int]$Port, [int]$ApiPort, [string]$DistDir, [string]$LogPath)
    $live = Get-LiveCaddyfileText; $lv = Get-CaddyfileValues $live
    $reh  = Get-Content -LiteralPath $RehearsalPath -Raw
    $rv   = [pscustomobject]@{ Listen = "$Port"; Api = "$ApiPort"; Root = $DistDir.Replace('\', '/'); Log = $LogPath.Replace('\', '/') }
    $a = @(Get-CanonicalCaddyfile $live $lv); $b = @(Get-CanonicalCaddyfile $reh $rv)
    $diff = @()
    for ($i = 0; $i -lt [Math]::Max($a.Count, $b.Count); $i++) {
        $x = if ($i -lt $a.Count) { $a[$i] } else { '(missing)' }; $y = if ($i -lt $b.Count) { $b[$i] } else { '(missing)' }
        if ($x -cne $y) { $diff += ("line {0}: live=[{1}] rehearsal=[{2}]" -f ($i + 1), $x, $y) }
    }
    return [pscustomobject]@{ Ok = ($diff.Count -eq 0); Live = $a; Rehearsal = $b; Diff = $diff; LiveValues = $lv }
}
function Start-RehearsalCaddy {
    param([string]$Name, [int]$Port, [int]$ApiPort, [string]$DistDir)
    Assert-RehearsalPort $Port
    $cf = "$ReleaseRoot\run\Caddyfile.$Name"
    $cl = "$ReleaseRoot\logs\caddy-access-$Name.log"
    New-RehearsalCaddyfile -Port $Port -ApiPort $ApiPort -DistDir $DistDir -Path $cf -LogPath $cl
    $fid = Compare-RehearsalCaddyfile -RehearsalPath $cf -Port $Port -ApiPort $ApiPort -DistDir $DistDir -LogPath $cl
    Rec "rehearsal Caddyfile '$Name' is semantically identical to live Caddyfile.beta (only listen/API port, static root, log path differ)" $fid.Ok ($fid.Diff -join ' ; ')
    if (-not $fid.Ok) { throw "rehearsal Caddyfile drifted from live ($Name)" }
    if ($cl.Replace('\', '/') -eq $fid.LiveValues.Log) { throw 'refusing: rehearsal access log would be the live log file' }
    $v = Run-Native "$Beta\bin\caddy.exe" @('validate','--config',$cf,'--adapter','caddyfile') -LogName "caddy-validate-$Name"
    if ($v.Code -ne 0) { Show-Tail $v; throw "rehearsal Caddyfile did not validate ($Name)" }
    $e = @{ XDG_DATA_HOME = "$ReleaseRoot\run\caddy-data"; XDG_CONFIG_HOME = "$ReleaseRoot\run\caddy-config"; APPDATA = "$ReleaseRoot\run\caddy-config"; LOCALAPPDATA = "$ReleaseRoot\run\caddy-data" }
    return (Start-Tracked -Name $Name -File "$Beta\bin\caddy.exe" -ArgList @('run','--config',$cf,'--adapter','caddyfile') -WorkDir $ReleaseRoot -EnvVars $e)
}
function Probe {
    param([int]$Port, [string]$Method, [string]$Path, [string[]]$Extra = @())
    $a = @("$Tools\http-probe.mjs","$Port",$Method,$Path) + $Extra
    $r = Run-Native $NodeExe $a
    return $r.Out
}
function Probe-Status {
    param([string[]]$Lines)
    $m = $Lines | Where-Object { $_ -match '^status=' } | Select-Object -First 1
    if ($m) { return [int](($m -replace 'status=', '') -replace ' .*', '') }
    return -1
}

# ---------------------------------------------------------------- migration object verification
# PostgreSQL silently truncates identifiers longer than 63 bytes (NAMEDATALEN-1). Migration 0003 declares one
# 65-character foreign-key name, which PostgreSQL stores truncated. Expected names are therefore truncated the
# same way, and foreign keys are verified by STRUCTURE (table, columns, referenced table/columns, ON DELETE,
# ON UPDATE), not only by name. Names here are ASCII, so characters == bytes.
function Get-PgIdentifier { param([string]$Name) if ($Name.Length -gt 63) { return $Name.Substring(0, 63) } return $Name }
function Get-PgActionCode {
    param([string]$Action)
    switch ($Action.Trim().ToLowerInvariant()) {
        'no action' { return 'a' } 'restrict' { return 'r' } 'cascade' { return 'c' }
        'set null' { return 'n' } 'set default' { return 'd' } default { throw "Unknown referential action: $Action" }
    }
}
# Parses every ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY declaration in a migration file's text.
function Get-DeclaredForeignKeys {
    param([string]$MigrationSql)
    $rx = 'ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \(([^)]+)\) REFERENCES "public"\."(\w+)"\(([^)]+)\) ON DELETE ([a-z ]+?) ON UPDATE ([a-z ]+?);'
    $out = @()
    foreach ($m in [regex]::Matches($MigrationSql, $rx)) {
        $out += [pscustomobject]@{
            Table = $m.Groups[1].Value; DeclaredName = $m.Groups[2].Value; StoredName = (Get-PgIdentifier $m.Groups[2].Value)
            Cols = ($m.Groups[3].Value -replace '[" ]', ''); RefTable = $m.Groups[4].Value; RefCols = ($m.Groups[5].Value -replace '[" ]', '')
            Del = (Get-PgActionCode $m.Groups[6].Value); Upd = (Get-PgActionCode $m.Groups[7].Value)
        }
    }
    return $out
}
function Format-DeclaredFk { param($f) return ('{0}({1}) -> {2}({3}) del={4} upd={5} name={6}' -f $f.Table, $f.Cols, $f.RefTable, $f.RefCols, $f.Del, $f.Upd, $f.StoredName) }
# SQL (single SELECT, no double quotes, no semicolon) returning one text row per foreign key on the given tables.
function Get-ActualFkSql {
    param([string[]]$Tables)
    $list = "array['" + ($Tables -join "','") + "']"
    return ("select cl.relname || '(' || (select string_agg(a.attname, ',' order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) || ') -> ' || rl.relname || '(' || (select string_agg(a.attname, ',' order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) || ') del=' || c.confdeltype::text || ' upd=' || c.confupdtype::text || ' name=' || c.conname::text as x from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class rl on rl.oid = c.confrelid join pg_namespace n on n.oid = cl.relnamespace where c.contype = 'f' and n.nspname = 'public' and cl.relname = any(" + $list + ") order by 1")
}

function Test-IdentitySchema {
    param([scriptblock]$Q, [string]$MigrationsDir)
    $m3 = Get-Content -LiteralPath (Join-Path $MigrationsDir '0003_identity_family_tables.sql') -Raw
    $m4 = Get-Content -LiteralPath (Join-Path $MigrationsDir '0004_identity_guards.sql') -Raw
    $tables = @([regex]::Matches($m3, 'CREATE TABLE "([^"]+)"') | ForEach-Object { Get-PgIdentifier $_.Groups[1].Value } | Sort-Object -Unique)
    $fkDecl = @(Get-DeclaredForeignKeys $m3)
    $fkWords = [regex]::Matches($m3, 'FOREIGN KEY').Count
    # every other CONSTRAINT declared inside CREATE TABLE (CHECK / UNIQUE): inline "CONSTRAINT "name" ..."
    $inline = @([regex]::Matches($m3, '(?m)^\s*CONSTRAINT "([^"]+)"') | ForEach-Object { Get-PgIdentifier $_.Groups[1].Value } | Sort-Object -Unique)
    $idx    = @([regex]::Matches($m3, 'CREATE (?:UNIQUE )?INDEX "([^"]+)"') | ForEach-Object { Get-PgIdentifier $_.Groups[1].Value } | Sort-Object -Unique)
    $trg    = @([regex]::Matches($m4, 'CREATE TRIGGER (\w+)') | ForEach-Object { Get-PgIdentifier $_.Groups[1].Value } | Sort-Object -Unique)
    $fns    = @([regex]::Matches($m4, 'CREATE FUNCTION (\w+)') | ForEach-Object { Get-PgIdentifier $_.Groups[1].Value } | Sort-Object -Unique)
    $arr = { param($names) "array['" + ($names -join "','") + "']" }
    $n = @(& $Q "select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname = any($(& $arr $tables))")[0]
    Rec "identity tables present ($($tables.Count) declared in 0003)" ([int]$n -eq $tables.Count) "found=$n"
    # --- foreign keys: structural comparison, each declared FK must exist exactly once ---
    Rec "FK parser sanity: ALTER ... FOREIGN KEY declarations parsed = FOREIGN KEY occurrences ($fkWords)" ($fkDecl.Count -eq $fkWords -and $fkWords -gt 0) "parsed=$($fkDecl.Count) occurrences=$fkWords"
    $actualFk = @(& $Q (Get-ActualFkSql -Tables $tables) | Where-Object { $_ -ne '' })
    $expectedFk = @($fkDecl | ForEach-Object { Format-DeclaredFk $_ })
    $missingFk = @($expectedFk | Where-Object { $actualFk -notcontains $_ })
    $extraFk   = @($actualFk   | Where-Object { $expectedFk -notcontains $_ })
    Rec "foreign keys present and structurally identical ($($fkDecl.Count) declared in 0003)" (($missingFk.Count -eq 0) -and ($extraFk.Count -eq 0) -and ($actualFk.Count -eq $fkDecl.Count)) ("found=$($actualFk.Count) missing=[" + ($missingFk -join ' ; ') + "] unexpected=[" + ($extraFk -join ' ; ') + "]")
    $longNames = @($fkDecl | Where-Object { $_.DeclaredName -ne $_.StoredName })
    foreach ($ln in $longNames) { Note ("PostgreSQL truncates this 63+ character constraint name: declared {0} ({1} chars) -> stored {2}" -f $ln.DeclaredName, $ln.DeclaredName.Length, $ln.StoredName) }
    Write-Host '      actual foreign keys:'; $actualFk | ForEach-Object { Write-Host "        $_" }
    if ($inline.Count -gt 0) {
        $n = @(& $Q "select count(*) from pg_constraint where contype in ('p','c','u') and conname = any($(& $arr $inline))")[0]
        Rec "CHECK/UNIQUE constraints present ($($inline.Count) declared inline in 0003)" ([int]$n -eq $inline.Count) "found=$n"
    }
    $n = @(& $Q "select count(*) from pg_indexes where schemaname='public' and indexname = any($(& $arr $idx))")[0]
    Rec "indexes present ($($idx.Count) declared in 0003)" ([int]$n -eq $idx.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_trigger where not tgisinternal and tgname = any($(& $arr $trg))")[0]
    Rec "triggers present ($($trg.Count) declared in 0004)" ([int]$n -eq $trg.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_proc where proname = any($(& $arr $fns))")[0]
    Rec "guard functions present ($($fns.Count) declared in 0004)" ([int]$n -eq $fns.Count) "found=$n"
    return $tables
}
