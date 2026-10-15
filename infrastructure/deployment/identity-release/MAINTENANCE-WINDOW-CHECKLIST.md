# Maintenance window: application release of a283c24 with identity DISABLED

**NOT EXECUTED. Requires explicit approval from the project owner for this window.** Identity stays off for the whole
window. Application release and identity enablement are separate cutovers.

All commands: `C:\Users\jonat\Documents\BidaZoo-Identity-Release\infrastructure\deployment\identity-release` is `$REL`.
Elevated PowerShell only where marked **[ADMIN]**. Record every result. Stop at the first FAIL.

## Preconditions (all must be true)

- [ ] Phase 0 evidence is PASS: 00, 01 (stage and rollback), 03 Rehearsal, 04, 05, 06, 07. Evidence files are saved off the PC.
- [ ] Rollback kit exists: `C:\BidaZoo-release\rollback-kit\{run-api.rollback.cmd, Caddyfile.beta.rollback}` and the `.current-copy` files.
- [ ] Off-PC backup destination chosen and writable: `<OFFPC>`
- [ ] Layer A tools present (`tools\observe.mjs`, `tools\layerA-check.mjs`); the Studio PC's public IP is known: `<STUDIO-IP>`; a phone on mobile data is at hand.
- [ ] Invited families told the beta will be down for the window. Window length expected: 30 to 45 minutes.
- [ ] Do NOT touch: system Caddy service, Cloudflared service, `jonabalos.com`, `djwikka.com`, HopQuest, other tunnels, DNS, zone SSL/HSTS.

## W0. Baseline (read-only) **[ADMIN]**

1. `run-admin.bat window-guard.ps1 -Expect Running` must PASS (3101 and 8480 listening on loopback only).
2. Record: `git -C C:\BidaZoo-beta\app rev-parse HEAD` must be `1a106bc328ed0d544d4c49b61f3a1c2071ae65b7`.
3. Record `curl.exe -s http://127.0.0.1:3101/health` and `/ready` (both 200) and the public site loads.
4. Record `Get-FileHash` (SHA-256) of `C:\BidaZoo-beta\bin\run-api.cmd`, `C:\BidaZoo-beta\config\Caddyfile.beta`, `C:\BidaZoo-beta\app\apps\api\dist\server.js`.
5. Copy `api.env` into the already-protected folder: `Copy-Item C:\BidaZoo-beta\config\api.env C:\BidaZoo-beta\config\rollback\api.env.pre-identity-release` (never print it).

## W1. Stop ONLY the dedicated BidaZoo Caddy, then the dedicated API **[ADMIN]**

```powershell
Stop-ScheduledTask -TaskName 'BidaZoo Caddy'
Stop-ScheduledTask -TaskName 'BidaZoo API'
```

`run-admin.bat window-guard.ps1 -Expect Stopped` must PASS: 8480 and 3101 free, no beta process, and no `run-api.cmd`/`run-caddy.cmd`
restart loop left behind. If something remains, read its command line first; stop only a PID whose command line contains
`C:\BidaZoo-beta`. Leave running: `BidaZoo Postgres`, `BidaZoo Tunnel`, `BidaZoo Backup`, system Caddy, Cloudflared service.
(The public site shows a Cloudflare error while the origin is down. Expected.)

## W2. FINAL pre-cutover backup (the authoritative rollback anchor) **[ADMIN]**

```bat
run-admin.bat 03-backup-verify.ps1 -Mode Final -OffPcDestination <OFFPC>
```

The script refuses unless 3101/8480 are down and no beta process exists. It then: takes `pg_dump -Fc` into
`C:\BidaZoo-beta\backups-release\prerelease-identity-<timestamp>.dump` (outside the nightly retention), runs
`pg_restore --list`, restores into scratch database `final_verify_...`, requires **identical row counts and content checksums for every table**
(and no writes between fingerprint and dump), writes the SHA-256, copies the dump **off the PC**, and re-hashes the copy.

- [ ] `MIGRATION GATE: OPEN` printed. If it says CLOSED, nothing else proceeds.
- [ ] Record: dump path, size, SHA-256, off-PC path, off-PC SHA-256, verify database name `<FINALDB>` (kept for W4).
- Never delete this backup, now or after the release.

## W3. Update the live checkout to the exact validated SHA (normal user)

Caddy is stopped, so `apps\play\dist` can be rebuilt safely.

```powershell
cd C:\BidaZoo-beta\app
git fetch origin
git checkout --detach a283c2470fe5abcb47f49d3f5753dea1bd881e78
git rev-parse HEAD            # must print exactly a283c2470fe5abcb47f49d3f5753dea1bd881e78
git status --short            # must print nothing
npm ci
npm run build
npm run scan:client           # must report CLEAN
```

- [ ] If any command fails: **go to ROLLBACK-CHECKLIST level 2** (the independent tree). Do not improvise repairs on the live tree.
- [ ] Compare `apps\api\dist\server.js` hash with the staged build's manifest (`C:\BidaZoo-release\evidence\dist-manifest-stage.txt`). Equal is ideal; a difference is information, not automatically a failure. Record it.

## W4. Migrate the live database, then verify

```powershell
cd C:\BidaZoo-beta\app
$env:DATABASE_URL = (Select-String -Path C:\BidaZoo-beta\config\api.env -Pattern '^DATABASE_URL=').Line.Substring(13)
npm run db:migrate
Remove-Item Env:DATABASE_URL
```

```bat
run.bat live-verify-migration.ps1 -BaselineDb <FINALDB>
```

