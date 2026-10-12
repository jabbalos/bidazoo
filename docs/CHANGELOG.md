# Changelog

All notable changes, by checkpoint. Dates use US format.

## Tooling after Checkpoint B: portable PostgreSQL for Studio validation (October 12, 2026)

Tooling and docs only. No application, game, schema, or test code changed; the accepted
Checkpoint B baseline (`01b7d41`) is untouched.

### Added

- `scripts\validate-studio.bat -PortablePostgres`: the Studio validation runner can supply its own
  isolated PostgreSQL 16 (portable Windows x64 binaries the user downloads once, kept under
  `%USERPROFILE%\BidaZoo-pg`), so no system-wide PostgreSQL install is needed. 127.0.0.1 only, port
  54329 by default, trust authentication on that loopback-only throwaway cluster, started with
  `pg_ctl` and stopped (only if this run started it) on pass, fail, or Ctrl+C. No elevation, no
  Windows service, no PATH change, no process kill. `-PortableRoot` and `-PgPort` adjust location
  and port. Setup failures exit with code 2.
- The validation summary reports the PostgreSQL mode, version, host, port, portable root, cluster
  status, whether this run started the server, and whether shutdown succeeded.
- `docs/STUDIO-VALIDATION.md` leads with the one-command recommended path; the installed-PostgreSQL
  path stays documented as the alternative.

### Changed

- The database cleanup question (and `-Cleanup`) now runs before the final summary instead of after
  it, because the portable server must still be running for the drops and the summary reports the
  shutdown result. Cleanup rules are unchanged.
- The "psql not found" message now suggests `-PortablePostgres`.
- The writable-folder probe file is removed with `-Force` (needed only where dot-files are hidden).

### Not verified

- The runner has still never run on Windows. See "Static checks" in `docs/STUDIO-VALIDATION.md` for
  what was exercised in the Linux sandbox and what only the Studio PC can show.

## Checkpoint B: first playable server-authoritative vertical slice (October 11, 2026)

### Added

- **Playable game.** Phaser client: Boot -> Choose Animal (Panda, Monkey, Lion; presentation only)
  -> Start Run -> Question with four large answer buttons -> Correct/Incorrect reaction -> next ->
  Results after 10 questions. Resumes after a refresh.
- **API** under `/api/v1`: `POST /guest`, `GET /me`, `POST /play-sessions`,
  `GET /play-sessions/:id`, `POST /play-sessions/:id/question`, `POST /play-sessions/:id/answers`.
  Requests are validated and responses serialized through TypeBox schemas
  (`@fastify/type-provider-typebox`), so private grading data cannot leak.
- **Guest identity:** opaque HttpOnly, SameSite=Lax cookie (Secure and `__Host-` under HTTPS);
  only a SHA-256 hash is stored; same-origin check on state-changing requests.
- **Database** (migrations 0001, 0002): `guest_sessions`, `play_sessions`, `served_questions`,
  `attempts`, `skill_mastery`, `wallet_transactions`, `xp_events`; unique constraints, composite
  foreign keys, a one-open-question-per-session index, and append-only / frozen-row triggers.
  One final grade per served question is enforced by the database.
- **Answer transaction:** one transaction locks the session, handles idempotent replay, grades,
  applies mastery, writes the ledger, and advances or completes the session.
- **Server-measured response time:** `served_at` and `answered_at` are server timestamps;
  `fluent = correct && responseMs <= 6000`; a refresh never resets `served_at`.
- **learning-core** (pure, no dependencies): multiplication fact families, seeded question
  generation with distractors, grading, Leitner mastery with fluent-on-multiple-days, and
  selection with bounded retry, adapted from Fact Crew's algorithms (not its persistence).
- **Rewards:** append-only ledgers; +10 XP and +2 coins per correct answer, +25 XP and +10 coins
  for finishing. XP lives in its own table (`xp_events`).
- **Tests:** 51 learning-core unit tests; 81 integration tests against real PostgreSQL (security,
  ownership, idempotency, concurrency, database guards, gameplay flow, guest cookie model);
  Playwright specs at four viewports; `tests/scripts/api-playthrough.mjs` (live HTTP playthrough
  with database verification) and `tests/scripts/scan-client-bundle.mjs` (built-frontend leak scan).
