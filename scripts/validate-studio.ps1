<#
.SYNOPSIS
  One-click Studio PC validation for the BidaZoo Checkpoint B baseline (commit 01b7d41).

.DESCRIPTION
  Runs, in order: environment checks, npm ci, the OFFICIAL Playwright Chromium install, creation of
  two throwaway PostgreSQL databases (bidazoo_test, bidazoo_e2e), migrations, the full Vitest suite
  against bidazoo_test, and the full Playwright suite against bidazoo_e2e. Process exit codes are
  authoritative. Expected counts are reported but never used to decide pass/fail.

  Safety: it only ever creates, migrates, and (when you ask) drops databases named exactly
  bidazoo_test and bidazoo_e2e. It never touches any other database, never changes configuration
  files, and never deletes failure evidence (logs, traces, screenshots, videos).

  Privileges: everything runs as the CURRENT user. The script never elevates itself and never
  relaunches anything as Administrator, because npm package scripts and test code should not run
  with admin rights for convenience. Nothing in the normal flow needs elevation. If the repository
  folder is not writable, the script stops and says so (see "Elevation" in docs/STUDIO-VALIDATION.md).

  Portable PostgreSQL (-PortablePostgres): no system-wide PostgreSQL install is needed. The script
  uses PostgreSQL 16 Windows x64 binaries that YOU download once (see docs/STUDIO-VALIDATION.md),
  keeps them and a throwaway cluster under %USERPROFILE%\BidaZoo-pg, listens on 127.0.0.1 only
  (port 54329 by default) with trust authentication (acceptable ONLY because of that), starts it with
  pg_ctl, and stops ONLY the server this run started. It never creates a Windows service, never
  edits PATH, never elevates, and never touches any other PostgreSQL instance. -Cleanup still drops
  only the two throwaway databases; it never deletes the portable folder.

  Exit codes: 0 = validation passed, 1 = validation failed, 2 = a precondition failed (nothing ran).
  Any failure to find, initialize, or start the portable PostgreSQL is a precondition failure (2).

.PARAMETER PgHost      PostgreSQL host. Default: localhost.
.PARAMETER PgPort      PostgreSQL port. Default: 5432.
.PARAMETER PgUser      PostgreSQL superuser (must be able to CREATE DATABASE). Default: postgres.
.PARAMETER Recreate    If bidazoo_test / bidazoo_e2e already exist, drop and recreate them after you
                       type "yes". Without this switch, existing databases make the script stop.
.PARAMETER Cleanup     Drop the two throwaway databases at the end, but ONLY if validation passed.
.PARAMETER NoPrompt    Never ask questions (no password prompt, no cleanup question). Requires
                       PGPASSWORD to be set if the server needs a password.
.PARAMETER PortablePostgres
                       Use an isolated, BidaZoo-owned portable PostgreSQL 16 instead of a server you
                       installed. Forces host 127.0.0.1 and user postgres; port defaults to 54329 (pass
                       -PgPort to change it; 5432 is refused). No password is needed or asked for.
.PARAMETER PortableRoot
                       Folder for the portable binaries and cluster. Default: %USERPROFILE%\BidaZoo-pg.

.EXAMPLE
  .\scripts\validate-studio.ps1
.EXAMPLE
  .\scripts\validate-studio.ps1 -Cleanup
.EXAMPLE
  .\scripts\validate-studio.ps1 -PortablePostgres
#>
[CmdletBinding()]
param(
  [string]$PgHost = 'localhost',
  [int]$PgPort = 5432,
  [string]$PgUser = 'postgres',
  [switch]$Recreate,
  [switch]$Cleanup,
  [switch]$NoPrompt,
  [switch]$PortablePostgres,
  [string]$PortableRoot = ''
)

Set-StrictMode -Version 1.0

# Remember the arguments this script was started with (a function's own $PSBoundParameters is not
# the script's), so a deliberate elevated re-run command can be shown with them preserved.
$script:BoundArgs = @{}
foreach ($k in $PSBoundParameters.Keys) { $script:BoundArgs[$k] = $PSBoundParameters[$k] }
# Native commands (npm, git, psql) report failure through exit codes, which this script checks
# itself. 'Continue' keeps stderr text from becoming terminating errors on Windows PowerShell 5.1.
$ErrorActionPreference = 'Continue'

$BaselineCommit = '01b7d41'
$TestDb = 'bidazoo_test'
$E2eDb = 'bidazoo_e2e'
$Ports = @(3001, 4173)
$ExpectedUnit = 51
$ExpectedIntegration = 88
$ExpectedTodo = 3
$ExpectedPlaywright = 40
$ExpectedProjects = 4

$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:Failures = New-Object System.Collections.Generic.List[string]
$script:CreatedDbs = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------
function Write-Banner([string]$Text) {
  Write-Host ''
  Write-Host ('=' * 64) -ForegroundColor Cyan
  Write-Host $Text -ForegroundColor Cyan
  Write-Host ('=' * 64) -ForegroundColor Cyan
}
function Write-Step([string]$Text) { Write-Host ''; Write-Host ('>> ' + $Text) -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host ('   OK    ' + $Text) -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host ('   WARN  ' + $Text) -ForegroundColor Yellow; $script:Warnings.Add($Text) }
function Write-Bad([string]$Text) { Write-Host ('   FAIL  ' + $Text) -ForegroundColor Red }

function Stop-Precondition([string]$Text) {
  Write-Bad $Text
  Write-Host ''
  Write-Host 'Nothing was validated. Fix the problem above and run the script again.' -ForegroundColor Red
  Stop-PortablePostgres   # no-op unless this run started the portable server
  exit 2
}

function Remove-Ansi([string]$Text) {
  $esc = [string][char]27
  return [regex]::Replace($Text, ($esc + '\[[0-9;?]*[A-Za-z]'), '')
}

# Runs a native command, shows its output live, saves it to a log file, and returns its exit code.
# $Exe is the program; $ArgList is an array of arguments (each is passed as ONE argument, so paths
# with spaces are safe).
function Invoke-Logged([string]$Exe, [string[]]$ArgList, [string]$LogFile) {
  $global:LASTEXITCODE = 0
  & $Exe @ArgList 2>&1 | ForEach-Object {
    $line = Hide-Password (Remove-Ansi ([string]$_))
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  }
  return $global:LASTEXITCODE
}

# Runs psql quietly against a named database and returns stdout (trimmed) in .Out, exit in .Code.
function Invoke-Psql([string]$Database, [string]$Sql) {
  $global:LASTEXITCODE = 0
  $out = & $script:Psql -h $PgHost -p $PgPort -U $PgUser -d $Database -w -v ON_ERROR_STOP=1 -X -t -A -c $Sql 2>&1
  $code = $global:LASTEXITCODE
  return [pscustomobject]@{ Code = $code; Out = (($out | ForEach-Object { [string]$_ }) -join "`n").Trim() }
}

function New-DbUrl([string]$Database) {
  $user = [uri]::EscapeDataString($PgUser)
  if ($script:PgPasswordPlain) {
    $pw = [uri]::EscapeDataString($script:PgPasswordPlain)
    return ('postgres://{0}:{1}@{2}:{3}/{4}' -f $user, $pw, $PgHost, $PgPort, $Database)
  }
  return ('postgres://{0}@{1}:{2}/{3}' -f $user, $PgHost, $PgPort, $Database)
}
function Hide-Password([string]$Text) {
  if ($script:PgPasswordPlain) { return $Text.Replace($script:PgPasswordPlain, '********').Replace([uri]::EscapeDataString($script:PgPasswordPlain), '********') }
  return $Text
}

