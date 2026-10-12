# Reference Review: Hop Quest and Fact Crew

Status: October 11, 2026. Read-only review done after Checkpoint A. No reference code was copied
into this repository, and the reference archive was not modified. Nothing here starts Checkpoint B.

This document decides what BidaZoo may learn from two existing products. It does not change any
Checkpoint A code.

## 1. Classification key

| Label | Meaning |
| --- | --- |
| **REUSE CONCEPT** | The idea is sound. Build it fresh in BidaZoo's own style. |
| **ADAPT ALGORITHM** | The logic is sound and worth porting. Re-implement it in `packages/learning-core` (pure, seeded, injected clock), with its own tests. |
| **REWRITE CLEANLY** | The need is real but the reference implementation is wrong for a server-authoritative platform. Design again from the requirement. |
| **DO NOT CARRY FORWARD** | Leave it behind. |

"Adapt" never means copy the file. Algorithms are re-expressed against BidaZoo's contracts and
tested against BidaZoo's own cases.

## 2. Source reviewed

| Item | Detail |
| --- | --- |
| Archive | `hop-quest-fact-crew-source-review.zip`, sha256 `883858f5d3570a4cc0d11e7949762e67368b21558aaa918c35c7844194fd0ddb` |
| Extracted | Outside this repository, read-only. The original zip was not touched. |
| Integrity | `MANIFEST.txt` lists 16-character sha256 prefixes. All 163 listed files matched. 0 mismatched, 0 missing. |
| Fact Crew | `fact-crew/game` v1.0.1 (TypeScript, Vite) and `fact-crew/card-studio` |
| Hop Quest | `hop-quest` 2.1.2 (plain Node, no framework, JSON file storage) |
| Also present | `accounts-service` 1.0.0, `clickaroo-games-hub`, `deployment`, `tools` |
| Read most closely | Fact Crew `engine/*`, `integrations/adapters.ts`, `storage/guest.ts`, tests, docs. Hop Quest `server.js`, `lib/{family,bank,api}.js`, targeted parts of the browser `app.js`. `accounts-service/server.js` for tokens, rate limits, and storage. |
| Not reviewed in depth | Card Studio, the games hub catalog, deployment scripts, Stripe and email flows beyond what bears on the questions above, and the question bank contents. |

Nothing was executed from the reference code. Every statement below comes from reading source.

## 3. The archive's `ARCHITECTURE.md`: claims checked against source

`ARCHITECTURE.md` in the archive was read first. It is accurate about the things checked, and it is
candid about its own limits.

| Claim | Result |
| --- | --- |
| Manifest matches the files shipped | **Confirmed.** 163 of 163. |
| Fact Crew layout test covers 18 size and mode combinations | **Confirmed.** 9 viewports times 2 input modes. |
| Hop Quest has no automated tests in its source tree | **Confirmed.** No test or spec files in `hop-quest` or `accounts-service`. |
| Fact Crew `tests/e2e.py` has 35 checks | **Not confirmed.** The file has 16 `check(` call sites. Some may run inside loops, but the count could not be reproduced by reading. Treat "35" as unverified. |
| Hop Quest returns the question bank without answers and reveals only after grading | **Confirmed.** `publicItem` allowlists fields and `reveal` appears only in the grade result. `/data/` is no longer served as files. |
| Kid sessions are HMAC tokens revoked by a PIN version | **Confirmed.** Tokens carry `pinV`, and a changed PIN version invalidates them. |
| Entitlements travel as short-lived Ed25519-signed tokens | **Confirmed** in `accounts-service/server.js` (default lifetime 900 seconds). |
| Rate limits are in memory | **Confirmed.** A `Map` of timestamps, pruned every 10 minutes. Lost on restart, not shared across processes. |
| Hand-off codes are one-time, short-lived, and in memory | **Confirmed.** 24 random bytes, 2 minute expiry, deleted on first redeem, lost on restart. |

Where the archive and the source disagree, the source wins, and this document says so.

## 4. Fact Crew findings

Fact Crew is a browser-only TypeScript game. Its engine is the most valuable thing in the archive.
Its architecture is the opposite of what BidaZoo needs.

### 4.1 What is good

