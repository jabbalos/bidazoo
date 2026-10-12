# Architecture

Status: Checkpoint A (Foundation), October 11, 2026.

BidaZoo is a **modular monolith**: one deployable API process with internal modules, one
PostgreSQL database, and browser clients that only present state. There are no microservices.

## 1. Repository structure

```text
bidazoo/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── analytics/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── content/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── identity/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── inventory/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── learning/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── players/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── rewards/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── sessions/
│   │   │   │   │   └── index.ts
│   │   │   │   └── index.ts
│   │   │   ├── routes/
│   │   │   │   └── health.ts
│   │   │   ├── app.ts
│   │   │   ├── config.ts
│   │   │   ├── db.ts
│   │   │   └── server.ts
│   │   ├── build.mjs
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── play/
│   │   ├── src/
│   │   │   ├── scenes/
│   │   │   │   └── BootScene.ts
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── portal/
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       ├── README.md
│       └── tsconfig.json
├── database/
│   ├── migrations/
│   │   ├── meta/
│   │   │   ├── 0000_snapshot.json
│   │   │   └── _journal.json
│   │   └── 0000_peaceful_maddog.sql
│   ├── schema/
│   │   ├── index.ts
│   │   └── players.ts
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CHANGELOG.md
│   ├── GAME-SDK.md
│   ├── PRODUCT.md
│   └── SECURITY.md
├── games/
│   └── zoo-sprint/
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       ├── README.md
│       └── tsconfig.json
├── infrastructure/
│   ├── deployment/
│   │   └── README.md
│   └── development/
│       └── README.md
├── packages/
│   ├── assets/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── README.md
│   │   └── tsconfig.json
│   ├── content-math/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── README.md
│   │   └── tsconfig.json
│   ├── contracts/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── game-sdk/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── learning-core/
│   │   ├── src/
│   │   │   ├── choices.test.ts
│   │   │   ├── choices.ts
│   │   │   ├── future.test.ts
│   │   │   ├── grading.test.ts
│   │   │   ├── grading.ts
│   │   │   ├── index.ts
│   │   │   ├── question.test.ts
│   │   │   ├── question.ts
│   │   │   ├── rng.test.ts
│   │   │   └── rng.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       ├── README.md
│       └── tsconfig.json
├── tests/
│   ├── e2e/
│   │   ├── boot.spec.ts
│   │   └── playwright.config.ts
│   ├── integration/
│   │   ├── contracts-boundary.test.ts
│   │   ├── database-resilience.test.ts
│   │   ├── health.test.ts
│   │   ├── learning-core-purity.test.ts
│   │   └── trust-model.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── .editorconfig
├── .env.example
├── .gitignore
├── .nvmrc
├── package-lock.json
├── package.json
├── README.md
└── tsconfig.base.json
```

Shown: files tracked by Git. `node_modules/`, `dist/`, and `.env` are ignored.

## 2. Package responsibilities