function Test-Elevated {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

# Rebuilds the exact command (with the original arguments, safely quoted) so the user can run it
# deliberately from an elevated terminal if they decide that is what they want.
function Get-OriginalCommandLine {
  $parts = @('powershell -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
  foreach ($key in $script:BoundArgs.Keys) {
    $value = $script:BoundArgs[$key]
    if ($value -is [System.Management.Automation.SwitchParameter]) {
      if ($value.IsPresent) { $parts += ('-' + $key) }
    } else {
      $parts += ('-' + $key + ' "' + ([string]$value).Replace('"', '\"') + '"')
    }
  }
  return ($parts -join ' ')
}

function Test-Interactive {
  if ($NoPrompt) { return $false }
  try { return ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) } catch { return $false }
}

function Remove-ThrowawayDb([string]$Name) {
  # Safety: only these two exact names can ever be dropped.
  if ($Name -ne $TestDb -and $Name -ne $E2eDb) { throw "Refusing to drop unexpected database '$Name'." }
  $r = Invoke-Psql 'postgres' ('DROP DATABASE IF EXISTS "{0}" WITH (FORCE)' -f $Name)
  if ($r.Code -eq 0) { Write-Ok "dropped database $Name" } else { Write-Bad ("could not drop {0}: {1}" -f $Name, (Hide-Password $r.Out)) }
  return ($r.Code -eq 0)
}

# ---------------------------------------------------------------------------------------------
# Portable PostgreSQL helpers (used only with -PortablePostgres)
#
# Isolation rules, enforced in code below:
#  - Everything lives under $Portable.Root (default %USERPROFILE%\BidaZoo-pg). The cluster is
#    always <root>\data and must carry this script's marker file, so a cluster the script did not
#    create is never started, reconfigured, or stopped.
#  - The server listens on 127.0.0.1 only. Trust authentication is used ONLY because of that, a
#    non-default port, and throwaway data; pg_hba.conf is audited to be loopback-only.
#  - Shutdown runs `pg_ctl stop` against <root>\data only, and only if THIS run started the server
#    and postmaster.pid still names the PID this run saw. Nothing here kills a process by name or id.
#  - No Windows service, no PATH edit, no elevation, no machine-wide change.
# ---------------------------------------------------------------------------------------------
$script:Exe = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
$script:Portable = [ordered]@{
  Enabled = $false; Root = ''; Bin = ''; Data = ''; ServerLog = ''; Port = 0
  Version = 'n/a'; ClusterStatus = 'n/a'; StartAttempted = $false; StartedByRun = $false; StartedPid = ''
  ShutdownAttempted = $false; ShutdownOk = $false; ShutdownResult = 'n/a'
}
$script:LogDir = ''

# Reads a file that another process (the server) may still have open.
function Read-SharedText([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  $fs = $null
  try {
    $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $fs = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
    $sr = New-Object System.IO.StreamReader($fs)
    return $sr.ReadToEnd()
  } catch { return '' } finally { if ($fs) { $fs.Dispose() } }
}

function Show-LogTail([string]$Path, [int]$Lines = 40) {
  $text = Read-SharedText $Path
  if (-not $text) { Write-Host ('   (no log text at ' + $Path + ')') -ForegroundColor Yellow; return }
  Write-Host ('   --- last lines of ' + $Path + ' ---') -ForegroundColor Yellow
  @($text -split "`r?`n") | Where-Object { $_ -ne '' } | Select-Object -Last $Lines | ForEach-Object { Write-Host ('   ' + $_) -ForegroundColor Yellow }
  Write-Host '   --- end of log ---' -ForegroundColor Yellow
}

# Runs a program with a hard timeout, output redirected to FILES (not pipes), so a server that
# pg_ctl leaves running can never keep this script waiting on an inherited pipe handle.
# $ArgString is one fully quoted command-line string. Returns .Code (-1 on timeout), .TimedOut, .Out.
function Invoke-Timed([string]$Exe, [string]$ArgString, [string]$Prefix, [int]$TimeoutSec) {
  $outFile = $Prefix + '.out.txt'
  $errFile = $Prefix + '.err.txt'
  $p = Start-Process -FilePath $Exe -ArgumentList $ArgString -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  $null = $p.Handle   # keep the handle so ExitCode is readable on Windows PowerShell 5.1
  $done = $p.WaitForExit($TimeoutSec * 1000)
  $text = ((Read-SharedText $outFile) + (Read-SharedText $errFile)).Trim()
  if (-not $done) { return [pscustomobject]@{ Code = -1; TimedOut = $true; Out = $text } }
  return [pscustomobject]@{ Code = $p.ExitCode; TimedOut = $false; Out = $text }
}

function Get-PortOwner([int]$Port) {
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return '' }
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return '' }
  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  return ('PID {0} ({1})' -f $conn.OwningProcess, $(if ($proc) { $proc.ProcessName } else { 'unknown' }))
}

# True only if nothing is listening on the loopback port (checked by listing AND by trying to bind).
function Test-PortFree([int]$Port) {
  if (Get-PortOwner $Port) { return $false }
  $listener = $null
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch { return $false } finally { if ($listener) { try { $listener.Stop() } catch { } } }
}

