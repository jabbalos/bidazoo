# Release rehearsal tooling and checklists (founding-family beta release candidate)

Originally prepared October 12, 2026 for the Checkpoint E identity release gate; **retargeted October 15, 2026** for the
final combined candidate on `release/founding-family-beta` (main + post-F6 documentation + the F1-F6 runtime + this tooling).

**The release candidate SHA is not stored here.** A script in commit X cannot contain X's own SHA, so the candidate is
immutable *input*: `-CandidateSha <40 lowercase hex>` (or `BZ_CANDIDATE_SHA`). `lib.ps1` refuses an empty value, a branch
name, a tag, `HEAD`, a short SHA, upper case, and any SHA that equals a historical reference commit. It then refuses
unexpected ancestry (see "Reference commits").

## Reference commits (all HISTORICAL / ROLLBACK / LINEAGE; none of them is the candidate)

| Commit | Role in this tooling |
| --- | --- |
| `1a106bc328ed0d544d4c49b61f3a1c2071ae65b7` | the live closed beta **and the only rollback target** (step 01 `-Name rollback`, step 05, step 07, ROLLBACK-CHECKLIST) |
| `a283c2470fe5abcb47f49d3f5753dea1bd881e78` | the Checkpoint E identity-only milestone this kit was first written for; kept only as lineage (must be an ancestor) |
| `856d012d3139735d7f13ffeebabb723222fba2e1` | `main` when the candidate was integrated (must be an ancestor) |
| `bb8e14d668324d3dfdd77d07dda84dd47cb04ee5` | post-F6 documentation reconciliation (must be an ancestor) |
| `f3b5483c2b253f0ccb0ee9b62060379b7575fb08` | the F1-F6 runtime, officially Studio-validated (must be an ancestor; the candidate may differ from it ONLY in docs, deployment tooling and the validator) |
| `d90f572c8de1804314c2edf520cc9199446aded7` | the `release/identity-beta` tooling tip (must be an ancestor) |

Live beta today: `1a106bc`, guest-only, identity not enabled. **Production identity stays OFF** in this release: the
candidate is deployed with `IDENTITY_SECRET` unset (steps 06 and 09 prove identity routes do not exist in that state).

**Status: UNTESTED ON STUDIO.** These scripts have not run on the Studio PC. The October 15 retargeting was checked by
parsing every `.ps1` with PowerShell 7 and by exercising the pure helpers (`Resolve-Candidate`, `Test-CandidateLineage`,
`Test-ReleaseOnlyPath`) and `tools/m6-headers.mjs` against the real repository and the real build in a Linux sandbox. Nothing
that needs Windows, the beta's PostgreSQL/Caddy binaries or the scratch cluster has been executed. Run them one at a time, read
each result, and report failures back. Fix the script, never the safety checks.

Nothing here changes the live beta, `api.env`, DNS, Cloudflare, Caddy configuration, scheduled tasks, or the live checkout.

## What the rehearsal uses (all new, all isolated)

| Thing | Value |
| --- | --- |
| Rehearsal root | `C:\BidaZoo-release` (evidence, logs, trees, rehearsal backups, scratch PostgreSQL, rollback kit) |
| Scratch PostgreSQL | its own cluster, `127.0.0.1:54341`, scram auth, own password file under `C:\BidaZoo-release\secrets` |
| Scratch databases | `rehearsal_pre`, `rehearsal_migrated`, and `verify_*` / `final_verify_*` |
| Rehearsal ports | API 3102-3105, Caddy 8481-8482 (never 3101, 8480, 54340) |
| Live database | opened **SELECT-only**, only by the two backup scripts; the helper refuses any other statement |
| Processes | started and stopped by recorded PID only, never by name |
| Executables borrowed read-only | `C:\BidaZoo-beta\pg\pgsql\bin\*` and `C:\BidaZoo-beta\bin\caddy.exe` |
| Read-only reads of live files | `pg-app.pw` (for `pg_dump`), `Caddyfile.beta` and `run-api.cmd` (for comparison / kit), `.git\HEAD` |

Normal user for everything in Phase 0 (`run.bat`). Only the maintenance-window scripts use `run-admin.bat`.

## Phase 0 run order (non-production)

