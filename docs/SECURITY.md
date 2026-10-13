# Security

Status: Checkpoint B (October 11, 2026) plus Checkpoint D, the public-beta security gate (October 12, 2026;
**complete and Studio-PC validated** on commit `52547a3`, October 12, 2026). This documents the rules and what is enforced today.
It is not a substitute for a security or legal review before real children use the product.

## The trust model

The browser is untrusted. Anyone can edit JavaScript, replay requests, or send hand-written ones.

```text
CLIENT REQUESTS -> SERVER VALIDATES -> SERVER DECIDES -> DATABASE COMMITS -> CLIENT ANIMATES
```

**The server owns:** correct answers, attempts, response times, mastery, persistent XP, currency,
inventory ownership, achievements, unlocks, entitlements, session completion, and reward issuance.

**The browser may own:** animations, camera, particles, sound, menu state, the chosen animal,
accessibility preferences, and temporary visual effects.

### Domain actions, not state

The API accepts requests to *perform a domain action* ("submit this answer"). It never accepts a
statement of resulting state. A body like this is rejected, not ignored:

```json
{ "coins": 999999, "xp": 999999, "inventory": ["everything"] }
```

Request schemas set `additionalProperties: false` and Ajv runs with `removeAdditional: false`,
so an extra field is a 400, not silently dropped. There is no field for XP, coins, mastery,
correctness, or response time in any request type in `packages/contracts`, and a compile-time test
(`tests/integration/contracts-boundary.test.ts`) fails if one is added to a client request.

### Answer security

The server generates a question, keeps the answer key in `served_questions.private_grading_data`,
and sends only a `PublicQuestion` (`id`, `sequence`, `prompt`, `type`, `choices`). Three layers
keep the key private:

1. **Allowlist projection.** The public question is built field by field from the stored
   `public_payload`; the key is a different column.
2. **Response serialization.** Every route declares a TypeBox `response` schema. Fastify's
   serializer drops any property that is not in the schema, so a private field that ended up on a
   row object still cannot reach the wire.
3. **Verification.** Tests assert that no question response contains `correctAnswer`,
   `answerKey`, `correctChoiceId`, or grading data, and `tests/scripts/scan-client-bundle.mjs`
   scans the built frontend for server-only code and secrets.

The answer is revealed in `AnswerResult.correctAnswer` only **after** the server has graded the
attempt. That is what lets a missed question teach the correction.

### Guest identity (cookie model)

- The cookie holds a random 32-byte token (43 base64url characters). It means nothing by itself
  and is not a JWT.
- Only the **SHA-256 hash** is stored (`guest_sessions.token_hash`). A database leak does not
  yield usable cookies. The token is compared by hash lookup, not by string comparison of secrets.
- `HttpOnly` (JavaScript cannot read it), `SameSite=Lax`, `Path=/`, 90-day `Max-Age`. Under HTTPS
  or production (`COOKIE_SECURE`), it is also `Secure` and uses the `__Host-` name prefix.
- No bearer token, nothing in `localStorage` or `sessionStorage`. The only thing the game stores
  locally is the chosen animal, which is presentation.
- A refresh sends the cookie and reconnects to the same player. Clearing cookies creates a new,
  empty guest; the old progress is unreachable (guest upgrade is a postponed decision).
- Sessions can be revoked (`revoked_at`) and expire (`expires_at`).

### Idempotency and double-submit protection

Enforced by the database, not by hope. See ARCHITECTURE.md section 6 for the transaction.

- `attempts.served_question_id` is `UNIQUE`: **a question can have only one final grade**, no
  matter how the code is written.
- `attempts(player_id, idempotency_key)` is `UNIQUE`: the same `attemptId` is a replay and returns
  the stored result without new rows. A *different* `attemptId` on an already-answered question is
  a 409 and earns nothing, so a modified client cannot farm rewards by minting new keys.
- The session row is locked (`FOR UPDATE`) for the whole answer transaction, so concurrent
  requests queue instead of racing. Unique-violation errors are mapped to 409 as a backstop.
