# Rollback checklist (NOT executed)

Principles: rollback never depends on rebuilding `1a106bc` during an incident, and it never drops the additive identity
tables merely to roll back code. The old application ignores tables it does not know (proved in rehearsal step 05,
which runs the 1a106bc code against the migrated schema).

Do NOT touch during any rollback: system Caddy, Cloudflared service, `jonabalos.com`, `djwikka.com`, HopQuest, other
tunnels, DNS, zone SSL/HSTS. The dedicated `BidaZoo Tunnel` and `BidaZoo Postgres` tasks stay running.

## Which level for which symptom

| Symptom | Level |
| --- | --- |
| Identity enabled and misbehaving (mail, sign-in, PIN, claim, revoke), guest play fine | 1. Fast identity disable |
| New build will not start, serves errors, `npm ci`/build failed in the window, Layer A/B failed, or the M6 header gate (W8) failed and the owner decides not to keep the release | 2. Application rollback |
| Data damage or a failed migration that cannot be moved forward | 3. Database restore (last resort, owner approval) |

## Level 1: fast identity disable (restart only the BidaZoo API)

Uses the documented mechanism: with `IDENTITY_SECRET` unset, identity routes do not exist and the app is guest-only
(IDENTITY-OPERATIONS section 9). Families, profiles and learning data stay in the database but are unreachable while
identity is off; a child whose guest was claimed plays as a NEW guest on that browser until identity is re-enabled.
Keep the same `IDENTITY_SECRET` value for re-enabling, or stored PINs become unverifiable.

1. **[ADMIN]** `Stop-ScheduledTask -TaskName 'BidaZoo API'`; confirm 3101 is free (`window-guard.ps1`-style check).
2. Edit `C:\BidaZoo-beta\config\api.env`: comment out the line `IDENTITY_SECRET=...` by putting `#` at its start. Do not delete it and do not print it. (The `MAIL_*` lines may stay: they are ignored without `IDENTITY_SECRET`.)
3. `Start-ScheduledTask -TaskName 'BidaZoo API'`.
4. Verify: `/health` and `/ready` 200; `POST /api/v1/guardian/email-links` returns 404; a phone plays a guest run.
5. Record the time. Existing guest players are unaffected.

Rollback of this rollback: remove the `#`, restart the API only.

## Level 2: application rollback to the proven 1a106bc tree

The known-working pre-E application lives in its own folder with its own dependencies and build:
`C:\BidaZoo-release\trees\rollback` (exact `1a106bc328ed0d544d4c49b61f3a1c2071ae65b7`, proven in rehearsal 05).
Do not move or rename that folder (npm workspace links can be absolute). The kit points the beta at it instead.

1. **[ADMIN]** `Stop-ScheduledTask -TaskName 'BidaZoo Caddy'` then `'BidaZoo API'`; `window-guard.ps1 -Expect Stopped` PASS. (Do not edit a `.cmd` file that a loop is still running.)
2. Keep what you are replacing:
   ```powershell
   $keep = "C:\BidaZoo-release\rollback-kit\replaced-$(Get-Date -Format yyyyMMdd-HHmmss)"
   New-Item -ItemType Directory $keep | Out-Null
   Copy-Item C:\BidaZoo-beta\bin\run-api.cmd, C:\BidaZoo-beta\config\Caddyfile.beta $keep
   ```
3. Install the kit versions (they differ from the live files only in the app / dist path):
   ```powershell
   Copy-Item C:\BidaZoo-release\rollback-kit\run-api.rollback.cmd C:\BidaZoo-beta\bin\run-api.cmd -Force
   Copy-Item C:\BidaZoo-release\rollback-kit\Caddyfile.beta.rollback C:\BidaZoo-beta\config\Caddyfile.beta -Force
   & C:\BidaZoo-beta\bin\caddy.exe validate --config C:\BidaZoo-beta\config\Caddyfile.beta --adapter caddyfile
   ```
4. `Start-ScheduledTask -TaskName 'BidaZoo API'`; then `Start-ScheduledTask -TaskName 'BidaZoo Caddy'`.
5. Verify: `window-guard.ps1 -Expect Running`; `/health` and `/ready` 200 on 127.0.0.1:3101; identity route 404; phone plays a full guest run; public CSP headers as in deployment record step 11.4.
6. The old code reads the same `api.env`. Unknown keys (`IDENTITY_*`, `MAIL_*`) are ignored by 1a106bc. Confirm the first 100 lines of `C:\BidaZoo-beta\logs\api.log` show a clean start.
7. Leave the additive identity tables in place. Do not run any down-migration.

Return to the new build later: copy back the two files saved in `$keep` (or the `*.current-copy` files in the kit), restart API then Caddy, and re-run W6 to W8 of the window checklist.

## Level 3: database restore (LAST RESORT; needs explicit owner approval)

Anchor: the Final pre-cutover dump `C:\BidaZoo-beta\backups-release\prerelease-identity-<timestamp>.dump`, its SHA-256, and the off-PC copy.
Restoring loses every write made after that dump (guest play). Prefer fixing forward.

1. Stop the beta API and Caddy ([ADMIN], as in level 2 step 1).
2. Verify the dump hash: `Get-FileHash <dump> -Algorithm SHA256` equals the recorded value (use the off-PC copy if the local one is damaged).
3. Restore into a NEW database next to the current one, never over it:
   ```powershell
   $env:PGPASSWORD = (Get-Content C:\BidaZoo-beta\config\pg-super.pw -Raw).Trim()
   $pg = 'C:\BidaZoo-beta\pg\pgsql\bin'
   & "$pg\psql.exe" -h 127.0.0.1 -p 54340 -U postgres -c "create database bidazoo_restored owner bidazoo_app"
   & "$pg\pg_restore.exe" -h 127.0.0.1 -p 54340 -U postgres -d bidazoo_restored --no-owner --no-privileges --role=bidazoo_app --exit-on-error <dump>
   Remove-Item Env:PGPASSWORD
   ```
4. Compare the restored database with the final-verify baseline (row counts and content) before switching anything.
5. Swap names (superuser, no connections open): rename `bidazoo` to `bidazoo_replaced_<timestamp>` and `bidazoo_restored` to `bidazoo`. Keep the replaced database; never drop it in the same session.
6. Run level 2 (old application) unless the new application is being kept with the restored pre-migration database: then run `npm run db:migrate` again from the validated tree.
7. Verify as in level 2 step 5.

## After any rollback

- Record: time, level used, trigger, what was verified, current live commit and state.
- The live beta stays on the rolled-back state until the owner approves another attempt.
- Do not delete: Final dump, off-PC copy, rollback tree, kit, evidence.
