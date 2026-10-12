# Architecture

Status: Checkpoint B (first playable server-authoritative vertical slice), October 11, 2026;
complete and Studio-PC validated October 12, 2026 (see [PROJECT-STATE.md](PROJECT-STATE.md)).
Checkpoint A (foundation) is recorded in [CHANGELOG.md](CHANGELOG.md); sections that changed
since then say so.

BidaZoo is a **modular monolith**: one deployable API process with internal modules, one
PostgreSQL database, and browser clients that only present state. There are no microservices.

## 1. What exists today

One thin, complete vertical slice:

```text
Phaser game -> BidaZoo API -> learning-core -> PostgreSQL -> server grading
   -> mastery + reward transaction -> API result -> Phaser reaction
```

A guest opens the page, picks a starter character (presentation only), and plays a 10-question
multiplication run. Every question, grade, mastery change, and reward is decided and stored by
the server. Nothing else is built (no accounts, store, multiplayer, dashboards, and so on).

## 2. Repository structure

Condensed; `node_modules/`, `dist/`, and `.env` are ignored.

```text
bidazoo/
├── apps/
│   ├── api/                      Fastify API (the only writer of persistent state)
│   │   └── src/
│   │       ├── app.ts            buildApp(): Fastify + TypeBox + cookies + hooks + modules
│   │       ├── config.ts         env parsing (never echoes values)
│   │       ├── context.ts        AppContext: db, clock, cookie settings, allowed origins
│   │       ├── db.ts             pg pool + Drizzle
│   │       ├── server.ts         process entry, wiring, graceful shutdown
│   │       ├── http/             errors.ts (fixed-text errors), hooks.ts (headers, origin check),
│   │       │                     rate-limit.ts (abuse limits), trust-proxy.ts (TRUST_PROXY parsing),
│   │       │                     security-headers.ts (API header set)
│   │       ├── routes/health.ts  /health, /ready
│   │       └── modules/
│   │           ├── identity/     guest cookie sessions: POST /guest, GET /me
│   │           ├── sessions/     play sessions, question serving, the answer transaction
│   │           ├── learning/     persistence of learning-core mastery decisions
│   │           ├── rewards/      append-only ledger + reward policy
│   │           └── players, inventory, content, analytics   (empty placeholders)
│   ├── play/                     Vite shell: mounts the game, implements the HTTP platform
│   └── portal/                   placeholder
├── database/
│   ├── schema/                   players, guest-sessions, play-sessions, served-questions,
│   │                             attempts, skill-mastery, ledger (wallet + xp)
│   └── migrations/               0000 players, 0001 slice tables, 0002 append-only guards
├── games/zoo-sprint/             Phaser scenes (Boot, Menu, Run, Results); talks only to game-sdk
├── packages/
│   ├── contracts/                TypeBox schemas = the public API contract (+ ./paths)
│   ├── learning-core/            pure TypeScript learning engine (no dependencies)
│   ├── game-sdk/                 BidaZooPlatform / BidaZooGame boundary (types only)
│   └── content-math, assets, ui  placeholders
├── tests/
│   ├── integration/              Vitest; real PostgreSQL via TEST_DATABASE_URL
│   ├── e2e/                      Playwright specs and config
│   └── scripts/                  api-playthrough.mjs, scan-client-bundle.mjs
└── docs/
```

## 3. Package responsibilities