| Area | What it does | Verdict |
| --- | --- | --- |
| Fact families | Content is declared as families (for example operation plus operand range) and facts are derived from them. Content tests assert that every fact is well formed. | **REUSE CONCEPT** |
| Seeded generation | A small xorshift32 generator. Its state is stored with the session, so a restored session continues the same sequence. | **ADAPT ALGORITHM** (BidaZoo already has `createRng`; keep that one and port only the "persist the RNG state" idea). |
| Distractors | Several strategies (near numbers, swapped operands, off-by-one, neighbor-operation answers), filtered so no distractor equals the answer or another distractor. | **ADAPT ALGORITHM** |
| Answer validation | Pure function, answer in and verdict out, with input normalization. | **ADAPT ALGORITHM**. BidaZoo's `gradeResponse` already has the right shape (choice ids). Free numeric entry would need its own normalizer. |
| Leitner boxes | Six boxes with review intervals of `[0, 0, 1, 3, 7, 21]` days. A miss drops the card back. A hit promotes it. | **ADAPT ALGORITHM** |
| Fluency | A correct answer faster than 6000 ms counts as fluent. Speed matters only when the answer is correct. | **ADAPT ALGORITHM**, with one change (see 4.3). |
| Mastery rule | Mastered when box is at least 4, streak is at least 3, and the card was fluent on at least 2 different days. | **ADAPT ALGORITHM**. The "different days" requirement is the best idea in the file. It stops one lucky session from marking mastery. |
| Priority scoring | `priority()` ranks cards so due, weak, and slow cards come first. | **ADAPT ALGORITHM** |
| Mastery Quest | Builds a session from the highest-priority cards. A missed card is retried: up to 4 extra cards, at most 2 retries. | **ADAPT ALGORITHM**. The retry cap is the part to keep. It prevents a frustration loop. |
| Immutable updates | `recordAnswer(prev, correct, ms, now)` returns a new record, takes time as a parameter, and does no I/O. | **REUSE CONCEPT**. This is exactly the purity BidaZoo's `learning-core` enforces. |
| Injected store and clock | Persistence and time are interfaces, so tests need no browser or real clock. | **REUSE CONCEPT** |
| Tests | 17 engine tests with property-style content checks, plus real-browser layout tests that measure element boxes at 9 viewports. | **REUSE CONCEPT** (see 4.4). |

### 4.2 What does not fit

| Area | Problem | Verdict |
| --- | --- | --- |
| Everything runs in the browser | The client generates the question, holds the answer, measures the time, grades, updates mastery, and awards XP. | **DO NOT CARRY FORWARD** as an architecture. |
| Persistence | `storage/guest.ts` writes progress to browser storage. Anyone can edit it. | **DO NOT CARRY FORWARD** for anything that counts. Fine for a throwaway guest preview only. |
| XP and scoring | `scoring.ts` computes XP on the client. | **REWRITE CLEANLY**. The formula may inform design. The computation belongs to the server. |
| Integration adapters | `integrations/adapters.ts` is a seam for a future server, with the client still authoritative. | **REUSE CONCEPT**: the seam is good. The authority it assumes is not. |
| Importer | `importer.ts` loads content from authored files at build time. | **REWRITE CLEANLY** as server-side content loading in `modules/content`, validated at startup. |
| Session progression | The session object lives in client memory. | **REWRITE CLEANLY** as a server-side session row (see section 8). |

### 4.3 Specific hazards

- **Client-measured time.** Fluency uses a timer the browser controls. A client can report any
  duration. In BidaZoo the server must time the answer itself: record when it served the question,
  record when the answer arrived, and treat the difference as the response time. Network latency adds
  noise, so fluency thresholds should be generous or computed with a small allowance.
- **Answer exposure.** The correct answer sits in client memory. In BidaZoo it must not leave the
  server until grading (already enforced by `toPublicQuestion` and the contracts boundary test).
- **Mastery from untrusted input.** Mastery here is a pure function of data the client supplies.
  The same function is safe when the server supplies the data.

### 4.4 Test approach worth keeping

Tests that assert properties instead of single cases are cheap and strong: for example, "for every
family and seed in a range, the answer is among the choices exactly once and no two choices
match." The layout tests measure real element boxes and fail on overflow or overlap, rather than
comparing screenshots. When Checkpoint B adds a UI, a similar check should run at BidaZoo's four
Playwright viewports.

## 5. Hop Quest findings

Hop Quest is a plain Node server with JSON-file storage, parent and child identity, and a browser
app. Its identity and token design has good ideas. Its core data model is the problem.

### 5.1 What is good