function Test-PgBinDir([string]$Dir) {
  foreach ($name in @('postgres', 'initdb', 'pg_ctl', 'psql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Dir ($name + $script:Exe)))) { return $false }
  }
  return $true
}

function Find-PortableBin([string]$Root) {
  if (-not (Test-Path -LiteralPath $Root)) { return $null }
  $standard = Join-Path (Join-Path $Root 'pgsql') 'bin'
  if (Test-PgBinDir $standard) { return $standard }
  # Tolerate a ZIP that was extracted one or two folders deeper than expected.
  $hits = @(Get-ChildItem -LiteralPath $Root -Recurse -Depth 3 -File -Filter ('pg_ctl' + $script:Exe) -ErrorAction SilentlyContinue |
      Sort-Object FullName | ForEach-Object { $_.DirectoryName } | Where-Object { Test-PgBinDir $_ })
  if ($hits.Count -gt 0) { return $hits[0] }
  return $null
}

function Find-PortableZip([string]$Root) {
  $dirs = @($Root)
  if ($env:USERPROFILE) { $dirs += (Join-Path $env:USERPROFILE 'Downloads') }
  foreach ($d in $dirs) {
    if (-not (Test-Path -LiteralPath $d)) { continue }
    $zip = Get-ChildItem -LiteralPath $d -File -Filter 'postgresql*16*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($zip) { return $zip }
  }
  return $null
}

function Get-PgMajorMinor([string]$BinDir) {
  $r = Invoke-Timed (Join-Path $BinDir ('postgres' + $script:Exe)) '--version' (Join-Path $script:LogDir '06-portable-version') 30
  if ($r.Code -eq 0 -and $r.Out -match '(\d+)\.(\d+)') { return [pscustomobject]@{ Major = [int]$Matches[1]; Text = ($Matches[1] + '.' + $Matches[2]) } }
  if ($r.Code -eq 0 -and $r.Out -match '(\d+)') { return [pscustomobject]@{ Major = [int]$Matches[1]; Text = $Matches[1] } }
  return $null
}

# Tools step: locate (or extract) the portable binaries. Does not start anything.
function Resolve-PortableBin {
  $P = $script:Portable
  try { New-Item -ItemType Directory -Path $P.Root -Force -ErrorAction Stop | Out-Null }
  catch { Stop-Precondition ("Could not create the portable folder '{0}': {1}" -f $P.Root, $_.Exception.Message) }
  $bin = Find-PortableBin $P.Root
  if (-not $bin) {
    $zip = Find-PortableZip $P.Root
    if ($zip) {
      $hash = (Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256).Hash
      Write-Host ('   found {0} ({1:N0} MB), SHA-256 {2}' -f $zip.FullName, ($zip.Length / 1MB), $hash)
      Write-Host ('   extracting into ' + $P.Root + ' (this can take a minute)...')
      try { Expand-Archive -LiteralPath $zip.FullName -DestinationPath $P.Root -ErrorAction Stop }
      catch { Stop-Precondition ("Could not extract '{0}': {1}. Delete any half-extracted '{2}' folder and try again." -f $zip.FullName, $_.Exception.Message, (Join-Path $P.Root 'pgsql')) }
      $bin = Find-PortableBin $P.Root
    }
  }
  if (-not $bin) {
    Write-Host ''
    Write-Host 'Portable PostgreSQL 16 binaries were not found. One-time setup (no installer, no admin rights):' -ForegroundColor Yellow
    Write-Host '  1. Open https://www.enterprisedb.com/download-postgresql-binaries' -ForegroundColor Yellow
    Write-Host '  2. Under "Binaries from installer", choose PostgreSQL 16.x for "Windows x86-64" and download the ZIP.' -ForegroundColor Yellow
    Write-Host ('  3. Save the ZIP into: ' + $P.Root) -ForegroundColor Yellow
    Write-Host '     (a file named like postgresql-16.x-...-windows-x64-binaries.zip; a copy in your Downloads folder is also found)' -ForegroundColor Yellow
    Write-Host '     or extract it yourself so that this file exists:' -ForegroundColor Yellow
    Write-Host ('       ' + (Join-Path (Join-Path (Join-Path $P.Root 'pgsql') 'bin') ('pg_ctl' + $script:Exe))) -ForegroundColor Yellow
    Write-Host '  4. Run this script again. It then extracts, initializes, starts, and stops it for you.' -ForegroundColor Yellow
    Stop-Precondition ("Portable PostgreSQL 16 binaries not found under '{0}'." -f $P.Root)
  }
  $v = Get-PgMajorMinor $bin
  if (-not $v) { Stop-Precondition ("'{0}' could not be run (postgres --version failed). Is it the Windows x86-64 build of PostgreSQL 16?" -f (Join-Path $bin ('postgres' + $script:Exe))) }
  if ($v.Major -ne 16) { Stop-Precondition ("The portable binaries are PostgreSQL {0}; this validation requires PostgreSQL 16. Nothing was started." -f $v.Text) }
  $P.Bin = $bin
  $P.Version = $v.Text
  $script:Psql = Join-Path $bin ('psql' + $script:Exe)
}

# pg_hba.conf must allow trust ONLY from loopback.
function Test-HbaLoopbackOnly([string]$HbaPath) {
  $text = Read-SharedText $HbaPath
  if (-not $text) { return $false }
  foreach ($line in ($text -split "`r?`n")) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $f = @($t -split '\s+')
    if ($f[0] -eq 'local') { continue }
    if ($f[0] -match '^host') {
      if ($f.Count -lt 4) { return $false }
      if (@('127.0.0.1/32', '::1/128') -notcontains $f[3]) { return $false }
    } else { return $false }
  }
  return $true
}

function Get-PostmasterPidInfo([string]$Data) {
  $lines = @((Read-SharedText (Join-Path $Data 'postmaster.pid')) -split "`r?`n")
  if ($lines.Count -lt 1 -or -not $lines[0].Trim()) { return $null }
  return [pscustomobject]@{
    Pid    = $lines[0].Trim()
    Port   = $(if ($lines.Count -gt 3) { $lines[3].Trim() } else { '' })
    Listen = $(if ($lines.Count -gt 5) { $lines[5].Trim() } else { '' })
  }
}

