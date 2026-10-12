# Changelog

All notable changes, by checkpoint. Dates use US format.

## Checkpoint D closure: Studio-PC validated (October 12, 2026)

Documentation only. Checkpoint D (public-beta security gate) is **COMPLETE**. The exact commit that
was Studio validated is `52547a356bdde6397c4b576381c30efff05e1d6e` (the validator tooling update on
top of `7dd9136`); this closure documentation commit came after it and was not itself validated.
Official run: October 12, 2026, run folder `.validation-logs\20261012-130626`, normal user,
`scripts\validate-studio.bat -PortablePostgres`, exit code 0, overall PASS, no count warnings.

- Unit 51 passed; integration 115 passed + 3 todo; Playwright 56 passed, 4 projects, 0 failed,
  0 flaky, no retries.
- Playwright 1.64.0; Chromium 156.0.8078.4; PostgreSQL 16.15 (portable, 127.0.0.1:54329, shutdown ok).
- Production build PASS; client bundle scan CLEAN (3 files, 1,228,557 bytes, 20 forbidden markers);
  live API playthrough ALL CHECKS PASSED (39 PASS lines).
- Checkpoint D history: `524f2e8` implementation, `2eb2970` tests, `abde130` validator counts,
  `7dd9136` documentation (pending-validation state), `52547a3` validator tooling update (build,
  `scan:client`, and live API playthrough steps; docs) and exact validated commit.
- Status wording that said "awaiting Studio validation" in the entry below is superseded by this entry.

## Checkpoint D: public-beta security gate (October 12, 2026; implemented; validated, see the closure entry above)

No change to gameplay, question generation, grading, `served_at` timing, idempotency, mastery, XP,
coins, session completion, guest identity, or ownership. Commits `524f2e8` (implementation),
`2eb2970` (tests), `abde130` (validator counts), `7dd9136` (documentation), `52547a3` (validator tooling).

### Added

- Rate limiting with `@fastify/rate-limit` (in-memory, no new infrastructure): per-IP guest creation
  (burst and hourly tiers), per-guest session start and answers, an API-wide per-IP backstop, and a
  service-wide new-guest circuit breaker that counts only per-IP-admitted creations and never
  affects existing guests. Limits run before any write; a throttled request mutates nothing.
- Stable error envelope: HTTP 429 `rate_limited` and HTTP 503 `service_busy`, both with `Retry-After`
  (two new error codes in `packages/contracts`).
- `TRUST_PROXY`: an explicit proxy-address list only; `true` and hop counts are refused.
- Environment configuration for every limit (`RATE_*`), `RATE_LIMIT_ENABLED`, `RATE_CACHE_SIZE`, and
  opt-in `HSTS_MAX_AGE_SECONDS`.
- API security headers on every response: CSP `default-src 'none'`, `X-Frame-Options`, COOP,
  Permissions-Policy (plus the existing three).
- An enforced client CSP (no `'unsafe-inline'`, `'unsafe-eval'`, wildcard, or remote origin), defined
  once in `apps/play/security-headers.ts`: sent by `vite preview`, embedded as a `<meta>` in the
  production build.
- Tests: 27 integration (config, headers, limits, breaker, proxy trust, no-mutation, idempotent
  retry, shared IP, normal play under defaults) and 16 Playwright (4 per viewport), plus an auto
  guard that fails every browser test on any CSP violation, console error, page error, or 429/503.

### Changed

- `apps/play/index.html`: the inline `<style>` moved to `src/styles.css`; the accessibility mirror
  sets its style through the DOM style API. Both were needed for `style-src 'self'`.
- Validator expected counts: integration 88 -> 115, Playwright 40 -> 56 (unit 51, todo 3, projects 4,
  baseline `01b7d41` unchanged).
- `.env.example` documents the new variables.

### Verification before the official run (sandbox only; the official Studio-PC result is in the closure entry above)

