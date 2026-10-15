<#
.SYNOPSIS
  Self-test for the approved-baseline checks in scripts/validate-studio.ps1 (the FINAL RELEASE CANDIDATE validator).

.DESCRIPTION
  Read-only and fast. It loads the REAL constants ($Expected*, $RuntimeCommit) and the REAL pure functions
  (Test-FullSha, Get-VitestBaselineProblems, Get-PlaywrightBaselineProblems, Get-BrowserVersionProblems,
  Get-PostgresVersionProblems) out of validate-studio.ps1 by parsing it, WITHOUT running the validator.
  It touches no database, no browser, no repository state, and starts no process.
  Run:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-studio-selftest.ps1
  Exit code 0 = every check passed.
#>
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'validate-studio.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { Write-Host "FAIL  validate-studio.ps1 does not parse: $($errors[0].Message)"; exit 1 }

# Constants: top-level assignments whose variable starts with Expected, plus RuntimeCommit.
$assignments = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and ($n.Left.VariablePath.UserPath -like 'Expected*' -or $n.Left.VariablePath.UserPath -eq 'RuntimeCommit') }, $false)
foreach ($a in $assignments) { Invoke-Expression $a.Extent.Text }
$wanted = 'Test-FullSha', 'Get-VitestBaselineProblems', 'Get-PlaywrightBaselineProblems', 'Get-BrowserVersionProblems', 'Get-PostgresVersionProblems'
$funcs = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $n.Name }, $false)
foreach ($f in $funcs) { Invoke-Expression $f.Extent.Text }

$fails = 0
function Check { param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) { Write-Host ("  PASS  {0}" -f $Name) } else { Write-Host ("  FAIL  {0}  {1}" -f $Name, $Detail); $script:fails++ } }

Write-Host 'Validator baseline self-test'
Check 'the five helper functions were found in validate-studio.ps1' ($funcs.Count -eq $wanted.Count) "found=$($funcs.Count)"
Check 'approved constants are the final baseline (51 / 649 + 3 todo / 256 in 4 projects / Chromium 156.0.8078.4 / Playwright 1.64.0 / PostgreSQL 16.15)' (($ExpectedUnit -eq 51) -and ($ExpectedIntegration -eq 649) -and ($ExpectedTodo -eq 3) -and ($ExpectedPlaywright -eq 256) -and ($ExpectedProjects -eq 4) -and ($ExpectedChromium -ceq '156.0.8078.4') -and ($ExpectedPlaywrightVersion -ceq '1.64.0') -and ($ExpectedPostgres -ceq '16.15')) 
Check 'runtime commit constant is the validated F6 tip f3b5483c2b253f0ccb0ee9b62060379b7575fb08' ($RuntimeCommit -ceq 'f3b5483c2b253f0ccb0ee9b62060379b7575fb08')

# Candidate SHA format
Check 'Test-FullSha accepts 40 lowercase hex' (Test-FullSha ('0123456789abcdef' * 3).Substring(0, 40))
foreach ($bad in @('', 'HEAD', 'main', 'release/founding-family-beta', '9781f7a', (('0123456789ABCDEF' * 3).Substring(0, 40)), (('0123456789abcdef' * 3).Substring(0, 41)), (('0123456789abcdeg' * 3).Substring(0, 40)))) {
    Check ("Test-FullSha refuses '{0}'" -f $bad) (-not (Test-FullSha $bad))
}