# Initialize (if needed), start, and wait for readiness. Any failure is a precondition failure.
function Start-PortablePostgres {
  $P = $script:Portable
  $pgCtl = Join-Path $P.Bin ('pg_ctl' + $script:Exe)
  $initdb = Join-Path $P.Bin ('initdb' + $script:Exe)
  $isReady = Join-Path $P.Bin ('pg_isready' + $script:Exe)
  $marker = Join-Path $P.Root 'BIDAZOO-VALIDATION-CLUSTER.txt'
  $data = $P.Data
  $port = [int]$P.Port

  if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
    # Never initialize into a folder that already holds something.
    if ((Test-Path -LiteralPath $data) -and @(Get-ChildItem -LiteralPath $data -Force -ErrorAction SilentlyContinue).Count -gt 0) {
      Stop-Precondition ("'{0}' exists, is not empty, and is not a PostgreSQL cluster. It was left untouched. Move it away or pick another -PortableRoot." -f $data)
    }
    Write-Host '   initializing a new throwaway cluster (initdb: user postgres, UTF8, trust on loopback only)...'
    $r = Invoke-Timed $initdb ('-D "{0}" -U postgres -A trust -E UTF8 --no-instructions' -f $data) (Join-Path $script:LogDir '07-portable-initdb') 300
    Set-Content -LiteralPath (Join-Path $script:LogDir '07-portable-initdb.log') -Value $r.Out -Encoding UTF8
    if ($r.Code -ne 0) {
      Show-LogTail (Join-Path $script:LogDir '07-portable-initdb.log')
      Stop-Precondition ("initdb failed (exit {0}). The cluster was not started." -f $r.Code)
    }
    Add-Content -LiteralPath (Join-Path $data 'postgresql.conf') -Value "`nlisten_addresses = '127.0.0.1'   # BidaZoo validation: loopback only" -Encoding ASCII
    Set-Content -LiteralPath $marker -Encoding ASCII -Value @(
      'This folder holds the throwaway PostgreSQL cluster created by BidaZoo scripts\validate-studio.ps1 -PortablePostgres.',
      'It listens on 127.0.0.1 only and uses trust authentication. It holds only disposable validation data.',
      'Safe to delete once validation is finished and the server is stopped.')
    Write-Ok 'cluster initialized'
  } else {
    if (-not (Test-Path -LiteralPath $marker)) {
      Stop-Precondition ("'{0}' is a PostgreSQL cluster that this script did not create (marker file missing). It was left untouched. Pick another -PortableRoot." -f $data)
    }
    $ver = (Read-SharedText (Join-Path $data 'PG_VERSION')).Trim()
    if ($ver -ne '16') { Stop-Precondition ("The portable cluster at '{0}' is PostgreSQL {1}, not 16. It was left untouched." -f $data, $ver) }
    Write-Ok 'existing portable cluster found'
  }
  if (-not (Test-HbaLoopbackOnly (Join-Path $data 'pg_hba.conf'))) {
    Stop-Precondition ("pg_hba.conf in '{0}' allows something other than loopback. This script only runs trust authentication on a loopback-only cluster. Nothing was started." -f $data)
  }

  # Is OUR cluster already running (for example after an interrupted earlier run)?
  $st = Invoke-Timed $pgCtl ('-D "{0}" status' -f $data) (Join-Path $script:LogDir '08-portable-status') 30
  if ($st.Code -eq 0) {
    $info = Get-PostmasterPidInfo $data
    if (-not $info -or $info.Port -ne [string]$port -or $info.Listen -ne '127.0.0.1') {
      Stop-Precondition ("The portable cluster is already running but not on 127.0.0.1:{0} (it reports port '{1}', listen '{2}'). It was not touched. Stop it yourself with: pg_ctl -D `"{3}`" stop" -f $port, $(if ($info) { $info.Port } else { '?' }), $(if ($info) { $info.Listen } else { '?' }), $data)
    }
    $P.ClusterStatus = ('already running (PID {0}); NOT started by this run, so it will be left running' -f $info.Pid)
    Write-Ok ('portable cluster already running on 127.0.0.1:' + $port + ' (reusing it; this run will not stop it)')
  } else {
    if (-not (Test-PortFree $port)) {
      $who = Get-PortOwner $port
      Stop-Precondition ("Port {0} on 127.0.0.1 is already in use{1}. Nothing was killed or changed. Free that port, or choose another with -PgPort (for example -PgPort {2})." -f $port, $(if ($who) { ' by ' + $who } else { '' }), ($port + 1))
    }
    Write-Ok ('port ' + $port + ' is free')
    Write-Host ('   starting the portable server on 127.0.0.1:' + $port + ' ...')
    $startArgs = '-D "{0}" -l "{1}" -w -t 90 -o "-p {2} -c listen_addresses=127.0.0.1" start' -f $data, $P.ServerLog, $port
    $P.StartAttempted = $true   # so a Ctrl+C while pg_ctl is still waiting is still cleaned up
    $r = Invoke-Timed $pgCtl $startArgs (Join-Path $script:LogDir '09-portable-start') 150
    # Whatever happens next, a postmaster in OUR data directory (which was not running a moment
    # ago) can only be the one this run just started, so this run is responsible for stopping it.
    $info = Get-PostmasterPidInfo $data
    if ($info) { $P.StartedByRun = $true; $P.StartedPid = $info.Pid }
    if ($r.Code -ne 0) {
      Write-Bad ("pg_ctl start failed (exit {0}){1}" -f $r.Code, $(if ($r.TimedOut) { ' - timed out' } else { '' }))
      if ($r.Out) { Write-Host ('   ' + $r.Out) -ForegroundColor Yellow }
      Show-LogTail $P.ServerLog
      Stop-Precondition 'The portable PostgreSQL did not start. Tests were not run.'
    }
    $P.ClusterStatus = 'started by this run'
  }

  # Wait until it really accepts connections.
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    if (Test-Path -LiteralPath $isReady) {
      $rr = Invoke-Timed $isReady ('-h 127.0.0.1 -p {0} -t 3' -f $port) (Join-Path $script:LogDir '10-portable-isready') 15
      $ready = ($rr.Code -eq 0)
    } else {
      $ready = ((Invoke-Psql 'postgres' 'SELECT 1').Code -eq 0)
    }
    if (-not $ready) { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) {
    Show-LogTail $P.ServerLog
    Stop-Precondition 'The portable PostgreSQL started but never became ready. Tests were not run.'
  }
  Write-Ok ('portable PostgreSQL is accepting connections on 127.0.0.1:' + $port)
}

# Stops ONLY a server this run started, via pg_ctl against the portable data directory. Idempotent.
# It never kills processes and never touches any other PostgreSQL instance.
function Stop-PortablePostgres {
  $P = $script:Portable
  if (-not $P.Enabled) { return }
  if (-not $P.StartedByRun -and $P.StartAttempted) {
    # Interrupted between "start requested" and "start confirmed". Our data directory was NOT running
    # before the request, so a postmaster there can only be the one this run asked for.
    $early = Get-PostmasterPidInfo $P.Data
    if ($early) { $P.StartedByRun = $true; $P.StartedPid = $early.Pid }
  }
  if (-not $P.StartedByRun) {
    if ($P.ShutdownResult -eq 'n/a') { $P.ShutdownResult = 'not needed (this run did not start a server)'; $P.ShutdownOk = $true }
    return
  }
  if ($P.ShutdownAttempted) { return }
  $P.ShutdownAttempted = $true
  Write-Host ''
  Write-Host '>> Stopping the portable PostgreSQL that this run started' -ForegroundColor Cyan
  $info = Get-PostmasterPidInfo $P.Data
  if (-not $info) { $P.ShutdownOk = $true; $P.ShutdownResult = 'already stopped (no postmaster.pid)'; Write-Ok $P.ShutdownResult; return }
  if ($info.Pid -ne $P.StartedPid) {
    $P.ShutdownOk = $false
    $P.ShutdownResult = ('NOT stopped: postmaster.pid names PID {0}, not the PID {1} this run started. Left alone.' -f $info.Pid, $P.StartedPid)
    Write-Warn $P.ShutdownResult
    return
  }
  $pgCtl = Join-Path $P.Bin ('pg_ctl' + $script:Exe)
  $r = Invoke-Timed $pgCtl ('-D "{0}" -m fast -w -t 60 stop' -f $P.Data) (Join-Path $script:LogDir '11-portable-stop') 90
  if ($r.Code -eq 0) {
    $P.ShutdownOk = $true; $P.ShutdownResult = ('succeeded (PID {0} stopped)' -f $P.StartedPid)
    Write-Ok $P.ShutdownResult
  } else {
    $P.ShutdownOk = $false
    $P.ShutdownResult = ('FAILED (exit {0}). Stop it yourself with: "{1}" -D "{2}" -m fast stop' -f $r.Code, $pgCtl, $P.Data)
    Write-Warn $P.ShutdownResult
    if ($r.Out) { Write-Host ('   ' + $r.Out) -ForegroundColor Yellow }
  }
}

# ---------------------------------------------------------------------------------------------
# 1-3. Repository, commit, working tree
# ---------------------------------------------------------------------------------------------
Write-Banner 'BIDAZOO STUDIO VALIDATION'
if ($PortablePostgres) {
  $script:Portable.Enabled = $true
  if ($PSBoundParameters.ContainsKey('PgHost') -and $PgHost -ne '127.0.0.1') { Stop-Precondition "-PortablePostgres always uses 127.0.0.1; -PgHost '$PgHost' conflicts with it. Drop -PgHost, or drop -PortablePostgres to use a server you installed." }
  if ($PSBoundParameters.ContainsKey('PgUser') -and $PgUser -ne 'postgres') { Stop-Precondition "-PortablePostgres always uses the user 'postgres'; -PgUser '$PgUser' conflicts with it." }
  $PgHost = '127.0.0.1'
  $PgUser = 'postgres'
  $PgPort = $(if ($PSBoundParameters.ContainsKey('PgPort')) { $PgPort } else { 54329 })
  if ($PgPort -lt 1024 -or $PgPort -gt 65535 -or $PgPort -eq 5432 -or $Ports -contains $PgPort) {
    Stop-Precondition "-PgPort $PgPort is not allowed for the portable server (use 1024-65535; 5432 is reserved for a normal PostgreSQL, and 3001/4173 are used by the tests)."
  }
  $portableRoot = $PortableRoot
  if (-not $portableRoot) {
    if (-not $env:USERPROFILE) { Stop-Precondition 'USERPROFILE is not set; pass -PortableRoot "C:\path\to\BidaZoo-pg".' }
    $portableRoot = Join-Path $env:USERPROFILE 'BidaZoo-pg'
  }
  $portableRoot = [System.IO.Path]::GetFullPath($portableRoot)
  foreach ($sys in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:SystemRoot)) {
    if ($sys -and $portableRoot.StartsWith($sys, [System.StringComparison]::OrdinalIgnoreCase)) {
      Stop-Precondition "-PortableRoot '$portableRoot' is inside a system folder ($sys). Use a folder you own, such as the default under your user profile."
    }
  }
  $script:Portable.Root = $portableRoot
  $script:Portable.Data = Join-Path $portableRoot 'data'
  $script:Portable.ServerLog = Join-Path $portableRoot 'pg.log'
  $script:Portable.Port = $PgPort
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
Write-Step 'Confirming this is the BidaZoo repository'
try {
  $pkgPath = Join-Path $RepoRoot 'package.json'
  if (-not (Test-Path -LiteralPath $pkgPath)) { Stop-Precondition "No package.json at '$RepoRoot'. Run this script from inside the BidaZoo repository (scripts\validate-studio.ps1)." }
  $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
  if ($pkg.name -ne 'bidazoo') { Stop-Precondition "package.json name is '$($pkg.name)', expected 'bidazoo'. This is not the BidaZoo repository." }
  foreach ($rel in @('apps\api', 'packages\learning-core', 'tests\e2e', 'database\migrations')) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel))) { Stop-Precondition "Missing '$rel' in '$RepoRoot'. This does not look like the BidaZoo repository." }
  }
} catch {
  Stop-Precondition ("Could not read the repository: " + $_.Exception.Message)
}
Set-Location -LiteralPath $RepoRoot
Write-Ok "repository: $RepoRoot"

Write-Step 'Checking privileges and repository write access'
if (Test-Elevated) {
  Write-Warn 'this shell is running as Administrator. That is not needed and not recommended: npm package scripts and test code would run with admin rights. Continuing as requested, but prefer a normal (non-elevated) terminal.'
} else {
  Write-Ok 'running as the current user (not elevated), which is what this validation expects'
}
$probeDir = Join-Path $RepoRoot '.validation-logs'
$probeFile = Join-Path $probeDir ('.write-test-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $probeDir -Force -ErrorAction Stop | Out-Null
  Set-Content -LiteralPath $probeFile -Value 'ok' -ErrorAction Stop
  Remove-Item -LiteralPath $probeFile -Force -ErrorAction Stop
  Write-Ok 'repository folder is writable by the current user'
} catch {
  Write-Bad ('the current user cannot write inside the repository folder: ' + $_.Exception.Message)
  Write-Host ''
  Write-Host 'This validation needs to write node_modules, build output, logs, and test results inside the repository.' -ForegroundColor Yellow
  Write-Host 'It will NOT elevate itself. Preferred fix: clone the repository somewhere you own (for example under your user profile) and run it there.' -ForegroundColor Yellow
  Write-Host 'If you deliberately want to run it elevated anyway, open an elevated terminal yourself and run (original arguments preserved):' -ForegroundColor Yellow
  Write-Host ('  ' + (Get-OriginalCommandLine)) -ForegroundColor Yellow
  Stop-Precondition 'Repository folder is not writable by the current user.'
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Precondition 'git was not found on PATH.' }
$Commit = (& git -C $RepoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $Commit) { Stop-Precondition 'This folder is not a Git checkout (git rev-parse failed).' }
$CommitSubject = (& git -C $RepoRoot log -1 --format=%s 2>$null)
Write-Step 'Git commit'
Write-Host ('   ' + $Commit + '  ' + $CommitSubject)
& git -C $RepoRoot merge-base --is-ancestor $BaselineCommit HEAD 2>$null
if ($LASTEXITCODE -eq 0) { Write-Ok "baseline $BaselineCommit is part of this checkout's history" }
else { Write-Warn "baseline commit $BaselineCommit is not an ancestor of HEAD (or is unknown). You may not be validating the approved Checkpoint B baseline." }

$dirty = @(& git -C $RepoRoot status --porcelain 2>$null)
if ($dirty.Count -gt 0) {
  Write-Warn ("working tree is DIRTY ({0} changed/untracked path(s)). Results may not describe the committed baseline." -f $dirty.Count)
  $dirty | Select-Object -First 15 | ForEach-Object { Write-Host ('         ' + $_) -ForegroundColor Yellow }
  if ($dirty.Count -gt 15) { Write-Host '         ...' -ForegroundColor Yellow }
} else {
  Write-Ok 'working tree is clean'
}

# ---------------------------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------------------------
Write-Step 'Checking tools'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Stop-Precondition 'node was not found on PATH (Node 22.12 or newer is required).' }
if (-not $npmCmd) { Stop-Precondition 'npm was not found on PATH.' }
$nodeVersion = ((& node --version) -replace '^v', '').Trim()
$nv = $nodeVersion.Split('.')
if (([int]$nv[0] -lt 22) -or ([int]$nv[0] -eq 22 -and [int]$nv[1] -lt 12)) { Stop-Precondition "Node $nodeVersion is too old; 22.12 or newer is required." }
Write-Ok "node $nodeVersion, npm $((& npm --version).Trim())"

$script:Psql = $null
if ($PortablePostgres) {
  Write-Ok 'psql: will come from the portable PostgreSQL 16 binaries (resolved below); no system PostgreSQL is used'
} else {
  $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($psqlCmd) { $script:Psql = $psqlCmd.Source }
  else {
    $found = Get-ChildItem -Path 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { $script:Psql = $found.FullName }
  }
  if (-not $script:Psql) { Stop-Precondition 'psql was not found (not on PATH, and not under C:\Program Files\PostgreSQL\*\bin). Easiest fix: run scripts\validate-studio.bat -PortablePostgres (no PostgreSQL install needed). Or install PostgreSQL 16 client tools / add psql to PATH.' }
  Write-Ok "psql: $($script:Psql)"
}

# ---------------------------------------------------------------------------------------------
# 4. Ports
# ---------------------------------------------------------------------------------------------
Write-Step ('Confirming ports {0} are free' -f ($Ports -join ' and '))
$busy = @()
foreach ($p in $Ports) {
  $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    foreach ($c in $conn) {
      $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      $busy += ('port {0} is in use by PID {1} ({2})' -f $p, $c.OwningProcess, $(if ($proc) { $proc.ProcessName } else { 'unknown' }))
    }
  }
}
if ($busy.Count -gt 0) {
  $busy | ForEach-Object { Write-Bad $_ }
  Stop-Precondition 'Ports 3001 and/or 4173 are in use. The e2e run would collide with whatever is listening there, so it was NOT started. Stop that process yourself (this script will not).'
}
Write-Ok 'ports 3001 and 4173 are free'

# ---------------------------------------------------------------------------------------------
# Environment hygiene (process-scope only; nothing is written to disk or the system)
# ---------------------------------------------------------------------------------------------
Write-Step 'Preparing a clean environment for this run (this process only)'
if (Test-Path Env:PW_CHROMIUM_EXECUTABLE) {
  Write-Warn ('PW_CHROMIUM_EXECUTABLE was set (' + $env:PW_CHROMIUM_EXECUTABLE + '); unsetting it so the OFFICIAL Chromium is used.')
  Remove-Item Env:PW_CHROMIUM_EXECUTABLE
} else { Write-Ok 'PW_CHROMIUM_EXECUTABLE is unset (official Chromium will be used)' }
foreach ($name in @('API_PROXY_TARGET', 'COOKIE_SECURE', 'ALLOWED_ORIGINS', 'API_PORT', 'API_HOST', 'NODE_ENV', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD')) {
  if (Test-Path ("Env:" + $name)) {
    Write-Warn "$name was set in this shell; clearing it for the validation run (this process only)."
    Remove-Item ("Env:" + $name)
  }
}
if (Test-Path -LiteralPath (Join-Path $RepoRoot '.env')) {
  Write-Warn 'a .env file exists in the repo root. Variables set by this script take precedence, but check it does not point DATABASE_URL at a real database.'
}
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
$env:CI = '1'   # disables Playwright's "reuse an existing server" and forbids test.only
$env:TEST_DATABASE_URL = $null
$env:DATABASE_URL = $null

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Join-Path $RepoRoot (Join-Path '.validation-logs' $Stamp)
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Write-Ok "logs for this run: $LogDir"

# ---------------------------------------------------------------------------------------------
# Portable PostgreSQL (only with -PortablePostgres): locate, initialize, start, wait until ready.
# From here on the server may be running, so everything below is inside try/finally and every
# exit path stops it (only if this run started it).
# ---------------------------------------------------------------------------------------------
if ($PortablePostgres) {
  Write-Step ('Portable PostgreSQL 16 (isolated; root ' + $script:Portable.Root + ')')
  foreach ($name in @('PGDATA', 'PGHOST', 'PGPORT', 'PGUSER', 'PGSERVICE', 'PGOPTIONS', 'PGPASSWORD', 'PGPASSFILE', 'PGSYSCONFDIR')) {
    if (Test-Path ('Env:' + $name)) { Remove-Item ('Env:' + $name) }   # this process only; the portable server needs none of them
  }
  Resolve-PortableBin
  Write-Ok ('PostgreSQL ' + $script:Portable.Version + ' binaries: ' + $script:Portable.Bin)
  Write-Ok ('psql: ' + $script:Psql)
  Start-PortablePostgres
}
try {

# ---------------------------------------------------------------------------------------------
# PostgreSQL connection
# ---------------------------------------------------------------------------------------------
Write-Step "Connecting to PostgreSQL ($PgUser@$PgHost`:$PgPort)"
$script:PgPasswordPlain = $null
$script:PgVersionText = 'unknown'
if ($PortablePostgres) {
  Write-Ok 'portable cluster uses trust authentication on 127.0.0.1; no password is needed or asked for'
} elseif ($env:PGPASSWORD) {
  $script:PgPasswordPlain = $env:PGPASSWORD
} elseif (Test-Interactive) {
  $secure = Read-Host -AsSecureString "PostgreSQL password for '$PgUser' (press Enter if none / using pgpass.conf)"
  $plain = [System.Net.NetworkCredential]::new('', $secure).Password
  if ($plain) { $script:PgPasswordPlain = $plain }
}
if ($script:PgPasswordPlain) { $env:PGPASSWORD = $script:PgPasswordPlain }

$ver = Invoke-Psql 'postgres' 'SELECT version()'
if ($ver.Code -ne 0) { Stop-Precondition ("Could not connect to PostgreSQL: " + (Hide-Password $ver.Out)) }
Write-Ok ($ver.Out.Split(',')[0])
$script:PgVersionText = $(if ($ver.Out -match 'PostgreSQL (\d+(\.\d+)?)') { $Matches[1] } else { $ver.Out.Split(',')[0] })
$canCreate = Invoke-Psql 'postgres' 'SELECT (rolcreatedb OR rolsuper) FROM pg_roles WHERE rolname = current_user'
if ($canCreate.Out -ne 't') { Stop-Precondition "Role '$PgUser' is not allowed to create databases." }

# Existing throwaway databases? Never silently reuse or drop.
$existing = @()
foreach ($db in @($TestDb, $E2eDb)) {
  $r = Invoke-Psql 'postgres' ("SELECT 1 FROM pg_database WHERE datname = '{0}'" -f $db)
  if ($r.Out -eq '1') { $existing += $db }
}
if ($existing.Count -gt 0) {
  if (-not $Recreate) {
    Stop-Precondition ("Database(s) already exist: {0}. They may hold evidence from an earlier run, so they were not touched. Re-run with -Recreate to drop and recreate exactly these two names, or drop them yourself." -f ($existing -join ', '))
  }
  if (-not (Test-Interactive)) { Stop-Precondition '-Recreate needs an interactive terminal so you can confirm. Nothing was dropped.' }
  Write-Warn ("-Recreate: about to DROP and recreate: {0}" -f ($existing -join ', '))
  $answer = Read-Host 'Type "yes" to drop exactly these throwaway databases'
  if ($answer -ne 'yes') { Stop-Precondition 'Not confirmed. Nothing was dropped.' }
  foreach ($db in $existing) { if (-not (Remove-ThrowawayDb $db)) { Stop-Precondition "Could not drop $db." } }
}

# ---------------------------------------------------------------------------------------------
# Validation steps
# ---------------------------------------------------------------------------------------------
$Result = [ordered]@{
  NpmCi = 'not run'; Install = 'not run'; CreateDb = 'not run'; Migrate = 'not run'
  Vitest = 'not run'; Playwright = 'not run'
}
$vitestLines = @()
$pwSummary = 'not run'
$retrySummary = 'not run'
$playwrightVersion = 'unknown'
$chromiumVersion = 'unknown'
$chromiumPath = 'unknown'
$evidence = @()

# If a failed step looks like a permissions problem, say exactly what happened. Never elevates.
function Show-PermissionHint([string]$LogFile) {
  if (-not (Test-Path -LiteralPath $LogFile)) { return }
  $hit = Select-String -LiteralPath $LogFile -Pattern 'EPERM|EACCES|operation not permitted|permission denied|Access is denied' -ErrorAction SilentlyContinue | Select-Object -First 3
  if ($hit) {
    Write-Host ''
    Write-Host 'This failure looks like a PERMISSIONS problem (matching lines below). The script does not elevate by itself.' -ForegroundColor Yellow
    $hit | ForEach-Object { Write-Host ('   ' + $_.Line.Trim()) -ForegroundColor Yellow }
    Write-Host 'Check that the repository (and your Playwright browser cache folder) are writable by your user, or that antivirus is not locking files.' -ForegroundColor Yellow
    Write-Host 'If you deliberately want an elevated attempt, open an elevated terminal yourself and run (original arguments preserved):' -ForegroundColor Yellow
    Write-Host ('   ' + (Get-OriginalCommandLine)) -ForegroundColor Yellow
  }
}

function Fail-Step([string]$Key, [string]$Message) {
  $script:Result[$Key] = 'FAIL'
  $script:Failures.Add($Message)
  Write-Bad $Message
}

# --- npm ci -------------------------------------------------------------------------------
Write-Step 'npm ci'
$code = Invoke-Logged 'npm' @('ci') (Join-Path $LogDir '01-npm-ci.log')
if ($code -eq 0) { $Result.NpmCi = 'ok'; Write-Ok 'npm ci succeeded' } else { Fail-Step 'NpmCi' "npm ci failed (exit $code)"; Show-PermissionHint (Join-Path $LogDir '01-npm-ci.log') }

# --- official Chromium --------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step 'npx playwright install chromium (official build)'
  $code = Invoke-Logged 'npx' @('playwright', 'install', 'chromium') (Join-Path $LogDir '02-playwright-install.log')
  if ($code -eq 0) { $Result.Install = 'ok'; Write-Ok 'official Chromium installed' } else { Fail-Step 'Install' "playwright install chromium failed (exit $code)"; Show-PermissionHint (Join-Path $LogDir '02-playwright-install.log') }
}

# --- databases ----------------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step "Creating throwaway databases $TestDb and $E2eDb"
  $ok = $true
  foreach ($db in @($TestDb, $E2eDb)) {
    $r = Invoke-Psql 'postgres' ('CREATE DATABASE "{0}"' -f $db)
    if ($r.Code -eq 0) { $script:CreatedDbs.Add($db); Write-Ok "created $db" } else { $ok = $false; Write-Bad ("could not create {0}: {1}" -f $db, (Hide-Password $r.Out)) }
  }
  if ($ok) { $Result.CreateDb = 'ok' } else { Fail-Step 'CreateDb' 'database creation failed' }
}