| Area | What it does | Verdict |
| --- | --- | --- |
| Parent and kid identity | A parent account owns a family. Kids are profiles inside it with a username and optional PIN. The parent can play as a kid. | **REUSE CONCEPT**. This matches BidaZoo's nickname-first, minimal-data direction. |
| PIN handling | The PIN is hashed with scrypt and a salt. Attempts are rate limited per parent. Changing the PIN bumps `pinV`, which revokes outstanding kid tokens. | **REUSE CONCEPT**. The revocation-by-version trick is simple and effective. Use a vetted password-hashing parameter set when it is rebuilt. |
| Kid tokens | HMAC-signed, expiring, carrying the family, kid, and `pinV`. | **REWRITE CLEANLY** (see 5.2: BidaZoo wants server-side sessions in HttpOnly cookies, not bearer tokens in browser storage). |
| Server-side grading | `bank.grade` checks the answer on the server. `publicItem` strips fields to an allowlist, and `reveal` is returned only after grading. | **REUSE CONCEPT**. BidaZoo already has the same design (`toPublicQuestion`, `AnswerResult`). |
| Entitlements | The accounts service holds one entitlements record per user and issues a short-lived Ed25519-signed token. Hop Quest verifies it with the public key only. | **REUSE CONCEPT**. Signed, short-lived, verify-only is the right shape for a future cross-product login. BidaZoo does not build it in Checkpoint B. |
| Plan and daily-cap gates | Free plan limits grade and questions per day. Daily counts respect the family's time zone. | **REUSE CONCEPT**. The time-zone detail matters. |
| Optimistic concurrency | Each kid has a `version`. A stale write gets HTTP 409 with the current record, and the client reloads. | **REUSE CONCEPT**. Server-side, use it on rows where two devices could race. |
| One-time hand-off codes | A signed-in kid gets a random code that lives 2 minutes and is deleted on first use. Another app trades it for a session. | **REUSE CONCEPT**. Persist codes in the database if BidaZoo ever needs this. |
| Rate limiting | A sliding window per named bucket and key (IP, username, parent). Tight limits on login, PIN, redeem, contact. | **REUSE CONCEPT** for the buckets and numbers. **REWRITE CLEANLY** the storage (see 5.2). |
| Client IP | Forwarded-IP headers are trusted only when the connection comes from loopback, meaning the reverse proxy. | **REUSE CONCEPT**. This avoids spoofable `X-Forwarded-For`. |
| Request hygiene | Body size limit (24 KB) with a clean 413, request and header timeouts, CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. | **REUSE CONCEPT**. Not in Checkpoint A (see `SECURITY.md`). Do this during Checkpoint B, using Fastify's own mechanisms. |
| Secret handling | Startup rejects a missing or short secret. | **REUSE CONCEPT**, with one change: do not auto-generate and append a secret to a file. Fail to start instead. |
| Atomic writes (accounts) | Writes a temp file, then renames. | Irrelevant for PostgreSQL. **DO NOT CARRY FORWARD**. |

### 5.2 What does not fit

These are the findings that matter most.

1. **Client-authored persistent state.** `PUT /api/kids/:id` accepts the entire kid state from the
   browser and stores it. `sanitizeState` removes a handful of server-owned fields (`pinHash`,
   `pinSalt`, `version`, `today`, `loot`, and a few more) and caps the size at 400,000 characters.
   Everything else is stored as sent: coins, sparks, inventory, mastery, streaks, badges. The
   browser `app.js` computes all of it: it adds coins for correct answers, daily streak bonuses,
   quest rewards, mini-game rewards, and chest contents, then syncs the result. A user can send
   `coins: 999999` and it will be saved. This is precisely the failure mode in `SECURITY.md`
   ("domain actions, not state"). **DO NOT CARRY FORWARD.**
2. **Grading is not bound to a served question.** `/api/grade` accepts a subject, grade, item id,
   and response. It checks that the answer is right but never checks that the server issued that
   question to this player, nor that it was not already answered. A client can read the bank and
   grade items in any order, and a correct answer can be replayed. In BidaZoo, a session must
   record each served question, and grading must match `sessionId` plus `questionId`, once.
   **REWRITE CLEANLY.**
3. **Rewards are not idempotent.** Cross-game "loot" coins are held on the kid record and cannot
   be replayed safely across retries or devices. BidaZoo rewards need a ledger with a unique
   idempotency key. **REWRITE CLEANLY.**
4. **Tokens in browser storage.** Kid tokens are stored in `localStorage` and sent as bearer
   headers, and the client can read their expiry. They are renewable. Any script injection steals
   them. BidaZoo plans HttpOnly cookies. **REWRITE CLEANLY.**
