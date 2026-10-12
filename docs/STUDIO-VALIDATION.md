# Studio PC validation (official Playwright run)

Status: **pending**. The Checkpoint B baseline is commit `01b7d41`. Playwright's pinned Chromium
could not be downloaded in the development sandbox, so the official browser run has not happened.
A supplementary run (24/24 on Chromium 141, a different build) exists but is **not** official
validation and must not be reported as such.

Commands are PowerShell, run from the repository root. Nothing here touches Hop Quest, Fact Crew,
Accounts, Caddy, Cloudflare, or any production database.

## One-click runner (recommended)

`scripts\validate-studio.bat` (double-click, or run from Windows Terminal) launches
`scripts\validate-studio.ps1` from the repository root, as **your normal, non-elevated user**,
and forwards every argument unchanged. It performs steps 0 to 7 below automatically. Paths are
quoted, so a repository path with spaces is fine.

```text
Double-click:      scripts\validate-studio.bat          (prompts for the PostgreSQL password)

From a terminal, in the repository folder:
  scripts\validate-studio.bat
  scripts\validate-studio.bat -Cleanup
  scripts\validate-studio.bat -Recreate
  scripts\validate-studio.bat -Recreate -Cleanup
  scripts\validate-studio.bat -PgHost localhost -PgPort 5432 -PgUser postgres

Directly in PowerShell (equivalent):
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-studio.ps1 -Cleanup
```

Switches (all pass through the batch file):

| Switch | Meaning |
| --- | --- |
| `-PgHost`, `-PgPort`, `-PgUser` | PostgreSQL location. Defaults: `localhost`, `5432`, `postgres`. The password is prompted for (or taken from `PGPASSWORD`); it is never written to disk and is masked in logs. |
| `-Recreate` | If `bidazoo_test` or `bidazoo_e2e` already exist, drop and recreate **exactly those two names** after you type `yes`. Without it, existing databases stop the run so earlier evidence is never overwritten. |
| `-Cleanup` | Drop the two throwaway databases at the end, **only if validation passed**. If it failed they are kept. |
| `-NoPrompt` | Never ask questions. |

Without `-Cleanup`, an interactive run asks at the end whether to delete the two databases
(default: No).

What it does, in order:

1. Confirms it is in the BidaZoo repository, prints the Git commit, and warns if the working tree
   is dirty or `01b7d41` is not in the checkout's history.
2. Confirms ports 3001 and 4173 are free (and refuses to continue if not; it never kills anything).
3. Clears `PW_CHROMIUM_EXECUTABLE` and other overriding variables **for this process only**, and sets `CI=1`.
4. `npm ci`, then `npx playwright install chromium` (the official build).
5. Creates `bidazoo_test` and `bidazoo_e2e` and migrates both. It never touches any other database.
6. `npm test` against `bidazoo_test` (51 unit, 81 integration, 3 todo are *reported* for comparison).
7. `npm run test:e2e -w @bidazoo/tests -- --reporter=list,json` against `bidazoo_e2e`
   (24 tests, 4 viewports; this is the same command as `npm run test:e2e` plus a JSON reporter so
   retries and skips can be counted).
8. Prints a summary (commit, Vitest, Playwright, retries, Playwright and Chromium versions,
   database, overall) and lists any traces, screenshots, or videos with their full paths.

**Exit codes are authoritative**: the runner exits 0 only if every command exited 0. The expected
counts only produce warnings. Tests that pass only after a retry are reported as warnings
(`PASS (with warnings)`), because they indicate flakiness. Exit codes: `0` passed, `1` validation
failed, `2` a precondition failed and nothing ran.

### Elevation

The runner never elevates itself and never relaunches anything as Administrator. `npm ci`,
Playwright, Vitest, the API, database connections, migrations, and the tests all run as the current
user, so npm package scripts and test code never run with admin rights for convenience. Nothing in
the normal flow needs elevation. The runner checks two things up front:

- If you started it from an **elevated** shell, it warns that this is unnecessary and continues.
- If the repository folder is **not writable** by your user (for example it was cloned under
  `C:\Program Files`), it stops with exit code 2 and explains why. The preferred fix is to clone the
  repository somewhere you own. If you deliberately want an elevated run, it prints the exact
  command with your original arguments preserved, to be run from an elevated terminal you opened
  yourself. If `npm ci` or the Chromium install fails with a permission error (`EPERM`, `EACCES`,
  `Access is denied`), it prints the matching log lines and the same hint.

