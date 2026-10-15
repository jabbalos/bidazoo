# Studio PC validation (official Playwright run)

Status: **COMPLETE. Official validation passed on the Studio PC on October 12, 2026, for
Checkpoints B, C, D, and E, and later for the runtime baseline at Checkpoint F5 (`f3b5483`).** The
accepted Checkpoint B application baseline is commit `01b7d41`; the
Checkpoint C game implementation is `7042f8f`; the Checkpoint D exact validated commit is
`52547a356bdde6397c4b576381c30efff05e1d6e`; the Checkpoint E exact validated commit is
`a283c2470fe5abcb47f49d3f5753dea1bd881e78`; the runtime (F5) exact validated commit is
`f3b5483c2b253f0ccb0ee9b62060379b7575fb08`. The runtime record comes first below, then Checkpoint E,
then Checkpoint D, then Checkpoint C, then Checkpoint B. The earlier records are historical and are
kept as written, including their own counts.

## Runtime baseline: Checkpoint F5 validation record (official run, passed)

This is the **current runtime validation baseline**. It was reported by the project owner as the
official Studio-PC result for the exact SHA below. The run date, run folder and the bundle-scan and
playthrough totals were not supplied, so they are not recorded here.

| Item | Result |
| --- | --- |
| Git commit tested (exact validated commit) | `f3b5483c2b253f0ccb0ee9b62060379b7575fb08` ("test(play): make expression wiring scan CRLF-safe"), branch `feature/world-expedition-runtime-integration` |
| Vitest (unit) | 51 passed (51) |
| Vitest (integration, real PostgreSQL) | 649 passed + 3 todo |
| Playwright | 256 passed of 256, 0 failed, 0 flaky, 0 skipped; 4 projects |
| Chromium | 156.0.8078.4 (Playwright's pinned build) |
| PostgreSQL | 16.15 |
| Production build | PASS |
| Client bundle scan (`npm run scan:client`) | **CLEAN** |
| Live API playthrough (`npm run playthrough`) | **ALL CHECKS PASSED** |
| Working tree | Clean |
| Overall | **PASS** |

- **Checkpoint F6** (final integrated runtime / release-candidate QA) made **zero repository
  changes**, so this validation applies to the F6 SHA. F6's own audit ran in a development sandbox
  on a non-pinned Chromium 141 (same counts passed) and is **supplementary, not official**.
- **Validator counts.** The validator on the runtime branch expects 51 unit, 649 integration, 3 todo
  and 256 Playwright. The validator on `main` still expects the Checkpoint E counts (51, 375, 3, 120)
  and would print count warnings (warnings only, not failures) until the runtime branch is
  integrated. No validator change is made by this documentation update.
- **Known follow-ups** (the F6 minor items, including validator cleanup M9) are listed in
  [PROJECT-STATE.md](PROJECT-STATE.md).

## Checkpoint E validation record (official run, passed)

Source: the local run folder `.validation-logs\20261012-221739` on the Studio PC (git-ignored, so the
evidence is recorded here). Command: `scripts\validate-studio.bat -PortablePostgres`,
normal (non-elevated) user, Playwright's pinned Chromium.

| Item | Result |
| --- | --- |
| Date and shell | October 12, 2026, run folder `20261012-221739` |
| Git commit tested (exact validated commit) | `a283c2470fe5abcb47f49d3f5753dea1bd881e78` ("tooling: update Studio validator for Checkpoint E") |
| Vitest (unit) | 51 passed |
| Vitest (integration, real PostgreSQL) | 375 passed, 3 todo (378 including todo) |
| Playwright | 120 passed of 120, 0 failed, 0 flaky, 0 skipped; 4 projects (360x640, 390x844, 820x1180, 1440x900) |
| Retries | None (0) |
| Playwright version | 1.64.0 |
| Chromium | 156.0.8078.4 (Playwright's pinned build, revision 1248; `PW_CHROMIUM_EXECUTABLE` unset) |
| PostgreSQL | 16.15, portable, isolated and BidaZoo-owned, 127.0.0.1:54329; databases `bidazoo_test` and `bidazoo_e2e` |
| Production build | PASS |
| Client bundle scan (`npm run scan:client`) | **CLEAN**: 7 files, 1,256,370 bytes, 24 forbidden markers checked |
| Live API playthrough (`npm run playthrough`) | **ALL CHECKS PASSED**, 39 PASS lines |
| Typecheck (`npm run typecheck`) | Outside `validate-studio.ps1` (the validator has no typecheck step). **Not confirmed in the results supplied for this record, so no result is recorded here.** |
| Validator expected counts | 51 unit, 375 integration, 3 todo, 120 Playwright, 4 projects, set in `a283c24` from the green pre-run; no count warnings were reported in the results supplied |
| Overall | **PASS** |

The identity behavior (guardian sign-in, devices, profiles, PIN, guest claim, legacy claim, audit,
throttles, mail with the fake/file sender) is proven by the integration and Playwright suites in those
totals. No real mail provider, DNS record or production secret was used or needed.

**How the commits relate.** `a283c24` is the exact validated commit. The documentation-only closure
commit that records this result came after it and was not itself validated; it changed no application,
test, validator or runtime file.

**Pre-run history (kept short).** The first Studio pre-run, on `057aac4`, ran unit 51 and integration
375 + 3 todo cleanly but Playwright had 4 failures out of 116 (112 passed; the 4 retries failed again),
all on `desktop-1440x900`, all with `touchscreen.tap: hasTouch must be enabled on the browser context`.
The shared test tap helper chose touch input from `navigator.maxTouchPoints`, which reflects the host:
the touch-capable Studio PC reported touch on a desktop project that was not created with
`hasTouch`. The helper now reads the Playwright project's `hasTouch` setting, with no fallback, and a
regression test covers it (`03748ae`, test only; no gameplay or application change). A second pre-run on
`03748ae` was green (run `20261012-220415`: 51 unit, 375 + 3 todo, 120/120 Playwright, build, scan and
playthrough passing), and the validator counts were then calibrated in `a283c24`, which passed the
official run above.

**Not done by this checkpoint (and not claimed):** deployment, production identity secrets, production
SMTP, the `notify.bidazoo.com` DNS records, or a real guardian email test. The live beta is unchanged.
Those are the Identity Release Gate ([IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md) section 10).

Conclusion: **Checkpoint E is complete and Studio-PC validated, and not deployed.** The Checkpoint D,
C and B records below are unchanged, including their historical "20 forbidden markers" figure.

## Checkpoint D validation record (official run, passed)

Source: the local run folder `.validation-logs\20261012-130626` on the Studio PC (git-ignored, so the
evidence is recorded here). Command: `scripts\validate-studio.bat -PortablePostgres`, normal
(non-elevated) user, Playwright's pinned Chromium.

| Item | Result |
| --- | --- |
| Date and shell | October 12, 2026, run folder `20261012-130626` |
| Git commit tested (exact validated commit) | `52547a356bdde6397c4b576381c30efff05e1d6e` ("tooling: Studio validator runs build, client bundle scan, and live API playthrough") |
| Checkpoint D commits | `524f2e8` implementation; `2eb2970` tests; `abde130` validator counts; `7dd9136` documentation (pending-validation state); `52547a3` validator tooling update (validated commit) |
| Vitest (unit) | 51 passed (51) |
| Vitest (integration, real PostgreSQL) | 115 passed, 3 todo (118) |
| Playwright | 56 passed, 0 failed, 0 flaky; 4 projects (360x640, 390x844, 820x1180, 1440x900) |
| Retries | None |
| Playwright version | 1.64.0 |
| Chromium | 156.0.8078.4 (Playwright's official pinned build) |
| PostgreSQL | 16.15, portable, isolated and BidaZoo-owned, 127.0.0.1:54329; shutdown succeeded |
| Production build | PASS |
| Client bundle scan (`npm run scan:client`) | **CLEAN**: 3 files, 1,228,557 bytes, 20 forbidden markers checked |
| Live API playthrough (`npm run playthrough`) | **ALL CHECKS PASSED**, 39 PASS lines |
| Steps | `npm ci` PASS; Chromium install PASS; database creation PASS; migrations PASS; Vitest PASS; Playwright PASS; build PASS; scan PASS; playthrough PASS |
| Validator count warnings | None |
| Overall | **PASS**; validator exit code 0 |

The security and rate-limit suites are part of those totals, and every Playwright test ran under the
enforced client CSP with the guard that fails on any CSP violation, console error, page error, or
429/503. The closure documentation commit that records this result came after `52547a3` and was not
itself Studio validated.

Conclusion: **Checkpoint D is complete and Studio-PC validated.** The Checkpoint C and Checkpoint B
records below are unchanged.

For Checkpoint B, the commit that was tested is `d0345bf`, which adds only the validation tooling (and docs) on top of that baseline. The earlier
supplementary run (24/24 on Chromium 141, a different build) is superseded and was never official
validation.

## Checkpoint C validation record (official run, passed)

Source: the local run folder `.validation-logs\20261012-114342` on the Studio PC (git-ignored, so
the evidence is recorded here).

| Item | Result |
| --- | --- |
| Date and shell | October 12, 2026, run folder `20261012-114342` |
| Git commit tested | `01752a1df4a4c0dbce41415027971b41540cb4dd` |
| Checkpoint C implementation commit | `7042f8f` ("feat(zoo-sprint): Checkpoint C - five locked starters, presentation only") |
| Difference between the two | Documentation and reference art only: `docs/reference-art/bidazoo-character-roster-reference.png`. No application, game, schema, API, database, learning, or test code differs. |
| Vitest (unit) | 51 passed (51) |
| Vitest (integration, real PostgreSQL) | 88 passed, 3 todo (91) |
| Playwright | 40 passed, 0 failed, 0 flaky, 0 skipped; 4 projects (360x640, 390x844, 820x1180, 1440x900) |
| Retries | None |
| Playwright version | 1.64.0 |
| Chromium | 156.0.8078.4 (Playwright's official pinned build) |
| PostgreSQL | 16.15, portable |
| Steps | `npm ci` PASS; database creation PASS; migrations PASS; PostgreSQL startup and shutdown PASS |
| Overall | **PASS**; exit code 0 |

The runner emitted two warnings in that run only because its approved baseline counts still
reflected Checkpoint B: integration expected 81 (now 88) and Playwright expected 24 (now 40). The
increases are the intentional Checkpoint C test additions (7 roster integration tests; 10 e2e tests
per viewport instead of 6), not failures.

Afterward, the runner's expected counts were updated in commit `5fef907` (tooling only): integration
**88** and Playwright **40**. Unchanged: unit 51, todo 3, projects 4, and `BaselineCommit`
`01b7d41`. Commit `5fef907`, the closure docs `5b287f2`, and the merge `6fcbc75` came after the
Studio run and were **not** themselves part of it; the exact commit that was Studio validated is
`01752a1`. The updated runner has not yet been run on the Studio PC.

Conclusion: **Checkpoint C is complete and Studio-PC validated.** Checkpoint B's accepted baseline
`01b7d41` and its record below are preserved. The limitations and deferred hardening items below
are unchanged.

## Checkpoint B validation record (official run, passed)

Source: the local run folder `.validation-logs\20261012-092607` (`SUMMARY.txt` and
`playwright-results.json`). `.validation-logs/` is git-ignored, so the evidence is recorded here
rather than committed.

| Item | Result |
| --- | --- |
| Date and shell | October 12, 2026, run folder `20261012-092607`, normal (non-elevated) user |
| Git commit tested | `d0345bf860d6abdab2e2d197e5dc5f6f5ce51a8e` ("chore: add -PortablePostgres to Studio validation runner") |
| Vitest (unit) | 51 passed (51) |
| Vitest (integration, real PostgreSQL) | 81 passed, 3 todo (84) |
| Vitest exit code | 0 |
| Playwright | 24 passed, 0 failed, 0 flaky, 0 skipped; 4 projects (360x640, 390x844, 820x1180, 1440x900) |
| Retries | None; no test needed a retry |
| Playwright version | 1.64.0 |
| Chromium | 156.0.8078.4 (Playwright's own pinned build, installed with `npx playwright install chromium`) |
| Playwright exit code | 0 |
| PostgreSQL | 16.15, portable, isolated and BidaZoo-owned; no system PostgreSQL used |
| Host and port | 127.0.0.1, 54329 (loopback only, trust authentication on that throwaway cluster) |
| Cluster | Started by this run; shutdown succeeded |
| Steps | `npm ci` ok; Chromium install ok; create databases ok; migrations ok; Vitest ok; Playwright ok |
| Overall | **PASS**; runner exit code 0 |

An earlier run the same morning (`20261012-091146`, same commit, same counts) also passed, but it
was started from an elevated shell and the runner reported `PASS (with warnings)`. It corroborates
the result and is not the official record.

Conclusion: **Checkpoint B is complete and Studio-PC validated.** The application baseline is still
`01b7d41`. Carried-forward limitations (below) are unchanged and accepted. Pre-beta hardening is a
separate checkpoint that is **not** authorized. (Checkpoint C was implemented afterward and is
validated separately; see the Checkpoint C record above.)

The rest of this document is the procedure to repeat the validation.

Commands are PowerShell, run from the repository root. Nothing here touches Hop Quest, Fact Crew,
Accounts, Caddy, Cloudflare, or any production database.

## RECOMMENDED: one command, no PostgreSQL install

```text
scripts\validate-studio.bat -PortablePostgres
```

This avoids installing PostgreSQL globally. The runner uses a **portable PostgreSQL 16** that lives
in its own folder (`%USERPROFILE%\BidaZoo-pg`), runs as your normal user, creates no Windows
service, changes no PATH or system setting, and listens on `127.0.0.1` only (port `54329`). It
initializes a throwaway cluster, starts it, runs the whole validation, and stops the server it
started. Your other PostgreSQL installs (if any) are never touched.

**One-time setup (about two minutes).** The runner does not download anything by itself, because
EnterpriseDB publishes the binaries only behind a changing download link and this tool refuses to
guess a URL.

1. Open <https://www.enterprisedb.com/download-postgresql-binaries> and, under "Binaries from
   installer", download **PostgreSQL 16.x for Windows x86-64** (a ZIP). Use only that page, over HTTPS.
2. Save the ZIP into `%USERPROFILE%\BidaZoo-pg` (create the folder if needed). A copy left in your
   Downloads folder is found too. The file name looks like `postgresql-16.x-...-windows-x64-binaries.zip`.
   If you prefer, extract it yourself so that `%USERPROFILE%\BidaZoo-pg\pgsql\bin\pg_ctl.exe` exists.
3. Run `scripts\validate-studio.bat -PortablePostgres`. If the ZIP is not there yet, the runner
   prints these same steps and stops with exit code `2` before doing anything else.

On the first run it extracts the ZIP (printing its SHA-256), runs `initdb` (user `postgres`, UTF8,
trust authentication), starts the server with `pg_ctl`, waits with `pg_isready`, and then validates.
Later runs reuse the same folder. No password is needed or asked for.

**Why trust authentication is acceptable here.** It is used only because this cluster (a) listens on
`127.0.0.1` exclusively, (b) uses a non-default port, (c) holds throwaway validation data, and
(d) is separate from every other PostgreSQL. The runner also checks `pg_hba.conf` and refuses to
start a cluster that would allow trust from anything but loopback. Do not reuse this cluster for
anything else.

**What it will and will not do to PostgreSQL.**

- It only ever starts and stops the cluster in `<portable root>\data` that carries its own marker
  file (`BIDAZOO-VALIDATION-CLUSTER.txt`). A different cluster in that folder is refused and left
  untouched. It never uses `taskkill`, or any kill by name or ID, and never stops a process it did not start.
  (The one process it ends directly is the API instance of step 8, through the process object it created itself.)
- It stops the server (`pg_ctl ... stop`) only if **this run started it**, whether validation passed
  or failed, and also if you press Ctrl+C. If your own earlier run left the portable server running,
  the runner reuses it and leaves it running, and says so in the summary.
- If port 54329 is busy, it stops with exit code `2` and names the owner. It never kills or moves
  anything. Choose another port with `-PgPort 54330` (1024-65535; `5432`, `3001`, and `4173` are refused).
- If the server cannot be initialized or started, it prints the relevant log and exits with `2`
  (an environment problem, not a BidaZoo test failure). Test failures keep exit code `1`.
- `-Cleanup` still drops only `bidazoo_test` and `bidazoo_e2e`. **It never deletes the portable
  folder.** To remove everything when you are completely done, first make sure the portable server is
  stopped (the runner stops it itself), then delete the folder yourself:
  `Remove-Item -Recurse -Force "$env:USERPROFILE\BidaZoo-pg"`.

Examples (all arguments pass through the batch file unchanged):

```text
scripts\validate-studio.bat -PortablePostgres
scripts\validate-studio.bat -PortablePostgres -Cleanup
scripts\validate-studio.bat -PortablePostgres -PgPort 54330
scripts\validate-studio.bat -PortablePostgres -PortableRoot "D:\Tools\BidaZoo-pg"
```

The summary then adds: PostgreSQL mode (Portable), version, host, port, portable root, cluster
status, whether this run started the server, and whether shutdown succeeded. Logs of each portable
step (`initdb`, start, readiness, stop) are in the run's `.validation-logs\<timestamp>\` folder, and
the server's own log is `<portable root>\pg.log`. Neither is ever deleted by the runner.

## Alternative: use a PostgreSQL 16 you installed yourself

`scripts\validate-studio.bat` without `-PortablePostgres` needs `psql` on PATH (or under
`C:\Program Files\PostgreSQL\<version>\bin`) and a running PostgreSQL 16 with a superuser. It
creates and drops only the two throwaway databases and never starts or stops your server.
Everything below (switches, steps, exit codes) applies to both modes unless noted.

## One-click runner

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
| `-PortablePostgres` | Use the isolated portable PostgreSQL 16 described above. Forces host `127.0.0.1` and user `postgres` (a conflicting `-PgHost` or `-PgUser` stops the run); the port defaults to `54329`; no password. |
| `-PortableRoot` | Folder for the portable binaries and cluster. Default `%USERPROFILE%\BidaZoo-pg`. Folders under `Program Files` or the Windows folder are refused. |

Without `-Cleanup`, an interactive run asks at the end whether to delete the two databases
(default: No). That question comes before the final summary, so the summary is the last thing on
screen (and the portable server is stopped after the databases are handled).

What it does, in order:

1. Confirms it is in the BidaZoo repository, prints the Git commit, and warns if the working tree
   is dirty or `01b7d41` is not in the checkout's history.
2. Confirms ports 3001 and 4173 are free (and refuses to continue if not; it never kills anything).
3. Clears `PW_CHROMIUM_EXECUTABLE` and other overriding variables **for this process only**, and sets `CI=1`.
4. `npm ci`, then `npx playwright install chromium` (the official build).
4a. With `-PortablePostgres`: finds or extracts the portable binaries, initializes the throwaway
   cluster if needed, starts it, and waits until it accepts connections (exit `2` on any failure).
5. Creates `bidazoo_test` and `bidazoo_e2e` and migrates both. It never touches any other database.
6. `npm test` against `bidazoo_test` (51 unit, 115 integration, 3 todo are *reported* for comparison).
7. `npm run test:e2e -w @bidazoo/tests -- --reporter=list,json` against `bidazoo_e2e`
   (56 tests, 4 viewports; this is the same command as `npm run test:e2e` plus a JSON reporter so
   retries and skips can be counted).
8. If everything so far passed: `npm run build` (log `12-build.log`), then `npm run scan:client`
   (`13-scan-client.log`; non-zero exit or no `CLEAN:` line fails the run). With the build and migrations
   in place it then waits for port 3001 to be free, starts one API instance (`node apps\api\dist\server.js`
   against `bidazoo_e2e`; logs `14-api-server.out.log` and `14-api-server.err.log`), waits for `/ready`,
   and runs `npm run playthrough` against it (`15-playthrough.log`; non-zero exit or no `ALL CHECKS PASSED`
   line fails the run). The scan and the playthrough are the repository's own scripts; the runner does not
   reimplement them. The API instance is stopped afterwards, even if the playthrough fails or you press Ctrl+C.
9. Prints a summary (commit, Vitest, Playwright, retries, build, bundle scan, playthrough, Playwright and
   Chromium versions, database, overall) and lists any traces, screenshots, or videos with their full paths.

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

The portable mode adds no elevation either: it never creates a Windows service, never edits PATH
(not even for this process), and never modifies any installed PostgreSQL. If you start it from an
elevated shell it warns, as above.

Logs for each run are written to `.validation-logs\<timestamp>\` (git-ignored), including
`SUMMARY.txt` and `playwright-results.json`. Playwright's own failure evidence is in
`tests\test-results\`. The runner never deletes logs or test evidence.

Static checks performed on the runner in the Linux development sandbox: the script parses with no
errors under PowerShell 7.4; the Vitest-summary and Playwright-JSON parsing logic was exercised on
real output and on a synthetic report containing a failure, a flaky test, and a skipped test; the
original-arguments command builder was exercised with the switches above; and the scripts were
audited for destructive and elevation commands (none besides the exact-name, confirmed database
drops). The runner was not executed on Windows in the
sandbox (it is Linux and has no Windows networking cmdlets). It has since been run end to end on the
Studio PC, as recorded above. If it misbehaves on another machine, the manual procedure below still
applies.

`-PortablePostgres` was additionally exercised in the Linux sandbox against a real PostgreSQL 16 with
`npm`, `npx`, and `node` stubbed: initialize, start, readiness, database create/migrate/drop, stop,
reuse of an already-running portable cluster, port collision, a failing test run (exit `1`), a
crash mid-run (server still stopped), refusal of a foreign or non-empty data folder, a wrong major
version, a non-loopback `pg_hba.conf`, conflicting switches, and an unrelated PostgreSQL left running
and untouched. What that could **not** cover, and what only the Studio PC could show (since exercised by the October 12, 2026 runs recorded above): Windows
paths and `.exe` names, `Expand-Archive` on the real EDB ZIP, Windows PowerShell 5.1 behavior,
`pg_ctl`/`initdb` running as a normal Windows user, Windows Defender or firewall prompts, and
whether the real ZIP's layout is `pgsql\bin` (the runner also searches a few folders deeper).

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

Node 22.12 or newer, npm 10+, Git, and PostgreSQL 16 (the one-click runner can supply a portable one
with `-PortablePostgres`; otherwise a local PostgreSQL 16 with a superuser you control). Use
**new, throwaway databases** named below. Never point these at a database with real data.

## 2. Get the exact baseline

```powershell
git clone <your BidaZoo remote> bidazoo   # or: cd bidazoo; git fetch
cd bidazoo
git checkout d0345bf                       # the validated commit (01b7d41 plus tooling and docs only)
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

Database-backed unit and integration tests (Checkpoint D: expect 51 + 115 passed, 3 todo; the
Checkpoint C commit gives 51 + 88 and the Checkpoint B checkout `d0345bf` gives 51 + 81):

```powershell
$env:TEST_DATABASE_URL = "$pg/bidazoo_test"
npm test
```

Official Playwright run (Checkpoint D: 56 tests, 14 per viewport at 360x640, 390x844, 820x1180,
1440x900; Checkpoint C gave 40, 10 per viewport; the Checkpoint B checkout gives 24, 6 per viewport):

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

- The final summary line (for example `56 passed`) and the full list output.
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

Historical list from the Checkpoint B era, kept as written. Several items have since been resolved
(rate limiting, CSP); the current limitations are in [PROJECT-STATE.md](PROJECT-STATE.md).

No rate limiting; guest creation is unbounded; clearing the guest cookie loses guest progress;
mastery day boundaries use UTC; network latency counts toward authoritative response time; no
Content-Security-Policy header; character art is code-drawn transitional art, not final; Click (the
host) is not implemented; real-device performance is unmeasured.

## Priority before any public-facing beta

1. Rate limiting: **done in Checkpoint D; Studio validated October 12, 2026.**
2. Guest-creation abuse limits: **done in Checkpoint D; Studio validated October 12, 2026.**
3. Content-Security-Policy and the remaining browser security headers: **done in Checkpoint D; Studio
   validated October 12, 2026.**
4. Official Playwright validation on the Studio PC: **done October 12, 2026** (see the validation record above).
5. Real-device performance checks: **not done.** F6 judged the eager image preload acceptable from
   emulated measurements in a sandbox only (see [PROJECT-STATE.md](PROJECT-STATE.md)).
6. A deliberate guest-account recovery and claim strategy: **done in Checkpoint E** (Studio validated
   October 12, 2026; on `main`; not deployed).

## Checkpoint D: what the Studio run established (criteria; result is in the record above)

Checkpoint D closed when the official run (`scripts\validate-studio.bat -PortablePostgres`, normal
user, Playwright's pinned Chromium) passed on `52547a3` and was recorded here. The runner
expects 51 unit, 115 integration, 3 todo, and 56 Playwright (4 viewports); a count warning after the
update would have meant something changed. The run confirmed:

- Vitest 51 unit and 115 integration (+3 todo) pass, with no count warnings. The integration tests
  include "a throttled request mutates nothing" (row counts and ledger totals unchanged), the
  idempotent-retry check, the proxy-trust and spoofed-header checks, and security headers on success
  and error responses.
- Playwright 56 pass, 0 flaky, no retries. Every browser test runs under the enforced CSP with a guard
  that fails on any CSP violation, console error, page error, or 429/503, so a pass means zero
  unexpected violations on all four viewports, and the full game completes.
- PostgreSQL flow (create, migrate, start, stop) still passes.
- The production build succeeds, `npm run scan:client` reports `CLEAN`, and the live API playthrough
  (`npm run playthrough`, run by the runner against its own API instance and `bidazoo_e2e`) reports
  `ALL CHECKS PASSED`. All three are run and logged by the runner (`12-`, `13-`, `15-` logs).

These criteria were all met; see the Checkpoint D validation record at the top of this file.

## Visual direction

The transitional code-drawn visuals may later be replaced by the final BidaZoo character art and UI design
(the locked character decisions are recorded in [CHARACTER-BIBLE.md](CHARACTER-BIBLE.md)).
That replacement must preserve the current API and gameplay contracts and must not change the
accepted architecture (session ownership, served-question model, attempt idempotency, reward
ledgers, server-authoritative mastery, guest-session trust boundary).

**Update (October 15, 2026):** the final character art has been integrated on the runtime branch
(Checkpoints F1 to F6, closed; see [PROJECT-STATE.md](PROJECT-STATE.md)) without changing those
contracts. `main` still has the code-drawn visuals until release-candidate integration.
