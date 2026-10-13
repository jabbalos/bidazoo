# Family identity (Checkpoint E)

Last updated: October 12, 2026.

**Status: Checkpoint E is COMPLETE. IMPLEMENTED, STUDIO-VALIDATED (exact commit
`a283c2470fe5abcb47f49d3f5753dea1bd881e78`), NOT DEPLOYED. Branch `checkpoint-e-identity`.** See [PROJECT-STATE.md](PROJECT-STATE.md) for the status
table and the difference between those three words. Operator procedures live in
[IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md). The design record and the options that were
weighed are in [IDENTITY-MIGRATION-ASSESSMENT.md](IDENTITY-MIGRATION-ASSESSMENT.md). If this file and
the code disagree, the code wins and this file is wrong: fix it.

This document describes what the code does today. Anything not implemented is labeled FUTURE.

## 1. The model in one picture

```text
Family
  |-- Guardians            (a verified email address; no password)
  |-- Child profiles       (a nickname; no child email)
  |       `-- maps to exactly one existing or new player_id
  `-- Trusted device sessions   (a cookie on one browser; optional active child)
```

- A **family** is the unit that owns profiles and devices.
- A **guardian** proves control of an email address by following a single-use emailed link. There is
  no password and no social login.
- A **child profile** belongs to one family and points at one `player_id` (unique: one player can
  have at most one profile, in at most one family).
- A **trusted device session** is a cookie on one browser. A device may carry guardian authority
  (temporarily) or may be a plain child device.

**Learning state stays keyed to the player.** Attempts, mastery, XP, coins, timing and sessions are
all keyed by `player_id`, exactly as in Checkpoint B to D. Attaching a player to a family never
copies, rewrites, recomputes or re-grades any learning record. The identity layer decides which
player a request is for; it never decides what the player learned. `packages/learning-core`,
grading, mastery, XP, coins, `served_at` timing and attempt idempotency are unchanged by Checkpoint E.

## 2. Switch: identity off, identity on

Identity is **off unless `IDENTITY_SECRET` is set** (at least 32 characters). With it unset, no
identity route is registered (each returns the normal 404) and the server behaves as the guest-only
build of Checkpoint D. The client probes `GET /api/v1/device` once; a 404 means "identity is off" and
the account page degrades accordingly. The 404 is intentional, and the e2e console guard allows only
that one probe line.

| Setting | Identity disabled | Development / test identity | Production identity |
| --- | --- | --- | --- |
| `IDENTITY_SECRET` | unset | set | set (required) |
| Identity routes | none (404) | registered | registered |
| Allowed `MAIL_TRANSPORT` | not used | `console`, `file`, `smtp` (`none` sends nothing) | **`smtp` only** |
| Test, file and console senders | n/a | allowed | **refused at startup** |
| `PUBLIC_BASE_URL` must be HTTPS | n/a | no (`http://localhost:5173` is fine) | **yes**, public hostname, no credentials, no path, no trailing slash, no localhost, no IP, no single-label host |
| Real email delivery required | n/a | no | **yes** (`MAIL_SMTP_USER` and `MAIL_SMTP_PASSWORD` required; `MAIL_SMTP_SECURITY=none` refused) |
| Guest mode | the only mode | still works; a guest can be claimed | still works; a guest can be claimed |
| Cookie names | `bidazoo_guest` (`__Host-` prefix when secure) | same, plus `bidazoo_device` | same, `Secure` on |

Production configuration is validated at startup in `loadConfig`, so a bad configuration fails the
process start instead of failing at the first sign-in. Production never silently falls back to a
fake, file, console or "none" sender.

Guest mode never goes away: a family can keep playing as a guest on a browser that has never signed
in. Identity adds a way to keep a guest's progress, not a requirement to sign in.

## 3. Guardian sign-in

```text
1. Guardian enters an email address on the account page.
2. POST /api/v1/guardian/email-links  ->  always 202 {accepted:true}  (same body for every input)
3. After the response, the server mails a single-use link (one attempt, no retry).
4. The link is  ${PUBLIC_BASE_URL}/account.html#t=<token>
5. The page reads the fragment and POSTs it to /api/v1/guardian/email-links/consume.
6. Token consumed (single use) -> guardian found or created -> trusted device session established,
   or guardian authority refreshed -> family and profile UI.
```

