# Project State

Last updated: October 15, 2026 (post-F6 source-of-truth reconciliation). This is the short,
authoritative entry point for any session (human or AI). The repository and the files in `docs/` are
the source of truth, not chat history. If this file and another doc disagree about status, fix the
other doc.

**How to read this file.** Statements say where they are true. **`main`** is at `856d012`. The
World Expedition runtime work lives on the branch `feature/world-expedition-runtime-integration`
(`f3b5483`) and is **not yet merged into `main`**. "Complete" and "closed" describe development and
validation; "deployed" means running in the live closed beta; "enabled" means switched on in
production. They are different words and are kept apart below.

## Status

| Item | State |
| --- | --- |
| Checkpoint A (foundation) | Complete |
| Checkpoint B (first playable server-authoritative slice) | **COMPLETE and Studio-PC validated** |
| Checkpoint C (five-starter presentation) | **COMPLETE and Studio-PC validated** (October 12, 2026) |
| Checkpoint D (public-beta security gate) | **COMPLETE and Studio-PC validated** (October 12, 2026; exact validated commit `52547a356bdde6397c4b576381c30efff05e1d6e`) |
| Checkpoint E (family identity and migration) | **COMPLETE and Studio-PC validated** (October 12, 2026; exact validated commit `a283c2470fe5abcb47f49d3f5753dea1bd881e78`). **On `main`**: `main` (`856d012`) contains the full Checkpoint E history. **NOT deployed** to the live beta, and **identity is NOT enabled in production**: the live beta is the guest-only closed-beta build. |
| Checkpoints F1 to F5 (World Expedition production character art and runtime integration) | **CLOSED** by the project owner. Official Studio-PC validation passed at `f3b5483c2b253f0ccb0ee9b62060379b7575fb08`. On the runtime branch; **not yet merged into `main`**. |
| Checkpoint F6 (final integrated runtime / release-candidate QA) | **CLOSED: PASS WITH MINOR ITEMS.** F6 made zero repository changes. Runtime ready for final release-candidate integration: **YES**. |
| Production character art | **COMPLETE.** All six cast members have six production expressions. Integrated on the runtime branch; `main` still carries the code-drawn transitional art until release-candidate integration. |
| Closed-beta deployment (`play.bidazoo.com`) | **LIVE, guest-only** (Studio PC; commit `1a106bc`; see "Closed-beta deployment and backups"). A closed-beta architecture, not necessarily the final production architecture. |
| Release work (release-candidate integration through founding-family beta) | **OPEN.** See "Remaining work". |
| World / Explore / Basecamp | Future product phase. **Not authorized**, and **not** part of the current runtime closure. |

## Baselines and commits

- **`main`:** `856d012` ("docs: close Checkpoint E after Studio validation"). It contains the
  Checkpoint E implementation (`87f1411` through `a283c24`, the validated commit) and the Checkpoint E
  closure documentation. It does **not** contain the World Expedition runtime branch.
- **Runtime branch:** `feature/world-expedition-runtime-integration` at
  `f3b5483c2b253f0ccb0ee9b62060379b7575fb08` ("test(play): make expression wiring scan CRLF-safe").
  As of October 15, 2026 it is 12 commits ahead of `main` and 0 behind (`main` is its merge base).
- **Release-rehearsal branch:** `release/identity-beta` at `d90f572`, 4 commits ahead of `main` and 0
  behind. It adds only `infrastructure/deployment/identity-release/` (see "Remaining work"). Not
  merged.
- **Deployed in the live closed beta:** commit `1a106bc` (Checkpoint D), per
  [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md) section 9.
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

This section is the historical Checkpoint C record and describes `main` today. On the runtime
branch the code-drawn art has been replaced by the production art and Click is integrated as the
non-selectable host (see "Checkpoint F").

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

- No CAPTCHA or distributed-attack defense. Abuse limits are in-process and best-effort (tumbling
  windows, lost on restart, per process).
- Clearing the guest cookie loses progress unless a guardian claimed the guest first. The claim path
  is Checkpoint E: on `main` and validated, but not deployed, so the live beta has no claim path.
- The client CSP needs the host to send headers or relies on its embedded `<meta>`. Verifying the
  production headers is release gate M6 (see "Checkpoint F").
- Mastery days use UTC; network latency counts toward response time; a replayed answer shows current
  mastery.
