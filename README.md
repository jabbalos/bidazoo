# BidaZoo

An educational-game platform for kids. Games are fun; **learning progress is decided by the server**.

> **Status: Checkpoint A (Foundation).** The workspace, API skeleton, database/migration pipeline,
> learning-core boundary, and a Phaser boot screen exist. There is **no gameplay yet**.
> The repository and the files in [`docs/`](docs/) are the project memory, not chat history.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structure, package responsibilities, trust boundaries, deviations, postponed decisions |
| [docs/SECURITY.md](docs/SECURITY.md) | Security baseline and the trust model |
| [docs/GAME-SDK.md](docs/GAME-SDK.md) | The boundary between a game and the platform |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product intent and scope |
| [docs/REFERENCE-REVIEW.md](docs/REFERENCE-REVIEW.md) | What BidaZoo may and may not take from Hop Quest and Fact Crew |
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
npm run dev                 # API on :3001, Phaser client on :5173
```

On Windows, use `copy .env.example .env` instead of `cp`.

## Scripts (run from the repository root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the Phaser client together (`dev:api` / `dev:play` start one each) |
| `npm run build` | Production builds for every workspace that has one |
| `npm run typecheck` | `tsc` in every workspace (strict) |
| `npm test` | Vitest unit and integration tests |
| `npm run test:e2e` | Playwright browser tests at four viewports (needs a one-time `npx playwright install chromium`) |
| `npm run db:generate` | Diff the Drizzle schema into a new SQL migration in `database/migrations` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run check` | typecheck, then test, then build |

## Endpoints (Checkpoint A)

- `GET /health` — liveness; never touches dependencies.
- `GET /ready` — readiness; `200` when PostgreSQL answers, `503` otherwise.

## The rule that shapes everything

```text
CLIENT REQUESTS -> SERVER VALIDATES -> SERVER DECIDES -> DATABASE COMMITS -> CLIENT ANIMATES
```

The browser is untrusted. It may own animation, camera, particles, sound, menu state, and
accessibility preferences. It may never own correct answers, attempts, mastery, XP, currency,
inventory, achievements, unlocks, entitlements, or reward issuance. See
[docs/SECURITY.md](docs/SECURITY.md).

## Out of scope for now

Zoo Sprint gameplay, multiplayer, QR controllers, classrooms, teacher and parent dashboards,
AI-generated lessons, subscriptions, purchases, stores, chat, friends, user-generated content,
real-time 3D, world maps, production account migration, and production deployment.