| Workspace | Responsibility | May depend on |
| --- | --- | --- |
| `apps/play` | Shell: mounts the game into `#game`, implements `BidaZooPlatform` over `fetch`. Presentation only. | `game-sdk`, `zoo-sprint`, `contracts/paths` |
| `games/zoo-sprint` | The Phaser game. Knows nothing about the database, cookies, or mastery. | `game-sdk`, `phaser` |
| `apps/api` | Authoritative API. Owns all persistent state changes. | `contracts`, `database`, `learning-core`, `fastify`, `pg`, `drizzle-orm`, `typebox` |
| `packages/contracts` | The one home for public request/response shapes, as TypeBox schemas. | `typebox` |
| `packages/learning-core` | Pure learning engine (section 8). | nothing (not even workspace packages) |
| `packages/game-sdk` | The game/platform boundary (section 9). Types only. | `contracts` |
| `database` | Drizzle schema and SQL migrations (PostgreSQL). | `drizzle-orm` |
| `tests` | Integration (Vitest) and browser (Playwright) tests, plus verification scripts. | anything, as a test consumer |
| `apps/portal`, `content-math`, `assets`, `ui` | Placeholders. Nothing implemented. | nothing |

Workspace packages export TypeScript source directly. Vite, Vitest, and `tsx` consume that
natively. The API's production build uses esbuild to inline the `@bidazoo/*` packages and keep
real third-party dependencies external (`apps/api/build.mjs`).

Changed since Checkpoint A: `learning-core` previously allowed type imports from `contracts`.
It now has **no dependencies at all**, because its question and grading types are its own and
the API maps them to the public contract. This keeps the engine reusable and trivially pure.

## 4. Trust boundaries

```text
 UNTRUSTED                                  TRUSTED
+------------------------+   HTTP    +------------------------------------+
| Browser                |  (JSON,   | API (Fastify)                      |
|  - Phaser presentation | cookie)   |  1. authenticate guest cookie      |
|  - animation, sound,   | --------> |  2. validate (TypeBox, strict)     |
|    menus               |           |  3. decide (learning-core)         |
|  - animal choice       | <-------- |  4. commit (ONE transaction)       |
+------------------------+  facts    |  5. serialize via response schema  |
                                     +----------------+-------------------+
                                                      |
                                                 +----v-----+
                                                 | Postgres |  constraints, triggers
                                                 +----------+
```

Everything on the left can be modified by the person using it, so nothing on the left is
believed. See [SECURITY.md](SECURITY.md).

| Concern | Server | Browser |
| --- | --- | --- |
| Question generation, answer key, grading | Owns | Never receives the key before grading |
| Response time (`served_at` to `answered_at`) | Owns, both ends are server clocks | Cannot send one |
| Attempts, mastery, next review date | Owns | Displays the summary |
| XP and coins | Owns (append-only ledger) | Displays what the server committed |
| Session progress, completion, results | Owns | Displays |
| Guest identity | Owns (hashed token in DB) | Holds an opaque HttpOnly cookie it cannot read |
| Animation, camera, sound, menu state | none | Owns |
| Which starter the child picked | none | Owns (localStorage, presentation only) |

## 5. Database

PostgreSQL 16 via Drizzle ORM. Migrations are generated by `drizzle-kit` into
`database/migrations` and committed; `0002_append_only_guards.sql` is hand-written SQL for
triggers that Drizzle cannot express. Applied and verified on a real PostgreSQL 16.

| Table | Purpose | Key guarantees |
| --- | --- | --- |
| `players` | A child's identity: opaque uuid, nickname. | Nothing about real-world identity. |
| `guest_sessions` | One row per guest cookie. Stores the **SHA-256 hash** of the token, never the token. | `unique(token_hash)`; `expires_at`, `revoked_at`. |
| `play_sessions` | A 10-question run. `status` active/completed/expired, `seed`, counters, `expires_at`. | Partial unique index: **one active session per (player, game)**. `unique(id, player_id)` is the target of composite FKs. Check constraints on counters and status. |
| `served_questions` | Each question the server issued: `public_payload` (what the client got), `private_grading_data` (answer key and skill key), `served_at`, `answered_at`. | `unique(play_session_id, sequence)`; partial unique index: **one open (unanswered) question per session**; a trigger freezes the row except for `answered_at` going from NULL to a value once. |
| `attempts` | The one final grade of a question. | `unique(served_question_id)` (**one grade per question, enforced by the database**); `unique(player_id, idempotency_key)`; composite FKs `(served_question_id, play_session_id)` and `(play_session_id, player_id)`, so an attempt cannot reference a question from another session or player; append-only trigger. |
| `skill_mastery` | Per player and fact: Leitner box, streak, attempts, fluent days, `next_review_at`, `mastered_at`. | PK `(player_id, skill_key)`; check constraints on ranges. |
| `wallet_transactions` | Append-only coin ledger: `id, player_id, currency, amount, reason, source_type, source_id, idempotency_key, created_at` (plus `play_session_id` for reporting). | `currency in ('coins')`, `amount <> 0`; `unique(idempotency_key)`; `unique(source_type, source_id, reason, currency)`; append-only trigger. |
| `xp_events` | Append-only XP ledger, same shape without `currency`. | `amount > 0`; the same two uniqueness rules; append-only trigger. |

