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

  Exit codes: 0 = validation passed, 1 = validation failed, 2 = a precondition failed (nothing ran).

.PARAMETER PgHost      PostgreSQL host. Default: localhost.
.PARAMETER PgPort      PostgreSQL port. Default: 5432.
.PARAMETER PgUser      PostgreSQL superuser (must be able to CREATE DATABASE). Default: postgres.
.PARAMETER Recreate    If bidazoo_test / bidazoo_e2e already exist, drop and recreate them after you
                       type "yes". Without this switch, existing databases make the script stop.
.PARAMETER Cleanup     Drop the two throwaway databases at the end, but ONLY if validation passed.
.PARAMETER NoPrompt    Never ask questions (no password prompt, no cleanup question). Requires
                       PGPASSWORD to be set if the server needs a password.

.EXAMPLE
  .\scripts\validate-studio.ps1
.EXAMPLE
  .\scripts\validate-studio.ps1 -Cleanup
#>
[CmdletBinding()]
param(
  [string]$PgHost = 'localhost',
  [int]$PgPort = 5432,
  [string]$PgUser = 'postgres',
  [switch]$Recreate,
  [switch]$Cleanup,
  [switch]$NoPrompt
)

Set-StrictMode -Version 1.0
# Native commands (npm, git, psql) report failure through exit codes, which this script checks
# itself. 'Continue' keeps stderr text from becoming terminating errors on Windows PowerShell 5.1.
$ErrorActionPreference = 'Continue'

$BaselineCommit = '01b7d41'
$TestDb = 'bidazoo_test'
$E2eDb = 'bidazoo_e2e'
$Ports = @(3001, 4173)
$ExpectedUnit = 51
$ExpectedIntegration = 81
$ExpectedTodo = 3
$ExpectedPlaywright = 24
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
# 1-3. Repository, commit, working tree
# ---------------------------------------------------------------------------------------------
Write-Banner 'BIDAZOO STUDIO VALIDATION'
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
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlCmd) { $script:Psql = $psqlCmd.Source }
else {
  $found = Get-ChildItem -Path 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($found) { $script:Psql = $found.FullName }
}
if (-not $script:Psql) { Stop-Precondition 'psql was not found (not on PATH, and not under C:\Program Files\PostgreSQL\*\bin). Install PostgreSQL 16 client tools or add psql to PATH.' }
Write-Ok "psql: $($script:Psql)"

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
# PostgreSQL connection
# ---------------------------------------------------------------------------------------------
Write-Step "Connecting to PostgreSQL ($PgUser@$PgHost`:$PgPort)"
$script:PgPasswordPlain = $null
if ($env:PGPASSWORD) {
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

function Fail-Step([string]$Key, [string]$Message) {
  $script:Result[$Key] = 'FAIL'
  $script:Failures.Add($Message)
  Write-Bad $Message
}

# --- npm ci -------------------------------------------------------------------------------
Write-Step 'npm ci'
$code = Invoke-Logged 'npm' @('ci') (Join-Path $LogDir '01-npm-ci.log')
if ($code -eq 0) { $Result.NpmCi = 'ok'; Write-Ok 'npm ci succeeded' } else { Fail-Step 'NpmCi' "npm ci failed (exit $code)" }

# --- official Chromium --------------------------------------------------------------------
if ($Failures.Count -eq 0) {
  Write-Step 'npx playwright install chromium (official build)'
  $code = Invoke-Logged 'npx' @('playwright', 'install', 'chromium') (Join-Path $LogDir '02-playwright-install.log')
  if ($code -eq 0) { $Result.Install = 'ok'; Write-Ok 'official Chromium installed' } else { Fail-Step 'Install' "playwright install chromium failed (exit $code)" }
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
      Write-Warn '-Cleanup was requested, but validation FAILED, so the databases were KEPT for debugging. Drop them later with: psql -U postgres -c "DROP DATABASE bidazoo_test" -c "DROP DATABASE bidazoo_e2e"'
    }
  } elseif (Test-Interactive) {
    Write-Host ''
    if (-not $passed) { Write-Host 'Validation FAILED. The databases may help debugging; the default answer is No.' -ForegroundColor Yellow }
    $ans = Read-Host ("Delete the throwaway databases {0}? Logs and test evidence are kept either way. [y/N]" -f ($CreatedDbs -join ', '))
    if ($ans -match '^(y|yes)$') { foreach ($db in @($CreatedDbs)) { [void](Remove-ThrowawayDb $db) } }
    else { Write-Host ('Kept. Drop later with: psql -U ' + $PgUser + ' -c "DROP DATABASE bidazoo_test" -c "DROP DATABASE bidazoo_e2e"') }
  } else {
    Write-Host ('Databases kept (non-interactive run). Re-run with -Cleanup, or drop them yourself: bidazoo_test, bidazoo_e2e.')
  }
}

if ($script:PgPasswordPlain) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
if ($Failures.Count -eq 0) { exit 0 } else { exit 1 }
