# Project State

Last updated: November 3, 2026 (release candidate and visual recovery merged into `main`; product
direction set). This is the short, authoritative entry point for any session (human or AI). The repository
and the files in `docs/` are the source of truth, not chat history. If this file and another doc disagree
about status, fix the other doc.

**World Expedition build, day 1 (Monday, November 9, 2026).** Plan of record:
[PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md](PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md). Branch
`integration/world-expedition` collects four lanes (`lane/encounters`, `lane/expedition`, `lane/progression`,
`lane/content`).

- **Bake-off result (November 8, 2026).** Claude won by the decision rule (fewest review findings among
  entries passing the required checks): Claude 3 Low, versus Gemini 1 High, 2 Medium and 6 Low. Claude was also
  faster. The Claude entry `bake/claude` became `lane/encounters` (A3 session client, A1 encounter model).
  Gemini is the reviewer for the build. The Gemini entry was removed.
- `lane/encounters` at `c46015a` merged into the integration branch as `bd66cfb` (typecheck, Vitest
  88 + 759 passed + 3 todo, play.spec 24 passed).

- `lane/encounters` at `55fbadb` (A1 to A6) merged as `573068b`: typecheck, Vitest, sharded Playwright
  276 of 276, 0 flaky (two shards at a time, 54.9 min). Gemini review 1 (`9ff9d70..bd66cfb`): 0 High, 0 Medium, 3 Low.
- **Live-site incident, November 9, about 14:40 CST.** play.bidazoo.com went down while up to six browser test
  stacks ran on the Studio PC; the owner stopped all lanes. No agent killed a process or used the live ports
  (3101, 54340, 8480); the cause is not confirmed (machine load was the working hypothesis). The site was back
  by 14:55. Since then: at most two browser test stacks at once, and every status message carries a live-site check.
- **Standing rule (owner, November 9):** the orchestrator decides anything the plan, the proposal or approved
  owner decisions cover, and records it below. The owner is asked only about changing an existing test, a
  section 2.6 contract signature, live-site data, cutting scope, kid-facing copy (docs/COPY.md) and the deploy go.

#### Decisions, November 9, 2026 (owner = O, orchestrator under the standing rule = R)

| Decision | By | Applies to |
| --- | --- | --- |
| Text answers: approved; migration 0006 (`attempts.submitted_response` to text) by Lane C; `AnswerResultSchema.correctAnswer` widened at integration | O | C-text, D3 |
| Hop Quest import: all 372 items by the stated rule (not 196); 56 `needsTable` items skipped until a table renderer exists | O | D1 |
| Mastery for imported items: per Hop Quest skill, key `imp:<grade>:<skill tag>` | O | D4 |
| Art references for Lanes A and B confirmed (rule 13); code-drawn and gradient art until ComfyUI layers land | O | A2-A6, B1-B5 |
| Only Great Wall starts unlocked; Petra needs the Great Wall stamp; the other five stay locked | O | B2, B5, C1 |
| Boss "last stand": at 0 hearts the boss stays lost and its remaining questions are still asked and graded, so the session always completes | O | A5 |
| Code-drawn takin (node challenger) and snow leopard (boss) approved for now; names and taunts stay PENDING copy | O | A6 |
| Load limit: at most two browser test stacks at once on the Studio PC; a check failure caused only by PostgreSQL connection timeouts does not count toward the 3-failure stop | O | all lanes, CI |
| Question mix (6 generated, 4 imported per 10) applies only to sessions with the new mode `expedition`; the gate quiz (mode `multiplication`) stays 10 multiplication questions | O | D5 |
| A full expedition is 15 questions (`EXPEDITION_SESSION_LENGTH`), provided no existing test changes | O | D5, B |
| A text answer to a number question (and a number answer to a text question) is rejected with 400, so the existing server-authority test stays unchanged | R | C-text |
| Imported grade defaults to 3 (`IMPORTED_ITEM_GRADE`, one place) until the owner sets the grade source | R | D4 |
| Gemini review 1 (`9ff9d70..bd66cfb`): 0 High, 0 Medium, 3 Low. Low 2 (unused exports) resolved by `ff65722` and the learning-core re-export; Low 1 (destination getter) kept for now, removed at the Lane B merge if Lane B does not use it; Low 3 (RunScene literal start request no longer asserted) gets a NEW test asserting RunScene passes `{ gameId: 'zoo-sprint', mode: 'multiplication' }` (no existing test changed), Lane A next run | R | A |
| Sharded CI runs at most two shards at a time (`E2E_SHARD_CONCURRENCY`, default 2) | R | CI |
| Starting a session with a different mode expires the player's active session of the other mode (one active session per player and game; same mode still resumes). Accepted from Lane D (D5) | R | D5 |
| Merge order for day 1: A, then C (C1, C2, C4, C-text: unblocks the API typecheck), then D (with the `correctAnswer` widening applied at integration), then B (scene registration, expedition mode in its start call) | R | integration |
| `SessionResultsSchema` gains OPTIONAL `beaconsLit` (0-5), `stampEarned`, `level`, `levelUp` (proposal 3 Lane C calls for them; no existing test pins the results keys; the 2.6 `results()` signature is unchanged) | R | C2, C4, B4 |
| The server learns an expedition's destination through a new route `POST /api/v1/me/expedition/runs` { sessionId, destination } (checks ownership and unlock, records an `expedition_events` 'start' row), not through the start request, whose keys an existing test pins | R | C2, A (session client) |
| Accepted from Lane C run 2: one-line `database/schema/attempts.ts` type edit; 400 `invalid_request` on an answer-kind mismatch; level curve placeholder xpStep 100, cap 50 (PENDING owner tuning) | R | C-text, C4 |