Design notes:

- **Why XP has its own table.** XP is monotonic progress, not spendable money. A separate table
  lets `wallet_transactions` keep a strict `currency` check and allow negative amounts later
  (purchases) without XP ever being able to go down. Both are append-only with the same
  idempotency rules. Totals are `SUM(amount)`; there are no mutable counters.
- **Frozen rows.** A trigger refuses every `UPDATE` on `attempts`, `wallet_transactions`, and
  `xp_events`, and refuses `DELETE` unless a deliberate erasure routine opens its transaction
  with `SET LOCAL bidazoo.allow_erasure = 'on'` (reserved for a future "delete this child's
  data" job; none exists). `served_questions` rejects any change except stamping `answered_at`
  once. Even a bug in application code cannot rewrite history.
- **Composite foreign keys** make cross-session and cross-player references structurally
  impossible rather than merely checked in code.

## 6. Request flow

All routes are under `/api/v1`. Shapes live in `packages/contracts`.

| Route | Purpose |
| --- | --- |
| `POST /guest` | Create a guest and set the cookie, or reconnect the existing one. Body `{}`. |
| `GET /me` | The guest's player, XP and coin totals, and `activeSessionId`. |
| `POST /play-sessions` | Start a 10-question multiplication run, or **resume** the active one (201 created, 200 resumed). |
| `GET /play-sessions/:id` | Session progress, current question, and results once completed. |
| `POST /play-sessions/:id/question` | Issue the next question, or return the outstanding one **unchanged**. Body `{}`. |
| `POST /play-sessions/:id/answers` | `{attemptId, questionId, response}` -> `AnswerResult`. |

### Question-serving model

`served_at` is stamped **once**, when the server issues a question, and stored. Asking again (a
refresh, a retry) returns the same row with the same `served_at`, so a refresh cannot reset the
clock or reroll a question. A new question is issued only when none is open. The answer response
intentionally returns `currentQuestion: null`; the client requests the next question after its
feedback animation, so animation time is never counted as thinking time.

### Server response-time model

`responseMs = answered_at - served_at`, both taken from the server's clock. The request has no
duration field, and a body containing one is rejected (400). `fluent = correct && responseMs <=
6000`. Network latency therefore counts against the child by a few hundred milliseconds at most;
that is a deliberate, documented trade-off for not trusting the client.

### Answer transaction

One database transaction does everything, in this order:

1. Lock the `play_sessions` row (`SELECT ... FOR UPDATE`, filtered by owner). A missing session
   and someone else's session are both 404, so existence is not leaked.
2. **Idempotent replay:** look up `(player_id, attemptId)`. If found with the same session,
   question, and response, return the stored result (`replayed: true`, no new rows). If found
   with different content, 409 `idempotency_key_conflict`.
3. Check the session is active (lazily expiring it if it is past `expires_at`).
4. The question must belong to this session (else 404) and must not already be answered (else
   409 `question_already_answered`, with no rewards even under a different key).
5. Grade against the **offered** choices. A value that was never offered is 422
   `invalid_response` and does not consume the question.
6. Compute `responseMs`, apply the mastery transition (learning-core), insert the attempt, and
   upsert `skill_mastery`.
7. Insert the ledger rows (`ON CONFLICT DO NOTHING` on the idempotency and source keys), stamp
   `answered_at`, and advance the session. On the 10th answer, complete the session and add the
   completion bonus.

Concurrency: the session row lock serializes concurrent requests for the same session, and the
unique constraints are a second, independent line of defense (a violation maps to 409). Eight
simultaneous identical submissions produce one attempt, one mastery change, and one reward set.
See `tests/integration/idempotency-concurrency.test.ts` and the checkpoint report.

### Reward policy

Correct answer: +10 XP, +2 coins. Completing a session: +25 XP, +10 coins. A perfect run is 125
XP and 30 coins. The policy lives in `apps/api/src/modules/rewards/policy.ts`; the client only
displays what the server returns. A completed, expired, or abandoned session can never mint
further rewards, because every ledger row is tied to a unique source (one specific attempt, or
the session's completion).

## 7. Guest identity

A guest is a `players` row plus a `guest_sessions` row. The browser receives a random 32-byte
token (base64url) as a cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 90 days, and
`Secure` plus the `__Host-` name prefix under HTTPS or production (`COOKIE_SECURE`). Only the
SHA-256 hash is stored, so a database leak does not yield usable cookies. There is no bearer
token and nothing in `localStorage`. A refresh sends the cookie and reconnects to the same
player. Non-GET requests under `/api/v1` must be same-origin (`Origin` matches `Host`, or is in
`ALLOWED_ORIGINS`). There are no parent accounts and no Accounts-service integration.

## 8. Learning-core

`packages/learning-core` is pure TypeScript with **no dependencies**. It must not use
`document`, `window`, `localStorage`, Phaser, a database, or Fastify. This is enforced three
ways: its `tsconfig` has neither the DOM lib nor Node types, its `package.json` declares no
dependencies, and `tests/integration/learning-core-purity.test.ts` scans the source for
forbidden imports and globals.

| Module | Contents |
| --- | --- |
| `multiplication.ts` | Fact families: unordered factor pairs 2..9 (36 facts), skill key `mul:AxB` with A <= B. |
| `question.ts` | `generateQuestion(skillKey, seed, {avoidAnswerIndex})`: seeded and deterministic; distractors (neighbor multiples, a+b, +/-10, +/-1, reversed digits, fill-ins); four distinct choices. |
| `grading.ts` | `gradeAnswer(offered, correctAnswer, response)`: `invalid` or `graded`. |
| `mastery.ts` | `applyAttempt(previous, {correct, responseMs, now})`: the Leitner transition. |
| `selection.ts` | `selectNextSkill(...)`: new, due, review, or retry. |
| `rng.ts` | `mulberry32` seeded generator. |

It computes decisions and never persists them. Storing them is `apps/api/src/modules/learning`.

### Fact Crew mastery adaptation

Adapted from Fact Crew's *algorithms* (see [REFERENCE-REVIEW.md](REFERENCE-REVIEW.md)), not its
client-side persistence:

- Leitner boxes 0 to 5 with review gaps of `[0, 0, 1, 3, 7, 21]` days.
- A correct answer advances one box and extends the streak; a miss drops to box 0 and resets the
  streak. Fluent means correct within 6000 ms, as timed by the server.
- A fact is **mastered** at box >= 4, streak >= 3, and fluent on **2 or more different UTC days**,
  so cramming in one sitting cannot master a fact. A miss after mastery clears mastery.
- Selection priority: unseen facts 50; due facts 60 plus overdue time, a missed-last bonus, and a
  box bonus; mastered-and-not-due facts are deprioritized (-80).
- Bounded retry: a missed fact may return after at least 2 other questions, at most twice per
  fact and 3 times per session. New facts are capped at 4 per session while seen facts remain,
  easiest first with jitter.

## 9. Game SDK boundary

A game receives a `BidaZooPlatform` (`ensureGuest`, `startSession`, `getSession`, `nextQuestion`,
`submitAnswer`) and exposes `BidaZooGame.mount`. `apps/play` implements the platform over HTTP;
tests can implement it in memory. The game never sees SQL, cookies, or token handling. Details
in [GAME-SDK.md](GAME-SDK.md).

## 10. Client

`games/zoo-sprint` is a Phaser 3 game (scenes: Boot, Menu, Run, Results) drawn with primitives
as placeholder graphics. Layout is recomputed from the real size on every state change and
resize, so portrait is first-class. For tests and accessibility it publishes two things on the
page: a visually hidden real-DOM mirror (`#bz-a11y`: a status line and real buttons), and data
attributes on `#game` (`data-scene`, `data-phase`, `data-progress`, `data-question-id`, and
`data-hit-targets` as top-left x/y/w/h). Neither carries anything that is not already on screen.

Mobile requirements, checked by `tests/e2e/play.spec.ts`: the question and all four answer
buttons are visible without scrolling at 360x640, 390x844, 820x1180, and 1440x900; each tap
target is at least 44 CSS px; nothing needs hover.

## 11. Testing strategy

| Layer | Tool | Location |
| --- | --- | --- |
| Unit (learning-core) | Vitest | `packages/learning-core/src/*.test.ts` |
| API + database integration | Vitest + Fastify `inject` + **real PostgreSQL** | `tests/integration` (need `TEST_DATABASE_URL`; they skip loudly without it) |
| Concurrency and idempotency | Vitest, real concurrent transactions | `tests/integration/idempotency-concurrency.test.ts` |
| Live API playthrough | Node script over real HTTP | `tests/scripts/api-playthrough.mjs` |
| Built-frontend leak scan | Node script | `tests/scripts/scan-client-bundle.mjs` |
| Browser | Playwright (Chromium) | `tests/e2e` |

A fake clock (`FakeClock`) drives timing and multi-day mastery tests. Test files run serially
(`fileParallelism: false`) because they share one database.

Playwright status: **official validation passed on the Studio PC on October 12, 2026**, for
Checkpoint B (24 of 24 tests, commit `d0345bf`) and again for Checkpoint C (40 of 40 tests, 51 unit
and 88 integration Vitest tests, commit `01752a1`, which differs from the Checkpoint C
implementation `7042f8f` only by documentation and reference art); Playwright 1.64.0 with its
pinned Chromium 156.0.8078.4, no retries. The earlier supplementary run on a different Chromium build is superseded. The full
record is in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md).

## 12. Deployment direction

Not decided and not implemented. The intent is a single Node process (the bundled API) plus
PostgreSQL, with the Vite build served as static files, same-origin with the API. Nothing in this
repository touches Hop Quest, Fact Crew, jonabalos.com Accounts, the Clickaroo Games Hub, Caddy,
Cloudflare, or any production service.

## 13. Decisions intentionally postponed

- **Authentication beyond guests**, parental consent, and COPPA-style review. Needs legal review;
  this is not legal advice. Guest upgrade and merge are undesigned.
- **Integration with existing jonabalos.com Accounts.** Out of scope.
- **A shared (multi-process) rate-limit store, CAPTCHA, and distributed-attack defense.** Checkpoint D
  added in-process rate limits and a service-wide new-guest breaker (see SECURITY.md); anything that
  needs new infrastructure is deferred.
- **CSRF beyond the same-origin check**, and a CORS story for a cross-origin deployment.
- **Spendable currency flows** (store, inventory, refunds). The ledger can hold negative amounts;
  nothing spends.
- **Hosting, domains, CI, backups, and data retention and deletion**, including purging old guests.
- **The mastery calendar day.** It is the UTC day; a per-player time zone is undecided.
- **Content authoring**, how `content-math` is structured, and other operations and skills.
- **Linting and formatting**, and **WebKit/Firefox** browser coverage.
- **Analytics** content and retention.

## 14. Deviations

Checkpoint A (unchanged):

| # | Deviation | Why |
| --- | --- | --- |
| 1 | `database/` and `tests/` are npm workspaces. | Lets the API import the schema, and tests import the API, by package name. |
| 2 | Phaser is `^3.90.0`, not 4.x. | The spec requires Phaser 3. |
| 3 | TypeScript is `^5.9.3`. | A mature line; revisit deliberately. |
| 4 | `@types/node` is `^22`. | Types should match the runtime. |
| 5 | Extra dev dependencies: `esbuild`, `tsx`, `concurrently`. | See the dependency table. |
| 6 | `.editorconfig` and `.nvmrc`. | Prevent line-ending and Node-version drift. |
| 7 | `apps/api` exposes `./db` as well as `./app`. | Lets tests cover the database pool. |
| 8 | `infrastructure/` contains READMEs only. | Nothing to deploy yet. |

Checkpoint B:

| # | Deviation | Why |
| --- | --- | --- |
| 9 | `contracts` now depends on `typebox`; `learning-core` no longer depends on `contracts`. | The spec requires TypeBox schemas as the single contract; learning-core stays dependency-free. |
| 10 | XP lives in `xp_events`, not `wallet_transactions`. | The spec allows it; see the design notes in section 5. |
| 11 | `POST /play-sessions/:id/question` exists in addition to the `/answers` endpoint. | Server-measured timing needs an explicit "issue" moment so `served_at` is stamped once and a refresh cannot reset it. |
| 12 | Tests that touch the database skip when `TEST_DATABASE_URL` is unset. | The suite still runs on a machine without PostgreSQL; the skip is loud, never silent. |

Checkpoint D (security gate; no gameplay, grading, reward, mastery, timing, or identity change):

| # | Deviation | Why |
| --- | --- | --- |
| 13 | `contracts` gained two error codes, `rate_limited` and `service_busy`. | The error envelope is a closed schema; a 429 or 503 must be a valid, typed response. |
| 14 | `TRUST_PROXY` accepts proxy addresses only; `true` and hop counts are refused. | Fastify fails closed on a bare number; a hop count cannot verify the immediate peer. |
| 15 | The client Content-Security-Policy is defined once in `apps/play/security-headers.ts` and applied by `vite preview` (headers) and the production build (an embedded `<meta>`). | The API does not serve the client, and hosting is undecided; this keeps enforcement independent of the host. |
| 16 | `apps/api` exposes `./config` and `./rate-limit`. | Lets tests cover configuration parsing and the default limits. |

## 15. Dependencies that are not obvious

| Package | Where | Why |
| --- | --- | --- |
| `drizzle-orm`, `drizzle-kit` | `database`, `api` | Required by the spec. `drizzle-kit` generates SQL migrations. |
| `pg` | `api` | Driver for Drizzle's `node-postgres` adapter. |
| `typebox`, `@fastify/type-provider-typebox` | `contracts`, `api` | One schema validates requests, serializes responses (so private fields cannot leak), and types the client. |
| `@fastify/rate-limit` | `api` | Checkpoint D abuse limits. Fastify-native and maintained by the Fastify organization, targets Fastify 5, four small dependencies, in-memory store (no new infrastructure). See SECURITY.md. |
| `@fastify/cookie`, `ajv-formats` | `api` | Guest cookie parsing and setting; `uuid` and `date-time` formats. |
| `esbuild`, `tsx` | `api` (dev) | Bundle the API; run TypeScript in dev. |
| `concurrently` | root (dev) | Runs the API and client dev servers together on every OS, including Windows. |
| `vitest`, `@playwright/test` | dev | Required by the spec. |

Known audit note: `npm audit` reports moderate findings that are dev-only and come via
`drizzle-kit`'s deprecated `@esbuild-kit` dependency. `npm audit --omit=dev` is the number that
matters for production. The suggested `--force` fix would downgrade `drizzle-kit`, so it was not
applied; revisit when `drizzle-kit` ships a fix.
