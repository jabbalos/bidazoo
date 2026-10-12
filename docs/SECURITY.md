# Security

Status: Checkpoint A baseline, October 11, 2026. This documents rules and what is enforced today.
It is not a substitute for a security or legal review before real children use the product.

## The trust model

The browser is untrusted. Anyone can edit JavaScript, replay requests, or send hand-written ones.

```text
CLIENT REQUESTS -> SERVER VALIDATES -> SERVER DECIDES -> DATABASE COMMITS -> CLIENT ANIMATES
```

**The server owns:** correct answers, attempts, mastery, persistent XP, currency, inventory
ownership, achievements, unlocks, entitlements, session completion, and reward issuance.

**The browser may own:** animations, camera, particles, sound, menu state, accessibility
preferences, and temporary visual effects.

### Domain actions, not state

The API accepts requests to *perform a domain action* ("submit this answer"). It must never accept
a statement of resulting state. A body like this must be meaningless to the server:

```json
{ "coins": 999999, "xp": 999999, "inventory": ["everything"] }
```

There is no field for these in any request type in `packages/contracts`, and a compile-time test
(`tests/integration/contracts-boundary.test.ts`) fails if one is added to a client request.

### Answer security

The server generates a question, keeps the answer key, and sends only a `PublicQuestion`. The key
is revealed in `AnswerResult` after grading. Choice ids are positional (`c1`, `c2`, ...) and
assigned after shuffling, so an id never encodes correctness.

## Baseline rules

| # | Rule | Status in Checkpoint A |
| --- | --- | --- |
| 1 | No secrets in frontend bundles | Only `VITE_`-prefixed variables reach the client, and `.env.example` marks them public. At Checkpoint A the built client bundle contained no database URL, server variable names, or key material. |
| 2 | No secrets committed to Git | `.gitignore` covers `.env`, `.env.*`, keys, and certificates. At Checkpoint A the tracked files were scanned: the only connection strings are obvious placeholders. |
| 3 | `.env` is ignored | Verified with `git check-ignore`. |
| 4 | `.env.example` has names and safe placeholders only | Yes (`change-me`). |
| 5 | Persistent rewards are server-authoritative | Architecture and contracts only; no rewards exist yet. |
| 6 | Player input is validated server-side | Not yet; no input endpoints exist. Validation approach is a postponed decision. |
| 7 | Reward-changing operations are idempotent | Contract carries `idempotencyKey`; enforcement arrives with rewards (planned: unique key on a ledger table). |
| 8 | Correct-answer information stays server-side | `toPublicQuestion` is an allowlist projection; covered by unit tests. |
| 9 | HttpOnly cookies for browser sessions | Planned for the identity module. Not implemented. |
| 10 | Child data is minimized | The only table stores an opaque id, a nickname (max 32 characters), and a timestamp. |
| 11 | Prefer nicknames and player ids over real-world identity | Yes. No real name, email, birth date, address, or school is modeled. |

## Implemented operational protections

- **Config errors never echo values.** A bad or missing `DATABASE_URL` names the variable only,
  because the value can contain a password.
- **Log redaction.** The API redacts `authorization`, `cookie`, and `set-cookie` headers.
- **`/ready` leaks nothing.** It reports coarse status (`ok` / `unavailable`). Underlying errors
  (hostnames, usernames) are logged server-side only, and a test asserts they are not returned.
- **Pool errors are contained and logged by message only.** An unhandled `pg` pool error would
  crash the API, and the raw error object contains the client's connection internals.
- **Safe defaults.** The API and dev servers bind to `127.0.0.1`.

## Not yet implemented (do not assume)

Authentication, sessions and cookies, input validation, CORS policy, security headers, rate
limiting, CSRF protection, audit logging, and backup/restore. Each must be designed before a
real child can use the product.

## Children's data

BidaZoo is intended for children, so privacy law may apply (for example, in the United States,
COPPA). Minimizing data is the first defense. Consent flows, retention, and deletion need a
proper review before launch. Nothing here is legal advice.

## Reporting and rotation

If a secret is ever committed, treat it as compromised: rotate it first, then remove it from
history. Removing it from the latest commit is not enough.
