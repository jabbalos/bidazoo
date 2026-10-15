# Family identity: operator runbooks (Checkpoint E)

Last updated: October 15, 2026 (status line reconciled; the runbooks are unchanged since October 12, 2026).

**Status: Checkpoint E is COMPLETE and Studio-validated (`a283c24`), on `main` (`856d012`), NOT
deployed and NOT enabled in production.** Nothing in this file has been run against the live beta. The live beta (`play.bidazoo.com`) is on its pre-Checkpoint-E
deployment and identity is **not enabled** there. Everything below is procedure for a future release
and for the future Identity Release Gate. Architecture and behavior are in
[IDENTITY.md](IDENTITY.md); design history is in
[IDENTITY-MIGRATION-ASSESSMENT.md](IDENTITY-MIGRATION-ASSESSMENT.md); the closed-beta deployment
record is [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md).

Rules for every runbook here:

- Examples use **placeholders only**. Never paste a real secret, token, code, email address or
  password into a document, chat, ticket, shell history or log.
- Do not log raw tokens, cookies, PINs, hashes or email-link secrets, and do not dump raw provider
  errors into logs.
- Secrets live outside Git (a protected env file or the host's secret store), never in the repo.
- Cloudflare Access is **not** configured on `play.bidazoo.com`. Guardian sign-in uses the
  fragment-based email link described in [IDENTITY.md](IDENTITY.md). There is no Redis.

## 1. Secret inventory and rotation impact

Rotation is **never silent**. Each row says what rotating breaks and how to recover. "Dual-key" means
the code accepts the old and new value at the same time during a changeover; **none of these secrets
has dual-key support today.**

| Secret | Purpose | May be rotated? | What rotation invalidates | Recovery | Downtime | Dual-key |
| --- | --- | --- | --- | --- | --- | --- |
| `IDENTITY_SECRET` | Root for three HKDF-derived keys: `throttle`, `code`, `pin`. Also gates identity on/off. | Yes, deliberately. | (1) **All stored profile PIN hashes become unverifiable** (the PIN pre-hash is keyed from it). (2) Every unused **device code** and **operator claim code** stops redeeming (their stored hashes are keyed). (3) **Throttle counters reset** (their keys change; an attacker gets a fresh budget once). Not affected: device sessions and email links (plain SHA-256 of a random token), guardians, families, profiles, learning data, legacy claims already made. | PINs: a guardian sets a new PIN or removes it (removal always works). Codes: issue new ones. Throttles: nothing to do. | A restart of the API (a few seconds). Rotate while idle. | **No.** |
| `LEGACY_MATCH_PEPPER` | Keys the HMAC that matches a verified guardian email to a loaded legacy family. | **Only with the care below.** There is no re-key tool. | (1) Unclaimed legacy rows keyed with the old pepper **never match** a verified email under the new pepper: the guardian sees no offer. (2) Re-running the same manifest under the new pepper **fails and rolls back entirely** (`already loaded with a different guardian email`). Not affected: already **claimed** families and their linked profiles (state is stored, not recomputed); operator claim codes (they depend on `IDENTITY_SECRET`, not the pepper value, and only need a pepper to be set). | Prefer **not rotating**. If it leaks, treat it as exposed email hashes: rotate, then recover unclaimed families through operator claim codes (section 5). Re-keying unclaimed rows is **not implemented**. | Restart. | **No.** |
| `MAIL_SMTP_PASSWORD` | Authenticates to the SMTP relay. | **Yes, routine.** | Nothing in BidaZoo's data. Until the API restarts with the new value, sends fail with category `auth` and parents still see the generic 202 ("check your email"). | Update the secret, restart, run `identity:mail-test`. | A restart; **revoke the old one at the provider only after** the new one works. | No (the provider may allow two credentials at once; use that). |
| `MAIL_SMTP_USER` | SMTP account name. Sensitive if the provider uses an API key as the username. | Yes, with the password. | Same as the password. | Same as the password. | A restart. | No. |
| Device cookie tokens and email-link tokens | Random 32-byte tokens; only their plain SHA-256 is stored. | Not a configured secret; there is nothing to rotate. | To invalidate sessions, **revoke devices** (UI "Revoke all") or let them expire. | Guardians sign in again. | None. | n/a |
| Cloudflare and deployment secrets | Tunnel credentials, API tokens, host secrets. | Managed per [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md). | Not part of identity. Referenced here **by name only**; do not copy values into any identity file. | Per the deployment runbook. | Per the deployment runbook. | n/a |

**FUTURE HARDENING (not current behavior):** a versioned `PIN_PEPPER` (a PIN key separate from
`IDENTITY_SECRET`, with a stored key version) would let `IDENTITY_SECRET` rotate without breaking PINs,
and would permit a dual-key changeover. It does not exist. Until it does, rotating `IDENTITY_SECRET`
means every guardian must set or remove PINs again.

**To rotate `IDENTITY_SECRET` safely:** pick a quiet hour; generate a new value
(`openssl rand -base64 32`) into the protected secret store; restart the API; confirm
`/ready` is 200; ask guardians to re-set PINs (or remove them); issue fresh device codes if any were
outstanding. Take a database backup first. Never put the value in a command line argument.

## 2. Environment settings

Names and placeholders only (the commented template is `.env.example`). `.env` is git-ignored.

| Variable | Placeholder / default | Notes |
| --- | --- | --- |
| `IDENTITY_SECRET` | `<32+ random characters>` | Unset = identity off. |
| `LEGACY_MATCH_PEPPER` | `<32+ random characters>` | Needed to load or claim legacy data. Unset = legacy claiming is off (404/400 generic). |
| `PUBLIC_BASE_URL` | `https://play.bidazoo.com` | Origin used in emailed links. |
| `MAIL_TRANSPORT` | `smtp` in production | `console`/`file`/`none` are non-production. |
| `MAIL_OUTBOX_DIR` | `./.mail-outbox` | `file` transport only (development, e2e). |
| `MAIL_FROM` | `no-reply@notify.example.com` | Bare address. The expected real sender is `BidaZoo <no-reply@notify.bidazoo.com>`. |
| `MAIL_FROM_NAME` | `BidaZoo` | Display name. |
| `MAIL_SMTP_HOST` | `<relay host>` | |
| `MAIL_SMTP_PORT` | `587` | 587 with `starttls`, 465 with `tls`. |
| `MAIL_SMTP_SECURITY` | `starttls` | `tls` or `starttls` in production. `none` is a local catcher only and is refused in production and with credentials. |
| `MAIL_SMTP_USER` | `<smtp user>` | Both or neither; required in production. |
| `MAIL_SMTP_PASSWORD` | `<smtp password>` | Both or neither; required in production. |
| `MAIL_SMTP_TIMEOUT_SECONDS` | `10` | Overall per-message deadline, 1 to 60. |
| `IDENTITY_LINK_MINUTES` | `15` | 5 to 60. |
| `IDENTITY_DEVICE_DAYS` | `90` | 1 to 365. |
| `IDENTITY_AUTHORITY_HOURS` | `24` | 1 to 168. |
| `IDENTITY_DEVICE_CODE_MINUTES` | `10` | 2 to 60. |
| `IDENTITY_CLAIM_CODE_DAYS` | `7` | 1 to 30. |
| `IDENTITY_PIN_MAX_FAILURES` | `5` | 3 to 20. |
| `IDENTITY_PIN_LOCK_SECONDS` | `900` | 60 to 86400. |
| `IDENTITY_RATE_<NAME>_MAX`, `..._WINDOW_SECONDS` | see [IDENTITY.md](IDENTITY.md) section 10 | Durable limits. |

The sender must be a **BidaZoo-owned** address. `jonabalos.com` senders (and its subdomains) are
**intentionally rejected** at startup; the Hop Quest / Accounts sending identity is not reused.

## 3. Guest-claim runbook (a guardian keeps a child's guest progress)

Preconditions: the child played as a guest on this browser (the `bidazoo_guest` cookie is still
there); a guardian has signed in **on the same browser** within the authority window.

1. The guardian opens the account page. The page asks the read-only availability endpoint whether
   this browser holds a keepable guest. It changes nothing.
2. The guardian chooses to keep it and gives a nickname. One request creates a child profile that
   references the **same `player_id`**.
3. Result: 201 created. The old guest credential stops working, the browser's cookie is cleared,
   the device's active child is the new profile, and `guest.claimed` is audited.

What does not happen: no copying, no new player, no history reconstruction, no change to mastery,
XP, coins, attempts or ledgers.

Edge cases: repeating the claim for the same family returns 200 and changes nothing; a player that
another family already claimed returns a generic 409; with no live guest cookie the answer is 401 and
the availability check is plainly `false`. If progress was lost (cookie cleared before the claim),
**there is no recovery**: the guest credential is gone. That is a known limitation.

## 4. Legacy Hop Quest migration runbook (offline)

BidaZoo has **no runtime dependency** on Hop Quest. An operator prepares a file by hand and runs a
CLI. Treat the manifest as **sensitive temporary input**: before import it contains plaintext
guardian email addresses.

**Allowed manifest fields** (strict; any other key is rejected): legacy family ID, guardian email
(temporary), legacy kid ID, an optional username label, an optional `gradeBand` label, and the
relationship structure (a family has up to 20 kids). Version 1; up to 5000 families; IDs match
`^[A-Za-z0-9._:-]{1,64}$`.

**Never imported:** passwords, PINs, salts, cookies, tokens, sessions, coins, XP, mastery, badges,
streaks, inventory, answer history, marketing contacts.

Procedure:

1. **Prepare the manifest offline**, on a machine you control, outside the repository. Never commit
   it.
2. **Protect it** as sensitive temporary input: a private folder, readable only by the operator.
3. **Back up the database first** (see [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md)).
4. **Run the loader** (needs `DATABASE_URL` and `LEGACY_MATCH_PEPPER` in the environment):

   ```bash
   npm run legacy:load -w @bidazoo/api -- --file <path-to-manifest> --label <batch label>
   ```

   The plaintext email is turned into the keyed match value and not stored. The whole manifest loads
   in **one transaction**: any problem (a malformed entry, a duplicate, a family already loaded with a
   different email, a kid that belongs to another family) rolls back and writes nothing.
5. **Verify the result.** Stdout is a counts-only JSON summary (batch id, families, kids, inserted
   and unchanged counts); notices go to stderr. Compare the counts to the file. Re-running the same
   manifest is safe: families already present with the same match key are left untouched (a claimed
   one is never modified) and only missing kids are added. Each run records a `legacy.batch_loaded`
   audit event.
6. **Back up the database again**, then **remove the temporary plaintext manifest from active storage
   and from any unintended copies or backups, according to your operator policy.** The tool never
   deletes the file. This runbook does not promise secure deletion: a filesystem may keep remnants
   (snapshots, sync clients, journals, SSD wear leveling) that BidaZoo cannot control.

**What the CLI checks about file permissions.** On Linux and macOS the loader prints a warning when
the manifest file is readable by group or other (POSIX mode bits). **On Windows the loader performs no
check at all: Windows ACL broad-readability detection is not currently implemented.** Do not rely on the
tool for that; set the folder's ACL yourself (for example, only your account) before you put the file
there. The tool also prints the sensitive-input notice and a reminder to delete the file.

## 5. Legacy verified-email claim and operator claim codes

**The normal path.** A guardian signs in with a verified BidaZoo email. If its keyed HMAC matches a
loaded, unclaimed legacy family, the account page offers the claim.

- Only a **verified BidaZoo guardian email** can match, using the keyed HMAC. Nothing is matched by a
  name, username or anything the browser supplies.
- Same-family replay is idempotent (200). A family that someone else claimed, a missing match and
  "legacy claiming is off" all look the same (404).
- **Legacy kids remain placeholders until explicitly linked.** The family claim creates no players.
  Linking a kid creates a **fresh** BidaZoo player and profile with no imported progress.

**The assisted path: an operator claim code** (the family's email changed, or the address on file is
unusable). The guardian must already be signed in; the code is **not a login credential**.

- Issued by the operator only. There is no HTTP route that issues one.
- Properties: random (60 bits), shown **once** and stored only as a keyed hash, expires (default 7
  days, 1 to 30), single use, scoped to one legacy family, redemption rate-limited per client
  address, and it only authorizes that one family's claim by a signed-in guardian.

```bash
# Issue (needs DATABASE_URL and IDENTITY_SECRET). Prints the code once; give it to the guardian
# through a channel you trust. Never paste a real code into a ticket, chat log, or this repo.
npm run legacy:claim-code -w @bidazoo/api -- issue --legacy-family <legacy-family-id> --days 7 --by <operator-name>

# Revoke every unused, unrevoked code for one legacy family
npm run legacy:claim-code -w @bidazoo/api -- revoke --legacy-family <legacy-family-id>
```

Issuing fails if the family is already claimed or unknown. Audit events: `legacy.claim_code_issued`,
`legacy.claim_code_redeemed`, `legacy.claim_code_revoked`. A code stops working if
`IDENTITY_SECRET` is rotated; issue a new one.

## 6. Production mail

**Current implementation:** generic SMTP through `nodemailer` behind the `Mailer` interface. The
provider is not named in code. `FakeMailer` (tests) and `FileMailer`/`ConsoleMailer` (development)
exist for non-production only. **Production requires `MAIL_TRANSPORT=smtp` and refuses `console`,
`file`, `none` and "unset"** at startup.

Delivery behavior: TLS 1.2 or newer, certificates always verified; STARTTLS is never downgraded
(credentials are not sent if the upgrade is unavailable); a hard overall deadline; one attempt; no
retries. The email is one short message ("Your BidaZoo sign-in link") with a single button and no
tracking.

**Expected future sender:** `BidaZoo <no-reply@notify.bidazoo.com>`. **No DNS is configured by this
checkpoint, and SPF, DKIM and DMARC are NOT configured.** Until the checklist below is done and
signed off, production identity must not be enabled.

### Pre-deploy checklist (provider-neutral; none of this has been done)

Tick each item and record the date and who did it.

1. [ ] Provision a transactional SMTP service (any provider that offers authenticated SMTP).
2. [ ] Verify the `notify.bidazoo.com` sending domain or sender with the provider.
3. [ ] Add **SPF** for the sending domain, as the provider instructs.
4. [ ] Add **DKIM** (the provider's selector records).
5. [ ] Add **DMARC** (start with a monitoring policy; tighten later).
6. [ ] Put `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_SECURITY`, `MAIL_SMTP_USER` and
   `MAIL_SMTP_PASSWORD` in the protected secret store, outside Git.
7. [ ] Set `MAIL_FROM` (bare address) and `MAIL_FROM_NAME`.
8. [ ] Set `PUBLIC_BASE_URL` to the final public HTTPS origin and confirm it opens.
9. [ ] Run `identity:mail-test` to a mailbox you control (below). Inspect the delivered message.
10. [ ] In the delivered message's headers, confirm SPF, DKIM and DMARC all **pass**.
11. [ ] Request a real guardian sign-in link. Confirm it points **only** at the configured HTTPS
    public origin and that it signs you in.
12. [ ] Confirm no secret, token, link, or address appears in the API logs.

```bash
# Sends one harmless message. No database, no token, no link. Prints the transport and a result only.
npm run identity:mail-test -w @bidazoo/api -- --to <your-controlled-address>
```

Do not point `identity:mail-test` at other people's addresses. Do not configure DNS from this
repository.

## 7. Mail failure behavior (intentional)

`POST /api/v1/guardian/email-links` returns the **same generic `202 {accepted:true}` even when
downstream delivery fails.** This is intentional current behavior, not a bug. It prevents account
enumeration (a "known address" cannot be told from an unknown one) and delivery enumeration (an
address cannot be probed for deliverability), and it keeps the external response consistent.

The operational consequence: **during a mail outage a parent still sees "check your email", and
nothing arrives.** The API will not tell them otherwise. Operators must therefore **monitor the safe
mail-failure log line**, not rely on user reports:

```text
warn {"mail":{"operation":"guardian_login_link","transport":"smtp","category":"<category>","statusClass":"<4xx|5xx, optional>"}} "mail send failed"
```

Only the category (and, for SMTP replies, the status class) is logged. The raw provider message,
host, address, recipient, token and link are never logged. Mail is sent after the response through a
bounded dispatcher (one attempt; at most 50 in flight; further sends are dropped and logged as
`overloaded`).

## 8. Mail incident runbook

For every row the **user-facing result is the same generic 202** ("check your email"); only the
operator-visible category differs. **Never** add raw provider errors, SMTP transcripts, credentials,
recipient addresses, tokens or links to logs while debugging.

| Condition | Category | Check | Rerun `identity:mail-test` when |
| --- | --- | --- | --- |
| SMTP host unreachable (DNS, network, port blocked, provider down) | `connection` | Provider status page; DNS for `MAIL_SMTP_HOST`; outbound firewall for the port; `MAIL_SMTP_PORT`. | The path is restored. |
| Authentication failed | `auth` | The username and password in the secret store; whether the provider revoked or rotated the credential; whether the account is suspended. | After updating the secret and restarting. |
| TLS failure (handshake, certificate, STARTTLS unavailable) | `tls` | `MAIL_SMTP_SECURITY` matches the port (587 `starttls`, 465 `tls`); the provider's certificate chain; the server clock. Do **not** switch to `none` or disable verification. | After correcting the setting. |
| Provider rejected the message (permanent 5xx: sender or domain not verified, recipient refused) | `rejected` | `MAIL_FROM` is on the verified domain; SPF/DKIM/DMARC; the provider's suppression list. | After the sender or domain is fixed. |
| Temporary provider error (4xx, greylisting, quota) | `temporary` | Provider quotas and status; whether failures persist. | When the provider recovers. |
| Timeout (no answer inside `MAIL_SMTP_TIMEOUT_SECONDS`) | `timeout` | Provider latency and network path; consider a slightly higher timeout (max 60). | After a change. |
| Too many sends at once (dispatcher full) | `overloaded` | A burst of sign-in requests. The `login_*` limits should already cap it; look for abuse. | Not needed unless other categories appear too. |
| Anything else | `unknown` | The API log around the time; the provider's dashboard. | After a fix. |
| **Invalid production configuration** | none (the process **fails to start**) | The startup error names the setting: `PUBLIC_BASE_URL` (not https, a path, localhost or an IP), `MAIL_TRANSPORT`, `MAIL_FROM` (a `jonabalos.com` sender), `MAIL_SMTP_USER`/`PASSWORD` missing, `MAIL_SMTP_SECURITY=none`. | After the API starts cleanly. |

If sign-in mail is down for long, the options are to fix the provider, or to **disable identity
temporarily** (section 9) so the app is guest-only again. Do not switch production to a console or
file sender.

## 9. Recovery scenarios

| Scenario | What to do |
| --- | --- |
| Guardian loses a trusted device | They sign in on another browser by email link, open the device list and revoke the lost one (or "Revoke all"). Revoked devices get 401 immediately. |
| Guardian revokes the **current** device | That browser is signed out at once and its cookie cleared; the UI says so. Sign in again by email link. |
| Child forgets their PIN | A guardian signs in and removes or resets the PIN. Removal also clears a lock. The child's learning data is untouched. |
| A profile is PIN-locked | The lock lasts `IDENTITY_PIN_LOCK_SECONDS` (default 15 minutes). A correct PIN is refused while locked. A guardian removing the PIN releases it immediately. |
| Guardian's email changed from the legacy data | The verified email will not match. Issue an **operator claim code** (section 5) for that legacy family. |
| Operator claim code expired | Issue a new one (revoke the old one first if unsure). |
| Guest progress already claimed | The second claim returns a generic 409. Nothing is duplicated. If it was claimed by the wrong family, there is no self-service undo; handle it as an operator data task with a database backup. |
| SMTP outage | Section 8. Parents see "check your email" with no mail. Monitor the log line. Existing signed-in devices keep working; only new sign-ins and authority refreshes are blocked. |
| Identity must be disabled temporarily | Unset `IDENTITY_SECRET` and restart. Identity routes return 404 and the app is guest-only. Families, profiles and learning data **stay in the database**, but they are not reachable while identity is off: a child whose guest progress was claimed has no guest credential any more (it is revoked at claim time), so that browser plays as a **new** guest until identity is re-enabled and the child is selected again. Re-enabling restores access. Re-use the **same** `IDENTITY_SECRET`, or PINs become unverifiable (section 1). Prefer this only for short, planned windows. |
| `IDENTITY_SECRET` rotation | Section 1. PINs must be set again; codes must be reissued; sessions survive. |
| `LEGACY_MATCH_PEPPER` rotation | Section 1. Unclaimed legacy families stop matching; claimed families are unaffected; recover with claim codes. Prefer not to rotate. |

## 10. Future identity-release checklist (NOT executed)

This is the gate for a future deployment. It is **not** authorization to deploy. Checkpoint E must be
closed (done: Studio-validated, October 12, 2026) and the project owner must explicitly approve a release.

1. [ ] Back up the production database and verify the backup restores.
2. [ ] Apply migrations `0003` and `0004` in a rehearsal copy first, then to production.
3. [ ] Create production `IDENTITY_SECRET` (and `LEGACY_MATCH_PEPPER` if legacy claiming is wanted)
   in the protected secret store.
4. [ ] SMTP provider and DNS ready (section 6 checklist complete, SPF/DKIM/DMARC passing).
5. [ ] Real-mail smoke test with `identity:mail-test`.
6. [ ] Deploy the application build (per the closed-beta deployment record).
7. [ ] Guardian sign-in smoke test (email link on the real origin).
8. [ ] Child profile smoke test (create, switch, PIN set, wrong PIN, remove PIN).
9. [ ] Guest-claim smoke test (guest cookie, then claim, then confirm history intact).
10. [ ] Device-revoke smoke test (revoke one, revoke all, revoke current).
11. [ ] Rollback verification: confirm that unsetting `IDENTITY_SECRET` returns the app to guest-only
    and that the pre-release backup is still the recovery point.

## 11. Validation record

The official Checkpoint E Studio validation (October 12, 2026, commit `a283c24`) is recorded in
[STUDIO-VALIDATION.md](STUDIO-VALIDATION.md). It used the fake and file mail senders only: no real
mail, DNS or production secret was involved, so steps 3 to 5 of the section 10 gate remain untested.
