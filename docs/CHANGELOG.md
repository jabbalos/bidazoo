# Changelog

All notable changes, by checkpoint. Dates use US format.

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