Properties, each enforced in code and covered by integration tests:

- **No password, no social login, no child email.** A guardian email is the only address stored.
- **Generic public response (anti-enumeration).** The sign-in request returns the same `202` whether
  or not the address is known, valid, throttled, or whether delivery later fails. No field, timing
  gate or status distinguishes "known" from "unknown".
- **Single use.** A token is consumed in one transaction (`used_at` set, the pending email cleared).
  Replay, an unknown token and an expired token are indistinguishable (one generic failure).
- **Expiry.** `IDENTITY_LINK_MINUTES`, default 15 (range 5 to 60).
- **The raw token is never stored.** It is 32 random bytes (43 base64url characters). Only its plain
  SHA-256 is stored. The pending link row holds the address only until it is consumed, then the
  address is cleared.
- **The fragment is never sent to a server.** The link carries the token after `#`, so it is not in
  a request line, a referrer, a proxy log or an access log. The consume step is a `POST`, so a mail
  scanner that only does `GET` on the link cannot spend it.
- **Link origin comes from configuration.** The emailed origin is `PUBLIC_BASE_URL`, never a request
  `Host` header.
- **Cookie-based auth.** The session is an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie
  (`bidazoo_device`, or `__Host-bidazoo_device` when secure). No credential is ever placed in
  `localStorage`, `sessionStorage` or a URL the server sees.
- **Mail never blocks or reveals.** Delivery runs after the response through a bounded dispatcher.
  Delivery failure does not change the public response; see section 8 of
  [IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md) for what that means operationally.

## 4. Trusted devices

A device session is a cookie bound to a database row.

| Property | Value |
| --- | --- |
| Cookie | `bidazoo_device`, or `__Host-bidazoo_device` when `Secure`. `HttpOnly`, `SameSite=Lax`, `Path=/`. |
| Device lifetime | `IDENTITY_DEVICE_DAYS`, default 90 (range 1 to 365). The cookie `Max-Age` and the row expiry match. |
| Guardian authority | `IDENTITY_AUTHORITY_HOURS`, default 24 (range 1 to 168), counted from the last email-link sign-in on that device. |
| Stored | Only the SHA-256 of the cookie token. A database leak yields no usable cookie. |
| Fresh token | Every sign-in issues a new token, even on a browser that already has one; the old row is retired as replaced. |
| Origin | `email_link` (a guardian signed in) or `device_code` (a child device paired by a guardian). |
| Display label | Optional, display only: NFKC-normalized, control characters removed, at most 40 characters. |
| `last_seen_at` | Refreshed at most once an hour. |
| Revoked | A revoked device can never be revived (a database trigger forbids it). |

**Guardian authority is time-boxed; the device is not.** A device stays trusted for up to 90 days so
a child can keep playing, but only a device where a guardian signed in within the last 24 hours may
manage the family (create or archive profiles, set PINs, issue codes, see or revoke devices, claim a
guest, claim legacy data). When authority lapses the same guardian signs in again by email link.
A device paired by a device code has no guardian and never has authority.

**Active child.** A device remembers which profile it plays as (`active_child_profile_id`). A device
may switch profiles (`POST /api/v1/device/profile`); a profile with no PIN switches freely, and a
profile with a PIN needs the correct PIN (section 6).

**Revocation.** A guardian can revoke one device or all devices. Revoking the current device signs
that browser out immediately and clears its cookie; the response reports `current: true` so the UI
can say so. Revoke-all can include or exclude the current device. A revoked device receives 401.
Devices and revocations survive an API restart because they live in PostgreSQL.

**What the device list shows (safe metadata only):** label, origin (email link or device code),
created and last-seen times, expiry, whether it is the current device, and the active child's
nickname. It shows no token, no hash, no IP address, no user agent and no email.

**Device identity is not browser fingerprinting.** A device is just a random cookie. The server does
not collect canvas, font, screen, hardware or IP-derived identifiers to recognize a browser. Clear
the cookie and the device is a stranger.