- Sandbox, supplementary Chromium 153: Vitest unit 51, integration 115 (+3 todo); Playwright 56 of
  56 on four viewports, no retries, no flaky; `scan:client` clean; live API playthrough passed.
- Closed by the official Studio-PC run recorded in the closure entry above. This sandbox entry is not itself the validation.

### Known limits

- Limiter state is in memory (per process, lost on restart); windows are tumbling; many-address
  attackers can still open the service-wide breaker; no CAPTCHA. See SECURITY.md.

## Checkpoint C closure: Studio-PC validated (October 12, 2026)

Documentation only. No application, game, schema, API, database, learning, test, or tooling code
changed.

- Checkpoint C passed official Studio-PC validation: run `20261012-114342`, commit
  `01752a1df4a4c0dbce41415027971b41540cb4dd`.
- Game implementation commit: `7042f8f`. The validated commit differs from it only by the
  documentation and reference-art addition `docs/reference-art/bidazoo-character-roster-reference.png`.
- Results: Vitest unit 51 passed (51); integration 88 passed, 3 todo (91); Playwright 40 passed,
  0 failed, 0 flaky, 0 skipped, no retries, 4 viewports; Playwright 1.64.0, Chromium 156.0.8078.4
  (official pinned build); PostgreSQL 16.15 portable; `npm ci`, database creation, migrations,
  startup, and shutdown all passed; exit code 0.
- The runner warned that integration (expected 81, now 88) and Playwright (expected 24, now 40)
  differ from its Checkpoint B approved counts. These are the intentional Checkpoint C test
  additions. The runner's expected counts have not been updated.
- `01b7d41` remains the accepted Checkpoint B application baseline.
- All known limitations and deferred hardening items are unchanged (see PROJECT-STATE.md).

## Checkpoint C: five starters, presentation only (October 12, 2026)

Presentation-only change to `games/zoo-sprint` and its tests. No change to `apps/api`, `database`,
`packages/contracts`, `packages/learning-core`, `packages/game-sdk`, question generation, grading,
`served_at` timing, idempotency, mastery, XP, coins, session completion, guest identity, or
ownership enforcement.

### Added

- `roster.ts`: the five locked starters (Dino, Koala, Tarsier, Eagle, Bronco), Dino as default,
  and a safe load/save of the choice (legacy `panda`, `monkey`, `lion`, or junk values fall back to
  Dino with no migration; blocked storage never throws).
- Code-drawn transitional art for each starter honoring the locked anchors, cached as one texture
  per character and mood (no filters or particles).
- Menu as a responsive grid (about 2 columns on small phones, vertical scroll, 3 on tablet, 5 on
  desktop), with 44 px or larger targets, a clear selected state, and a pinned Start/Continue.
- Tests: 7 integration tests for the roster; new e2e menu tests (roster and Click, targets and
  overflow at 360x640 and 390x844, tap-select plus reload persistence, legacy fallback, scrolling).

### Changed

- `animals.ts` renamed to `characters.ts`; `GameContext.animal` became `character`.
- Run and Results scenes draw the selected starter.
- The full-run e2e test now plays as Eagle, asserts the starter on results, and asserts that no API
  request carries any character data.
- The old Panda/Monkey/Lion menu e2e test was replaced by the stronger tests above; its "no
  scrolling" assertion was relaxed per the grid decision (vertical scroll is allowed on small phones).

### Verification

- Development sandbox: typecheck, build, and client-bundle leak scan passed; Vitest unit 51 and
  integration 88 (3 todo) passed; Playwright 40 passed on a supplementary Chromium 153. Not official.
- **Official Studio-PC validation passed**; see the closure entry above.

### Not done

- Click, host behavior, dialogue, tutorial, placement, character animation beyond idle/celebrate/
  wobble, final art, rate limiting, security hardening, accounts, store, multiplayer.

## Character bible (October 12, 2026)

Documentation only. No application, game, schema, test, API, database, or tooling code changed.

### Added