- Ledger rows are unique on `idempotency_key` and on `(source_type, source_id, reason[, currency])`,
  and inserted with `ON CONFLICT DO NOTHING`.
- `attempts`, `wallet_transactions`, and `xp_events` are append-only (triggers refuse `UPDATE`;
  `DELETE` is refused outside a deliberate erasure routine). A served question is frozen once
  issued: the answer key and `served_at` can never be rewritten.

### Ownership

Every session lookup filters by the authenticated player. Another player's session, a session
that does not exist, and a question from another session all return the same 404, so ids cannot
be probed. Composite foreign keys make cross-player and cross-session attempts impossible at
the schema level too.

### Server-measured time

`responseMs = answered_at - served_at`, both server clocks. There is no client duration field.
A refresh returns the outstanding question with its original `served_at`; it cannot reset the
timer or reroll the question. A database trigger prevents `served_at` from ever changing.

## Baseline rules

| # | Rule | Status in Checkpoint B |
| --- | --- | --- |
| 1 | No secrets in frontend bundles | Only `VITE_`-prefixed variables reach the client. The client no longer needs any. `scan-client-bundle.mjs` checks the built output for server-only identifiers, table names, and connection strings. |
| 2 | No secrets committed to Git | `.gitignore` covers `.env`, `.env.*`, keys, and certificates. Tracked files contain only placeholders. |
| 3 | `.env` is ignored | Yes. |
| 4 | `.env.example` has names and safe placeholders only | Yes. |
| 5 | Persistent rewards are server-authoritative | **Implemented.** Append-only ledgers written only inside the answer transaction. |
| 6 | Player input is validated server-side | **Implemented.** TypeBox request schemas with `additionalProperties: false`; 16 KB body limit; fixed-text errors that never echo input. |
| 7 | Reward-changing operations are idempotent | **Implemented and DB-enforced.** |
| 8 | Correct-answer information stays server-side | **Implemented**, with the three layers above. |
| 9 | HttpOnly cookies for browser sessions | **Implemented** (guest cookie). |
| 10 | Child data is minimized | A player is an opaque id plus a generic nickname. The database stores no name, email, birth date, address, school, or IP address. (Request logs do include the remote address; log retention is undecided.) |
| 11 | Prefer nicknames and player ids over real-world identity | Yes. |

## Implemented operational protections

- **Security headers on every API response** (success, 4xx, 5xx, 404, 429, 503):
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment, USB off),
  a Content-Security-Policy of `default-src 'none'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'` (an API response may never load or run anything), and `Cache-Control:
  no-store` under `/api/v1`. `Strict-Transport-Security` is sent only when `HSTS_MAX_AGE_SECONDS`
  is set (see "Public-beta protections"). Defined in `apps/api/src/http/security-headers.ts`.
- **Abuse limits, proxy trust, and a client Content-Security-Policy** (Checkpoint D): see the next
  section.
- **Same-origin check** for non-GET requests under `/api/v1`: if a browser sends `Origin`, it must
  match `Host` or be listed in `ALLOWED_ORIGINS`; otherwise 403. Combined with `SameSite=Lax` and
  JSON-only bodies, this is the CSRF defense.
- **Config errors never echo values.** A bad or missing `DATABASE_URL` names the variable only.
- **Log redaction.** The API redacts `authorization`, `cookie`, and `set-cookie` headers.
- **`/ready` leaks nothing.** It reports coarse status; underlying errors are logged server-side.
- **Pool errors are contained** and logged by message only (an unhandled `pg` pool error would
  otherwise crash the API).
- **Safe defaults.** The API and dev servers bind to `127.0.0.1`.

## Public-beta protections (Checkpoint D)

### Rate limiting and abuse limits

