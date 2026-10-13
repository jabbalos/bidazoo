# Shared helpers for the Checkpoint E identity-release REHEARSAL tooling. ASCII only.
# Dot-source from the numbered scripts:  . "$PSScriptRoot\lib.ps1"
#
# SAFETY MODEL
#  - The live beta database is opened SELECT-only (Invoke-Psql refuses anything else on port 54340).
#  - Every rehearsal runs against a throwaway PostgreSQL cluster on port 54341 under C:\BidaZoo-release.
#  - Rehearsal processes use ports 3102-3105 / 8481-8482 only, and are stopped by recorded PID, never by name.
#  - Nothing here edits api.env, Caddyfile.beta, run-*.cmd, scheduled tasks, DNS, Cloudflare or the live checkout.
#  - Secrets are read from files into process environment variables and are never echoed.

$ErrorActionPreference = 'Stop'

$Beta        = 'C:\BidaZoo-beta'
$R           = 'C:\BidaZoo-release'
$Repo        = 'C:\Users\jonat\Documents\BidaZoo-Identity-Release'
$MainRepo    = 'C:\Users\jonat\Documents\BidaZoo'
$PgBin       = "$Beta\pg\pgsql\bin"
$LivePort    = 54340
$ScratchPort = 54341
$ShaStage    = 'a283c2470fe5abcb47f49d3f5753dea1bd881e78'
$ShaDocs     = '856d012d3139735d7f13ffeebabb723222fba2e1'
$ShaRollback = '1a106bc328ed0d544d4c49b61f3a1c2071ae65b7'
$ReleaseDir  = $PSScriptRoot
$Tools       = Join-Path $ReleaseDir 'tools'
$NodeExe     = (Get-Command node -ErrorAction SilentlyContinue).Source

