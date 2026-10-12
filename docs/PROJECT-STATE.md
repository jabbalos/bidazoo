# Project State

Last updated: October 12, 2026. This is the short, authoritative entry point for any session
(human or AI). The repository and the files in `docs/` are the source of truth, not chat history.
If this file and another doc disagree about status, fix the other doc.

## Status

| Item | State |
| --- | --- |
| Checkpoint A (foundation) | Complete |
| Checkpoint B (first playable server-authoritative slice) | **COMPLETE and Studio-PC validated** |
| Checkpoint C (five-starter presentation) | **COMPLETE and Studio-PC validated** (October 12, 2026) |
| Pre-beta hardening | **NOT authorized.** A separate checkpoint that needs explicit approval. |

## Baselines and commits

- **Accepted application baseline:** `01b7d41` (Checkpoint B).
- **Accepted Checkpoint C game implementation:** `7042f8f` ("feat(zoo-sprint): Checkpoint C - five
  locked starters, presentation only"). Presentation-only: no change to `apps/api`, `database`,
  `packages/contracts`, `packages/learning-core`, or `packages/game-sdk`.
- **Later commits (not themselves Studio-validated):**
  - `5b287f2`: Checkpoint C closure documentation (docs only).
  - `6fcbc75`: merge of `5b287f2` with `01752a1`, preserving both histories.
  - `5fef907`: validator-count update in `scripts/validate-studio.ps1`, tooling only
    (`ExpectedIntegration` 81 -> 88, `ExpectedPlaywright` 24 -> 40; `ExpectedUnit` 51,
    `ExpectedTodo` 3, `ExpectedProjects` 4, and `BaselineCommit` `01b7d41` unchanged). It has not
    yet been run on the Studio PC; the next run should print no count warnings.
  - The documentation cleanup commit that recorded these.
- **Checkpoint C officially validated commit:** `01752a1df4a4c0dbce41415027971b41540cb4dd`. It
  differs from `7042f8f` only by a documentation and reference-art addition
  (`docs/reference-art/bidazoo-character-roster-reference.png`); no application, game, schema, API,
  database, learning, or test code differs. (Reported from the Studio run; see
  [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md).)
- **`d0345bf`:** validation tooling and docs on top of that baseline (portable PostgreSQL for the
  Studio runner). This is the commit the official validation tested. It changed no application,
  game, schema, or test code.
- This closure documentation was added afterward as a **new** documentation-only commit. An earlier
  closure commit (`446092a`) existed in a development session but is not in this repository, and
  this record is not claimed to be identical to it.
- To see the current commit: `git log --oneline -5`.

## What Checkpoint B delivered

A guest opens the page, picks Panda, Monkey, or Lion (presentation only), and plays a 10-question
multiplication run. The server generates and grades every question, updates mastery, and issues XP
and coins; the Phaser client only presents it. Details: [CHANGELOG.md](CHANGELOG.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). The locked character decisions are in [CHARACTER-BIBLE.md](CHARACTER-BIBLE.md).

## What Checkpoint C delivered

The Zoo Sprint menu now offers exactly the five locked starters (Dino, Koala, Tarsier, Eagle,
Bronco) in a responsive grid, drawn as code-made transitional art; Dino is the default; the choice
persists in `localStorage` and old `panda`/`monkey`/`lion` values fall back to Dino. Click is not
implemented. No server, database, contracts, or learning-core code changed. Details:
[CHANGELOG.md](CHANGELOG.md).

Checkpoint C was first verified in a development sandbox on a supplementary Chromium 153 (not
official), then **officially validated on the Studio PC** (see below).

## Validation evidence (official, passed)

### Checkpoint C

Run `20261012-114342` on the Studio PC, commit `01752a1df4a4c0dbce41415027971b41540cb4dd`
(Checkpoint C implementation `7042f8f` plus a documentation and reference-art addition only):

- Vitest: unit 51 passed (51); integration 88 passed with 3 todo (91).
- Playwright: 40 passed, 0 failed, 0 flaky, 0 skipped; no retries; Playwright 1.64.0, Chromium
  156.0.8078.4 (official pinned build); 4 viewports.
- PostgreSQL 16.15 portable; `npm ci`, database creation, migrations, startup, and shutdown passed.
- Overall PASS, exit code 0.
- That run printed two count warnings only because the runner's approved counts still reflected
  Checkpoint B (integration expected 81, now 88; Playwright expected 24, now 40). The increases are
  the intentional Checkpoint C tests, not failures. The runner was updated afterward in `5fef907`
  (see "Baselines and commits"); the run itself used the older counts.

### Checkpoint B

Run `20261012-092607` on the Studio PC, normal (non-elevated) user, commit
`d0345bf860d6abdab2e2d197e5dc5f6f5ce51a8e`:

- Vitest: 51 passed (51); 81 passed with 3 todo (84); exit 0.
- Playwright: 24 passed, 0 failed, 0 flaky, 0 skipped; no retries; Playwright 1.64.0, Chromium
  156.0.8078.4; 4 viewports; exit 0.
- PostgreSQL 16.15 portable on 127.0.0.1:54329; `npm ci`, migrations, startup, and shutdown passed.
- Overall PASS, exit code 0.

The full record is in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md). The raw logs live in the
git-ignored `.validation-logs/` folder.