#### Decisions, continued (November 9 to 10, 2026)

| Decision | By | Applies to |
| --- | --- | --- |
| `SessionResultsSchema` gains OPTIONAL `beaconsLit` (0-5), `stampEarned`, `level`, `levelUp` (proposal 3 Lane C calls for them; no existing test pins the results keys; the 2.6 `results()` signature is unchanged) | R | C2, C4, B4 |
| The server learns an expedition's destination through `POST /api/v1/me/expedition/runs` { sessionId, destination } (ownership and unlock checked; an `expedition_events` 'start' row), not through the start request, whose keys an existing test pins | R | C2, session client |
| Accepted from Lane C: the one-line `database/schema/attempts.ts` type edit; 400 `invalid_request` on an answer-kind mismatch; level curve placeholder xpStep 100, cap 50 (PENDING owner tuning); the existing `idempotency_key_conflict` code for a second destination on one session; level computed on read, not stored | R | C-text, C2, C4 |
| Each lane's REPORT.md is kept as `docs/lane-reports/<lane>.md`; integrate.ps1 resolves that one conflict and aborts on any other. Textual conflicts between lanes are resolved by the integration workspace, then gated by CI | R | integration |
| Gear: the third slot is a held "trail stick", not a pack (LOCKED: Dino exactly one backpack, Koala none); no gear covers a LOCKED feature | R (LOCKED rules win) | C3 |
| Lane C C3 art references confirmed (rule 13) | O | C3 |
| Text answers: the client sends them; one existing test (session-client.test.ts, the refusal check) changed to check the text value is sent | O | A3, D3 |
| The expedition question mix stays OFF in any deploy until A9 (text-choice tiles) is merged and a Playwright test shows a child answering a text question in an expedition. Implemented as `expeditionMixEnabled()`: off under NODE_ENV=production unless EXPEDITION_MIX=1 | O | D5, deploy |
| Client-bundle scan gains the markers `content-import` and `math-items` | O | validator tooling |
| Validator baseline counts: unit 126, integration 937 + 3 todo, Playwright 292 in 4 projects (all increases are new test files; see commit 67d2367) | O | validator |
| Gemini review 4 High: destination ids come from ONE list, `EXPEDITION_DESTINATIONS` in `@bidazoo/contracts`, which the game imports (via `@bidazoo/game-sdk`). Short ids everywhere: great-wall, petra, andes, maya, taj, nile, philippine-highlands (matches docs/visual/13). The 6 asset folders are renamed. Existing-test edits approved, id strings only: `expedition.spec.ts` lines 72 and 83, `destination-model.test.ts` lines 126-133. No 2.6 signature changes (`DestinationId` stays `string`). New integration test: every manifest id is accepted by `POST /api/v1/me/expedition/runs` | O (Nov 10) | Lane B, integration |
| Gemini review 4 Medium: the map board shows unlocks from the server's `progress.unlocked` (registry `expeditionUnlocked`, set from `getExpedition()`); manifests give only the lock-screen text; until the server answers, only Great Wall is open; tiles update in place | O (Nov 10) | Lane B, integration |
| Quick Lows fixed in the same pass (Lane C): a retried answer with the other JSON type is a 400, not a replay; `POST .../expedition/runs` is a 409 once the session has answers; Drizzle `ledger.ts` mirrors migration 0007's checks. Doc typo in the content report (316 usable, not 296) | R | Lane C, docs |

