# BidaZoo World Expedition: build proposal (five workspaces, continuous integration; four-day critical path)

Written Sunday, November 8, 2026. Adopted by the project owner as the plan of record. It is written to be
executed by any capable coding agent without further conversation with its author. Everything referenced
exists in this repository at `390e0b4` (live on play.bidazoo.com since November 8, 2026, 1:35 AM CST) unless
marked NEW. The build branches from `main` at `b61ad9c`, which is `390e0b4` plus docs-only commits.

Revised Sunday, November 8, 2026 with the owner's decisions (section 10). Where this revision and an
earlier copy differ, this revision governs.

## 0. Current state

- **Backend: done.** Fastify API, PostgreSQL, Drizzle, server-authoritative play sessions, grading, XP and
  coins, mastery, guest identity, full family identity (Checkpoint E, validated, never deployed), closed-beta
  deployment on the Studio PC with its own Caddy, tunnel, backups, a 276-test Playwright suite, a validator and
  a one-click deploy. None of it needs rework for anything in this proposal.
- **Art pipeline: done.** Painted Basecamp, five painted full-body starters, 36 painted expressions, painted
  side-view walkers, provenance per file, code-drawn fallbacks, a character bible, palettes per destination.
- **Game: a 10-question multiplication quiz.** `RunScene` shows a prompt and four integer choices; `ResultsScene`
  shows totals. Content is `packages/learning-core/multiplication.ts` only (single-digit products). The Basecamp
  is a 1.5-screen walk to a gate that starts the quiz. There is no world, no encounter, no visible progression,
  and no daily reason to return.

This proposal adds the game on top of the existing systems: gameplay work first, a deploy every day, the
existing validation and deployment tooling unchanged underneath.

## 1. The game (definition of done for this proposal)

A kid aged 6 to 12 opens play.bidazoo.com on a phone or iPad, picks a buddy, and:

1. stands in Basecamp, taps the **map board**, sees seven destinations, two unlocked;
2. walks the **Great Wall** path: a painted scrolling ridge with five **encounters** and hidden artifacts;
3. in an encounter, faces a **challenger** (a destination creature): each correct answer is a strike, each
   wrong answer costs a heart, three correct in a row charges the buddy's **special move**; a timer ticks;
   win the encounter, the beacon lights, the path continues;
4. beats the **boss** at the summit, gets a **passport stamp**, levels up, earns coins;
5. spends coins in the **outfitter** on a hat, scarf or pack the buddy wears everywhere;
6. comes back tomorrow for the **daily expedition** (a 5-encounter route with a bonus) and a **streak**;
7. meanwhile a **parent** signs in (the existing identity system) and sees what the child practiced, how
   fluent they are, and the streak.

Math content for grades K to 8 comes from the owner's Hop Quest bank (owned, server-side;
`apps/hop-quest/bank/` in `github.com/jabbalos/hopquest`, copy at `Documents\Hop-Quest\bank`), imported into
`learning-core` so the adaptive selection has depth. Reading is out of this build (section 10).

## 2. Architecture (additive; the five decisions that make it fast)

1. **Encounter = presentation over the existing play session.** `POST /play-sessions` starts a session;
   each encounter consumes two questions from it (`GET .../question`, `POST .../answers`). Hearts, strikes,
   streak charge and timer are client state derived from `AnswerResult` (`correct`, `fluent`, `responseMs`,
   `rewards`). The server never trusts the client for XP, coins or stamps. A session ends the way it does
   today; `SessionResults` feeds the summit card. One session = one destination run of five encounters.
   The encounter state machine is a pure module in `packages/learning-core` (NEW `src/encounter/`), imported
   by both the game and the API. At session completion the server replays its own stored answers through
   that module to compute beacons lit; the client never reports beacons, hearts or strikes to the server.
2. **Destinations are data.** NEW `games/zoo-sprint/assets/world-expedition/destinations/<id>/manifest.json`:
   layers (far/mid/near, scale rules like `basecamp.json`), `pathLength` in screens, `nodes[]` (fraction along
   the path, type `encounter|boss|artifact|rest`), `challenger` (id, name, art, taunt lines), `palette`,
   `audio`. `ExpeditionScene` renders any manifest. The seven destinations in
   [visual/12](visual/12-destination-worlds.md) become seven folders.
