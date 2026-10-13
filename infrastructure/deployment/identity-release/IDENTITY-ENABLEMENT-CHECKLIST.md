# Identity enablement checklist (separate cutover; NOT executed; BLOCKED on SMTP and DNS)

Only after the application release (MAINTENANCE-WINDOW-CHECKLIST) is complete, the beta has run healthy guest-only, and
the owner approves. Identity is enabled solely by setting `IDENTITY_SECRET` and restarting the BidaZoo API.
(Rehearsal step 06 proves that mail settings alone do not enable it, and that `IDENTITY_SECRET` without valid
production mail refuses to start.)

Never paste SMTP credentials or `IDENTITY_SECRET` into chat, tickets, or logs.

## E1. Sending domain and DNS (operator; nothing here is done)

Use the EXISTING `bidazoo.com` Cloudflare zone. Do not create a zone for `notify.bidazoo.com`.

- [ ] Transactional SMTP provider selected (any provider with authenticated SMTP; record the choice).
- [ ] `notify.bidazoo.com` verified at the provider.
- [ ] Add ONLY the exact records the provider requires for that sender: SPF-related, DKIM selector records, and a DMARC record (start with a monitoring policy such as `p=none` plus an aggregate report address you control; decide and record the policy).
- [ ] Records added as DNS-only (not proxied) where the provider requires it.
- [ ] Provider dashboard shows the domain verified and DKIM/SPF passing.
- [ ] Unchanged and confirmed unchanged: zone SSL mode, HSTS, the `play.bidazoo.com` tunnel route, every unrelated record, every other site and tunnel.

## E2. Production settings in `C:\BidaZoo-beta\config\api.env` (credentials live ONLY here)

Add these lines (values from the provider; edit the file without printing it). Do NOT add `IDENTITY_SECRET` yet.

| Variable | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://play.bidazoo.com` |
| `MAIL_TRANSPORT` | `smtp` |
| `MAIL_FROM` | `no-reply@notify.bidazoo.com` |
| `MAIL_FROM_NAME` | `BidaZoo` |
| `MAIL_SMTP_HOST` / `MAIL_SMTP_PORT` | provider values; 587 with `starttls` or 465 with `tls` |
| `MAIL_SMTP_SECURITY` | `starttls` or `tls` (never `none`) |
| `MAIL_SMTP_USER` / `MAIL_SMTP_PASSWORD` | provider values (both or neither; both required in production) |
| `MAIL_SMTP_TIMEOUT_SECONDS` | optional, default 10 |
| `LEGACY_MATCH_PEPPER` | **leave unset** (legacy Hop Quest claiming stays disabled). If the owner decides to enable it: a separate 32+ character random value, never `IDENTITY_SECRET`, and record "legacy enabled" in the release evidence. Do not load a real manifest in the initial smoke test. |
| existing keys | `TRUST_PROXY=loopback`, `COOKIE_SECURE=true`, `HSTS_MAX_AGE_SECONDS=0`, and no `ALLOWED_ORIGINS` stay exactly as they are |

With `IDENTITY_SECRET` still unset these mail settings are inert: restarting the API at this point changes nothing for users.

## E3. Prove real mail BEFORE enabling identity

`identity:mail-test` needs `IDENTITY_SECRET` in its own process only; it never touches the database, makes no token and no
link. Use a throwaway process-only value so the real secret is not created yet and credentials stay in `api.env`:

```powershell
$env:IDENTITY_SECRET = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
cd C:\BidaZoo-beta\app\apps\api
node --env-file=C:\BidaZoo-beta\config\api.env --import tsx src\cli\mail-test.ts --to <a mailbox you control>
Remove-Item Env:IDENTITY_SECRET
```

(`--env-file` never overrides a variable already set in the process, so the throwaway value wins and the file stays unchanged.)

- [ ] Output `sent: yes (transport smtp)`.
- [ ] The message arrives. In the delivered message's headers: SPF **pass**, DKIM **pass**, DMARC **pass**; From is `BidaZoo <no-reply@notify.bidazoo.com>`.
- [ ] Do not point the test at anyone else's address.

If it fails, the category (`connection`, `auth`, `tls`, `rejected`, `temporary`, `timeout`) is the only detail printed; use IDENTITY-OPERATIONS section 8. Do not weaken TLS or switch to `none`.

## E4. Create the real `IDENTITY_SECRET` and enable (restart only the BidaZoo API)

1. Take a database backup first (a rehearsal-style `03-backup-verify.ps1 -Mode Rehearsal` is not enough as an anchor; take a Final-style one at a quiet moment, or confirm the last nightly dump is recent and restore-tested).
2. Generate and append without printing; then record the value in your password manager (losing it, or changing it, invalidates every stored PIN):
   ```powershell
   $b = New-Object byte[] 32
   (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
   Add-Content -Path C:\BidaZoo-beta\config\api.env -Value ('IDENTITY_SECRET=' + (($b | ForEach-Object { $_.ToString('x2') }) -join '')) -Encoding ASCII
   ```
3. **[ADMIN]** `Stop-ScheduledTask 'BidaZoo API'`, `Start-ScheduledTask 'BidaZoo API'`. A bad mail configuration makes the process exit at startup with a message naming the variable (never its value).
4. Verify: `/health` and `/ready` 200; `POST http://127.0.0.1:3101/api/v1/guardian/email-links` with a valid same-origin request and a syntactically valid address returns 202 (do NOT use this on a real person's address; use your own mailbox in E5).
5. Check `C:\BidaZoo-beta\logs\api.log`: no token, link, address, cookie or secret anywhere; no `mail send failed` lines.

## E5. Smoke tests on the real origin (use only your own mailbox; PINs are throwaway)

1. **Guardian email (real, end to end):** request a sign-in link for your own address; it arrives; it points only at `https://play.bidazoo.com`; opening it signs in. Repeat the same link: it must not work a second time. Check the log line for mail failures stays empty.
2. **Family / profile:** create a child profile, switch profiles, set a PIN, enter a wrong PIN (refused), remove the PIN. Learning data untouched.
3. **Guest claim:** on a test browser, play a guest run first (note the XP/coins); sign in as guardian on the same browser; keep the guest as a profile; confirm the history is intact and the `player_id` is the same; claim again returns a generic 409; the old guest cookie no longer works.
4. **Trusted-device revoke:** sign in on two browsers; from one, revoke the other (it gets 401 at once); "Revoke all"; revoke the current device (that browser is signed out immediately and the cookie cleared).
5. **Per-IP identity throttle on the real path (no extra mail):** `login_ip` defaults to 20 per hour per client. Do not exhaust it with real sends. Instead rely on rehearsal Layer B (step 06, `IDENTITY_RATE_LOGIN_IP_MAX=3` with file mail, same Caddy rules) plus the live guest-limit Layer B from the window. If the owner wants a live identity-throttle proof, use a temporary low `IDENTITY_RATE_LOGIN_IP_MAX` with SMTP addresses you own, then remove it.

## E6. Record and close

- [ ] Evidence: E3 header results, E5 results, log check, time of enablement, `LEGACY_MATCH_PEPPER` state (unset or enabled), the commit still a283c24.
- [ ] Monitor the safe log line for mail failures (IDENTITY-OPERATIONS section 7): parents see "check your email" even when delivery fails.
- [ ] Rollback if needed: ROLLBACK-CHECKLIST level 1 (comment out `IDENTITY_SECRET`, restart only the API).