- Character art: `main` still has the code-drawn transitional art and no Click. The production art,
  Click as the non-selectable host, and the expression wiring are complete on the runtime branch
  (`f3b5483`) and reach `main` at release-candidate integration.
- Real-device performance has not been measured on real devices. F6 judged the eager preload of all
  36 expression images acceptable for the founding-family beta from emulated measurements (see
  "Checkpoint F").
- Backups exist for the closed-beta database (nightly dump, one restore validated) but with the
  limits listed in "Closed-beta deployment and backups". Data-retention and deletion jobs do not
  exist. Identity audit logging exists in Checkpoint E (on `main`, not deployed).
- Children's-data privacy and legal review is still needed before real use. It is a launch gate.

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

## Checkpoint E: family identity and migration (COMPLETE; Studio-PC validated; on `main`; NOT deployed or enabled)

**Checkpoint E — COMPLETE** as a development and validation checkpoint (October 12, 2026).
**Checkpoint E being complete, and being on `main`, does NOT mean family identity is live.** The
identity implementation is present in `main`; identity is **not enabled** in production, and the live
beta still runs the pre-Checkpoint-E application. Checkpoint D remains COMPLETE.

| Word | Meaning here | Checkpoint E |
| --- | --- | --- |
| **IMPLEMENTED** | Code exists and is committed. | **YES** |
| **STUDIO-VALIDATED** | The official run on the Studio PC passed with the pinned Playwright browser and is recorded in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md). | **YES** |
| **ON `main`** | The implementation is part of `main`'s history. | **YES** (`main` `856d012`; `a283c24` is an ancestor) |
| **DEPLOYED** | Running in the live beta. | **NO** |
| **ENABLED IN PRODUCTION** | Identity switched on (requires `IDENTITY_SECRET`, production SMTP and DNS). | **NO** |

- **Exact Studio-validated commit (validated implementation):** `a283c2470fe5abcb47f49d3f5753dea1bd881e78`
  ("tooling: update Studio validator for Checkpoint E").
- **Closure documentation:** the documentation-only commit `856d012` ("docs: close Checkpoint E
  after Studio validation"; it changed only files under `docs/` and `README.md`). It came **after**
  the validated commit, changed no application, test, validator or runtime file, and is **not**
  itself the validated application SHA.
- **Official validation evidence:** `.validation-logs/20261012-221739` (Studio PC, local and
  git-ignored; the numbers are recorded in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md)).
- **Official counts and environment:** unit 51 passed; integration 375 passed + 3 todo; Playwright
  120/120 passed across 4 projects, 0 failed, 0 flaky, 0 retries; Playwright 1.64.0 with the pinned
  Chromium 156.0.8078.4 (revision 1248); PostgreSQL 16.15 (portable, isolated, 127.0.0.1:54329);
  build PASS; client bundle scan CLEAN (7 files, 1,256,370 bytes, 24 forbidden markers); live API
  playthrough ALL CHECKS PASSED (39 PASS lines); overall PASS.
- **Where it lives:** Checkpoint E was developed on the branch `checkpoint-e-identity`. **`main` now
  contains it**: `main` is at `856d012`, and the Checkpoint E history (`87f1411` through `856d012`)
  is part of `main` (at closure time `main` was still at `cf02ba5`; that is no longer true). The
  branch `checkpoint-e-identity` points at the same commit as `main`.
- **Live beta:** still on the **pre-Checkpoint-E deployment**. **Identity is NOT enabled in
  production.** Not done, and not claimed: production identity secrets, production SMTP, the
  `notify.bidazoo.com` sending domain and its SPF/DKIM/DMARC records, a real guardian email test, the
  Checkpoint E database migration on the live beta, or any deployment. Those belong to the separate
  **Identity Release Gate** ([IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md) section 10).
  Cloudflare Access is not configured on `play.bidazoo.com`.
- **Commits (in order):** 1 `87f1411`, 2 `bf12084`, 3 `2e4e5fe`, 4 `d0d4a3f`, 5 `58fc941`,
  6 `170bc79`, 7 `ae3c212`, 8 `5d0b636`, 9 `ce670ce` (account UI) plus follow-up `b38b7a0`
  (guest-claim availability), 10 `32d172c` (SMTP adapter), 11 `161db9a` (documentation) plus
  `057aac4` (`.env.example` comments), `03748ae` (Playwright tap helper uses the project's
  `hasTouch`, test only), `a283c24` (validator expected counts, the validated commit), then the
  docs-only closure commit.