# --- migrations ---------------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step 'Applying migrations to both databases'
  $migOk = $true
  foreach ($db in @($TestDb, $E2eDb)) {
    # Guard: the URL must name exactly one of the two throwaway databases.
    if ($db -ne $TestDb -and $db -ne $E2eDb) { throw 'unexpected database name' }
    $env:DATABASE_URL = New-DbUrl $db
    $code = Invoke-Logged 'npm' @('run', 'db:migrate') (Join-Path $LogDir ("03-migrate-$db.log"))
    if ($code -eq 0) { Write-Ok "migrations applied to $db" } else { $migOk = $false; Write-Bad "migrations failed on $db (exit $code)" }
  }
  $env:DATABASE_URL = $null
  if ($migOk) { $Result.Migrate = 'ok' } else { Fail-Step 'Migrate' 'migrations failed' }
}

# --- Vitest -------------------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step "Vitest (all workspaces) against $TestDb"
  $env:TEST_DATABASE_URL = New-DbUrl $TestDb
  $vitestLog = Join-Path $LogDir '04-vitest.log'
  $code = Invoke-Logged 'npm' @('test') $vitestLog
  $env:TEST_DATABASE_URL = $null
  $vitestText = Get-Content -LiteralPath $vitestLog -Raw
  $vitestLines = @([regex]::Matches($vitestText, '(?m)^\s*Tests\s+.*$') | ForEach-Object { $_.Value.Trim() })
  if ($vitestText -match 'database-backed tests are SKIPPED') { Write-Warn 'Vitest reported that database-backed tests were SKIPPED (TEST_DATABASE_URL not picked up).' }
  if ($code -eq 0) { $Result.Vitest = 'ok'; Write-Ok 'Vitest exited 0' } else { Fail-Step 'Vitest' "Vitest failed (exit $code)" }
  # Informational comparison only; exit codes decide pass/fail.
  $passedNumbers = @($vitestLines | ForEach-Object { if ($_ -match '(\d+)\s+passed') { [int]$Matches[1] } })
  $todoNumbers = @($vitestLines | ForEach-Object { if ($_ -match '(\d+)\s+todo') { [int]$Matches[1] } })
  $totalTodo = ($todoNumbers | Measure-Object -Sum).Sum
  if (($passedNumbers -notcontains $ExpectedUnit) -or ($passedNumbers -notcontains $ExpectedIntegration)) {
    Write-Warn ("Vitest passed-counts [{0}] differ from the approved baseline ({1} unit, {2} integration)." -f ($passedNumbers -join ', '), $ExpectedUnit, $ExpectedIntegration)
  }
  if ($totalTodo -ne $ExpectedTodo) { Write-Warn ("Vitest todo count is {0}; the approved baseline has {1}." -f $totalTodo, $ExpectedTodo) }
}