- [ ] `live-verify-migration` PASS: live checkout is a283c24; 12 tables, 19 foreign keys, indexes, triggers, guard functions present; every pre-E table identical to the pre-migration backup; exactly two migrations applied; identity tables empty.
- [ ] Do not delete `<FINALDB>` yet.
- If the migration fails midway: stop. The migration is additive and runs per drizzle's own tracking; report the exact output and decide with the owner. Do not drop tables by hand.

## W5. Layer A: the public proxy-identity chain (API still stopped) **[start Caddy as ADMIN]**

Purpose: prove Cloudflare -> tunnel -> dedicated Caddy -> Fastify identity, with nothing else behind Caddy.

1. `Start-ScheduledTask -TaskName 'BidaZoo Caddy'`; `curl.exe -s -I -H "Host: play.bidazoo.com" -H 'CF-Visitor: {\"scheme\":\"https\"}' http://127.0.0.1:8480/` shows the client CSP (static site works; `/api/*` returns 502 because the API is down).
2. Start the harness (normal user, new window). It answers **only** `GET /api/observe`, returns derived values only, and exits by itself:
   ```powershell
   $env:OBSERVE_FASTIFY_FROM = 'C:\BidaZoo-beta\app\apps\api\package.json'
   $env:OBSERVE_MAX_SECONDS  = '300'
   node C:\Users\jonat\Documents\BidaZoo-Identity-Release\infrastructure\deployment\identity-release\tools\observe.mjs
   ```
3. **Check A (honest phone):** phone on mobile data opens `https://play.bidazoo.com/api/observe`. Required: `ip` equals the phone's public IP; `protocol` `https`; `hostnameIsExpected` true; `socketRemote` `127.0.0.1`; `xffEntryCount` 1 and `xffSingleEntryEqualsIp` true.
4. **Checks B and C (forged headers, plain HTTP) from the Studio PC:**
   ```powershell
   node ...\tools\layerA-check.mjs --expect-ip <STUDIO-IP>
   ```
   Required: all PASS (forged `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `CF-Connecting-IP`, `X-Real-IP` change nothing; plain HTTP redirects and never returns JSON).
5. Stop the harness (Ctrl+C or wait for the time limit) and confirm 3101 is free. The diagnostic endpoint must not outlive this step.
6. Fail handling: **do not start the API, do not loosen `TRUST_PROXY`, do not change Cloudflare or Caddy.** Report the exact failing line. Roll back (ROLLBACK-CHECKLIST) unless a real defect is proven and the owner approves a specific fix.

Layer A proves the forwarding chain only. It does not prove the application. That is Layer B.

## W6. Start the API with identity still disabled

1. Confirm identity is not configured, without printing the file: `(Select-String -Path C:\BidaZoo-beta\config\api.env -Pattern '^(IDENTITY_SECRET|LEGACY_MATCH_PEPPER)=').Count` must be `0`.
2. **[ADMIN]** `Start-ScheduledTask -TaskName 'BidaZoo API'`.
3. `curl.exe -s http://127.0.0.1:3101/health` and `/ready` both 200.
4. Identity absent: `curl.exe -s -i -X POST http://127.0.0.1:3101/api/v1/guardian/email-links -H "Origin: http://127.0.0.1:3101" -H "Content-Type: application/json" -d "{}"` returns 404 (not 400, not 202).
5. `run-admin.bat window-guard.ps1 -Expect Running` PASS.

## W7. Layer B live: the real application through the real path (no config change)

```powershell
node ...\tools\layerB-live.mjs
```

- [ ] PASS: this machine is throttled (429) after at most 30 guest creations despite a different forged `X-Forwarded-For`/`X-Real-IP` on every request. At most about 30 throwaway guest rows are created.
- [ ] By hand: a phone on mobile data opens the site and starts a guest right after. If the phone is throttled too, the proxy chain collapses visitors onto one address: STOP and roll back.
- [ ] Identity per-IP throttles (`login_ip`, `consume_ip`, ...) key on the same `request.ip` as these guest limits. They are tested directly in rehearsal (Layer B, step 06) and again live after identity is enabled (see IDENTITY-ENABLEMENT-CHECKLIST, step E6) without sending real mail.

## W8. Start Caddy (if not already running) and verify the public site

1. `window-guard.ps1 -Expect Running` PASS.
2. Headers (from the deployment record step 11.4): `curl.exe -s -D - -o NUL http://127.0.0.1:3101/api/v1/me` and `https://play.bidazoo.com/api/v1/me` show the same API headers (CSP `default-src 'none'`, `Cache-Control: no-store`, ...); `curl.exe -s -I https://play.bidazoo.com/` shows the client CSP and `Cache-Control: no-cache`.
3. Phone on mobile data: open the site, see the five starters, play a full 10-question run, reload mid-run (same question returns).
4. Existing sites still work: `jonabalos.com`, `hopquest.jonabalos.com`, `djwikka.com` (look only).
5. The next nightly backup (3:10 AM) is untouched. Optionally check `C:\BidaZoo-beta\logs\backup.log` the next morning.

## W9. Close the window

- [ ] Application release complete, identity DISABLED, live beta on a283c24.
- [ ] Keep: the Final dump and its off-PC copy, `<FINALDB>` until the owner signs off (then `08-cleanup-rehearsal.ps1 -DropDb <FINALDB>`), the rollback tree, the rollback kit, all evidence files.
- [ ] Observe the beta for guest-only health before scheduling the identity enablement.

## Report-back template for this window

1. Final backup: path, size, SHA-256, off-PC path and SHA-256, gate result.
2. Live checkout SHA, `npm ci`/build/scan results.
3. Live migration output and `live-verify-migration` result.
4. Layer A results (A, B, C) with the observed values.
5. API health, identity-absent proof, Layer B live result, phone result.
6. Anything unexpected. Live beta state. Rollback readiness.