# Vitest
Check 'Vitest 51 + 649 + 3 todo: baseline met (no problems)' (@(Get-VitestBaselineProblems @(51, 649) 3).Count -eq 0)
Check 'Vitest order does not matter' (@(Get-VitestBaselineProblems @(649, 51) 3).Count -eq 0)
Check 'Vitest 648 integration: FAIL' (@(Get-VitestBaselineProblems @(51, 648) 3).Count -ge 1)
Check 'Vitest 50 unit: FAIL' (@(Get-VitestBaselineProblems @(50, 649) 3).Count -ge 1)
Check 'Vitest an extra passing test file (51, 649, 5): FAIL (total passed differs)' (@(Get-VitestBaselineProblems @(51, 649, 5) 3).Count -ge 1)
Check 'Vitest todo 2: FAIL' (@(Get-VitestBaselineProblems @(51, 649) 2).Count -eq 1)
Check 'Vitest todo 4: FAIL' (@(Get-VitestBaselineProblems @(51, 649) 4).Count -eq 1)
Check 'Vitest no counts parsed at all: FAIL' (@(Get-VitestBaselineProblems @() 0).Count -ge 1)

# Playwright
Check 'Playwright 256 passed, 0 failed/flaky/skipped, 4 projects: baseline met' (@(Get-PlaywrightBaselineProblems 256 256 0 0 0 4).Count -eq 0)
Check 'Playwright 255 total: FAIL' (@(Get-PlaywrightBaselineProblems 255 255 0 0 0 4).Count -ge 1)
Check 'Playwright 257 total: FAIL' (@(Get-PlaywrightBaselineProblems 257 257 0 0 0 4).Count -ge 1)
Check 'Playwright 1 failed: FAIL' (@(Get-PlaywrightBaselineProblems 256 255 1 0 0 4).Count -ge 1)
Check 'Playwright 1 flaky: FAIL' (@(Get-PlaywrightBaselineProblems 256 255 0 1 0 4).Count -ge 1)
Check 'Playwright 1 skipped: FAIL' (@(Get-PlaywrightBaselineProblems 256 255 0 0 1 4).Count -ge 1)
Check 'Playwright 3 projects: FAIL' (@(Get-PlaywrightBaselineProblems 256 256 0 0 0 3).Count -eq 1)
Check 'Playwright 5 projects: FAIL' (@(Get-PlaywrightBaselineProblems 256 256 0 0 0 5).Count -eq 1)

# Browser and database versions (exact pins)
Check 'Chromium 156.0.8078.4 + Playwright 1.64.0: baseline met' (@(Get-BrowserVersionProblems '156.0.8078.4' '1.64.0').Count -eq 0)
Check 'Chromium 141.0.7390.37 (a different build): FAIL' (@(Get-BrowserVersionProblems '141.0.7390.37' '1.64.0').Count -eq 1)
Check 'Chromium 156.0.8078.5 (one patch off): FAIL' (@(Get-BrowserVersionProblems '156.0.8078.5' '1.64.0').Count -eq 1)
Check 'Chromium unknown: FAIL' (@(Get-BrowserVersionProblems 'unknown' '1.64.0').Count -eq 1)
Check 'Playwright 1.63.0: FAIL' (@(Get-BrowserVersionProblems '156.0.8078.4' '1.63.0').Count -eq 1)
Check 'PostgreSQL 16.15: baseline met' (@(Get-PostgresVersionProblems '16.15').Count -eq 0)
foreach ($pg in '16.14', '16.1', '17.1', '16', 'unknown') { Check ("PostgreSQL '{0}': FAIL" -f $pg) (@(Get-PostgresVersionProblems $pg).Count -eq 1) }

# The validator must no longer treat baseline violations as warnings.
$text = Get-Content -LiteralPath $target -Raw
Check 'validator has no remaining "approved baseline" Write-Warn' (-not ($text -match 'Write-Warn[^\r\n]*approved baseline'))
Check 'validator heading says FINAL RELEASE CANDIDATE' ($text -match "Write-Banner 'BIDAZOO STUDIO VALIDATION - FINAL RELEASE CANDIDATE'")
Check 'validator requires -CandidateSha (precondition, exit 2)' ($text -match "Stop-Precondition '-CandidateSha <40 lowercase hex> is required")

if ($fails -eq 0) { Write-Host 'VALIDATOR SELF-TEST PASS'; exit 0 } else { Write-Host "VALIDATOR SELF-TEST FAIL ($fails)"; exit 1 }