3. **Progression is a small server addition.** NEW migration: `player_progress` (level, xp_total is already in
   totals; add `gear jsonb`, `streak_days`, `last_play_date`), `destination_stamps` (player, destination, count,
   best_streak, artifacts jsonb), `expedition_events` (session, kind, payload). NEW routes under
   `/api/v1/me/`: `expedition` (stamps + unlocks), `gear` (GET/PUT, validated against a server-side catalog
   priced in coins; purchase debits coins server-side), `daily` (today's route id + whether it is done).
   Guests keep working: everything keys off the existing player id.
4. **Content import, not content authoring.** NEW `packages/content-import`: a CLI that reads the nine
   `bank-math-g*.js` files of the Hop Quest bank and emits `learning-core` question sets keyed by `grade`,
   `domain`, `skill` and `teks`. Scope: 196 items, the plain multiple-choice items with no picture (156
   four-choice items in grades 2 to 8, 40 three-choice items in K and 1). `PublicQuestion` gains an optional
   `kind: 'number' | 'text'` and text choices, 3 or 4 per question. Session generation mixes questions in
   blocks of 10: 6 generated multiplication, 4 imported (a 15-question expedition is 9 and 6). Grading stays
   server-side; answers and rationales never reach the client.
5. **Identity ON for the owner's family first.** Checkpoint E is built and validated on branch
   `checkpoint-e-identity`. Before day 2, verify it is merged into the build base
   (`git merge-base --is-ancestor checkpoint-e-identity HEAD`). If it is, flip it on in the beta with the owner's
   family as the only parent account, keep guests working, then widen; the parent dashboard is a plain page
   over `/api/v1/family/*` plus the new progress routes. If it is not, C7 and C8 leave this build and the
   beta ships guest-only.

Everything above is additive. The existing tests keep passing; new tests are added beside them.

### 2.6 Interfaces fixed before any lane starts (so lanes never wait on each other)

These six contracts are written into the repository by the integration workspace in the first hour of day 1,
each as a file with the signatures below and a stub implementation, together with
`games/zoo-sprint/src/contracts.check.ts` (type-level assertions on every signature, so a change fails
`npm run typecheck`). Lanes code against them; a lane may add to its own side but may not change a signature
without the integration workspace's merge.

1. **Encounter overlay** (owned by Lane A; called by Lane B). `games/zoo-sprint/src/encounter/index.ts`:
   `startEncounter(scene: Phaser.Scene, opts: { session: SessionClient; questions: number; kind: 'node' | 'boss';
   challenger: ChallengerId; buddy: CharacterId }): Promise<EncounterOutcome>` where
   `EncounterOutcome = { won: boolean; correct: number; asked: number; bestStreak: number; heartsLeft: number }`.
   Day-1 stub: runs the existing question UI for `questions` questions and resolves with counts.
2. **Session client** (owned by Lane A; used by RunScene, the encounter and Lane B's summit).
   `games/zoo-sprint/src/session-client.ts`: `startSession(req: StartPlaySessionRequest & { destination?: DestinationId })`,
   `nextQuestion()`, `submitAnswer(choice)`, `results()`, wrapping the calls RunScene makes today.
3. **Basecamp overlay registry** (owned by Lane B; used by Lanes B and C). `games/zoo-sprint/src/basecamp/overlays.ts`:
   `registerOverlay(id: 'map' | 'outfitter' | 'passport' | 'daily', def: { hotspot: 'map-board' | 'lodge-door' |
   'banner'; open(scene: BasecampScene): Phaser.GameObjects.Container })`. `BasecampScene` owns the hotspots and
   calls `open`; nothing else in `BasecampScene.ts` is edited by A or C.
4. **Progress contracts** (owned by Lane C). New file `packages/contracts/src/progress.ts` exporting
   `ExpeditionProgressSchema`, `StampSchema`, `GearSchema`, `DailySchema` and the `/api/v1/me/*` paths added to
   `ApiPaths`. The hour-1 commit adds `export * from './progress'` to `packages/contracts/src/index.ts`; Lane C
   does not edit that file.
5. **Question kind** (owned by Lane D; consumed by Lane A's tile layout). In `packages/contracts/src/index.ts`,
   `PublicQuestionSchema` gains `kind: Type.Optional(Type.Union([Type.Literal('number'), Type.Literal('text')]))` and
   `choices` becomes 3 or 4 integers, or 3 or 4 strings; absent `kind` means `number` (today's behavior).
   Lane A lays out 3 and 4 tiles, `number` and `text`, against this shape on day 1 with a fixture; no server
   change is needed for that.
6. **Encounter model** (owned by Lane A; used by the encounter overlay and by Lane C's stamp hook).
   `packages/learning-core/src/encounter/encounter-model.ts`, exported from `packages/learning-core/src/index.ts`:
   a pure state machine with no Phaser, DOM or clock access. `createEncounter(opts: { questions: number; kind: 'node' | 'boss'; specialMoves: number }): EncounterState`,
   `applyAnswer(state: EncounterState, answer: { correct: boolean }): EncounterState`, and
   `replayExpedition(answers: { correct: boolean }[]): { beaconsLit: number; bossWon: boolean }` (five node
   encounters of two questions, then the boss of five, carrying the charge meter across encounters). The timer
   is not an input: timer expiry has no effect on state.

Shared-file ownership: `BasecampScene.ts` Lane B; `basecamp/overlays.ts` Lane B after the hour-1 stub;
`packages/contracts/src/index.ts` Lane D (item 5 only, after the hour-1 commit); `packages/learning-core/src/encounter/**` Lane A;
`apps/api/src/modules/sessions/service.ts` Lane C (one hook at session completion, item C2); `tests/e2e/
playwright.config.ts` and `scripts/validate-studio.ps1` the integration workspace only.

## 3. Work breakdown: four lanes, run in parallel

Each lane is a branch off `main` (after `main` is fast-forwarded to `390e0b4`), in its own git worktree on the
Studio PC, touching disjoint code areas. An integration agent (or the Encounters agent, last thing each day)
merges the lanes into `integration/world-expedition`, runs `scripts\validate-studio.bat -PortablePostgres
-Recreate -CandidateSha <sha>`, and on PASS runs the deploy script (copy `deploy-390e0b4.ps1`, change the SHAs).
If validation fails at night, the morning's first job is the fix; nothing else starts before it is green.

### Lane A: Encounters

Owner: the strongest agent available for days 1 to 3, then any.

- `packages/learning-core/src/encounter/encounter-model.ts` NEW (interface 2.6 item 6): pure, unit-tested state
  machine: `idle -> question -> resolving -> strike|hit -> question ... -> won|lost`; hearts 3, strikes to win =
  questions in the node, charge 3 correct in a row. The question timer is display only: when it runs out
  nothing happens (no heart lost, no grade, no skip).
- `games/zoo-sprint/src/encounter/` NEW: `index.ts` (2.6 item 1), `EncounterOverlay.ts`
  (Phaser container: challenger on the right, buddy bust with painted expressions on the left, hearts, charge
  meter, timer bar, the existing four-tile question UI below), `challengers.ts` (definitions; code-drawn
  fallback art per challenger, painted art loaded like `character-art.ts`).
- Hook into the session: reuse `RunScene`'s API calls (`context.ts`, question fetch, answer submit) by
  extracting them into `session-client.ts` so RunScene and the encounter share one implementation. RunScene
  keeps working for the gate (regression safety) until the map board replaces it.
- Special move: on charge, the next correct answer counts double strike, with a buddy-specific animation
  (reuse the `cheer`/`discover` expressions; no new art needed day 1).
- Lose state: hearts 0 ends the encounter; the session continues (the server does not know about hearts), the
  node stays unlit, the path continues; the summit card shows beacons lit out of five. Nothing punitive.
- Boss node: same model, five questions, two special moves allowed, challenger art larger.
- Tests: `encounter-model.test.ts` (Vitest, exhaustive transitions, and `replayExpedition` against hand-worked
  answer sequences), one Playwright spec driving an encounter
  through QA hooks (`data-encounter`, `data-hearts`, `data-charge`, `data-node`).

### Lane B: Expedition

- `games/zoo-sprint/src/scenes/ExpeditionScene.ts` NEW: renders a manifest; reuses `presentation/world-layers.ts`,
  `backdrop-model.ts`, `explore-model.ts` and the Basecamp walker/input (extract shared code from
  `BasecampScene.ts` into `presentation/` rather than copying). Nodes are reached by walking; an encounter node
  opens Lane A's overlay; artifacts are collected by walking through them (chime, HUD counter); a rest node is
  a bench with a one-line buddy quip (owner-approved text only). The summit opens `SummitScene` NEW (the
  existing results data presented as a card: beacons lit, artifacts, stamp animation, XP/coins/level, "Back
  to Basecamp" and "Again").
- Map board overlay on `BasecampScene`: seven destination tiles from the manifests; locked tiles show a
  silhouette and the unlock rule; tapping an unlocked tile opens the trailhead card and starts the expedition.
- Destination manifests: Great Wall first (day 1, placeholder layers generated as flat painted gradients from
  the palette in visual/12 so the game is playable before art lands), then the other six on the schedule in
  4.4. Painted layers come from the owner's ComfyUI pipeline with provenance, exactly as `basecamp/` was made;
  the manifest's fallback rule renders palette gradients until a layer exists.
- Summit card: the stamp shows when the server reports it earned (3 or more of 5 beacons lit); the card shows
  beacons lit out of five from the server's result, not the client's count.
- Audio: `assets/audio/` CC0 only, `CREDITS.md`; muted until the first tap; toggle persists per device.

### Lane D: Content

- D3: the 2.6 item 5 edit to `packages/contracts/src/index.ts`, plus API serialization and grading tests for
  3- and 4-choice `number` and `text` questions.
- D1: `packages/content-import` NEW: reads the nine `bank-math-g*.js` files (each is
  `window.HQ_BANK.push({subject, grade, passages, items})`; kindergarten is grade 0; see
  `apps/hop-quest/lib/bank.js` in the Hop Quest repo for the parse). Imports only items with `type: "mc"`, no
  `figure`, and 3 or 4 `choices` (196 items). Converts `answer` (a choice index) to the server's answer key; keeps
  `grade`, `domain`, `skill`, `teks` and `rationale` server-side. `npm run content:import -- <path>`, with an
  import report (count per grade and skill, rejected items with reason) and integration tests on a fixture.
- Session mix: blocks of 10 questions, 6 generated multiplication and 4 imported, repeated for the session length.
- The Hop Quest repository is read-only. Never write to it or to `Documents\Hop-Quest`.

### Lane C: Progression, daily, parents

- Migration + routes from section 2.3 (day 1 to 2), with integration tests (the suite already has the harness:
  real PostgreSQL in `tests/integration`).
- Stamp hook (C2): at session completion, replay the session's stored answers through `replayExpedition`
  (2.6 item 6); write a stamp only when `beaconsLit >= 3`. Return `beaconsLit` and `stampEarned` in the results.
- Gear catalog (server-side JSON: 3 slots x 4 items, coin prices), `OutfitterOverlay` in Basecamp (the lodge
  door), gear rendered on the painted walker and bust via simple anchored sprites (code-drawn day 2, painted
  later).
- Level curve (pure function in `learning-core`, unit-tested), level-up moment on the summit card.
- Daily expedition: server picks today's route (destination + seed) from unlocked destinations; `data-daily`
  banner on the map board; streak calendar in the passport.
- Identity ON: a `config` flag already exists (Checkpoint E); enable in the beta `api.env` for the owner's
  family, verify guests still work (the existing `identity absent` deploy check becomes `identity present`
  for this release: update the deploy script's expectation deliberately, in the same commit).
- Parent dashboard: `apps/play/account.html` exists for identity; add a progress page reading
  `/api/v1/family/children` + the new routes: per child, minutes played this week, skills practiced,
  fluency, streak, stamps.

## 4. Schedule: four-day critical path with tiered, continuously integrated agents

### 4.1 Dependency check (what can and cannot run in parallel on day 1)

Hard dependencies between lanes, and how each is removed:

| Dependency | Blocks day-1 parallel start? | Resolution |
| --- | --- | --- |
| Lane B's nodes call Lane A's encounter overlay | No, once the interface (2.6 item 1) and its stub exist | Integration workspace writes the stub in hour 1; A replaces the body |
| RunScene, the encounter and the summit share one session client | No | Interface 2.6 item 2; A extracts it first (A3 before A2) |
| Lanes A and C add overlays to `BasecampScene` | No, once the registry exists | Integration workspace writes the `overlays.ts` stub (2.6 item 3) in hour 1 of day 1; B owns it after |
| Lanes C and D both touch `packages/contracts` | No | C adds `progress.ts`; D makes the one edit to `index.ts` |
| C2 (stamps) hooks session completion in `sessions/service.ts` | No | C owns that one hook; nobody else edits the file. C2 calls `replayExpedition` (2.6 item 6) against its hour-1 stub until A1 lands |
| A9 (text tiles) needs D3's question shape | No | Shape fixed in 2.6 item 5; A codes against a fixture |
| D1 needs the Hop Quest bank files | No | Read-only from `github.com/jabbalos/hopquest` (`apps/hop-quest/bank/`) or `Documents\Hop-Quest\bank` |
| A7, A8, C9, C10 need an integrated build | Yes, by nature | Scheduled on days 2 to 3 |
| B7 needs painted layers | Yes, by nature | ComfyUI pipeline runs from day 1 in parallel; gradient fallbacks ship until each layer lands |
| Full `validate-studio` runs are serialized | Yes, for release validation only | Continuous integration runs typecheck, Vitest and the sharded Playwright per merge; the full validator runs once per day and once more on the release candidate. Two full validator runs cannot overlap on one PC: the portable cluster and the fixed database names `bidazoo_test`/`bidazoo_e2e` are shared |

Conclusion: no code dependency blocks day-1 parallel execution across the four lanes, provided the six
interfaces in 2.6 are committed in the first hour and the Hop Quest bank files are available for Lane D.

### 4.2 Work items and estimates

Lane A 23h (A1 to A9), Lane B 26h (B1 to B7), Lane C 34h (C1 to C10), Lane D 9h (D1, D3, session mix); itemized in the
previous revision of this section and reproduced in Appendix A. Playwright sharding into three shards:
2h, day 1, integration workspace (ports are already configurable per worktree via `E2E_API_PORT`/`E2E_PLAY_PORT`;
each shard needs its own throwaway database name, which the shard script passes in `DATABASE_URL`). Art: about
1 hour of pipeline time per destination plus review, on the local ComfyUI workstation, from day 1.

### 4.3 Capacity check for four days

Lane loads against the proposed allocation, assuming agents run continuously (20 productive agent-hours per
workspace-day; the earlier derivation assumed 10):

| Workspace | Lanes | Hours | Earliest code-complete |
| --- | --- | --- | --- |
| Workspace 1 | A (23h) | 23 | mid day 2 |
| Workspace 2 | B (26h) | 26 | mid day 2 (B7 continues as art lands) |
| Workspace 3 | C (34h) | 34 | end of day 2 |
| Workspace 4 | D (9h: D1 4h, D3 3h, session mix 2h) | 9 | end of day 1 |
| Integration | sharding 2h; merges; CI runs | continuous | |

If one workspace carries both C and D (43h), it is code-complete late on day 3 at 20h/day or day 5 at
10h/day; the four-day plan therefore needs C and D in separate workspaces (five workspaces as proposed, with
the fifth as CI). If only four workspaces exist, CI runs inside Lane D's workspace after D is complete.

Items that cannot be finished before an integrated build exists (A7, A8, C9, C10: 11h) fall on days 2 to 3 after
the first full merge. Day 4 is the release candidate.

### 4.4 Day by day

| Day | Code | Integration and validation | Art (ComfyUI, RTX 3090) | Live that night |
| --- | --- | --- | --- | --- |
| 1 | Hour 1: integration workspace commits the six interfaces (2.6), including the overlay registry stub. Then A1 to A6, B1 to B5, C1 to C4, D3 then D1. | Shard Playwright (2h). From then on every merge: typecheck, Vitest, sharded e2e. One full validator run at end of day. | Great Wall 3 layers, Great Wall challenger and boss; prompts from the destination brief in visual/12 | Playable loop: map board, Great Wall path, five encounters and a boss with hearts/strikes/charge, summit card with stamp and level, gradient art |
| 2 | A7, A9, B6, B7 (Great Wall), C5 to C8; conflicts in `BasecampScene` hotspots resolved by B | Continuous; full validator at end of day | Petra, Andes layers and challengers; gear sprites | Painted Great Wall, audio, outfitter, daily + streak, passport, parent progress page, imported K-8 math questions. **Owner's 10-minute phone playtest** |
| 3 | A8 (pacing from day-2 sessions), C9, C10, B7 (Petra, Andes), remaining manifests, fix list from the playtest | Continuous; full validator at end of day | Remaining four destinations as capacity allows | Five to seven destinations, whole-loop Playwright, performance pass |
| 4 | Fix list only | One clean, unsharded `validate-studio.bat -PortablePostgres -Recreate -CandidateSha <sha>` on the release candidate; deploy on PASS | Any late layers land as data-only commits after the beta | **Founding-family beta** |

### 4.5 What moves the number

- Lane D import blocked: the beta ships on generated multiplication only, with the import landing as a
  data-only follow-up. The calendar does not move.
- One workspace for C and D: day 4 becomes day 5.
- Agents at 10 productive hours per day instead of 20: the plan is the earlier 7-day derivation.
- A full validator FAIL on day 4 adds one cycle (about 1.5 hours) per round of fixes.

## 5. Rules for every agent on this repository

1. Every session ends with a player-visible change deployed to play.bidazoo.com or merged into the
   integration branch for that night's deploy. Reports and plans do not substitute for it.
2. Do not touch grading, XP or coin formulas except in Lane C's level curve and gear purchase, server-side.
3. Character Bible LOCKED rules and painted-v1 art rules stand. No new starters. Click is host only.
4. Never deploy without `validate-studio.bat` PASS on the exact SHA. Never skip it because it is slow; make it
   faster instead (the Playwright suite can be sharded into three shards).
5. All art through the existing provenance convention; every asset has a code-drawn or gradient fallback.
6. Ask the owner only for product decisions (names, taunt lines, unlock rules, prices) and for the art
   confirmation in rule 13. Never for permission to build what this document already says.
7. Text a kid reads is owner-approved before deploy; keep a `docs/COPY.md` of all strings.
8. Logs stay on the PC. No cloud copies.
9. Never modify, skip, delete or weaken an existing test, snapshot, test config or the validator without the
   owner's approval. A test that seems wrong is reported, not edited. Never special-case code to match a test.
10. The same check failing 3 times in a row: stop, write `STOP.md` (the check, the 3 logs, a hypothesis) and wait.
11. An API, file or function not found by search: stop and ask. Never create a stand-in.
12. Every merge request states files changed, commands run with their output, and assumptions made.
13. Visual work lists its reference files and waits for the owner's one-line confirmation before starting.
    Challenger designs need owner approval.
14. Section 2.6 contract files change only through the integration workspace.
15. Read-only search across the repository is allowed. Writes go only to the lane's file list in section 7.
16. Git: work only in your own worktree and on your own branch. Never run checkout, switch, reset --hard,
    rebase, branch -D or -m, push, worktree, stash or clean, and never move another branch or tag. A commit that
    fails on `index.lock` or a ref lock is a collision with another workspace: wait 10 seconds and retry.
17. Rewards (XP, coins, stamps, level) are decided only on the server, from the server's own records.

## 6. What the owner does

- Day 0: `main` is at `b61ad9c`. Commit this revision of the proposal, create one worktree per workspace
  (each with its own `E2E_API_PORT`, `E2E_PLAY_PORT` and database name), pre-approve git, npm, npx and node in
  each agent tool, and start the agents with the briefs in section 7.
- Before day 1: start the ComfyUI pipeline on Great
  Wall (prompts and conventions in `docs/reference-art/world-expedition/painted-v1/README.md` and the destination
  brief in `docs/visual/12-destination-worlds.md`).
- Day 2: the 10-minute phone playtest; return a list.
- Day 4: approve `docs/COPY.md`; run or authorize the release validation and deploy.

## 7. Workspaces and briefs

Five isolated workspaces, each a git worktree on its own branch off `main`, with file boundaries as in 2.6.

- **Integration workspace** (branch `integration/world-expedition`). Hour 1 of day 1: commit the six
  interface files with stubs and `contracts.check.ts` (2.6), including the `overlays.ts` stub and the
  `progress` export, then shard Playwright into three shards (`E2E_API_PORT`/`E2E_PLAY_PORT` and a distinct `DATABASE_URL` per shard; wire `npm run
  test:e2e:sharded`). Then continuously: merge each lane branch as it passes its own checks; on every merge run
  typecheck, Vitest and the sharded e2e; on failure, revert the merge and hand the failure back to the lane with
  the log. Once per day and on the release candidate: `scripts\validate-studio.bat -PortablePostgres -Recreate
  -CandidateSha <sha>` (never two at once), then the deploy script retargeted to that SHA. Record each deployed
  SHA in `docs/PROJECT-STATE.md`; write failures to `docs/NIGHTLY.md`. Owns `tests/e2e/playwright.config.ts` and
  `scripts/validate-studio.ps1`.
- **Lane A, Encounters** (branch `lane/encounters`). Order: A3 session client, A1 model with tests,
  A2 overlay (code art), A4, A5, A6, then A9 against the fixed question shape, A7 after the first integrated
  build, A8 after day-2 sessions exist. Files: `games/zoo-sprint/src/encounter/**`, `packages/learning-core/src/encounter/**`, `session-client.ts`,
  RunScene only to switch it onto the session client, `docs/art-requests/**` (challenger requests, section 11). Done means: every item has tests, typecheck clean, `play.spec.ts`
  passes in the worktree.
- **Lane B, Expedition** (branch `lane/expedition`). Order: take ownership of the `basecamp/overlays.ts` stub,
  B1, B2, B5 (Great Wall manifest with gradient layers, then the six others), B3, B4, B6, B7 as layers land.
  Files: `ExpeditionScene.ts`, `SummitScene.ts`, `basecamp/**`, `BasecampScene.ts` (sole owner), manifests,
  `assets/audio/**`, shared `presentation/**` extractions, `docs/art-requests/**` and the
  destination entries in `tests/scripts/refresh-painted-provenance.mjs` (section 11). Done means: `basecamp.spec.ts` passes and a new
  `expedition.spec.ts` drives path, nodes, artifacts and summit through QA hooks.
- **Lane C, Progression** (branch `lane/progression`). Order: C1 (migration, `progress.ts` contracts,
  `/api/v1/me/expedition`), C2 (stamp hook via `replayExpedition`, 3 of 5 beacons), C4, C3, C5, C6, C7, C8, then C9 and C10 after integration. Files:
  `database/**` (new migration only), `apps/api/src/modules/progress/**` (new), the one hook in
  `sessions/service.ts`, `packages/contracts/src/progress.ts`, Basecamp overlays via the registry, `account.html`
  progress page. Done means: integration tests for every route, guests still work with identity OFF and ON.
- **Lane D, Content** (branch `lane/content`). Order: D3 (the one `index.ts` edit plus API
  serialization and grading tests for 3- and 4-choice questions), D1 math import (196 items, section 3), then the
  6-and-4 session mix. Files:
  `packages/content-import/**` (new), `packages/learning-core/**` additions, `packages/contracts/src/index.ts`
  (item 5 only). Done means: `npm run content:import -- <path>` produces question sets the adaptive selection
  uses, with integration tests on a fixture bank.
- **ComfyUI workstation (owner-run, parallel from day 1):** Great Wall first (three layers, challenger, boss),
  then Petra, Andes, then the rest, from the agents' art requests; approved masters go to
  `docs/reference-art/world-expedition/comfyui-v1/<destination>/`. Lanes A and B export runtime copies, write
  `PROVENANCE.json` and integrate each drop as data (section 11).

## 8. Basis of the estimate

Section 4 derives the calendar from per-item estimates (Appendix A), the dependency check in 4.1, the capacity
check in 4.3 (continuous agents, five workspaces, continuous integration with sharded e2e) and one serialized
full validation per day. The number can be re-derived for a different team size, agent speed or scope with the
same tables. The existing backend and art pipeline keep the items small: every lane is wiring and presentation
over systems that already work.

## 9. What could still go wrong

- The encounter must play well on day 1 with code-drawn art; layout and timing come before sprites.
- Hop Quest import: the bank's format and skill tags are the owner's; if the mapping is unclear, import math
  first and ask once, with a filled example.
- Continuous merging will conflict in `BasecampScene.ts` (map board, outfitter door, daily banner) unless the
  ownership rule in 2.6 holds: Lane B owns the file; A and C add overlays through `basecamp/overlays.ts`.
- Continuous integration catches typecheck, unit and sharded e2e failures per merge, but the full validator (bundle
  scan, live playthrough, unsharded Playwright on the pinned Chromium) runs once a day; a defect only it can see
  surfaces at the end of the day, not at merge time. Budget the day-4 fix cycle for that.
- Identity ON changes the deploy script's `identity absent` check; flip the expectation deliberately in the
  same commit, or the deploy will roll back correctly and nobody will understand why.
- Agent tooling and models are chosen outside this repository (a day-1 bake-off decides which agents run the
  lanes); the plan depends only on
  each workspace honoring the file boundaries in 2.6 and the done-criteria in section 7, which any agent can meet.

## 10. Owner decisions (Sunday, November 8, 2026)

| Decision | Choice | Applies to |
| --- | --- | --- |
| Timer expiry | Display only: when the timer runs out nothing happens (no heart lost, no grade, no skip) | A1, A4 |
| Passport stamp | Earned when at least 3 of 5 beacons are lit, computed by the server replaying its own answers (2.6 item 6) | A1, C2, B4 |
| Art pipeline | ComfyUI, run by the owner; agents write requests and integrate approved files (section 11) | A6, B7 |
| Content scope | 196 math items (156 four-choice, grades 2 to 8; 40 three-choice, K and 1). Reading and the other 704 math items (pictures, typed answers, multi-select, sort, order) wait until after the beta | D1, D3, A9 |
| Question mix | Blocks of 10: 6 generated multiplication, 4 imported; a 15-question expedition is 9 and 6 | Lane D session mix |
| Build base | `main` at `b61ad9c` (`390e0b4` plus docs-only commits) | All workspaces |

First item after the beta: the 273 math items with pictures, which need the Hop Quest figure renderer
(`apps/hop-quest/site/js/figures.js`, 38 figure kinds) ported to the game.

## 11. Art pipeline: ComfyUI

**Definition.** ComfyUI is an open-source image-generation application that runs on the owner's own GPU. A
generation is a workflow: a graph of nodes (model, prompt, reference images, sampler, upscale, background
removal) saved as JSON. ComfyUI writes that workflow into the metadata of every PNG it saves, so a master PNG
records how it was made. For this build it runs on the studio PC's RTX 3090, which is shared with the local LLM
stack, the photobooth engine and Lipsync Studio; the Studio Remote panel (Tailscale only) switches which engine
holds the GPU.

**Who runs it.** The owner. Coding agents never start, stop or call ComfyUI, never switch GPU modes, never
install or download models, and never generate images. Agents write art requests and integrate approved files.

**Style baseline.** The approved painted-v1 art was made on OpenArt (Nano Banana 2, image-to-image), not in
ComfyUI (`docs/reference-art/world-expedition/painted-v1/README.md`). Local models do not reproduce that style
by default. The first ComfyUI output for each asset type (destination layer, challenger) is compared against
painted-v1 and approved by the owner before it is used; LOCKED Character Bible rules always win.

**Flow per asset.**

1. **Request (agent).** Lane B (destination layers, artifacts, rest benches) or Lane A (challengers, boss
   variants) writes `docs/art-requests/<destination>/<asset>.md`: asset name and runtime filename; size in
   pixels; layer (`far`, `mid`, `near`) and whether it needs transparency; palette from
   `docs/visual/12-destination-worlds.md`; the painted-v1 files to use as references; framing (for example
   "challenger faces left, full body, plain white background"); and what the gradient fallback shows today.
   Rule 13 applies: the agent lists its reference files and waits for the owner's one-line confirmation.
2. **Generate and approve (owner).** The owner runs the request in ComfyUI, picks a result and saves the
   full-size master PNG (with its embedded workflow) to
   `docs/reference-art/world-expedition/comfyui-v1/<destination>/`.
3. **Integrate (agent, item B7 or A6).** The agent exports the runtime copy into
   `games/zoo-sprint/assets/world-expedition/destinations/<id>/` (WebP; JPEG allowed for opaque far layers;
   sizes per `docs/visual/13-phaser-asset-spec.md`), updates the manifest to point at it, writes the folder's
   `PROVENANCE.json` and runs the asset tests. The master PNG and its workflow metadata are never edited.
4. **Fallback.** Until step 3 lands, the manifest's gradient or code-drawn fallback ships. Art never blocks a
   deploy.

**Provenance for ComfyUI files.** Same schema as the painted-v1 folders (`schemaVersion`, size, bytes and
SHA-256 per file, `status` FINAL or PLACEHOLDER), with `source` set to `ComfyUI` and, per file, `masterPath`
(the PNG in `comfyui-v1/`), `model` (checkpoint file name), `seed` and `approvedOn` (date) in place of
`openArtHistoryId`. B7 extends `tests/scripts/refresh-painted-provenance.mjs` to cover
`destinations/<id>/` without changing its behavior for the existing three folders.

**Open owner decisions.** Which ComfyUI instance and GPU mode on the studio PC serves BidaZoo, and at what
times; whether challengers (characters) are made in ComfyUI or stay on OpenArt to match the painted-v1 cast.

## Appendix A: work items and estimates (agent-hours)

Lane A, Encounters: A1 encounter model + unit tests 3; A2 overlay (code art) 4; A3 session-client extraction 2;
A4 charge, special move, timer, lose state 3; A5 boss node 2; A6 challenger definitions, fallbacks, painted loading
3; A7 Playwright encounter spec 2; A8 pacing from `fluent`/`responseMs` 2; A9 text-choice tile layout 2. Total 23.

Lane B, Expedition: B1 scene over a manifest + extraction of walker/parallax/input 5; B2 map board + overlay
registry 3; B3 artifacts + HUD 2; B4 summit card + trailhead 3; B5 gradient layers and six more manifests 3; B6
audio system + CC0 set 3; B7 painted layer integration 1 per destination, 7. Total 26.

Lane C, Progression: C1 migration + progress routes + tests 4; C2 stamps on completion 2; C3 gear catalog, routes,
outfitter, gear on sprites 5; C4 level curve + level-up 2; C5 daily route + streak 4; C6 passport overlay 3; C7
identity ON + deploy-check change + guest regression 2; C8 parent progress page 5; C9 whole-loop Playwright 3; C10
performance pass 4. Total 34.

Lane D, Content: D1 Hop Quest math reader (196 items) + tests 4; D2 reading: out of this build; session mix 2; D3 question `kind` through
contracts, API, grading tests 3. Total 9.

Integration: Playwright sharding 2 (once); per merge, CI about 15 to 30 minutes with shards; full validator 60 to
80 minutes, once per day and once on the release candidate; deploy about 3 minutes.

Basis: measured on this codebase November 7 to 8, 2026 (a verified 15-line scene change with a Playwright pass
took about 2.5 hours; full Studio validation 60 to 80 minutes).