#### End of day 1 (written November 10, 2026, about 07:15 CST)

Integration tip: `83be761` (all four lanes merged: A1 to A6, B1 to B5 with B3 and B4, C1, C2, C3, C4 and text
answers, D1, D3, D4, D5 and the session mix). Every merge passed typecheck, Vitest on real PostgreSQL and the
sharded Playwright suite (latest: 291 passed + 1 flaky of 292). Nothing deployed.

**Full validator: NOT RUN yet.** `scripts/validate-studio.ps1 -Recreate` asks a person to type "yes" before it
drops `bidazoo_test`/`bidazoo_e2e`, so an agent cannot run it unattended. It goes to the owner with the exact
command. Known risk: `tests/e2e/cast-production-flow.spec.ts:370` ("a run with <starter> starts and takes an
answer, with the production art loaded") was flaky twice in sharded CI under load (bronco, then koala); the
validator fails on any flaky test.

Actual versus estimated agent-hours (Appendix A; actuals from the lane reports, mostly waiting on checks):

| Item | Estimate | Actual |
| --- | --- | --- |
| A3 + A1 (bake-off) | 5 | 0.9 |
| A review Lows, A2, A4, A5, A6 | 12.5 | about 3 (14:05 to 18:00, including the outage stop and four check runs) |
| B registry, B1, B2, B5, B3, B4 | 16 | about 4.7 elapsed (14:07 to 18:50, including the outage stop); agent-hours not reported |
| C1 | 4 | 1.2 active |
| C-text and C4 curve (run 2) | (C4: 2) | 0.6 |
| C2 and C4 results (run 3) | 2 | about 1.1 |
| C3 | 5 | 3.6 (3.2 of it waiting for a test slot) |
| D3, D1, session mix | 9 | 0.5 |
| D4, D5 (added November 9) | none | about 0.7 |
| Playwright sharding (integration) | 2 | about 1.5 |

Measured productivity is above the Appendix A rate on every item, so the re-plan stop condition does not apply.
Wall-clock time was lost to the 14:40 outage stop and to queueing under the two-stack limit.

Open items:
- Owner: run the full validator (command in the day-1 summary); deploy only on the owner's go.
- Gemini reviews 2, 3 and 4 queued in `.bake/review-queue/` (owner-run).
- Day 2: gear drawn on the Basecamp walker and bust (Lane B), A9 text-choice tiles plus the Playwright proof the
  owner asked for before the mix is turned on, A7, A8, B6, B7 as ComfyUI layers land, C5 to C8, Lane A's
  `ce33088` (new RunScene start test) to merge.
- All kid-facing copy in `docs/COPY.md` is PENDING owner approval; nothing PENDING ships.
- The identity flag stays off (C7 not started), so the deploy script's `identity absent` check is unchanged.
- Gemini Lows NOT fixed in the quick pass (results in `.bake/review-results/`):
  - R3: `POST .../expedition/runs` does not check `mode === 'expedition'`; adding it changes existing tests in
    `expedition-completion.test.ts` (they start runs on multiplication sessions), so it needs the owner. The
    mid-session part is fixed (409 once answered).
  - R3: `xpAtEndOfSession` (`sessions/views.ts`) returns 0 if a completed session had no XP events (not reachable
    today: completion always grants 25 XP).
  - R3: `gradeSubmitted` duplicates the string-answer check instead of calling the widened `gradeAnswer`.
  - R2/R3 unused code: `playerProgress`/`GearState` exports, `DestinationIdSchema`, `LEVEL_CURVE`/`xpForLevel`/
    `levelProgress` (tests only), `isImportedSkillKey`, `excludeIds`, `progress/index.ts` re-exports that
    callers bypass, `PlaySessionClient.destination` getter (Lane A).
  - R2/R3/R4: an unreachable `app.register(progressModule)` line in `progress-expedition.test.ts:60`,
    `expedition-completion.test.ts:55`, `progress-gear.test.ts:60` (removing it is an existing-test change).
  - R4: gear is saved but not drawn on the walker or bust (already the day-2 Lane B item).
  - R2: the `as number` cast on `correctAnswer` was already removed in `ed3f41b` (no action).
- Gemini re-review 5 (High and Medium fixes, `5a7f1b2..64a4a46`): clean, 0 High, 0 Medium. Two Lows, open:
  - `tests/scripts/refresh-painted-provenance.mjs:76` hardcodes the seven ids instead of reading the destination
    folders or `EXPEDITION_DESTINATIONS`.
  - `isUnlocked` and the manifest fields `unlock.startsUnlocked`/`unlock.requires` are no longer used at runtime
    (only by `destination-model.test.ts`). The Andes lock text ("Earn a stamp at the Great Wall to open this
    trail.") does not match the server, which opens Andes only after Petra too; the text is kid-facing copy
    (PENDING in `docs/COPY.md`), so the fix goes with the owner's copy review.
- Lane C quick Lows (`lane/progression` at `9f25511`) are NOT merged yet. The first CI run was red on one
  Playwright test unrelated to Lane C (`expedition.spec.ts:113`, phone: under load the buddy walked past the first
  artifact into the first encounter before the test pressed "next stop"; the same test passed in all four
  projects one hour earlier). The re-run was stopped by the orchestrator so the owner's validator runs with no
  other checks. Merge after the validator. That test is a flake risk for the validator; making it robust is an
  existing-test change and needs the owner.
- Load rule slip (November 10): Lane C ran two of its own check stacks at once by mistake while doing the Lows.

#### Release candidate 2fcf73e (November 10, 2026)

- Full validator: run 20261110-161337 FAIL on counts only (integration 955 vs 937; owner approved 955 in `2fcf73e`);
  run 20261110-162537 FAIL on one `net::ERR_NO_BUFFER_SPACE` browser error (play.spec, tablet; passed on retry);
  **run 20261110-173132 PASS on `2fcf73ecffb016ada40edcfee904acd4587e82f8`** (owner-run). Owner go to deploy.
- Deploy prepared, not run: `Documents\BidaZoo-release\deploy-2fcf73e.ps1/.bat` (copy of `deploy-390e0b4`,
  candidate 2fcf73e, rollback target 390e0b4, pg_dump backup kept). Added checks: migrations 5 -> 8 (0005, 0006,
  0007) and their schema effects; `api.env` must set `NODE_ENV=production` and must not set `EXPEDITION_MIX` (mix
  OFF); identity variables absent (identity OFF, unchanged). The live clone fetches from GitHub, so the owner pushes
  `integration/world-expedition` first.
- Full rollback prepared: `rollback-2fcf73e.ps1/.bat` (safety dump of the current database, app to 390e0b4, restore
  of the pre-release dump in one transaction after dropping the three 0005 tables). Needed because 0006 changes
  `attempts.submitted_response` to text, which 390e0b4 reads as an integer. Rehearsed on a scratch database on the
  build cluster (54330, never live): schema back to 5 migrations and integer, pre-deploy rows restored, re-deploy
  migrates again cleanly.

#### Live QA of 2fcf73e: four owner-found blockers (November 10, 2026, evening)

The owner played the live build 2fcf73e on play.bidazoo.com and found four blocking bugs. Each has a browser
test with REAL taps (touch on the phone and tablet projects, mouse on desktop) that failed on 2fcf73e and passes
with the fix: `tests/e2e/world-expedition-qa.spec.ts` (helpers in `tests/e2e/world-helpers.ts`). No existing
test and no validator file was changed. Nothing is deployed; the owner decides the deploy.

| Owner's bug | Root cause (from the code and the live proxy log) | Fix |
| --- | --- | --- |
| 1. Outfitter purchase never confirms | Every purchase PUT on live returned 200 (Caddy access log, 20:46 to 20:51 CST). A viewport change (the browser bar collapsing on a phone, a rotation) made `BasecampScene.build` close and re-open the overlay, so the answer landed on a dead overlay and the fresh one showed the pre-purchase state. | An open overlay survives a rebuild; every overlay lays itself out again on the resize event (the map board gained that; the outfitter already had it). |
| 2. "Open the map" opens the outfitter, then the game locks up | The Basecamp prompt chip was re-used and kept every earlier prompt's tap listener (and its first hit area), so one tap at the map board also fired "Visit the lodge" from a few steps back, and the lodge won. The outfitter's Close destroyed itself without telling the scene, which kept a dead overlay: walking stayed off, nothing opened. | A fresh chip container per prompt. `openOverlay` listens for the container's `close` event and closes properly. |
| 3. After the boss the game dies instead of the summit | `SummitScene.build` returned early on `sys.isActive()`, which is false inside `create()` (Phaser reports CREATING, not RUNNING), so the summit drew nothing until a resize. | Draw in `create()`; only the resize path checks the scene is still alive. |
| 4. Layout breaks after rotating | On a phone turned on its side the outfitter squeezed its three slot rows to 32 px cards (under the 48 px tap floor). The resize path also destroyed and re-opened overlays (see 1). | Pure `outfitterLayout()` (`outfitter-layout.ts`, unit-tested on nine views): slot rows in portrait, slot columns in a short landscape; cards never under the floor. |

- Also found by the rotation tests, rarely (a handful of times in some forty rotation-heavy runs; at the summit, in
  an encounter, in Basecamp): the window turned but the canvas never followed, with no error anywhere. The cause
  is in Phaser 3.90's Scale Manager: `updateScale()` ends with `getParentBounds()`, which records the element's
  size as already seen and drops the answer, so a second size change that lands while the first is being applied
  (a turn, then the browser's own relayout) is never applied: `parentSize` says landscape, the canvas stays
  portrait, nothing is dirty, and no later frame fixes it (captured in `data-scale-refresh-last`:
  element 640x360, parentSize 640x360, game 360x640, dirty false). On a phone this is "the layout breaks after
  rotating": a canvas left at the old size in a turned window. The game shell now runs `keepFittedAndAlive`
  (`games/zoo-sprint/src/index.ts`): after every window resize (150 and 600 ms later) and twice a second, a
  canvas that is not the size of its element gets `scale.refresh()`; a frame counter that does not move for three
  browser frames gets the loop restarted. It publishes `data-scale-refreshes`, `data-loop-restarts` and
  `data-scale-refresh-last`. Worth reporting upstream to Phaser.
- Test hooks added (presentation only): `data-hotspots` and `data-hotspot-radius` on Basecamp (where the map
  board, lodge door and banner stand), so a test can walk to the map board without blundering into the gate.
- Whole-loop test (owner requirement): `tests/e2e/world-loop.spec.ts` plays Basecamp, map board, Great Wall, five
  encounters and the boss (fifteen real-tap answers), the summit turned to landscape and back, the outfitter
  (buy and wear the Red Scarf, checked against `GET /api/v1/me/gear`), two more turns and walking in Basecamp.
  **It must pass on every Playwright project before any deploy.** The deploy script lives outside the repository
  (`Documents\BidaZoo-release`), so this gate is a rule for the owner's checklist until the script checks it.
- Validator baselines (owner approval needed, not changed here): Playwright 292 -> 316 (6 new tests x 4
  projects); Vitest integration 955 -> 965 (`tests/integration/outfitter-layout.test.ts`).
- Test stacks used: this worktree's own ports 3131/4231 and 3141/4241 with databases on the build cluster
  (54330); never a live port; at most two stacks at once.
- Results on the final code (November 11, 2026, early morning): typecheck PASS; Vitest unit 126, integration 965
  passed + 3 todo; `world-expedition-qa.spec.ts` 5 of 5 and `world-loop.spec.ts` 1 of 1 on all four Playwright
  projects (bug 2a's walk also 3 of 3 at 1440x900 and once more on each touch project with the final helper);
  rotation sampling 4 of 4 more at 360x640 with the refit firing at most once per run. Existing specs
  (basecamp, expedition, play), run alone with no retries: tablet 17 of 17; phone-small 16 of 17 and desktop 16
  of 17, each miss a known load-sensitive race of an unchanged test (play.spec full run's feedback capture;
  basecamp.spec's walk into the gate) that then passed 3 of 3 when rerun alone. Under two concurrent stacks the
  same two walk-based tests and expedition.spec's first-artifact walk flake, as already recorded above.

#### Graphics to replace (placeholder visuals; never block a merge or deploy)

| Placeholder | Where | Replace with |
| --- | --- | --- |
| Great Wall node challenger (golden takin), code-drawn | `games/zoo-sprint/src/encounter/challengers.ts` `drawTakin` | Painted file per `docs/art-requests/great-wall/challenger.md` |
| Great Wall boss (snow leopard), code-drawn | `challengers.ts` `drawSnowLeopard` | Painted file per `docs/art-requests/great-wall/boss.md` |
| Encounter backdrop (sky, peaks, wall, beacon tower, ledge), code-drawn | `EncounterOverlay.ts` `drawStage` | Lane B's painted Great Wall layers |
| Hearts, charge meter, strike pips, special-move burst, banners, code-drawn | `EncounterOverlay.ts` | Optional UI art (docs/visual/13); the owner keeps warm rose hearts |
| Seven destination backdrops, palette gradients | `games/zoo-sprint/assets/world-expedition/destinations/*/manifest.json` | Owner's ComfyUI layers per `docs/art-requests/<destination>/` (B7) |

**How to read this file.** Statements say where they are true. "Complete" and "closed" describe development
and validation; "deployed" means running in the live closed beta; "enabled" means switched on in production.

**`main` is the release candidate (November 3, 2026).** On the owner's instruction, `main` now contains,
fast-forward with no conflicts: the Checkpoint E identity work, the post-F6 documentation reconciliation, the
F1-F6 runtime (`f3b5483`), the release rehearsal tooling (`release/founding-family-beta`, `46fe5eb`), and the
World Expedition visual recovery (`feature/world-expedition-visual-recovery`, `6cedf93`), plus validator and
rehearsal-tooling updates for that combination. The candidate SHA is the `main` commit the owner validates;
any later commit on `main` is a new candidate. **Not yet Studio-validated, not deployed.** The exploration
spike (`spike/world-hub-exploration`) is NOT merged: it is unfinished and not authorized.

**Product direction (owner, November 3, 2026):** BidaZoo is the platform and main product; BidaZoo sign-in
is the master account; Hop Quest's features are rebuilt inside BidaZoo on its server-authoritative model; the
Hop Quest site becomes a trial that leads into BidaZoo; first release is math only. Details:
[PRODUCT.md](PRODUCT.md) and "Roadmap" below.

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
| Closed-beta deployment (`play.bidazoo.com`) | **LIVE, guest-only, running the validated candidate `c0fdbaf6935fc9048cc8aa3a8fcdd77218a7c467`** (deployed Wednesday, November 4, 2026, 7:09 AM CST by the owner's decision to skip the rehearsal kit; pre-cutover `pg_dump` kept in `C:\BidaZoo-beta\backups-release\`; identity OFF; no data changed). Before this the live tree was `46fe5eb` (the October 15 candidate), not `1a106bc` as previously recorded. Same closed-beta architecture (Studio PC, own Caddy :8480, own tunnel). |
| Release work (release-candidate integration through founding-family beta) | **IN PROGRESS.** Step 1 (integration) is done and **merged into `main`** (November 3, 2026, with the visual recovery). Step 2 is **DONE**: official Studio validation of the exact `main` SHA `c0fdbaf6935fc9048cc8aa3a8fcdd77218a7c467` **passed** on November 3, 2026 (51 unit, 685 integration + 3 todo, Playwright 244/244 in 4 projects, Chromium 156.0.8078.4, Playwright 1.64.0, PostgreSQL 16.15, build, scan CLEAN, playthrough ALL CHECKS PASSED, exit 0; run folder `.validation-logs\20261103-214204`; see [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md)). `c0fdbaf` is the validated release candidate. **Not deployed**; the release rehearsal (step 3) is next and needs the owner's go. See "Remaining work". |
| World Expedition visual recovery (Choose Your Buddy, gameplay and results rebuilt on a shared presentation layer) | **On `main`** (`6cedf93`). Presentation only. Sandbox: unit 51, integration 685 + 3 todo, build, client scan CLEAN. Owner decisions still open: trait copy, `PRESENCE_EXPONENT`, higher-resolution art. See [visual/18](visual/18-world-expedition-visual-recovery.md). |
| Checkpoint W1 (Expedition Basecamp: walkable home screen, whole-body buddy, Basecamp Gate portal into Zoo Sprint) | **BUILT, look accepted by the owner (November 4, 2026)** on `feature/w1-basecamp-walk`; presentation only (no API, database or progression change). Sandbox: typecheck, unit 51, integration 724 + 3 todo, build, client scan CLEAN; Playwright on all four projects (supplementary Chromium). **Not Studio-validated, not merged, not deployed.** See [visual/20](visual/20-basecamp-walk.md). The validator now expects 724 integration and 272 Playwright. |
| Painted look pass (Basecamp B, painted cast and expressions on every screen) | **BUILT, owner-approved (November 7, 2026)** on `claude/loving-noether-e40ung`, merged into `main` the same day; presentation only. Painted Basecamp backdrop (far and mid layers), painted full-body cast and 36 painted expressions, all from OpenArt Nano Banana 2 with per-file provenance; code-drawn and original art stay as fallbacks. Masters in `docs/reference-art/world-expedition/painted-v1/`. **Studio-validated November 7, 2026 at `390e0b43e710983b1caab8cd3c239edb525bd63e`** (branch `tooling/validator-e2e-ports`, `b2e5ef5` + 4 commits: validator ports, stale lab tests, a play.spec race, and one Basecamp fix for the buddy clipping at a screen edge after rotation): 51 / 747 + 3 todo / 276 of 276, 0 flaky / build / scan CLEAN / playthrough ALL CHECKS PASSED, exit 0; run folder `.validation-logs\20261107-220423` (see [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md)). `390e0b4` is the release candidate; merge it into `main` fast-forward only. **Not deployed**; deployment needs the owner's go. |

## Baselines and commits

- **`main`:** `c0fdbaf6935fc9048cc8aa3a8fcdd77218a7c467` ("Merge release candidate + World Expedition visual
  recovery into main (#1)", November 3, 2026). This is the **validated release candidate** (official Studio
  run passed November 3, 2026; see [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md)). It contains Checkpoints A-E,
  the F1-F6 runtime (`f3b5483`), the release rehearsal tooling, the World Expedition visual recovery
  (`6cedf93`), the tab icon and the desktop test allowances (`0e7d563`, the rehearsal application baseline).
  Documentation-only commits may follow it on `main`; they are not the validated SHA, and any commit that
  changes application code, tooling or the validator is a new candidate that needs its own run.
- **Historical branches (merged into `main`, kept for lineage only):**
  `feature/world-expedition-runtime-integration` (`f3b5483`, the F5 validated runtime);
  `release/identity-beta` (`d90f572`, rehearsal tooling); `release/founding-family-beta` (`46fe5eb`, the
  October 15 candidate: runtime + tooling retarget + validator hardening);
  `feature/world-expedition-visual-recovery` (`6cedf93`). Before the merge, `main` was `856d012` (Checkpoint E closure).
- **Not merged:** `spike/world-hub-exploration` (unfinished, not authorized).
- **Deployed in the live closed beta:** `c0fdbaf6935fc9048cc8aa3a8fcdd77218a7c467` since November 4, 2026 (see the Status table). Rollback target for the next release: this commit. `1a106bc` (Checkpoint D) is the original closed-beta deploy, per [DEPLOYMENT-CLOSED-BETA.md](DEPLOYMENT-CLOSED-BETA.md) section 9.
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
- **World / Explore / Basecamp** started on November 4, 2026 with Checkpoint W1 (owner decision, ahead of
  roadmap G): the walkable Basecamp with the gate portal. Destinations, the map room and anything the
  world might unlock or reward remain unauthorized (see [visual/20](visual/20-basecamp-walk.md)).

### Roadmap (owner direction, November 3, 2026; each checkpoint still needs the owner's go)

- **G. Content engine.** Generalize `learning-core` and the session flow from multiplication facts to
  Hop Quest's item format (mc, ms, numeric with number-line and grid input, sort, order; drawn figures),
  server grading and answer secrecy; import the Hop Quest math bank (1,869 items) with its school-year
  pacing and variant families; server-side placement test.
- **H. BidaZoo app screens (math).** Kid home (buddy, daily quest), question player, results, skill map,
  placement test; parent dashboard on Checkpoint E identity. Phone first, BidaZoo art. Phaser stays for
  game moments (Zoo Sprint, the future world).
- **I. Rewards and shop on the server** (coins, buddy accessories), replacing Hop Quest's browser-trusted economy.
- **J. Hop Quest trial and migration.** The Hop Quest site becomes a trial that leads into a BidaZoo family
  account; existing Hop Quest families claim their accounts (Checkpoint E legacy claim); Boss Hop moves to
  BidaZoo's APIs.
- Then reading (content and screens). World / Explore / Basecamp: W1 (Basecamp walk) was pulled ahead and built on November 4, 2026; later world phases still need their own go.

### Release work (steps 1 and 2 done; the rest OPEN)

The remaining release path:

1. Final release-candidate integration (bringing the closed runtime branch and the release tooling
   into one candidate). **DONE and merged into `main`** (November 3, 2026), together with the visual recovery.
2. Exact-SHA validation of that candidate on the Studio PC with the pinned Chromium. **DONE and PASSED**
   (November 3, 2026) for `c0fdbaf6935fc9048cc8aa3a8fcdd77218a7c467`: every baseline count and version
   matched exactly, exit 0 (record in [STUDIO-VALIDATION.md](STUDIO-VALIDATION.md)). Any new commit on
   `main` is a new candidate and needs its own run.
3. Release rehearsal: **skipped by owner decision** (November 4, 2026). The rehearsal kit remains unexecuted.
4. Backup and rollback verification: a pre-cutover `pg_dump -Fc` (164 TOC entries, SHA-256 recorded in the deploy log) was taken; a scratch restore was **not** performed.
5. Production application deployment: **DONE** (November 4, 2026; `c0fdbaf` live; identity OFF; M6 headers observed on the public URL: HTML `no-cache`, hashed assets `max-age=31536000, immutable`, CSP present).
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

**Rehearsal tooling.** `infrastructure/deployment/identity-release/` (scratch-cluster backup
verification, restore and migration checks, rollback proof, the M6 header gate, and maintenance-window,
rollback and enablement checklists) is part of the release-candidate branch. It was **retargeted on
October 15, 2026**: the candidate is now immutable input (`-CandidateSha`, never a constant in a script),
refused unless it is a full SHA with the expected ancestry and differs from the validated runtime only in
documentation, tooling and the validator. `1a106bc` (the live beta) remains the only rollback target;
`a283c24` and `856d012` are kept only as lineage references. Production identity stays OFF by default. It is
**still untested on the Studio PC**: no checklist has been executed (scripts were parsed and their pure
helpers exercised in a Linux sandbox only; see its README).

**Next candidate (W1).** When W1 is merged, that merge commit is a new release candidate: it changes game
code, so `infrastructure/deployment/identity-release/` (`$ShaApp = 0e7d563`) would refuse it until its
application baseline is moved; the Studio validator already expects the W1 counts (51 / 724 / 3 / 272).
Studio validation of the exact merge SHA, then a deploy with a pre-cutover dump (rollback target
`c0fdbaf`), is the path.

## Rules for future sessions

1. Orient first: read this file, then README, ARCHITECTURE, SECURITY, and CHANGELOG, then inspect
   `git status` and recent history.
2. Do not start any further checkpoint or phase (Studio validation of the candidate, release rehearsal,
   deployment, SMTP or DNS work, identity enablement, privacy work, World / Explore / Basecamp, and so on) until
   the project owner explicitly authorizes it. Do not reopen closed checkpoints.
3. Keep BidaZoo's runtime isolated from production systems (Hop Quest, Fact Crew, jonabalos.com Accounts, the
   Clickaroo Games Hub, the existing Caddy, existing Cloudflare tunnels and DNS). The closed beta uses
   its own BidaZoo Caddy and a dedicated BidaZoo tunnel. Copying content and screen ideas FROM the Hop Quest
   repository into BidaZoo is allowed (owner direction, November 3, 2026); changing Hop Quest itself happens
   in the Hop Quest repository under its own rules.
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