Built on the Fastify-native `@fastify/rate-limit` plugin with its **in-memory** store (no Redis, no
new service). Why this dependency: it is maintained by the Fastify organization, targets Fastify 5
(this project's framework), has four small dependencies of its own, and needs no infrastructure.
It is the only dependency Checkpoint D adds.

**Two rules keep the limiter away from learning state.** (1) Every limiter runs before the route
handler (a route `onRequest` hook, or the first statement of the guest-creation handler), so a
throttled request never reaches a database write. (2) A limiter can only answer 429 or 503; it has
no way to grade, reward, or change a session. Tests prove both (`tests/integration/rate-limit.test.ts`
checks row counts and ledger totals before and after a throttled request).

| Rule | Key | Default (max per window) | Variables (prefix `RATE_`) |
| --- | --- | --- | --- |
| New guests, burst | client IP | 30 per 60 s | `GUEST_CREATE_BURST_MAX`, `..._WINDOW_SECONDS` |
| New guests, sustained | client IP | 150 per 3600 s | `GUEST_CREATE_HOURLY_MAX`, `..._WINDOW_SECONDS` |
| New guests, whole service (emergency breaker) | none (global) | 3000 per 3600 s; `MAX=0` disables | `GLOBAL_GUEST_CREATE_MAX`, `..._WINDOW_SECONDS` |
| Start or resume a play session | guest (hash of the cookie) | 30 per 600 s | `SESSION_START_MAX`, `..._WINDOW_SECONDS` |
| Submit an answer | guest (hash of the cookie) | 120 per 60 s | `ANSWER_MAX`, `..._WINDOW_SECONDS` |
| Any `/api` request (backstop for floods and forged cookies) | client IP | 2400 per 60 s | `API_PER_IP_MAX`, `..._WINDOW_SECONDS` |

Other variables: `RATE_LIMIT_ENABLED` (default `true`), `RATE_CACHE_SIZE` (keys tracked per rule,
default 10000, oldest evicted first), `TRUST_PROXY`, `HSTS_MAX_AGE_SECONDS`. All are validated at
startup; a bad value names the variable and never echoes its value.

**How the defaults were chosen.** One 10-question game is 1 `POST /guest`, 1 `POST /play-sessions`,
11 `POST .../question`, and 10 `POST .../answers`. A refresh adds a guest call, a session resume,
and a question call; "Play again" repeats the game. A fast child finishes a game in about a minute,
so one guest sends about 15 answers and 30 requests per minute at most. Every per-guest limit is
several times that. The per-IP limits assume a classroom of about 30 children behind one NAT
address. The integration tests play four games back to back with refreshes and retries, and 28
children on one address, all under the default limits with zero 429s.

**The response contract.** HTTP 429 with the same envelope as every other error:
`{"error":{"code":"rate_limited","message":"Too many requests. Please wait a moment and try again."}}`
and a `Retry-After` header in whole seconds. The service-wide breaker answers HTTP 503 with
`{"error":{"code":"service_busy",...}}` and `Retry-After`. The game client already shows a "Try
again" button on any failed call and does not auto-retry non-network errors, so a throttled child
sees the normal retry screen.

**Guest creation is "ensure a guest", so a refresh never counts.** The creation limits are checked
only when no valid cookie is present, immediately before the guest is created. A guest who refreshes
a hundred times is never limited by the creation rules.

**The service-wide breaker is an emergency stop, not the primary limiter.** The primary protection
is the per-IP rules. The breaker counts only creations that already passed the per-IP rules, so one
address can consume at most its own per-IP allowance of it (tested: one address making eight
attempts uses two units of a ceiling of three). When it is open, only brand-new guests are refused
(HTTP 503, `service_busy`, `Retry-After` until the window ends); every existing guest keeps playing
normally, and it closes by itself when the window rolls over. **Limitation:** an attacker with many
addresses can still open it and block new guests for the rest of the window. Fixing that properly
needs infrastructure BidaZoo does not have (an edge or CAPTCHA layer, a shared store). It is
documented rather than hidden, and the ceiling is configurable (or off with `MAX=0`).

**Limits of the mechanism (accepted for the beta).**
- Windows are per key and **tumbling**: the window starts at that key's first request and resets
  when it ends. A client can spend up to about twice its allowance across a boundary. Guest
  creation therefore has two tiers (burst and hourly).
- State lives in the API process's memory. A restart clears it, and two API processes would each
  enforce their own limits. A shared store is deliberately not introduced yet.
- IPv6 clients are limited per /64 network, so one household cannot dodge a limit by rotating
  addresses.
- Rate-limit keys (an IP, or a SHA-256 of a cookie) exist only in memory and are never written to
  the database. Request logs still contain remote addresses (retention is undecided; see below).

### Proxy trust and the client address

Every per-IP limit uses the client address, and a client can send any `X-Forwarded-For` it likes.
So the API **never** trusts forwarding headers unless told exactly which proxies to believe.

- `TRUST_PROXY` unset, empty, or `false` (default): headers are ignored; the socket address is used.
  This is correct for local Studio runs and for an API with no proxy in front. Behind a proxy it
  would make every visitor look like one address, so a deployment must set it.
- `TRUST_PROXY=loopback` (proxy on the same machine), or a list such as `10.0.0.0/8,fd00::/8`:
  forwarding headers are trusted only from those addresses, and the client address is the right-most
  `X-Forwarded-For` entry that is not itself one of those proxies. Entries a client adds on the left
  change nothing (tested).
- `true` and hop counts such as `1` are **refused at startup** on purpose: a hop count cannot verify
  who is connected to the API, so a client that reached the API directly could forge the header.
  (Fastify itself treats a bare number as "trust nothing".)
- **Deployment assumption:** the API must be reachable only through the proxy (bind it to loopback
  or a private network). If it is also reachable directly, the proxy list must still be accurate and
  the proxy must overwrite, not append to, an incoming `X-Forwarded-For` from the internet. Caddy
  does this by default; check this for whatever proxy is chosen. No hosting provider is assumed.

### Content-Security-Policy and headers for the playable client

One definition, `apps/play/security-headers.ts`, is used three ways: `vite preview` (what the
Playwright and Studio runs serve) sends it as headers; the production build embeds the same policy
as a `<meta http-equiv>` in `index.html`, so it is **enforced even if a host forgets to send
headers**; and the production reverse proxy should send it as a header (preferred, because only a
header can carry `frame-ancestors`).

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
```

There is no `'unsafe-inline'`, no `'unsafe-eval'`, no wildcard, and no remote origin. Phaser runs
under it unchanged: it draws to a canvas, loads no assets, and the game makes only same-origin
`fetch` calls. Two small client changes made that possible: the inline `<style>` in `index.html`
moved to `apps/play/src/styles.css`, and the hidden accessibility mirror sets its style through the
DOM style API instead of an inline `style` attribute. If a browser ever reports a violation, loosen
only that one directive and say why in `security-headers.ts`.

Example for a reverse proxy (illustration only, not a hosting recommendation; Caddy shown):

```text
bidazoo.example.com {
  header {
    Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    X-Content-Type-Options nosniff
    Referrer-Policy no-referrer
    X-Frame-Options DENY
    Cross-Origin-Opener-Policy same-origin
    Strict-Transport-Security "max-age=31536000"   # only once HTTPS is final; HSTS is sticky
  }
  handle /api/* { reverse_proxy 127.0.0.1:3001 }   # with TRUST_PROXY=loopback on the API
  handle { root * /srv/bidazoo/play/dist
           file_server }
}
```

The development server (`vite dev`) does not send the CSP: its hot-reload client injects styles at
runtime and would only produce noise. Always judge CSP behavior on the built client (`vite preview`,
which Playwright uses).

## Family identity (Checkpoint E: COMPLETE and Studio-validated, NOT deployed)

The live beta does not run this code. Full behavior: [IDENTITY.md](IDENTITY.md). Operations and secret
rotation: [IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md).

- **Guardian sign-in** is a single-use emailed link in a URL fragment, redeemed by `POST`. The public
  request always returns the same `202`, even when delivery fails. Tokens are random and only their
  SHA-256 is stored. No password, no social login, no child email.
- **Sessions** are `HttpOnly`, `SameSite=Lax` cookies (`__Host-` and `Secure` in production), hashed in
  the database. A device is trusted for up to 90 days; guardian authority on it lasts 24 hours.
  Revocation is immediate and permanent. No credential lives in `localStorage` or `sessionStorage`.
- **Anti-enumeration:** unknown, expired and used links, wrong or missing PINs, other families'
  profiles, and claim conflicts are generic and indistinguishable.
- **Optional PIN** is a local profile-switch lock, not authentication: four digits, scrypt with a
  profile-bound keyed pre-hash, a durable 5-failure lockout, and a supplemental per-device limit.
- **Keys:** `IDENTITY_SECRET` derives three purpose keys by HKDF (throttle, code, PIN). Rotating it
  invalidates stored PIN hashes, unused device and claim codes, and resets throttle counters; it does
  not invalidate sessions or email links. `LEGACY_MATCH_PEPPER` keys the legacy email match. There is no
  dual-key rotation.
- **Durable throttles** (PostgreSQL) cover sign-in, link redemption, device and claim codes, and PINs,
  and survive restarts. The Checkpoint D in-process limits remain as a backstop.
- **Audit:** security-significant identity actions are written append-only in the same transaction as
  the change. Secrets and email addresses are refused by an allowlist (a violating write throws).
- **Mail:** production refuses fake, file, console and unset senders, requires verified TLS and
  credentials, and rejects `jonabalos.com` senders. Mail errors are reduced to a safe category before
  logging; provider text, addresses and links are never logged.
- **Legacy data** arrives only through an offline operator CLI as keyed match values; no passwords,
  PINs, progress or marketing data are imported. The CLI does not detect broad readability of the
  manifest on Windows.

SPF, DKIM and DMARC for the sending domain are **not** configured. No COPPA, FERPA, Safe Harbor or
privacy certification or compliance is claimed.

## Known limitations (do not assume these are solved)

- **Abuse protection is in-process and best-effort.** See "Limits of the mechanism" and the
  service-wide breaker limitation above. There is no CAPTCHA, no shared limiter store, and no
  distributed-attack defense.
- **No CAPTCHA or abuse detection.** On the deployed baseline there is no account recovery: a guest who clears cookies loses progress. Checkpoint E adds guardian accounts and guest claim (validated but not yet deployed); a guest whose cookie is cleared before a claim is still lost.
- **The same-origin check trusts the `Origin` header being absent for non-browser clients.**
  That is intentional (curl and tests have no ambient cookie), but it means this check is defense
  in depth, not the primary control.
- **Latency is counted in response time.** Server-measured time includes network delay; a slow
  connection can turn a fluent answer into a merely correct one. Accepted trade-off.
- **A malicious client can still answer slowly or quickly on purpose** or answer correctly if it
  can do multiplication itself. Server authority prevents *forging* results, not *playing*.
  Nothing here is a cheat-proof proctoring system, and that is not the goal.
- **Mastery days use UTC.** The "different days" rule can be off by a local evening.
- **Replay returns the current mastery state**, not a snapshot from the time of the original
  answer.
- **Database tests skip without `TEST_DATABASE_URL`.** They skip loudly, but a machine that never
  sets it never runs them.
- **No backup/restore automation or data-retention jobs.** Old guests accumulate. Identity audit logging exists in Checkpoint E (not yet deployed); there is no audit viewer.
- **The client CSP depends on the host sending it or on the embedded `<meta>`.** The meta fallback
  cannot carry `frame-ancestors`; clickjacking protection (`X-Frame-Options`, `frame-ancestors`) needs
  the proxy to send headers. HSTS is off until configured.
- **Tracked dependency advisories:** see ARCHITECTURE.md section 15.

## Children's data

BidaZoo is intended for children, so privacy law may apply (for example, in the United States,
COPPA). Minimizing data is the first defense. Consent flows, retention, and deletion need a
proper review before launch. The append-only triggers deliberately allow `DELETE` only inside an
explicit erasure routine, so a "delete this child's data" job can be built without disabling the
guards. Nothing here is legal advice.

## Reporting and rotation

If a secret is ever committed, treat it as compromised: rotate it first, then remove it from
history. Removing it from the latest commit is not enough.