# --- versions (Playwright + official Chromium) ---------------------------------------------
if ($Result.Install -eq 'ok') {
  Write-Step 'Playwright and Chromium versions'
  Push-Location (Join-Path $RepoRoot 'tests')
  try {
    $pwv = & npx playwright --version 2>&1 | ForEach-Object { [string]$_ }
    $playwrightVersion = (($pwv | Select-Object -Last 1) -replace '^Version\s*', '').Trim()
    $probe = "import { chromium } from '@playwright/test'; const p = chromium.executablePath(); const b = await chromium.launch(); console.log('VERSION=' + b.version()); console.log('PATH=' + p); await b.close();"
    $probeOut = & node --input-type=module -e $probe 2>&1 | ForEach-Object { [string]$_ }
    foreach ($l in $probeOut) {
      if ($l -match '^VERSION=(.+)$') { $chromiumVersion = $Matches[1].Trim() }
      if ($l -match '^PATH=(.+)$') { $chromiumPath = $Matches[1].Trim() }
    }
  } finally { Pop-Location }
  Write-Host ("   Playwright: {0}" -f $playwrightVersion)
  Write-Host ("   Chromium:   {0}" -f $chromiumVersion)
  Write-Host ("   Binary:     {0}" -f $chromiumPath)
  if ($chromiumPath -notmatch 'ms-playwright|chromium-\d+|chromium_headless_shell') {
    Write-Warn 'the Chromium binary path does not look like a Playwright-managed install; confirm this is the official build.'
  }
  if ($chromiumVersion -eq 'unknown') { Write-Warn 'could not determine the Chromium version.' }
}