- **Shape:** Family -> Guardians -> Child Profiles -> existing or new `player_id` -> Trusted Device
  Sessions. Guardians prove an email with a single-use link (no password, no social login, no child
  email). A device is trusted for up to 90 days; guardian authority on it lasts 24 hours. Profiles may
  have an optional four-digit PIN that only locks switching on an already-trusted device. A guardian
  can keep an existing guest player (the same `player_id`, no copy). Hop Quest families can be
  recognized offline by a keyed email match, with operator claim codes for assisted recovery. Security
  actions are audited; identity limits are durable in PostgreSQL. Details: [IDENTITY.md](IDENTITY.md).
- **Learning state is unchanged:** it stays keyed to `player_id` and is never rewritten by account
  attachment. `learning-core`, grading, mastery, XP, coins, timing and attempt idempotency are untouched.
- **Operations:** secret inventory and rotation impact, legacy migration, claim codes, production mail
  and the DNS checklist, mail incidents, recovery scenarios and the future release gate are in
  [IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md).
- **Not yet done (production mail):** a SMTP provider, the `notify.bidazoo.com` sending domain, and
  **SPF, DKIM and DMARC are NOT configured.** Production identity cannot be enabled until they are.
- **Known limitations specific to Checkpoint E:** rotating `IDENTITY_SECRET` makes stored PIN hashes
  unverifiable (a guardian sets or removes the PIN again); no dual-key rotation for any secret;
  rotating `LEGACY_MATCH_PEPPER` leaves unclaimed legacy families unmatched (no re-key tool); the
  sign-in request returns the same generic 202 even if mail delivery fails (intentional, so operators
  must watch the mail-failure log); the legacy loader does no Windows ACL check; a guest whose cookie
  is cleared before a claim is still lost; no COPPA, FERPA, Safe Harbor or privacy certification is
  claimed.

## Checkpoint F: World Expedition runtime integration (F1 to F6 CLOSED; on the runtime branch, NOT yet on `main`)

**F1, F2, F3, F4, F5 and F6 are CLOSED (owner-closed).** F6 outcome: **PASS WITH MINOR ITEMS**. F6
made **zero repository changes**. **Runtime ready for final release-candidate integration: YES.** The
production character art and the runtime integration are complete; neither is pending authorization.

- **Runtime / F6 SHA:** `f3b5483c2b253f0ccb0ee9b62060379b7575fb08` ("test(play): make expression
  wiring scan CRLF-safe") on `feature/world-expedition-runtime-integration`. F6 audited this exact
  SHA and changed nothing, so the official validation below applies to it. The branch is **not merged
  into `main`**; merging it is the release-candidate integration step, which has **not** been done.
- **Cast and art:** production art is complete. Six cast members (Dino, Koala, Tarsier, Eagle,
  Bronco, Click) each have six production expressions (idle, happy, thinking, cheer, discover,
  tryAgain): 36 images. **Five selectable starters:** Dino, Koala, Tarsier, Eagle, Bronco. **Click is
  the host/guide and is NOT selectable** (no starter storage value, no gameplay API payload).
- **Expressions are presentation-only.** The client picks an expression from the gameplay state:
  thinking while an answer is submitting, happy on a correct answer, tryAgain on an incorrect one,
  cheer on a completed run, discover on a newly mastered result (it takes precedence over cheer), and
  idle otherwise. Character choice and expression state never affect question selection, grading,
  correctness, mastery, XP, coins, attempts, persistence, learning progression, identity, scoring or
  server authority, and no character or expression value is sent to or known by the API.
- **Official Studio-PC validation at `f3b5483`:** unit 51/51; integration 649 passed + 3 todo;
  Playwright 256/256 across 4 projects with 0 failed, 0 flaky and 0 skipped; production build PASS;
  client bundle scan CLEAN; live API playthrough ALL CHECKS PASSED; Chromium 156.0.8078.4;
  PostgreSQL 16.15; working tree clean; overall PASS. (The run date and run folder are not recorded
  in this repository.)
- **F6 supplementary audit** (development sandbox, **not** the official run; Playwright used a
  non-pinned Chromium 141): confirmed all five starters, Click non-selectable, all 36 expressions,
  expression mapping, server authority, persistence, responsive behavior, CSP and asset delivery, and
  error/recovery paths, and found no blockers. The same test counts, the production build, the client
  scan (36 of 36 curated images, CLEAN) and the API playthrough (39 PASS lines) all passed there.
- **Eager preload decision: KEEP.** The 36 expression images total 2,028,027 bytes and the production
  build is 3,295,302 bytes. On emulated profiles in the sandbox the menu appeared after about 1.4 s
  on desktop, 3.2 s on LTE, 6.8 s on 4G (CPU throttled 4x) and 1.9 s on a repeat visit. On emulated
  slow 4G (1.6 Mbps) a first visit hits the 6-second art cap: the game starts with partial production
  art and the code-drawn fallback for the rest, and play is never blocked. Accepted for the
  founding-family beta. These are emulations, not real-device measurements.
- **Current runtime validation baseline** (what the Studio validator should show on the runtime
  branch): unit **51**, integration **649 passed + 3 todo**, Playwright **256** (4 projects). The
  validator on `main` still expects the Checkpoint E counts (51 / 375 + 3 todo / 120) and prints count
  warnings (warnings only, not failures) until the runtime branch is integrated. The Checkpoint B to E
  numbers elsewhere in this file and in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md) are historical
  and intentionally unchanged.