5. **In-memory limits and hand-off codes.** Fine for a single process. Lost on restart and not
   shared across processes. A restart resets every attacker's budget. **REWRITE CLEANLY** with
   a shared store (the database is enough at BidaZoo's scale).
6. **Whole-file JSON storage.** Each family store is a single file written whole. Two near-
   simultaneous saves can overwrite each other. This is plausible from reading the code. It was not
   reproduced. PostgreSQL transactions replace it. **DO NOT CARRY FORWARD.**
7. **Health endpoint.** `/api/health` always returns 200 and reports configuration (mail on or
   off, admin set, accounts linked, item count). There is no readiness notion and no dependency
   check. Reporting configuration publicly is a small information leak. BidaZoo's `/health` plus
   `/ready` split (503 when the database is down, no error text) is better. **DO NOT CARRY FORWARD.**
8. **Crash policy.** An uncaught exception saves state and exits, relying on an external scheduled
   task to restart. BidaZoo should exit on fatal errors but run under a supervisor that restarts it,
   and the log must go to a real sink. **REUSE CONCEPT** with the supervisor requirement stated.
9. **No automated tests.** The server and the accounts service ship none. **DO NOT CARRY FORWARD.**
   BidaZoo's Vitest and `fastify.inject` approach is the replacement.

### 5.3 Adaptive selection in the browser

`app.js` picks questions by sorting skills into categories (weak, learning, strong) and choosing with
a weighted draw that favors weak skills. It is a reasonable heuristic. **REUSE CONCEPT** only. If
BidaZoo needs adaptive selection, Fact Crew's `priority()` is the better-tested starting point, and
the selection must run on the server.

## 6. Comparison with the Checkpoint A architecture

| Concern | Fact Crew | Hop Quest | BidaZoo (Checkpoint A) |
| --- | --- | --- | --- |
| Who holds the answer key | Browser | Server until grading | Server until grading |
| Who grades | Browser | Server, but unbound to a served question | Server (`gradeResponse`), session binding to come |
| Who owns mastery | Browser | Browser | Server (planned) |
| Who owns XP and coins | Browser | Browser | Server (planned) |
| Persistent state written by | Browser storage | Whole state from the browser | Commands only, server writes |
| Reward idempotency | None | None | Contract field now, ledger later |
| Time measurement | Browser clock | Browser clock | Server clock (planned) |
| Identity | Guest only | Parent plus kid, bearer tokens | Planned: nickname, HttpOnly cookie |
| Storage | Browser storage | JSON files | PostgreSQL with migrations |
| Readiness | None | Always-up health | `/health` and `/ready` with real checks |
| Rate limit store | None | In memory | None yet |
| Pure learning logic | Yes | No (mixed into UI and server) | Yes, enforced by tests |
| Server tests | Engine unit tests | None | Unit, integration, and failure-injection tests |

Checkpoint A matches the safe parts of both references and rejects the unsafe ones. It does not yet
contain any of the learning logic. That arrives only if and when Checkpoint B is approved.

## 7. Authority map for Checkpoint B and later

For each item, the server decides. The browser may only request and animate.

| Item | Owner | How it should work | Source of the idea |
| --- | --- | --- | --- |
| Question choice and order | Server | Seeded selection. Persist the RNG state and the served question in the session. | Fact Crew seeded generation |
| Correct answer | Server | Never sent before grading. | Both, and already in place |
| Attempt record | Server | One row per served question, graded once. A repeat returns the first result. | Rewrite of Hop Quest grading |
| Response time | Server | Measured between serve and receipt. Browser time is ignored. | Fact Crew fluency, made server-side |
| Mastery and review schedule | Server | Leitner state per player and skill, updated in the same transaction as the attempt. | Fact Crew mastery |
| XP | Server | Computed from the attempt result. Never accepted from a request. | Rewrite of both |
| Currency | Server | Append-only ledger. Balance is a sum or a cached value derived from it. | Rewrite of Hop Quest coins |
| Inventory | Server | Purchases and grants are domain actions with idempotency keys. | Rewrite of Hop Quest shop |
| Achievements | Server | Evaluated after an attempt commits. The result is a row, not a flag from the client. | Rewrite of Hop Quest badges |
| Session completion | Server | The server decides when a session ends (count, time, or retry rule). The client cannot declare itself finished. | Rewrite of both |
| Rewards | Server | Issued inside the completion transaction. Duplicate requests return the original grant. | Rewrite of Hop Quest loot |
| Entitlements | Accounts, later | Signed short-lived token, verified only. | Hop Quest and the accounts service |

The client sends `{ sessionId, idempotencyKey, response }` and nothing else. It receives an
`AnswerResult` and animates it. That is the flow Checkpoint A set up:

```text
CLIENT REQUEST -> API VALIDATION -> LEARNING/DOMAIN LOGIC -> DATABASE COMMIT -> RESULT -> CLIENT ANIMATION
```

## 8. Patterns BidaZoo should reject

1. A write endpoint that stores a client-supplied state object (Hop Quest `PUT /api/kids/:id`).
2. Client-side computation of coins, XP, mastery, streaks, badges, inventory, or quest completion.
3. Grading that does not check the question was served to this player and not already answered.
4. Client-measured response time as input to mastery.
5. Answer keys in any payload sent before grading, including "question banks" shipped to the browser.
6. Bearer tokens kept in browser storage.
7. Whole-file JSON persistence, or any storage where concurrent writers can overwrite each other.
8. Rate limits and one-time codes that live only in process memory.
9. Rewards or loot without an idempotency key.
10. A health endpoint that always says "ok" and describes configuration.
11. Auto-generating a missing secret at startup and writing it to disk.
12. Servers with no automated tests.
13. Letting one lucky session grant mastery. Keep Fact Crew's "fluent on at least 2 days" rule.
14. Retry loops without a cap. Keep the 2-retry limit.

## 9. Architecture changes recommended before Checkpoint B

None are blocking, and none were applied. Each is something Checkpoint B's design should decide
first. They are listed so the approval conversation can settle them.

1. **Add a session and attempt model to the design.** Checkpoint A has a `GameSession` contract but
   no tables. Decide the tables (`sessions`, `served_questions`, `attempts`) and the rule "one grade
   per served question" before any endpoint exists. This is the main defense against the Hop Quest
   grading gap.
2. **Decide server-side timing.** Choose how the server records "served at" and "answered at", and
   what allowance it gives for network latency. Fact Crew's 6000 ms threshold needs this.
3. **Choose the free-input policy.** BidaZoo's `PublicQuestion` is multiple choice with positional
   ids. Fact Crew also supports typed numeric answers. If typed answers return, the contract needs
   a new response shape and a normalizer. Defer until a game needs it.
4. **Decide the validation library.** `SECURITY.md` already lists input validation as postponed. The
   first endpoint that accepts a body forces the choice. Pick one before writing it.
5. **Plan the ledger.** XP and currency should be append-only rows with a unique idempotency key,
   not mutable counters. Settle this before the rewards module is built.
6. **Keep the supervisor requirement visible.** Say in `infrastructure/deployment` that the API
   expects a process supervisor, since fatal errors exit.
7. **Fold the security-header and body-limit list from 5.1 into Checkpoint B's scope.** These are
   small, known, and already identified as missing in `SECURITY.md`.
8. **Content tests.** Port Fact Crew's property-style content checks into `content-math` when that
   package gets real content.

No change to the current package layout, the `learning-core` purity rules, or the dependency
direction is needed.

## 10. Boundaries reconfirmed

- `packages/learning-core` depends only on `@bidazoo/contracts`. It has no `window`, `document`,
  `localStorage`, Phaser, Fastify, or database access. This is enforced by `tsconfig` (`types: []`),
  and by `tests/integration/learning-core-purity.test.ts`, which scans the package source.
- Client request types contain no state fields. A compile-time test fails if one appears.
- Nothing from the reference projects was added: no playable question loop, XP or currency awarding,
  inventory, login or account integration, multiplayer, QR controllers, subscriptions, store, or
  second game.

## 11. External validation: Playwright (resolved)

> **Update, October 12, 2026: resolved.** The official Playwright run passed on the Studio PC
> (24 of 24, Playwright's pinned Chromium, no retries). See
> [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md). The text below is the original Checkpoint A-era
> note, kept as history.

**Pending external validation on the studio Windows machine using Playwright's supported Chromium
build.**

The four-viewport browser tests (360x640, 390x844, 820x1180, 1440x900) are configured and listed
(12 tests) but have not been executed, because this sandbox could not download Playwright's
Chromium. The decision is to run them on the studio machine with Playwright's own supported
Chromium, not with a substitute browser. This is not a Checkpoint A failure. It becomes one only
if the real run exposes a problem.

On the studio machine:

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

Record the pass, fail, and skipped counts, the viewport coverage, any console errors, and any Phaser
initialization failure.

## 12. Limits of this review

- Read-only. Nothing was executed from the reference code, so behavior claims are from reading.
- Race conditions in Hop Quest's storage are plausible from the code and were not reproduced.
- The reference question content was not audited for quality or age-appropriateness.
- Card Studio, the games hub, Stripe and email flows, and deployment scripts were skimmed or not read.
- This is an engineering review, not a security audit or legal review. Hop Quest is a live product
  and none of the findings above were acted on, and nothing in production was touched.
