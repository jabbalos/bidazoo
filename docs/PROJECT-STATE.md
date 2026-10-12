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
| Checkpoint D (public-beta security gate) | **COMPLETE and Studio-PC validated** (October 12, 2026; exact validated commit `52547a356bdde6397c4b576381c30efff05e1d6e`) |
| Real-device performance, guest recovery, Click, final art | **NOT authorized.** Separate later checkpoints. |

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

No CAPTCHA or distributed-attack defense; clearing the guest cookie loses progress and there is no recovery or claim path;
abuse limits are in-process and best-effort (tumbling windows, lost on restart, per process); the client CSP needs the host to send headers or relies on its embedded `<meta>`; mastery days use UTC; network latency counts toward response time; a replayed answer shows current
mastery; character art is code-drawn transitional art, not final; Click (the host) is not implemented; real-device performance unmeasured; no audit logging, backups, or
retention jobs; children's-data privacy and legal review is still needed before real use.

## Checkpoint D: public-beta security gate (COMPLETE; Studio-PC validated)

Approved scope: rate limiting (per-IP guest creation, per-guest session start and answers, an
API-wide per-IP backstop), a service-wide emergency new-guest breaker, explicit proxy trust
(`TRUST_PROXY`), and browser security headers including an enforced Content-Security-Policy for the
client. Every limit is environment-configurable; no hosting provider is assumed. Details and the
default numbers: [SECURITY.md](SECURITY.md) ("Public-beta protections").

- **Commits (in order, on top of `67975bf`):** `524f2e8` implementation, `2eb2970` tests, `abde130`
  validator counts, `7dd9136` Checkpoint D documentation (pending-validation state), `52547a3`
  validator tooling update (adds the production build, `scan:client`, and the live API playthrough to
  the Studio runner). **`52547a3` is the exact commit that was Studio validated.** The closure
  documentation commit that records the result came after it and was not itself validated.
- **No change to** gameplay, question generation, grading, `served_at` timing, idempotency, mastery,
  XP, coins, session completion, guest identity, or ownership. The only package outside `apps/api`,
  `apps/play`, and the game's accessibility mirror that changed is `packages/contracts` (two new error
  codes, `rate_limited` and `service_busy`). `learning-core` and `game-sdk` are untouched. Checkpoint D
  is independently revertible without reverting Checkpoint C.
- **Earlier sandbox verification (NOT Studio-PC validation; superseded by the official run below):** Vitest unit 51 passed; integration 115 passed,
  3 todo; Playwright 56 passed, 0 flaky, 0 retries, on all four viewports with the CSP enforced and
  zero violations, console errors, or throttled calls, using a supplementary Chromium 153;
  `scan:client` clean; the live API playthrough passed.
- **Official Studio-PC validation (October 12, 2026), PASSED**, run folder
  `.validation-logs\20261012-130626`, commit `52547a356bdde6397c4b576381c30efff05e1d6e`: unit 51
  passed; integration 115 passed, 3 todo; Playwright 56 passed across 4 projects, 0 failed, 0 flaky,
  no retries; Playwright 1.64.0, Chromium 156.0.8078.4, PostgreSQL 16.15 (portable, 127.0.0.1:54329,
  shutdown succeeded); production build PASS; client bundle scan **CLEAN** (3 files, 1,228,557
  bytes, 20 forbidden markers checked); live API playthrough **ALL CHECKS PASSED** (39 PASS lines);
  no validator count warnings; validator exit code 0. Full record:
  [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md). The validator's expected counts (51 / 115 + 3 todo / 56
  / 4 projects) were set in `abde130`.

## Deferred (not authorized)

With Checkpoint D closed, in order (none authorized yet): real-device performance checks; a deliberate guest-account
recovery and claim strategy; the Click host character; final character art. Also still open:
CAPTCHA, a shared (multi-process) limiter store, distributed-attack defense, audit logging, backups,
retention, and children's-data legal review. (Official Playwright validation, rate limiting, guest
creation limits, and CSP were formerly on this list.)

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