```bat
rem The worktree must be clean and checked out DETACHED at the candidate: git fetch origin && git checkout --detach <CAND>
rem (also run 'git fetch origin' in C:\Users\jonat\Documents\BidaZoo, the repository the build clones are made from).
cd C:\Users\jonat\Documents\BidaZoo-Identity-Release\infrastructure\deployment\identity-release
rem <CAND> below is the 40-character lowercase candidate SHA supplied by the owner (never a branch name).

run.bat 00-verify-git.ps1 -CandidateSha <CAND>      rem 0.1  candidate identity, lineage, migrations + dependency differences
run.bat 02-scratch-cluster.ps1 -Action Start rem      throwaway PostgreSQL on 54341
run.bat 01-build-tree.ps1 -Name stage -CandidateSha <CAND>   rem 0.2-0.5  exact candidate: npm ci, build, scan:client (CLEAN)
run.bat 03-backup-verify.ps1 -Mode Rehearsal rem 0.6-0.8  pg_dump -Fc, restore to scratch, row + content compare, SHA-256
run.bat 04-restore-migrate.ps1 -CandidateSha <CAND>   rem 0.9-0.10 apply 0003+0004 to a copy, verify tables/FKs/indexes/triggers, pre-E data intact
run.bat 01-build-tree.ps1 -Name rollback     rem 0.11 independent 1a106bc tree with its own npm ci / build
run.bat 05-rollback-proof.ps1                rem 0.12 old code starts on 3102/8481; also against the MIGRATED schema
run.bat 06-runtime-and-layerB.ps1 -CandidateSha <CAND>   rem 0.13 identity stays OFF by default; cannot half-enable; Layer B throttling
run.bat 09-m6-release-headers.ps1 -CandidateSha <CAND>   rem 0.14 M6 gate (rehearsal): cache + security headers of this build behind the live Caddy rules
run.bat 07-prepare-rollback-kit.ps1          rem      ready-to-copy run-api / Caddyfile variants pointing at the rollback tree
run.bat 08-cleanup-rehearsal.ps1             rem      stops leftovers; add -DropRehearsalDbs etc. only when evidence is recorded
```

Every script prints `PASS`/`FAIL` lines and a final `RESULT`, and writes a transcript to `C:\BidaZoo-release\evidence`.
Passwords are never printed; scratch passwords live only in files under `C:\BidaZoo-release\secrets` (restricted ACL).

## What each rehearsal step proves

| Step | Evidence |
| --- | --- |
| 00 | candidate is a full exact SHA, the checkout IS the candidate and is clean; all six reference commits are ancestors; the candidate differs from the Studio-validated runtime (f3b5483) only in docs, deployment tooling and the validator; migrations added since 1a106bc are exactly 0003 and 0004; package differences 1a106bc to the candidate; (historical) a283c24..856d012 is docs-only |
| 01 stage | exact SHA, lineage re-checked inside the build clone, clean tree, `npm ci`, build, `scan:client` CLEAN, dist SHA-256 manifest |
| 03 | dump path, size, SHA-256, `pg_restore --list` entries, restore result, per-table row count and content checksum |
| 04 | two migrations applied as the non-superuser `bidazoo_app`; 12 identity tables, 19 foreign keys, indexes, 8 triggers and 6 guard functions exist (counts are parsed from the migration files); every pre-E table identical in rows and content; new tables empty |
| 01 rollback + 05 | independent 1a106bc tree starts, `/health` `/ready` 200, 39-check playthrough on today's schema AND on the migrated schema; served through a Caddy with the same rules |
| 06 | identity off by default; mail settings alone do not enable it; `IDENTITY_SECRET` without SMTP refuses to start in production; Layer B throttling separates two clients and ignores forged headers |
| 09 | **M6 gate (rehearsal):** with the candidate build behind a Caddy derived from the live Caddyfile: HTML shell `no-cache`; hashed `/assets/*` JS/CSS and the character PNGs `max-age>=31536000, immutable`; `nosniff`; frame protection; `Permissions-Policy`; strict client CSP; API keeps its own CSP and `no-store` |
| 07 | rollback kit files built from the live scripts (copies), Caddyfile validated with the beta `caddy.exe` |

## What rehearsal does NOT prove (do not claim it)

- Cloudflare behavior: the edge overwriting `CF-Connecting-IP`, `CF-Visitor`, and Browser Cache TTL / Cache Rules rewriting cache headers (step 09 proves only what the Caddy rules emit; the public run of `tools\m6-headers.mjs` is window step W8.2b), and the tunnel path. That is **Layer A** and the live Layer B, run in the maintenance window. See `MAINTENANCE-WINDOW-CHECKLIST.md`.
- The state of live data at cutover. The rehearsal backup is a drill; the authoritative anchor is the Final backup inside the window.
- Real SMTP, SPF, DKIM, DMARC. See `IDENTITY-ENABLEMENT-CHECKLIST.md`.

## Files

| File | Purpose |
| --- | --- |
| `lib.ps1` | shared helpers and the safety guards |
| `00` to `08`, `window-guard.ps1`, `live-verify-migration.ps1` | scripts described above and in the checklists |
| `run.bat`, `run-admin.bat` | wrappers; `run.bat` is deliberately NOT elevated, `run-admin.bat` elevates itself and passes arguments through |
| `tools\observe.mjs` | Layer A harness: derived values only, one route, exits by itself |
| `tools\layerA-check.mjs`, `tools\layerB-live.mjs` | window-only checks against the public URL |
| `tools\layerB.mjs`, `tools\http-probe.mjs`, `tools\depdiff.mjs` | rehearsal helpers |
| `tools\m6-headers.mjs`, `09-m6-release-headers.ps1` | M6 release gate: cache and security headers, local (rehearsal) and public (window) |
| `MAINTENANCE-WINDOW-CHECKLIST.md`, `ROLLBACK-CHECKLIST.md`, `IDENTITY-ENABLEMENT-CHECKLIST.md` | the procedures; none has been executed |
