# Studio PC validation (official Playwright run)

Status: **pending**. The Checkpoint B baseline is commit `01b7d41`. Playwright's pinned Chromium
could not be downloaded in the development sandbox, so the official browser run has not happened.
A supplementary run (24/24 on Chromium 141, a different build) exists but is **not** official
validation and must not be reported as such.

Commands are PowerShell, run from the repository root. Nothing here touches Hop Quest, Fact Crew,
Accounts, Caddy, Cloudflare, or any production database.

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