- Docs updated: README, ARCHITECTURE, SECURITY, GAME-SDK, PRODUCT, `.env.example`.

### Changed

- `learning-core` no longer depends on `contracts`; `contracts` now holds TypeBox schemas.
- `game-sdk` is now a real `BidaZooPlatform` / `BidaZooGame` boundary (was method sketches).
- Removed the Checkpoint A placeholder scenes and the unused `VITE_API_BASE_URL`; the client
  calls `/api` on its own origin (Vite proxies it in dev and preview).

### Found and fixed during verification

- The `game-sdk` workspace failed `tsc` (no DOM lib for `HTMLElement`); fixed.
- A screenshot review found the feedback line ("Not quite. The answer is N") was anchored at the
  left of center and clipped on narrow screens. Fixed (centered, sized to the column).
- A mutation check (removing the session `FOR UPDATE` lock) made the concurrency tests fail as
  intended, confirming they detect the race; the lock was restored.

### Known limitations

- No rate limiting; guest creation is unbounded. No account upgrade, so clearing cookies loses
  progress. Mastery "different days" uses UTC. A replayed answer shows current mastery.
- Database-backed tests skip (loudly) without `TEST_DATABASE_URL`.
- In a GPU-less headless Chromium, Phaser renders on the CPU (measured 14 fps at 360x640, under
  5 fps at 1440x900). Not measured on real devices.
- **Playwright:** the official run (Playwright's pinned Chromium) has NOT been executed:
  execution pending external Studio PC validation. A supplementary run on a different Chromium
  build (141, not the pinned one) is recorded in the checkpoint report and is not a substitute.

## Post-Checkpoint A: reference review (October 11, 2026)

### Added

- `docs/REFERENCE-REVIEW.md`: read-only review of the Hop Quest and Fact Crew source archive, with
  each item classified REUSE CONCEPT, ADAPT ALGORITHM, REWRITE CLEANLY, or DO NOT CARRY FORWARD.
  No reference code was copied. No code changed.

### Status

- Playwright browser tests: **pending external validation on the studio Windows machine using
  Playwright's supported Chromium build.** Not a Checkpoint A failure unless the real run exposes a
  problem.

## Checkpoint A — Foundation (October 11, 2026)

### Added

- npm-workspaces monorepo: `apps/`, `packages/`, `games/`, `database/`, `tests/`.
- `apps/api`: Fastify API with `GET /health` and `GET /ready`, config loading that never echoes
  secret values, log redaction, graceful shutdown, and empty module plugins for `identity`,
  `players`, `learning`, `sessions`, `rewards`, `inventory`, `content`, and `analytics`.
- `apps/play`: Vite + Phaser 3 client with a branded, responsive boot screen.
- `database`: Drizzle schema (`players`) and the first generated SQL migration.
- `packages/contracts`: shared DTOs, including `PublicQuestion` (no answer-key fields).
- `packages/learning-core`: seeded RNG, duplicate-free choice building, grading, and the
  public-question projection; pure TypeScript with the boundary enforced by config and tests.
- `packages/game-sdk`: the `BidaZooGame` boundary (types only).
- Placeholders: `apps/portal`, `packages/content-math`, `packages/assets`, `packages/ui`,
  `games/zoo-sprint`.
- Vitest unit and integration tests; Playwright configured for 360x640, 390x844, 820x1180, and 1440x900.
- Documentation: README, ARCHITECTURE, PRODUCT, GAME-SDK, SECURITY, CHANGELOG.

### Fixed during the checkpoint

- The API crashed when PostgreSQL restarted underneath it (an unhandled `pg` pool `error`
  event). Found by stopping Postgres under a running API. The pool now handles the event, the
  API stays up (`/health` 200, `/ready` 503) and recovers on its own. Covered by a regression
  test that was confirmed to fail without the fix.
- `db:migrate` did not read the root `.env` (and failed safe with an empty URL). It now loads it
  with Node's built-in `--env-file-if-exists`.

### Not done

- Playwright tests were configured and listed (12 tests across 4 viewports) but **not executed**:
  the sandbox could not download the Chromium build. Pending external validation on the studio
  Windows machine using Playwright's supported Chromium build (`npx playwright install chromium`,
  then `npm run test:e2e`).
- No gameplay, authentication, input validation, CORS, security headers, or rate limiting.