### F6 minor items (finite follow-ups; not blockers; F6 is not reopened)

| ID | Item |
| --- | --- |
| M1 | Stale local XP and coin totals after a crossed retry or other-tab resync (display only; the server values are correct) |
| M2 | Duplicate boot retry handlers (a tap and the "Try again" button) |
| M3 | Unguarded fast double retry presses (the server resumes the same session; no data harm) |
| M4 | Keyboard focus is lost after a re-render |
| M5 | No mid-session 401 re-authentication (a retry keeps failing until the page is reloaded) |
| M6 | Production cache and security-header verification (**a release gate**, below) |
| M7 | Optional selected-character-first preload optimization |
| M8 | Test blind spots (for example reload on the results screen, and resize during feedback) |
| M9 | Validator cleanup (counts warn rather than fail, the pinned Chromium version is not asserted, and the header still names Checkpoint F5) |
| M10 | Coverage and determinism improvements (for example the results screen is not exercised for every starter, and some checks read source text or use fixed sleeps) |
| S1 | Investigate the identity-probe startup delay (the game waits up to 1.5 s for it before it mounts) |

**M6 release gate (the most important pre-launch operational check; not an F6 blocker).** Before
production application deployment, confirm that production serves long-lived immutable caching
(`Cache-Control: public, max-age=31536000, immutable`) on the hashed `/assets/*` files and
`no-cache` on the HTML shell, and confirm the required security headers at the production proxy: the
client CSP including `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Cross-Origin-Opener-Policy` and `Permissions-Policy`, with API responses keeping
their own stricter headers. The closed-beta Caddyfile plan specifies these
([DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md) step 7), but the as-built record
(section 9) does not record a header verification, and the client build itself sets no cache
headers. F6 measured against `vite preview`, not the production proxy.

## Closed-beta deployment and backups (as built; recorded October 12, 2026)

Source: [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md) section 9. This repository records the
deployment; it cannot prove the live state today.

- **Current closed-beta deployment:** `https://play.bidazoo.com`, **guest-only**, application commit
  `1a106bc` (Checkpoint D; no application code changed during deployment). It runs on the Studio PC:
  the Fastify API, PostgreSQL 16, a separate BidaZoo Caddy and a dedicated Cloudflare tunnel
  (`bidazoo-beta`), all bound to loopback behind the tunnel and run as BidaZoo-named scheduled
  tasks. A reboot test and a phone and cellular test passed (recorded by the project owner).
- **This is a closed-beta architecture, not necessarily the final production architecture.** Final
  production hosting, CI and the data-retention policy are still open decisions
  ([ARCHITECTURE.md](ARCHITECTURE.md), "postponed decisions").
- **Not deployed:** Checkpoint E (identity) and the World Expedition runtime. Identity is OFF in
  production.
- **Backups (implemented for the closed beta, with limits):** a `BidaZoo Backup` scheduled task runs a
  daily `pg_dump -Fc` at 3:10 AM and keeps 14 copies on the same PC. On October 12, 2026 one real dump
  made by that task was restored into a scratch database with identical table lists (9 tables) and
  identical row counts. **Not yet proven or done:** a fully unattended nightly run (the validated dump
  came from a manual start of the same task); an off-PC backup destination; backup and restore of the
  Checkpoint E migrations or of the final release candidate (rehearsal and rollback verification are
  release-path steps); and data-retention and deletion jobs (none exist). The backup scripts live on
  the Studio PC under `C:\BidaZoo-beta\bin`, not in this repository.