- `docs/CHARACTER-BIBLE.md`: the locked character identity decisions. Click (orange/tan kangaroo
  host, not selectable) and exactly five selectable starters (Dino, Koala, Tarsier, Eagle,
  Bronco), with the academic-equivalence rule, the originality rules, and non-binding guidance for
  future asset formats and the mobile selection experience.

### Changed

- Links to the bible from `docs/PROJECT-STATE.md`, `README.md`, and `docs/STUDIO-VALIDATION.md`
  (which previously mentioned a "locked character system" without a source).

### Not done

- The game still draws placeholder Panda, Monkey, and Lion shapes; the code has not been changed to
  match the new roster. Checkpoint C has not started and is not authorized.

## Checkpoint B closure: complete and Studio-validated (October 12, 2026)

Documentation only. No application, game, schema, test, API, database, or tooling code changed.

### Status

- **Checkpoint B is COMPLETE** and **officially Studio-PC validated**.
- Accepted application baseline: `01b7d41` (unchanged).
- `d0345bf` is validation tooling and docs on top of that baseline (the portable PostgreSQL option
  for the Studio runner). It is the commit that was tested.
- Official validation: run `20261012-092607`, non-elevated, tested commit `d0345bf`. Vitest 51 passed
  and 81 passed with 3 todo (exit 0); Playwright 24 passed, 0 failed, 0 flaky, 0 skipped, no retries
  (Playwright 1.64.0, Chromium 156.0.8078.4, exit 0); PostgreSQL 16.15 portable on 127.0.0.1:54329;
  `npm ci`, migrations, and PostgreSQL startup and shutdown all passed; overall PASS. Details in
  `docs/STUDIO-VALIDATION.md`.
- Known limitations are unchanged and remain recorded. Pre-beta hardening is a separate checkpoint
  and is **not** authorized. Checkpoint C is **not** authorized.

### Added

- `docs/PROJECT-STATE.md`: the short authoritative entry point for future sessions.

### Changed

- `README.md`: status line, and a docs-table row for `PROJECT-STATE.md`.
- `docs/STUDIO-VALIDATION.md`: status changed from pending to complete, with the validation record.
  The stale "never run on Windows" and "first Studio run must show" wording is updated, the manual
  procedure checks out the validated commit, and the Studio-validation hardening item is marked done.
- `docs/ARCHITECTURE.md`: status line and the Playwright status paragraph.
- `docs/REFERENCE-REVIEW.md`: section 11 marked resolved (original text kept as history).
- This file: notes on the superseded "pending" statements below.

### Provenance

This closure was written as a **new** documentation-only commit from the repository and the real
Studio validation logs. An earlier closure commit (`446092a`) was recorded in a development session
but is not present in this repository; this record is not claimed to be identical to it.

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

- (Superseded October 12, 2026: the runner has since run on the Studio PC; see the closure entry above.)
  The runner had still never run on Windows. See "Static checks" in `docs/STUDIO-VALIDATION.md` for
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
  execution pending external Studio PC validation (resolved October 12, 2026: official run passed,
  see the closure entry above). A supplementary run on a different Chromium
  build (141, not the pinned one) is recorded in the checkpoint report and is not a substitute.

## Post-Checkpoint A: reference review (October 11, 2026)

### Added

- `docs/REFERENCE-REVIEW.md`: read-only review of the Hop Quest and Fact Crew source archive, with
  each item classified REUSE CONCEPT, ADAPT ALGORITHM, REWRITE CLEANLY, or DO NOT CARRY FORWARD.
  No reference code was copied. No code changed.

### Status

- (Resolved October 12, 2026: passed; see the closure entry above.) Playwright browser tests: **pending external validation on the studio Windows machine using
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
  the sandbox could not download the Chromium build. (Resolved October 12, 2026: passed.) Pending external validation on the studio
  Windows machine using Playwright's supported Chromium build (`npx playwright install chromium`,
  then `npm run test:e2e`).
- No gameplay, authentication, input validation, CORS, security headers, or rate limiting.