Logs for each run are written to `.validation-logs\<timestamp>\` (git-ignored), including
`SUMMARY.txt` and `playwright-results.json`. Playwright's own failure evidence is in
`tests\test-results\`. The runner never deletes logs or test evidence.

Static checks performed on the runner in the Linux development sandbox: the script parses with no
errors under PowerShell 7.4; the Vitest-summary and Playwright-JSON parsing logic was exercised on
real output and on a synthetic report containing a failure, a flaky test, and a skipped test; the
original-arguments command builder was exercised with the switches above; and the scripts were
audited for destructive and elevation commands (none besides the exact-name, confirmed database
drops). The runner has **not** been executed end to end
on Windows (the sandbox is Linux and has no Windows networking cmdlets), so its first real run is
on the Studio PC. If it misbehaves there, the manual procedure below still applies.

## Manual procedure

## 0. Safety checks first

The e2e config starts the API on port **3001** and the client preview on **4173**, and by default
it *reuses* anything already listening there. On the Studio PC, make sure neither port is used by a
real service:

```powershell
Get-NetTCPConnection -LocalPort 3001,4173 -State Listen -ErrorAction SilentlyContinue
```

This must print nothing. If it prints rows, stop and free the ports (or ask). Also set `CI=1` for
the run (step 5): it disables server reuse, so Playwright fails loudly instead of testing whatever
is on those ports. (It also allows one retry; a test that passes only on retry should be reported.)

## 1. Prerequisites

Node 22.12 or newer, npm 10+, Git, and a local PostgreSQL 16 with a superuser you control. Use
**new, throwaway databases** named below. Never point these at a database with real data.

## 2. Get the exact baseline

```powershell
git clone <your BidaZoo remote> bidazoo   # or: cd bidazoo; git fetch
cd bidazoo
git checkout 01b7d41
git status --short                         # must print nothing
npm ci
```

## 3. Official Playwright Chromium

```powershell
Remove-Item Env:PW_CHROMIUM_EXECUTABLE -ErrorAction SilentlyContinue   # official run: must be unset
npx playwright --version                   # expect 1.64.x
npx playwright install chromium
```

This downloads the Chromium build Playwright pins. That is the whole point of the official run.

## 4. Databases

```powershell
$pg = "postgres://postgres:YOUR_PASSWORD@localhost:5432"
psql "$pg/postgres" -c "CREATE DATABASE bidazoo_e2e"
psql "$pg/postgres" -c "CREATE DATABASE bidazoo_test"
$env:DATABASE_URL = "$pg/bidazoo_e2e";  npm run db:migrate
$env:DATABASE_URL = "$pg/bidazoo_test"; npm run db:migrate
```

Both migrations must report success (3 migrations each).

## 5. Run the suites

Database-backed unit and integration tests (expect 51 + 81 passed, 3 todo):

```powershell
$env:TEST_DATABASE_URL = "$pg/bidazoo_test"
npm test
```

Official Playwright run (24 tests: 6 per viewport at 360x640, 390x844, 820x1180, 1440x900):

```powershell
$env:DATABASE_URL = "$pg/bidazoo_e2e"
$env:CI = "1"
npm run test:e2e
```

This builds the API and client, starts both, and drives real taps through the real stack. It uses
one worker by default. A GPU makes it much faster than the sandbox (which took about 11 minutes
because Chromium rendered on the CPU).

Optional extras: `$env:API_URL="http://127.0.0.1:3001"` plus `npm run playthrough` against a
running API, and `npm run scan:client` after `npm run build`.

## 6. What to send back

- The final summary line (for example `24 passed`) and the full list output.
- `npx playwright --version` and the Chromium version (`npx playwright install chromium --dry-run`
  shows it).
- Any failure: the error text, the viewport project name, and `tests/test-results/<test>/`
  (`error-context.md`, `trace.zip`). Open a trace with `npx playwright show-trace <trace.zip>`.
- Whether any test passed only on retry.

If the official run exposes a real Checkpoint B defect, fix only that defect and rerun the relevant
tests. Do not refactor the accepted architecture.

## 7. Cleanup

```powershell
psql "$pg/postgres" -c "DROP DATABASE bidazoo_e2e" -c "DROP DATABASE bidazoo_test"
Remove-Item Env:DATABASE_URL, Env:TEST_DATABASE_URL, Env:CI -ErrorAction SilentlyContinue
```

## Carried-forward limitations (accepted, not reasons to reject Checkpoint B)

No rate limiting; guest creation is unbounded; clearing the guest cookie loses guest progress;
mastery day boundaries use UTC; network latency counts toward authoritative response time; no
Content-Security-Policy header; placeholder art; real-device performance is unmeasured.

## Priority before any public-facing beta (not authorized yet)

1. Rate limiting.
2. Guest-creation abuse limits.
3. Content-Security-Policy and the remaining browser security headers.
4. Official Playwright validation on the Studio PC (this document).
5. Real-device performance checks.
6. A deliberate guest-account recovery and claim strategy.

These belong to a separate hardening checkpoint that needs explicit approval.

## Visual direction

The placeholder visuals may later be replaced by the locked BidaZoo character system and UI design.
That replacement must preserve the current API and gameplay contracts and must not change the
accepted architecture (session ownership, served-question model, attempt idempotency, reward
ledgers, server-authoritative mastery, guest-session trust boundary).
