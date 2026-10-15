# BidaZoo

An educational-game platform for kids. Games are fun; **learning progress is decided by the server**.

> **Status: Checkpoint B is COMPLETE and Studio-PC validated** (accepted baseline `01b7d41`).
> Checkpoint C (five-starter presentation, implementation `7042f8f`) is also COMPLETE and
> Studio-PC validated. Checkpoint D (public-beta security gate: rate limits, proxy trust, CSP) is
> also COMPLETE and Studio-PC validated (October 12, 2026; validated commit `52547a3`). Start with
> [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md).
> Checkpoint B is a first playable slice: a guest can open the page, pick a starter, and play a
> 10-question multiplication run. Every question, grade, mastery update, and reward is decided and
> stored by the server in PostgreSQL; the Phaser client only presents it.
> Checkpoint E (family identity) is COMPLETE and Studio-PC validated (validated commit `a283c24`) and
> is **on `main`** (`856d012`), but it is NOT deployed and identity is NOT enabled in production; see
> [docs/IDENTITY.md](docs/IDENTITY.md). Identity is off unless `IDENTITY_SECRET` is set.
> Checkpoints F1 to F6 (World Expedition production character art and runtime integration) are CLOSED
> (F6: PASS WITH MINOR ITEMS) on the branch `feature/world-expedition-runtime-integration`
> (`f3b5483`), **not yet merged into `main`**; `main` still has the code-drawn starter art. The
> runtime is ready for release-candidate integration.
> A guest-only closed beta is live at `play.bidazoo.com` on the Studio PC (commit `1a106bc`); see
> [docs/DEPLOYMENT-CLOSED-BETA.md](docs/DEPLOYMENT-CLOSED-BETA.md). That is a closed-beta
> architecture, not necessarily the final production architecture.
> Not built: store, multiplayer, dashboards (see "Out of scope").
> The repository and the files in [`docs/`](docs/) are the project memory, not chat history.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) | **Start here.** Short authoritative status: what is complete, the accepted baseline, validation evidence, invariants, limitations, and what is not authorized |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structure, tables, request flow, idempotency, learning-core, deviations, postponed decisions |
| [docs/SECURITY.md](docs/SECURITY.md) | Trust model, guest cookie, answer secrecy, known limitations |
| [docs/IDENTITY.md](docs/IDENTITY.md) | Checkpoint E family identity: guardians, devices, profiles, PIN, guest claim, audit, throttles |
| [docs/IDENTITY-OPERATIONS.md](docs/IDENTITY-OPERATIONS.md) | Checkpoint E operator runbooks: secret rotation, legacy migration, mail, recovery, release gate |
| [docs/DEPLOYMENT-CLOSED-BETA.md](docs/DEPLOYMENT-CLOSED-BETA.md) | Closed-beta deployment plan and as-built record: `play.bidazoo.com`, Studio PC, Caddy, tunnel, backups |
| [docs/GAME-SDK.md](docs/GAME-SDK.md) | The boundary between a game and the platform |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product intent and scope |
| [docs/CHARACTER-BIBLE.md](docs/CHARACTER-BIBLE.md) | Locked character identity decisions: Click (host) and the five selectable starters |
| [docs/REFERENCE-REVIEW.md](docs/REFERENCE-REVIEW.md) | What BidaZoo may and may not take from Hop Quest and Fact Crew |
| [docs/STUDIO-VALIDATION.md](docs/STUDIO-VALIDATION.md) | Record of the passed official Studio-PC validation, the procedure to repeat it (one command: `scripts\validate-studio.bat -PortablePostgres`), carried-forward limitations, and pre-beta hardening priorities |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | What changed, by checkpoint |

## Requirements

- Node.js 22.12 or newer (`.nvmrc` says 22)
- npm 10+ (workspaces)
- PostgreSQL 16 for local development (see [infrastructure/development](infrastructure/development/README.md))

## Quick start

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL; .env is git-ignored
npm run db:migrate          # apply migrations to DATABASE_URL
npm run dev                 # API on :3001, Phaser client on :5173 (proxies /api to the API)
```

Open `http://127.0.0.1:5173`. On Windows, use `copy .env.example .env` instead of `cp`.

### Running the database-backed tests

The integration tests exercise real PostgreSQL behavior (constraints, triggers, locking). Create a
**throwaway** database, migrate it, and point `TEST_DATABASE_URL` at it:

```bash
createdb bidazoo_test
DATABASE_URL=postgres://.../bidazoo_test npm run db:migrate
TEST_DATABASE_URL=postgres://.../bidazoo_test npm test
```

Without `TEST_DATABASE_URL` those tests are **skipped** (with a loud warning), not passed.

## Scripts (run from the repository root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the Phaser client together (`dev:api` / `dev:play` start one each) |
| `npm run build` | Production builds for every workspace that has one |
| `npm run typecheck` | `tsc` in every workspace (strict) |
| `npm test` | Vitest unit and integration tests |
| `npm run test:e2e` | Playwright browser tests at four viewports (needs a one-time `npx playwright install chromium`, plus `DATABASE_URL`) |
| `npm run playthrough` | Plays a full 10-question session against a running API over HTTP and verifies the database (needs `API_URL` and `DATABASE_URL`) |
| `npm run scan:client` | Scans the built frontend (`apps/play/dist`) for answer keys, server code, and secrets |
| `npm run db:generate` | Diff the Drizzle schema into a new SQL migration in `database/migrations` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run check` | typecheck, then test, then build |

## API (all under `/api/v1` unless noted)

| Method and path | Purpose |
| --- | --- |
| `GET /health` (no prefix) | Liveness; never touches dependencies |
| `GET /ready` (no prefix) | Readiness; `200` when PostgreSQL answers, `503` otherwise |
| `POST /guest` | Create a guest (sets an HttpOnly cookie) or reconnect the existing one |
| `GET /me` | Player, XP and coin totals, active session id |
| `POST /play-sessions` | Start a 10-question multiplication run, or resume the active one |
| `GET /play-sessions/:id` | Progress, current question, results |
| `POST /play-sessions/:id/question` | Issue the next question (or the outstanding one, unchanged) |
| `POST /play-sessions/:id/answers` | `{attemptId, questionId, response}`; idempotent; returns the graded result |

## The rule that shapes everything

```text
CLIENT REQUESTS -> SERVER VALIDATES -> SERVER DECIDES -> DATABASE COMMITS -> CLIENT ANIMATES
```

The browser is untrusted. It may own animation, camera, particles, sound, menu state, the chosen
animal, and accessibility preferences. It may never own correct answers, attempts, response
times, mastery, XP, currency, inventory, achievements, unlocks, entitlements, or reward issuance.
See [docs/SECURITY.md](docs/SECURITY.md).

## Out of scope for now

The jonabalos.com Accounts integration, subscriptions, purchases, stores, inventory, multiplayer,
QR controllers, classrooms, teacher and parent dashboards, AI-generated lessons, chat, friends,
user-generated content, real-time 3D, and world maps (World / Explore / Basecamp is a future
product phase). Guardian accounts exist in Checkpoint E but are not enabled in production, and the
final production deployment is not done (only the guest-only closed beta is live).