# --- Playwright ---------------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step "Playwright e2e (CI=1) against $E2eDb"
  $env:DATABASE_URL = New-DbUrl $E2eDb
  $jsonFile = Join-Path $LogDir 'playwright-results.json'
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $jsonFile
  $code = Invoke-Logged 'npm' @('run', 'test:e2e', '-w', '@bidazoo/tests', '--', '--reporter=list,json') (Join-Path $LogDir '05-playwright.log')
  $env:DATABASE_URL = $null
  Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
  if ($code -eq 0) { $Result.Playwright = 'ok'; Write-Ok 'Playwright exited 0' } else { Fail-Step 'Playwright' "Playwright failed (exit $code)" }

  if (Test-Path -LiteralPath $jsonFile) {
    try {
      $report = Get-Content -LiteralPath $jsonFile -Raw | ConvertFrom-Json
      $tests = New-Object System.Collections.Generic.List[object]
      function Collect-Tests($suite) {
        if ($suite.specs) {
          foreach ($spec in $suite.specs) {
            if (-not $spec.tests) { continue }
            foreach ($t in $spec.tests) {
              $attempts = 0
              if ($t.results) { $attempts = @($t.results).Count }
              $tests.Add([pscustomobject]@{ Title = $spec.title; File = $spec.file; Project = $t.projectName; Status = $t.status; Attempts = $attempts })
            }
          }
        }
        if ($suite.suites) { foreach ($child in $suite.suites) { Collect-Tests $child } }
      }
      if ($report.suites) { foreach ($top in $report.suites) { Collect-Tests $top } }
      $total = $tests.Count
      $passedN = @($tests | Where-Object { $_.Status -eq 'expected' }).Count
      $failedN = @($tests | Where-Object { $_.Status -eq 'unexpected' }).Count
      $flaky = @($tests | Where-Object { $_.Status -eq 'flaky' })
      $skippedN = @($tests | Where-Object { $_.Status -eq 'skipped' }).Count
      $retried = @($tests | Where-Object { $_.Attempts -gt 1 })
      $projects = @($tests | ForEach-Object { $_.Project } | Sort-Object -Unique)
      $pwSummary = ("{0} tests: {1} passed, {2} failed, {3} flaky, {4} skipped; {5} project(s)" -f $total, $passedN, $failedN, $flaky.Count, $skippedN, $projects.Count)
      $retrySummary = if ($retried.Count -eq 0) { 'none (no test needed a retry)' } else { ("{0} test(s) retried; {1} passed only after retry" -f $retried.Count, $flaky.Count) }
      Write-Host ''
      Write-Host ('   ' + $pwSummary)
      Write-Host ('   projects: ' + ($projects -join ', '))
      if ($failedN -gt 0 -and $Result.Playwright -eq 'ok') { Fail-Step 'Playwright' "$failedN Playwright test(s) failed according to the JSON report." }
      if ($failedN -gt 0) { $tests | Where-Object { $_.Status -eq 'unexpected' } | ForEach-Object { Write-Bad ("[{0}] {1}" -f $_.Project, $_.Title) } }
      if ($skippedN -gt 0) { Write-Warn "$skippedN Playwright test(s) were SKIPPED."; $tests | Where-Object { $_.Status -eq 'skipped' } | ForEach-Object { Write-Host ("         skipped: [{0}] {1}" -f $_.Project, $_.Title) -ForegroundColor Yellow } }
      if ($flaky.Count -gt 0) { Write-Warn "$($flaky.Count) test(s) PASSED ONLY AFTER RETRY (flaky):"; $flaky | ForEach-Object { Write-Host ("         flaky: [{0}] {1} ({2} attempts)" -f $_.Project, $_.Title, $_.Attempts) -ForegroundColor Yellow } }
      if ($total -ne $ExpectedPlaywright) { Write-Warn ("Playwright ran {0} tests; the approved baseline has {1}." -f $total, $ExpectedPlaywright) }
      if ($projects.Count -ne $ExpectedProjects) { Write-Warn ("Playwright used {0} viewport project(s); the approved baseline has {1}." -f $projects.Count, $ExpectedProjects) }
    } catch {
      Write-Warn ("could not parse the Playwright JSON report: " + $_.Exception.Message)
      $pwSummary = 'ran (JSON report unreadable; see 05-playwright.log)'
    }
  } else {
    Write-Warn 'Playwright did not write a JSON report; see 05-playwright.log.'
    $pwSummary = 'ran (no JSON report; see 05-playwright.log)'
  }

  # Failure evidence (traces, screenshots, videos) is only listed, never deleted.
  $resultsDir = Join-Path $RepoRoot 'tests\test-results'
  if (Test-Path -LiteralPath $resultsDir) {
    $evidence = @(Get-ChildItem -LiteralPath $resultsDir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '\.(zip|png|webm|md)$' -or $_.Name -eq 'trace.zip' })
  }
}