## Remaining work

Unfinished **release** work is different from unfinished **game** work.

### Game work

- Nothing remains for runtime closure: F1 to F6 are closed.
- The F6 minor items above are finite follow-ups for the owner to schedule. They do not reopen F6.
- **World / Explore / Basecamp** is a future product phase. It is not authorized and is not part of
  the current runtime closure.

### Release work (all OPEN; none of it has been done)

The remaining release path:

1. Final release-candidate integration (bringing the closed runtime branch and the release tooling
   into one candidate). Needs explicit owner authorization.
2. Exact-SHA validation of that candidate on the Studio PC with the pinned Chromium.
3. Release rehearsal (non-production).
4. Backup and rollback verification.
5. Production application deployment (with the M6 header check confirmed first).
6. SMTP provider and DNS setup (the `notify.bidazoo.com` sending domain with SPF, DKIM and DMARC).
7. Production identity enablement (`IDENTITY_SECRET`, production mail). Identity stays OFF until then
   ([IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md) section 10).
8. Privacy and parental-consent launch gate (children's-data and legal review; no COPPA, FERPA, Safe
   Harbor or privacy compliance is claimed).
9. Founding-family beta.

Also open from the closed-beta record (DEPLOYMENT-CLOSED-BETA.md section 9): the formal proxy-identity
proof through the public path, observing the first unattended nightly backup, an off-PC backup
destination, and re-checking that the unrelated sites still work. Still not built: CAPTCHA, a shared
(multi-process) limiter store, and distributed-attack defense.

**Rehearsal tooling.** The branch `release/identity-beta` (`d90f572`, not merged) carries rehearsal
scripts and checklists under `infrastructure/deployment/identity-release/` (scratch-cluster backup
verification, restore and migration checks, rollback proof, and maintenance-window, rollback and
enablement checklists). Its own README labels it **untested tooling** and records that none of the
checklists has been executed. It names `a283c24` as its release candidate, so its references will
need re-pointing to the final candidate SHA.

## Rules for future sessions

1. Orient first: read this file, then README, ARCHITECTURE, SECURITY, and CHANGELOG, then inspect
   `git status` and recent history.
2. Do not start any further checkpoint or phase (release-candidate integration, deployment,
   SMTP or DNS work, identity enablement, privacy work, World / Explore / Basecamp, and so on) until
   the project owner explicitly authorizes it. Do not reopen closed checkpoints.
3. Keep BidaZoo isolated from production systems (Hop Quest, Fact Crew, jonabalos.com Accounts, the
   Clickaroo Games Hub, the existing Caddy, existing Cloudflare tunnels and DNS). The closed beta uses
   its own BidaZoo Caddy and a dedicated BidaZoo tunnel.
4. Documentation-only changes get documentation-only commits. Do not mix them with code.

## Document map

| Doc | Purpose |
| --- | --- |
| [README.md](../README.md) | Quick start, scripts, API table |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, tables, request flow, deviations, postponed decisions |
| [SECURITY.md](SECURITY.md) | Trust model and known limitations |
| [IDENTITY.md](IDENTITY.md) | Checkpoint E identity architecture and behavior |
| [IDENTITY-OPERATIONS.md](IDENTITY-OPERATIONS.md) | Checkpoint E operator runbooks, secret rotation, mail, recovery, release gate |
| [IDENTITY-MIGRATION-ASSESSMENT.md](IDENTITY-MIGRATION-ASSESSMENT.md) | Design record for family identity and Hop Quest migration |
| [GAME-SDK.md](GAME-SDK.md) | Game and platform boundary |
| [PRODUCT.md](PRODUCT.md) | Product intent and open questions |
| [CHARACTER-BIBLE.md](CHARACTER-BIBLE.md) | Locked character identity decisions (Click and the five starters) |
| [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md) | Closed-beta deployment plan and as-built record (`play.bidazoo.com`, Studio PC, backups) |
| `docs/visual/` (runtime branch only, until integration) | World Expedition visual specification and production art plan |
| [REFERENCE-REVIEW.md](REFERENCE-REVIEW.md) | What may be taken from Hop Quest and Fact Crew |
| [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md) | Validation record and procedure |
| [CHANGELOG.md](CHANGELOG.md) | History by checkpoint |