| Workspace | Responsibility | May depend on |
| --- | --- | --- |
| `apps/play` | Browser client: Vite + Phaser 3. Presentation only. | `phaser` (later: `contracts`, `game-sdk`, `ui`, `assets`) |
| `apps/api` | Authoritative API: Fastify, modular monolith. Owns all persistent state changes. | `contracts`, `database`, `learning-core` (later), `fastify`, `pg`, `drizzle-orm` |
| `apps/portal` | Placeholder for future non-game surfaces. Nothing implemented. | nothing |
| `packages/contracts` | The one home for shared API DTOs and types. Types only. | nothing |
| `packages/learning-core` | Pure TypeScript learning engine (see section 6). | `contracts` (types only) |
| `packages/game-sdk` | The game/platform boundary (see section 7). Types only. | `contracts` |
| `packages/content-math` | Placeholder for math skill and question-template content. | nothing yet |
| `packages/assets` | Placeholder for shared art, audio, fonts. | nothing |
| `packages/ui` | Placeholder for shared presentation helpers and design tokens. | nothing |
| `games/zoo-sprint` | Placeholder for the first game. Talks to the platform only via `game-sdk`. | `game-sdk` (later) |
| `database` | Drizzle schema and SQL migrations (PostgreSQL). | `drizzle-orm` |
| `tests` | Cross-package integration tests (Vitest) and browser tests (Playwright). | anything, as a test consumer |

Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`). Vite,
Vitest, and `tsx` consume that natively. The API's production build uses esbuild to inline the
`@bidazoo/*` packages and keep real third-party dependencies external (`apps/api/build.mjs`).

### API modules

`apps/api/src/modules/` contains `identity`, `players`, `learning`, `sessions`, `rewards`,
`inventory`, `content`, and `analytics`. In Checkpoint A each is an empty Fastify plugin that
registers nothing. They exist to fix the shape: modules call each other in-process and never
over the network, and every state-changing path goes through a module.

## 3. Trust boundaries

```text
 UNTRUSTED                               TRUSTED
+-----------------------+   HTTPS   +----------------------------------+
| Browser               |  (JSON)   | API (Fastify)                    |
|  - Phaser presentation| --------> |  1. validate input               |
|  - animation, sound,  |           |  2. decide (learning-core, rules)|
|    camera, menus      | <-------- |  3. commit (PostgreSQL)          |
|  - a11y preferences   |  results  |  4. return facts to animate      |
+-----------------------+           +----------------+-----------------+
                                                     |
                                                +----v-----+
                                                | Postgres |
                                                +----------+
```

Everything on the left can be modified by the person using it. Therefore nothing on the left is
believed. See [SECURITY.md](SECURITY.md) for the rules this implies.

## 4. Client and server responsibilities

| Concern | Server | Browser |
| --- | --- | --- |
| Correct answers, answer keys | Owns | Never receives before grading |
| Attempts, mastery | Owns | Displays results |
| XP, currency, inventory, achievements, unlocks | Owns | Displays results |
| Entitlements, session completion, reward issuance | Owns | Displays results |
| Animation, camera, particles, sound | none | Owns |
| Menu state, accessibility preferences | none (may store later) | Owns |

Client-to-server messages are **requests for domain actions** (for example "submit this answer
for this session, with this idempotency key"). The API has no endpoint that accepts a statement
of state such as `{ "coins": 999999 }`. The shapes live in `packages/contracts`.

### Answer security flow

```text
server generates question -> server retains answer key -> PublicQuestion sent to client
   -> client returns a PlayerResponse -> server grades -> AnswerResult (key revealed after)
```

`learning-core` exposes `toPublicQuestion`, an allowlist projection, so a field added to the
server-side question later cannot leak by accident. A compile-time test in `tests` fails if an
answer-key field is added to `PublicQuestion`.

## 5. Database direction

- PostgreSQL 16, accessed through Drizzle ORM. SQL migrations are generated by `drizzle-kit`
  into `database/migrations` and committed. They are the schema's history.
- Checkpoint A ships one table, `players` (opaque id, nickname, created-at), to prove the
  schema-to-migration-to-database pipeline. It was applied to and verified on a real PostgreSQL 16.
- Planned canonical tables: `players`, `play_sessions`, `questions_served`, `attempts`,
  `skill_mastery`, `wallet_transactions`, `inventory_unlocks`, `achievements`. They arrive with
  the checkpoints that need them.
- Direction: wallet and reward state are **append-only ledgers** (`wallet_transactions`) with a
  unique idempotency key, not mutable counters that a bug or replay can inflate.

## 6. Learning-core boundary

`packages/learning-core` is pure TypeScript.

- Must not use: `document`, `window`, `localStorage`, Phaser, React, database queries, Fastify.
- May import: relative modules and `@bidazoo/contracts` (types only).
- Enforced three ways: its `tsconfig` has no DOM lib and no Node types (so `document` does not
  compile), `package.json` declares one dependency, and
  `tests/integration/learning-core-purity.test.ts` scans the source for forbidden imports and globals.
- Today it contains a seeded RNG, choice building (no duplicate distractors), grading, and the
  public-question projection. Future: skill selection, mastery transitions, retry scheduling,
  difficulty, base scoring.

It computes decisions; it never persists them. Persisting an attempt, updating mastery, and
issuing rewards are the API's job.

## 7. Game SDK boundary

Games interact with the platform through `BidaZooGame` (`start`, `submitAnswer`, `finish`) and the
shared contracts. A game does not know the database structure, login internals, how currency is
stored, how mastery is persisted, subscription logic, or entitlement internals. Details in
[GAME-SDK.md](GAME-SDK.md).

## 8. Testing strategy

| Layer | Tool | Location | Checkpoint A state |
| --- | --- | --- | --- |
| Unit (learning-core) | Vitest | `packages/learning-core/src/*.test.ts` | Real tests plus `todo` placeholders for mastery and retry |
| API integration | Vitest + Fastify `inject` | `tests/integration` | Health/ready, DB-resilience regression, contract guards, purity scan; trust-model tests are `todo` |
| Browser | Playwright (Chromium) | `tests/e2e` | Configured for 360x640, 390x844, 820x1180, 1440x900; see "Known gaps" |

Non-negotiable UX requirement for future question screens: *the question and primary answer
controls must be visible without scrolling.* It exists as a `fixme` test at all four viewports.

`todo` and `fixme` tests are placeholders that record intent. They are not passing tests.

### Known gaps

- Playwright was not executed in the Checkpoint A environment (see Assumptions in the report).
- No linting or formatting tool is configured (deliberate; see postponed decisions).

## 9. Deployment direction

Not decided and not implemented. The intent is a single Node process (the bundled API) plus
PostgreSQL, with the Vite build served as static files. `infrastructure/` holds development setup
notes now and deployment material later. Nothing in this repository touches Hop Quest, Fact Crew,
jonabalos.com Accounts, the Clickaroo Games Hub, Caddy, Cloudflare, or any production service.

## 10. Decisions intentionally postponed

- **Request validation library.** Fastify's built-in JSON Schema validation versus a schema
  library such as Zod. Decide when the first real endpoint is written.
- **Authentication and consent.** Cookie-session design, nickname-only play, and how parental
  consent works for children. Needs legal review (for example US COPPA); this is not legal advice.
- **Integration with existing jonabalos.com Accounts.** Deliberately out of scope.
- **Security middleware.** CORS policy, security headers, and rate limiting.
- **Identifier scheme** for sessions and questions (currently opaque strings; the server issues them).
- **Hosting, domains, CI, and backups.**
- **Linting and formatting** (ESLint, Prettier) and **WebKit/Firefox** browser coverage.
- **Content authoring** and how `content-math` is structured.
- **Analytics** content and retention.

## 11. Deviations from the Checkpoint A specification

| # | Deviation | Why |
| --- | --- | --- |
| 1 | `database/` and `tests/` are npm workspaces (each has a `package.json` and `tsconfig.json`). | Lets the API import the schema by package name and lets tests import the API by package name, instead of fragile relative paths. |
| 2 | Phaser is `^3.90.0`, not the newest release (4.x). | The spec requires Phaser 3. |
| 3 | TypeScript is `^5.9.3`, not 6.x or 7.x. | A mature, widely supported line; the spec asks for current stable versions, not the newest major. Revisit deliberately. |
| 4 | `@types/node` is `^22`, matching the Node 22 runtime. | Types should match the runtime, not the newest release. |
| 5 | Extra dev dependencies: `esbuild`, `tsx`, `concurrently`. | See the dependency table below. |
| 6 | Added `.editorconfig` and `.nvmrc`. | Tiny, prevent line-ending and Node-version drift. |
| 7 | `database/schema/players.ts` defines one table. | Needed to prove the migration pipeline; the spec says not to overbuild. |
| 8 | `apps/api` exposes `./db` as well as `./app`. | Lets integration tests cover the database pool without a live database. |
| 9 | `infrastructure/` contains READMEs only. | Nothing to deploy yet; avoids unverifiable files (no Docker daemon was available). |

## 12. Dependencies that are not obvious

| Package | Where | Why |
| --- | --- | --- |
| `drizzle-orm`, `drizzle-kit` | `database`, `api` | Required by the spec. `drizzle-kit` generates and applies SQL migrations. |
| `pg` | `api` | The PostgreSQL driver Drizzle's `node-postgres` adapter uses. |
| `esbuild` | `api` (dev) | Bundles the API into one file, inlining the TypeScript workspace packages. |
| `tsx` | `api` (dev) | Runs TypeScript directly in `npm run dev`. |
| `concurrently` | root (dev) | Runs the API and client dev servers together on every OS, including Windows. |
| `@types/node`, `@types/pg` | dev | Type definitions only. |
| `vitest`, `@playwright/test` | dev | Required by the spec. |

Known audit note: `npm audit` reports 4 moderate findings, all dev-only, all via `drizzle-kit`'s
deprecated `@esbuild-kit` dependency (an old-esbuild dev-server issue; `drizzle-kit` does not run
a dev server). `npm audit --omit=dev` reports 0. The suggested `--force` fix would downgrade
`drizzle-kit` to 0.18.1, so it was not applied. Revisit when `drizzle-kit` ships a fix.