# ---------------------------------------------------------------------------------------------
# Optional cleanup (databases only; logs and test evidence are never deleted)
# ---------------------------------------------------------------------------------------------
if ($CreatedDbs.Count -gt 0) {
  $passed = ($Failures.Count -eq 0)
  if ($Cleanup) {
    if ($passed) {
      Write-Step '-Cleanup: dropping the two throwaway databases (validation passed)'
      foreach ($db in @($CreatedDbs)) { [void](Remove-ThrowawayDb $db) }
    } else {
      Write-Warn ('-Cleanup was requested, but validation FAILED, so the databases were KEPT for debugging. Drop them later with: psql -h ' + $PgHost + ' -p ' + $PgPort + ' -U ' + $PgUser + ' -c "DROP DATABASE bidazoo_test" -c "DROP DATABASE bidazoo_e2e"' + $(if ($PortablePostgres) { ' (the portable server is stopped at the end of this run; the next run needs -Recreate, or start it yourself)' } else { '' }))
    }
  } elseif (Test-Interactive) {
    Write-Host ''
    if (-not $passed) { Write-Host 'Validation FAILED. The databases may help debugging; the default answer is No.' -ForegroundColor Yellow }
    $ans = Read-Host ("Delete the throwaway databases {0}? Logs and test evidence are kept either way. [y/N]" -f ($CreatedDbs -join ', '))
    if ($ans -match '^(y|yes)$') { foreach ($db in @($CreatedDbs)) { [void](Remove-ThrowawayDb $db) } }
    else { Write-Host ('Kept. Drop later with: psql -h ' + $PgHost + ' -p ' + $PgPort + ' -U ' + $PgUser + ' -c "DROP DATABASE bidazoo_test" -c "DROP DATABASE bidazoo_e2e"' + $(if ($PortablePostgres) { ' (next run: use -Recreate)' } else { '' })) }
  } else {
    Write-Host ('Databases kept (non-interactive run). Re-run with -Cleanup, or drop them yourself: bidazoo_test, bidazoo_e2e.')
  }
}

# ---------------------------------------------------------------------------------------------
# Portable PostgreSQL shutdown (only the server THIS run started; the portable folder is kept)
# ---------------------------------------------------------------------------------------------
Stop-PortablePostgres

# ---------------------------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------------------------
$Overall = if ($Failures.Count -eq 0) { if ($Warnings.Count -gt 0) { 'PASS (with warnings, see below)' } else { 'PASS' } } else { 'FAIL' }
$vitestText2 = if ($Result.Vitest -eq 'ok') { 'exit 0 | ' + ($vitestLines -join ' || ') } elseif ($Result.Vitest -eq 'not run') { 'not run' } else { 'FAILED | ' + ($vitestLines -join ' || ') }
$playwrightText = if ($Result.Playwright -eq 'ok') { 'exit 0 | ' + $pwSummary } elseif ($Result.Playwright -eq 'not run') { 'not run' } else { 'FAILED | ' + $pwSummary }

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('================================')
$summary.Add('BIDAZOO STUDIO VALIDATION')
$summary.Add('================================')
$summary.Add('')
$summary.Add('Git commit:  ' + $Commit + '  ' + $CommitSubject + $(if ($dirty.Count -gt 0) { '   [WORKING TREE DIRTY]' } else { '' }))
$summary.Add('Vitest:      ' + $vitestText2)
$summary.Add('Playwright:  ' + $playwrightText)
$summary.Add('Playwright version: ' + $playwrightVersion)
$summary.Add('Retries:     ' + $retrySummary)
$summary.Add('Chromium:    ' + $chromiumVersion + '   (' + $chromiumPath + ')')
if ($PortablePostgres) {
  $summary.Add('PostgreSQL mode: Portable (isolated, BidaZoo-owned; no system PostgreSQL used)')
  $summary.Add('PostgreSQL version: ' + $script:PgVersionText)
  $summary.Add('Host / Port: ' + $PgHost + ' / ' + $PgPort + '  (loopback only, trust authentication)')
  $summary.Add('Portable root: ' + $script:Portable.Root)
  $summary.Add('Cluster status: ' + $script:Portable.ClusterStatus)
  $summary.Add('Started by this run: ' + $(if ($script:Portable.StartedByRun) { 'yes' } else { 'no' }))
  $summary.Add('Shutdown: ' + $script:Portable.ShutdownResult)
} else {
  $summary.Add('PostgreSQL mode: Existing server (installed by you; this script did not start or stop it)')
  $summary.Add('PostgreSQL version: ' + $script:PgVersionText)
  $summary.Add('Host / Port: ' + $PgHost + ' / ' + $PgPort)
}
$summary.Add('Database:    ' + $TestDb + ' and ' + $E2eDb + ' on ' + $PgHost + ':' + $PgPort + ' (throwaway; created by this run: ' + $(if ($CreatedDbs.Count -gt 0) { $CreatedDbs -join ', ' } else { 'none' }) + ')')
$summary.Add('Steps:       npm ci=' + $Result.NpmCi + ', chromium install=' + $Result.Install + ', create dbs=' + $Result.CreateDb + ', migrate=' + $Result.Migrate + ', vitest=' + $Result.Vitest + ', playwright=' + $Result.Playwright)
$summary.Add('Overall:     ' + $Overall)
$summary.Add('')
if ($Failures.Count -gt 0) { $summary.Add('Failures:'); $Failures | ForEach-Object { $summary.Add('  - ' + $_) } }
if ($Warnings.Count -gt 0) { $summary.Add('Warnings:'); $Warnings | ForEach-Object { $summary.Add('  - ' + $_) } }
$summary.Add('Logs:        ' + $LogDir)
if ($Failures.Count -gt 0 -and $evidence.Count -gt 0) {
  $summary.Add('')
  $summary.Add('Failure evidence (kept; nothing was deleted):')
  $evidence | ForEach-Object { $summary.Add('  ' + $_.FullName) }
  $traces = @($evidence | Where-Object { $_.Name -eq 'trace.zip' })
  if ($traces.Count -gt 0) {
    $summary.Add('')
    $summary.Add('Open a trace with, for example:')
    $summary.Add('  cd "' + (Join-Path $RepoRoot 'tests') + '"')
    $summary.Add('  npx playwright show-trace "' + $traces[0].FullName + '"')
  }
}
$summary.Add('')
$summary.Add($(if ($Failures.Count -eq 0) { 'PASS' } else { 'FAIL' }))
$summary.Add('================================')

Write-Host ''
foreach ($line in $summary) {
  $color = 'White'
  if ($line -eq 'PASS') { $color = 'Green' } elseif ($line -eq 'FAIL') { $color = 'Red' }
  Write-Host $line -ForegroundColor $color
}
Set-Content -LiteralPath (Join-Path $LogDir 'SUMMARY.txt') -Value $summary -Encoding UTF8
Write-Host ('Summary saved to ' + (Join-Path $LogDir 'SUMMARY.txt'))

if ($script:PgPasswordPlain) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
if ($Failures.Count -eq 0) { exit 0 } else { exit 1 }
} finally {
  # Safety net for Ctrl+C or an unexpected error: still stop the portable server THIS run started.
  Stop-PortablePostgres
}