**Pairing a child device.** A signed-in guardian can issue a short single-use device code for a
profile (Crockford base32, 40 bits, shown as `ABCD-EFGH`; `IDENTITY_DEVICE_CODE_MINUTES`, default 10,
range 2 to 60). A family may hold at most 10 unused, unexpired codes. Redeeming a code on another
browser creates a device session with no guardian and the profile pre-selected. Only a keyed hash of
the code is stored.

## 5. Child profiles

- A profile belongs to **one family** and maps to **one `player_id`**. `unique(player_id)` makes a
  second profile for the same player impossible.
- **No child email is required or stored.** A profile is a nickname plus the player link.
- **Create** makes a fresh player and a profile. (A guest's existing player is attached by *claim*,
  section 7, not by create.)
- **Archive and restore** are idempotent and guardian-only. Archiving only stops the profile from
  being playable (it cannot be selected, and a device pointing at it falls back to "no active
  child"). It never touches the player, attempts, mastery, XP, coins or ledgers. Restoring makes it
  playable again with everything intact. A profile of another family looks exactly like a missing
  one (404).
- **Learning records stay on `player_id`.** Ownership changes nothing about grading, mastery, XP,
  coins, timing, attempts or learning-core.

## 6. Optional profile PIN

A PIN is a **local profile-switch lock** and nothing more. It stops one child on a shared, already
trusted device from switching into a sibling's profile.

**A PIN is not** guardian authentication, account recovery, an internet login, multi-factor
authentication, or a substitute for email verification. It is only checked on a device that is
already trusted, and it never grants guardian authority.

| Property | Behavior |
| --- | --- |
| Format | Exactly four ASCII digits (`^[0-9]{4}$`). |
| Stored form | `scrypt$v1$16384$8$1$<salt>$<key>`: scrypt N=16384, r=8, p=1, a 16-byte random salt, a 32-byte key. |
| Pre-hash | The scrypt input is `HMAC(pin key, "pin:v1:<childProfileId>:<pin>")`, so the hash is bound to the profile and to a server key derived from `IDENTITY_SECRET`. The same four digits on two profiles hash differently. |
| Comparison | Constant time (`timingSafeEqual`), and one derivation is performed even when no PIN is stored, so a missing PIN is not detectable by timing. |
| Failure counter | Durable, in `child_profiles` (`pin_failures`, `pin_locked_until`), updated under a row lock. |
| Lock | 5 wrong guesses (`IDENTITY_PIN_MAX_FAILURES`, range 3 to 20) lock the profile for 900 seconds (`IDENTITY_PIN_LOCK_SECONDS`, range 60 to 86400). |
| While locked | The PIN is still hashed, the answer is always "no", and the counter and lock are not extended. A correct PIN while locked is **still refused**. |
| After the lock expires | The failure count **stays at the threshold**. One more wrong guess re-locks immediately. This allows roughly one guess per lock window (about 96 a day at defaults). |
| Clearing failure state | A correct PIN (when not locked) resets the counter and lock. A guardian setting, resetting or removing the PIN also clears it. Removing the PIN is idempotent and is the way to release a locked profile. |
| Response | Wrong, missing and locked all return the same generic 403 `pin_incorrect`: no `Retry-After`, no lock detail. |
| Supplemental limit | A separate durable limit of 30 PIN attempts per device per hour (`pin_device`, 429) applies before the PIN is checked. |
| Audit | `pin.set` and `pin.cleared` (guardian actions) and `pin.locked` (when a lock starts; actor `device`). |

A PIN is never stored, logged, or returned. Setting a PIN needs guardian authority.

**Known limitation (Commit 6, not hidden).** The PIN pre-hash is keyed from `IDENTITY_SECRET`.
Rotating `IDENTITY_SECRET` therefore makes every stored PIN hash unverifiable: nobody can switch into a
PIN-protected profile until a guardian sets or removes the PIN again. A guardian can always remove it.
No learning data is lost. See the rotation table in
[IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md).

## 7. Claiming a guest player

Before accounts, a child's progress lives on a guest player identified only by the guest cookie. A
verified guardian can keep that exact player.

**Existing guest player + verified guardian on the same browser -> a child profile that references
the SAME `player_id`.**

- No copying, no new player, no reconstructed history, and no change to mastery, XP, coins, attempts
  or ledgers. History is preserved exactly because nothing about it is touched.
- The claim is identified by the guest cookie only; the request body is just a nickname.
- It runs in one transaction with a row lock on the player and `unique(player_id)`.
- **Availability check:** `GET /api/v1/family/guest-claim` returns `{available: boolean}`. It needs
  guardian authority, reads only the request's guest cookie, and is true only for a well-formed,
  known, unrevoked, unexpired guest session whose player has no profile yet. Everything else is a
  plain `false`. It is **read-only**: no write, no audit row, no cookie change, no active-child change.
- **Same-family replay is idempotent:** 201 on the first claim, 200 on a repeat.
- **Different-family claim:** a generic `409 already_claimed` with no owner detail.
- **No live guest cookie:** 401.
- **After a successful claim** the old guest credential stops authenticating (the player's guest
  sessions are revoked and the cookie is cleared), the device's active child becomes the new profile,
  and `guest.claimed` is audited.

The guest must exist before the guardian signs in on that browser: a trusted device with no active
child and no guest cookie gets `409 profile_required` from `POST /api/v1/guest` instead of silently
getting a new guest.

## 8. Legacy Hop Quest family claim

Existing Hop Quest families can be recognized without any runtime link to Hop Quest.

- **Offline only.** An operator prepares a manifest and loads it with a CLI. BidaZoo never reads Hop
  Quest at runtime and holds no Hop Quest credentials.
- **Only a verified BidaZoo guardian email may match**, and it matches by a keyed HMAC:
  `HMAC-SHA-256(LEGACY_MATCH_PEPPER, "bidazoo-legacy-match-v1:" + normalized email)` (NFKC, trimmed,
  lowercased, no provider folding). The plaintext address is not stored.
- **Claiming** (`POST /api/v1/legacy/claim`): 201 first time, 200 same-family replay (idempotent), a
  generic 404 for "no match", "claimed by someone else" and "legacy claiming is off".
- **Legacy kids stay placeholders until explicitly linked.** A family claim alone creates no player.
  Linking a kid (`POST /api/v1/legacy/kids/:id/link`, a nickname) creates a **fresh** BidaZoo player
  and profile. **No old progress is imported**: not coins, XP, mastery, badges, streaks, inventory,
  or answer history.
- **Operator claim code** (`POST /api/v1/legacy/claim-code`): assisted recovery when a family's
  email changed. Operator-only issuance, and the guardian must already be signed in. The code is
  random (60 bits), stored only as a keyed hash, expiring, single-use, scoped to one legacy family and
  rate-limited. It is **not a login credential**.

Runbooks: [IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md).

## 9. Audit trail

Security-significant actions are written to `audit_events`, an append-only table. Rows are written in
the **same transaction** as the state change, so there is never a change without its row or a row
without its change.

| Family | Actions |
| --- | --- |
| Guardian | `guardian.created`, `guardian.verified` |
| Devices | `device.authorized`, `device.revoked`, `device.revoked_all`, `device.code_issued` |
| Profiles | `child.created`, `child.archived`, `child.restored` |
| Guest claim | `guest.claimed` |
| PIN | `pin.set`, `pin.cleared`, `pin.locked` |
| Legacy | `legacy.batch_loaded`, `legacy.claim_code_issued`, `legacy.claim_code_redeemed`, `legacy.claim_code_revoked`, `legacy.family_claimed`, `legacy.kid_linked` |

Rules:

- **Secrets are excluded.** Metadata keys are an allowlist (`method, origin, reason, count,
  childCount, kidCount, includeCurrent, replaced, wasSet`). A value that looks like a secret or an
  email address makes the write **throw**; the error never echoes the value.
- **Server clock.** `at` is the server's time, never a client value.
- **Actors:** the guardian, `device` (an unauthenticated local action such as a PIN lock), or
  `operator` (a CLI tool).
- **Idempotent replay generally writes no duplicate success event.** A repeat or no-op writes
  nothing. Exceptions, by design: `device.revoked_all` is recorded on **every** call, including
  `count = 0`, because "revoke everything" is an explicit security action; and each operator manifest
  load records `legacy.batch_loaded` (a reload of an unchanged manifest still records a load event).
- There is no audit viewer in the product yet; operators read the table directly.

## 10. Throttles

Restart-critical limits are **durable** (PostgreSQL). They are checked **before** the action, each
counted in its own statement so a rejected request keeps its count, and a rejected request mutates
nothing else.

**Authoritative, durable (`identity_throttles`, atomic upsert; keys are HMACs, so no raw email or IP
is stored):**

| Scope | Default | Rejection |
| --- | --- | --- |
| `login_email` | 5 per hour | silent 202, **no mail sent** (indistinguishable from success) |
| `login_ip` | 20 per hour | 429 |
| `login_global` | 300 per hour | 503 |
| `consume_ip` | 30 per 15 minutes | 429 |
| `device_code_ip` | 10 per 10 minutes | 429 |
| `device_code_global` | 200 per 10 minutes | 503 |
| `claim_code_ip` | 10 per hour | 429 |

**Authoritative, in the profile row:** the PIN profile lock (`child_profiles.pin_failures`,
`pin_locked_until`, row-locked; section 6).

**Supplemental, durable:** `pin_device`, 30 per device per hour (429).

**Supplemental, process-local:** the Checkpoint D `@fastify/rate-limit` backstops (`apiPerIp` and the
per-client keys). These live in memory and a restart clears them. They are a second layer, never the
only protection for an identity action.

**Single-use credentials** (email links, device codes, claim codes) are enforced by database rules
(row lock plus `used_at`), not by counters.

Overrides: `IDENTITY_RATE_<NAME>_MAX` and `IDENTITY_RATE_<NAME>_WINDOW_SECONDS` with NAME one of
`LOGIN_EMAIL, LOGIN_IP, LOGIN_GLOBAL, LINK_CONSUME_IP, DEVICE_CODE_IP, DEVICE_CODE_GLOBAL,
CLAIM_CODE_IP, PIN_DEVICE`. The IP subject is the IPv4 address, or the IPv6 /64. Per-IP limits use
the client address as determined by `TRUST_PROXY` (see [SECURITY.md](SECURITY.md)).

## 11. Privacy boundary

What the code guarantees today:

- **No child email** is required or stored.
- **Minimal child data:** a nickname, a link to a player, and the existing learning records.
- **No legacy marketing import:** marketing contacts are not part of the manifest.
- **No tracking pixels** in the sign-in email (one button, no remote images, no tracking links).
- **No fingerprinting** (section 4).
- **Learning data stays server-authoritative** and keyed to the player.
- **No secrets in the browser:** no credential in `localStorage` or `sessionStorage`; the client
  bundle scan checks for server-only markers (24 as of Commit 10).

What this document does **not** claim: it does not state that BidaZoo is COPPA certified, COPPA
compliant, in a Safe Harbor program, FERPA compliant, or privacy certified. None of that has been
established. Children's-data review, consent flows, retention and deletion still need proper review
before real-world use. Nothing here is legal advice.

## 12. Where the code is

`apps/api/src/modules/identity/`: `config.ts` (settings and production validation), `runtime.ts`,
`crypto.ts` (key derivation, codes), `service.ts` (token hashing), `guardians.ts` and
`guardian-routes.ts` (email links), `devices.ts`, `device-management.ts` and `device-routes.ts`
(sessions, switching, revoke, pairing), `children.ts` and `family-routes.ts` (profiles),
`guest-claim.ts`, `pin.ts`, `legacy.ts`, `legacy-manifest.ts` and `legacy-routes.ts`, `throttle.ts`,
`audit.ts`, `mail.ts`, `mail-smtp.ts`, `mail-content.ts`. CLIs in `apps/api/src/cli/`:
`legacy-load.ts`, `legacy-claim-code.ts`, `mail-test.ts`. The client is `apps/play/src/account/`.
Route paths are in `packages/contracts/src/paths.ts`. Migrations `0003` and `0004` add the identity
tables and their database guards.