## Invariants that must be preserved

Do not weaken or redesign these without explicit approval. Details in
[ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

- The server decides everything that counts: questions, answer keys, grading, response time,
  attempts, mastery, XP, coins, session completion. The browser only presents.
- The API accepts domain actions, never resulting state; unknown request fields are rejected.
- `served_at` is stamped once by the server; a refresh cannot reset the clock or reroll a question.
- One final grade per served question, enforced by the database; answers are idempotent by
  `attemptId`; the answer transaction locks the session row.
- Ledgers (`wallet_transactions`, `xp_events`) and `attempts` are append-only; rewards are tied to
  unique sources.
- Ownership is enforced on every lookup (another player's session and a missing one are both 404).
- Guest identity is an HttpOnly cookie whose SHA-256 hash is stored; no bearer tokens or
  `localStorage` identity.
- `learning-core` has no dependencies; games talk to the platform only through `game-sdk`.

## Known limitations (accepted, recorded)

No rate limiting and unbounded guest creation; no Content-Security-Policy or remaining browser
security headers; clearing the guest cookie loses progress and there is no recovery or claim path;
mastery days use UTC; network latency counts toward response time; a replayed answer shows current
mastery; character art is code-drawn transitional art, not final; Click (the host) is not implemented; real-device performance unmeasured; no audit logging, backups, or
retention jobs; children's-data privacy and legal review is still needed before real use.

## Deferred hardening (not authorized)

In the priority order from [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md): rate limiting; guest-creation
abuse limits; Content-Security-Policy and remaining browser security headers; real-device
performance checks; a deliberate guest-account recovery and claim strategy. (Official Playwright
validation, formerly on this list, is done.)

## Rules for future sessions

1. Orient first: read this file, then README, ARCHITECTURE, SECURITY, and CHANGELOG, then inspect
   `git status` and recent history.
2. Do not start any further checkpoint (Click/host, hardening, accounts, and so on) until the project owner explicitly authorizes it.
3. Keep BidaZoo isolated from production systems (Hop Quest, Fact Crew, jonabalos.com Accounts, the
   Clickaroo Games Hub, Caddy, Cloudflare).
4. Documentation-only changes get documentation-only commits. Do not mix them with code.

## Document map

| Doc | Purpose |
| --- | --- |
| [README.md](../README.md) | Quick start, scripts, API table |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, tables, request flow, deviations, postponed decisions |
| [SECURITY.md](SECURITY.md) | Trust model and known limitations |
| [GAME-SDK.md](GAME-SDK.md) | Game and platform boundary |
| [PRODUCT.md](PRODUCT.md) | Product intent and open questions |
| [CHARACTER-BIBLE.md](CHARACTER-BIBLE.md) | Locked character identity decisions (Click and the five starters) |
| [REFERENCE-REVIEW.md](REFERENCE-REVIEW.md) | What may be taken from Hop Quest and Fact Crew |
| [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md) | Validation record and procedure |
| [CHANGELOG.md](CHANGELOG.md) | History by checkpoint |
