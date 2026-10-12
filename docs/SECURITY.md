# Security

Status: Checkpoint B, October 11, 2026. This documents the rules and what is enforced today.
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

- **Security headers.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Resource-Policy: same-origin`, and `Cache-Control: no-store` on API responses.
- **Same-origin check** for non-GET requests under `/api/v1`: if a browser sends `Origin`, it must
  match `Host` or be listed in `ALLOWED_ORIGINS`; otherwise 403. Combined with `SameSite=Lax` and
  JSON-only bodies, this is the CSRF defense.
- **Config errors never echo values.** A bad or missing `DATABASE_URL` names the variable only.
- **Log redaction.** The API redacts `authorization`, `cookie`, and `set-cookie` headers.
- **`/ready` leaks nothing.** It reports coarse status; underlying errors are logged server-side.
- **Pool errors are contained** and logged by message only (an unhandled `pg` pool error would
  otherwise crash the API).
- **Safe defaults.** The API and dev servers bind to `127.0.0.1`.

## Known limitations (do not assume these are solved)

- **No rate limiting.** Guest creation, session starts, and answer attempts are unbounded. An
  attacker can create many guests. Needs design before any public exposure.
- **No CAPTCHA, abuse detection, or account recovery.** A guest who clears cookies loses progress.
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
- **No audit logging, backup/restore, or data-retention jobs.** Old guests accumulate.
- **No Content-Security-Policy header yet** for the static client.
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