function Initialize-Release {
    param([string]$Step)
    $ErrorActionPreference = 'Stop'
    foreach ($d in 'evidence','run','logs','trees','rehearsal-backups','secrets','tmp','rollback-kit') {
        New-Item -ItemType Directory -Force -Path "$R\$d" | Out-Null
    }
    $global:StepName = $Step
    $global:Results = New-Object System.Collections.ArrayList
    $global:EvidenceFile = "$R\evidence\$Step-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
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

# Runs a native command without PowerShell 5.1 turning stderr lines into terminating errors.
function Run-Native {
    param([string]$Exe, [string[]]$ArgList, [string]$LogName = '')
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $o = & $Exe @ArgList 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    $lines = @($o | ForEach-Object { "$_" })
    if ($LogName -ne '') { $lines | Set-Content -LiteralPath "$R\logs\$LogName.log" -Encoding ASCII }
    return [pscustomobject]@{ Code = $code; Out = $lines }
}

function Show-Tail { param($Result, [int]$Lines = 12) $Result.Out | Select-Object -Last $Lines | ForEach-Object { Write-Host "      $_" } }

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
function Scr-Q  { param([string]$Db, [string]$Sql) return @(Invoke-Psql -Port $ScratchPort -Db $Db -User 'postgres' -PwFile "$R\secrets\pg-scratch.pw" -Sql $Sql) }

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
    if (Test-Path "$R\pg-scratch\data\PG_VERSION") { Note 'scratch cluster already initialized'; return }
    if (Test-Listening $ScratchPort) { throw "Port $ScratchPort is already in use." }
    New-Item -ItemType Directory -Force -Path "$R\pg-scratch","$R\secrets" | Out-Null
    & icacls "$R\secrets" /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
    $bytes = New-Object byte[] 24
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $pw = (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
    Set-Content -LiteralPath "$R\secrets\pg-scratch.pw" -Value $pw -NoNewline -Encoding ASCII
    $r = Run-Native "$PgBin\initdb.exe" @('-D',"$R\pg-scratch\data",'-U','postgres','--auth=scram-sha-256',"--pwfile=$R\secrets\pg-scratch.pw",'-E','UTF8') -LogName 'scratch-initdb'
    if ($r.Code -ne 0) { Show-Tail $r; throw 'initdb failed' }
    Add-Content -LiteralPath "$R\pg-scratch\data\postgresql.conf" -Value @('', "listen_addresses = '127.0.0.1'", "port = $ScratchPort") -Encoding ASCII
    Note 'scratch cluster initialized (scram-sha-256, loopback only, port 54341)'
}
function Ensure-ScratchRole {
    # Mirrors production privileges: databases are OWNED by a non-superuser role named bidazoo_app, and
    # restores / migrations / rehearsal APIs run as that role (scratch password only, never reused elsewhere).
    $have = @(Scr-Q 'postgres' "select count(*) from pg_roles where rolname = 'bidazoo_app'")[0]
    if ([int]$have -eq 0) {
        $pw = Read-Secret "$R\secrets\pg-scratch.pw"
        [void](Scr-Q 'postgres' "create role bidazoo_app login password '$pw'")
        Note 'scratch role bidazoo_app created (non-superuser)'
    }
}
function Start-ScratchCluster {
    Initialize-ScratchCluster
    if (Test-Listening $ScratchPort) { Ensure-ScratchRole; Note 'scratch cluster already running'; return }
    $p = Start-Process -FilePath "$PgBin\postgres.exe" -ArgumentList @('-D',"$R\pg-scratch\data") -WindowStyle Hidden -PassThru -RedirectStandardOutput "$R\logs\pg-scratch.out.log" -RedirectStandardError "$R\logs\pg-scratch.err.log"
    Set-Content -LiteralPath "$R\run\pg-scratch.pid" -Value $p.Id
    $end = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $end) {
        $r = Run-Native "$PgBin\pg_isready.exe" @('-h','127.0.0.1','-p',"$ScratchPort")
        if ($r.Code -eq 0) { Note 'scratch cluster accepting connections'; Ensure-ScratchRole; return }
        Start-Sleep -Seconds 1
    }
    throw 'scratch cluster did not become ready (see C:\BidaZoo-release\logs\pg-scratch.err.log)'
}
function Stop-ScratchCluster {
    if (-not (Test-Path "$R\pg-scratch\data\PG_VERSION")) { return }
    if (Test-Listening $ScratchPort) {
        $r = Run-Native "$PgBin\pg_ctl.exe" @('stop','-D',"$R\pg-scratch\data",'-m','fast','-w')
        if ($r.Code -ne 0) { Show-Tail $r; throw 'pg_ctl stop failed' }
    }
    Remove-Item -LiteralPath "$R\run\pg-scratch.pid" -Force -ErrorAction SilentlyContinue
}
function New-ScratchDb {
    param([string]$Name)
    if ($Name -notmatch '^(rehearsal_|verify_|final_verify_)[A-Za-z0-9_]+$') { throw 'scratch database names must start with rehearsal_, verify_ or final_verify_' }
    [void](Scr-Q 'postgres' "drop database if exists $Name with (force)")
    [void](Scr-Q 'postgres' "create database $Name owner bidazoo_app")
}
function Restore-Dump {
    param([string]$Dump, [string]$Db)
    $env:PGPASSWORD = Read-Secret "$R\secrets\pg-scratch.pw"
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
        $p = Start-Process -FilePath $File -ArgumentList $ArgList -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$R\logs\$Name.out.log" -RedirectStandardError "$R\logs\$Name.err.log"
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    Set-Content -LiteralPath "$R\run\$Name.pid" -Value $p.Id
    return $p
}
function Stop-Tracked {
    param([string]$Name)
    $f = "$R\run\$Name.pid"
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
    $pw = Read-Secret "$R\secrets\pg-scratch.pw"
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
    $pw = Read-Secret "$R\secrets\pg-scratch.pw"
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
function New-RehearsalCaddyfile {
    param([int]$Port, [int]$ApiPort, [string]$DistDir, [string]$Path)
    $dist = $DistDir.Replace('\', '/')
    $text = @"
{
	auto_https off
	admin off
	persist_config off
}

http://play.bidazoo.com:$Port {
	bind 127.0.0.1
	@not_https {
		not {
			header_regexp cfv CF-Visitor ``"scheme"\s*:\s*"https"``
		}
	}
	handle @not_https {
		redir https://play.bidazoo.com{uri} 308
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:$ApiPort {
			header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
			header_up X-Forwarded-Proto https
			header_up X-Forwarded-Host {http.request.host}
			header_up -X-Real-IP
		}
	}
	handle {
		header {
			Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
			X-Content-Type-Options nosniff
			Referrer-Policy no-referrer
			X-Frame-Options DENY
			Cross-Origin-Opener-Policy same-origin
			Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
		}
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		@shell path / /index.html
		header @shell Cache-Control "no-cache"
		root * $dist
		try_files {path} /index.html
		file_server
	}
}

http://:$Port {
	bind 127.0.0.1
	respond 404
}
"@
    Set-Content -LiteralPath $Path -Value $text -Encoding ASCII
}
function Start-RehearsalCaddy {
    param([string]$Name, [int]$Port, [int]$ApiPort, [string]$DistDir)
    Assert-RehearsalPort $Port
    $cf = "$R\run\Caddyfile.$Name"
    New-RehearsalCaddyfile -Port $Port -ApiPort $ApiPort -DistDir $DistDir -Path $cf
    $v = Run-Native "$Beta\bin\caddy.exe" @('validate','--config',$cf,'--adapter','caddyfile') -LogName "caddy-validate-$Name"
    if ($v.Code -ne 0) { Show-Tail $v; throw "rehearsal Caddyfile did not validate ($Name)" }
    $e = @{ XDG_DATA_HOME = "$R\run\caddy-data"; XDG_CONFIG_HOME = "$R\run\caddy-config"; APPDATA = "$R\run\caddy-config"; LOCALAPPDATA = "$R\run\caddy-data" }
    return (Start-Tracked -Name $Name -File "$Beta\bin\caddy.exe" -ArgList @('run','--config',$cf,'--adapter','caddyfile') -WorkDir $R -EnvVars $e)
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
# Verifies, via scriptblock $Q, that everything declared in migrations 0003 and 0004 exists.
function Test-IdentitySchema {
    param([scriptblock]$Q, [string]$MigrationsDir)
    $m3 = Get-Content -LiteralPath (Join-Path $MigrationsDir '0003_identity_family_tables.sql') -Raw
    $m4 = Get-Content -LiteralPath (Join-Path $MigrationsDir '0004_identity_guards.sql') -Raw
    $tables = @([regex]::Matches($m3, 'CREATE TABLE "([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $cons   = @([regex]::Matches($m3, 'ADD CONSTRAINT "([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $idx    = @([regex]::Matches($m3, 'CREATE (?:UNIQUE )?INDEX "([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $trg    = @([regex]::Matches($m4, 'CREATE TRIGGER (\w+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $fns    = @([regex]::Matches($m4, 'CREATE FUNCTION (\w+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $arr = { param($names) "array['" + ($names -join "','") + "']" }
    $n = @(& $Q "select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname = any($(& $arr $tables))")[0]
    Rec "identity tables present ($($tables.Count) declared in 0003)" ([int]$n -eq $tables.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_constraint where conname = any($(& $arr $cons))")[0]
    Rec "foreign keys present ($($cons.Count) declared in 0003)" ([int]$n -eq $cons.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_indexes where schemaname='public' and indexname = any($(& $arr $idx))")[0]
    Rec "indexes present ($($idx.Count) declared in 0003)" ([int]$n -eq $idx.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_trigger where not tgisinternal and tgname = any($(& $arr $trg))")[0]
    Rec "triggers present ($($trg.Count) declared in 0004)" ([int]$n -eq $trg.Count) "found=$n"
    $n = @(& $Q "select count(*) from pg_proc where proname = any($(& $arr $fns))")[0]
    Rec "guard functions present ($($fns.Count) declared in 0004)" ([int]$n -eq $fns.Count) "found=$n"
    return $tables
}
