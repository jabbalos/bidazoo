# BidaZoo World Expedition: build proposal (four parallel lanes; critical path 7 days, planned 9)

Written Sunday, November 8, 2026. Adopted by the project owner as the plan of record. It is written to be
executed by any capable coding agent without further conversation with its author. Everything referenced
exists in this repository at `390e0b4` (live on play.bidazoo.com since November 8, 2026, 1:35 AM CST) unless
marked NEW.

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

Math and reading content for grades K to 8 comes from the owner's Hop Quest bank (owned, server-side,
`Documents\Hop-Quest\bank`), imported into `learning-core` so the adaptive selection has depth.

## 2. Architecture (additive; the five decisions that make it fast)

1. **Encounter = presentation over the existing play session.** `POST /play-sessions` starts a session;
   each encounter consumes two questions from it (`GET .../question`, `POST .../answers`). Hearts, strikes,
   streak charge and timer are client state derived from `AnswerResult` (`correct`, `fluent`, `responseMs`,
   `rewards`). The server never trusts the client for XP or coins. A session ends the way it does today;
   `SessionResults` feeds the summit card. One session = one destination run of five encounters.
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
4. **Content import, not content authoring.** NEW `packages/content-import`: a CLI that reads the Hop Quest
   bank format and emits `learning-core` question sets with skill keys by grade and strand (math: number
   sense, operations, fractions, measurement, data; reading: vocabulary, main idea, inference, grammar).
   `PublicQuestion` gains an optional `kind: 'number' | 'text'` and text choices (today: four integers), which
   the question UI already lays out as four tiles. Grading stays server-side and unchanged in principle.
5. **Identity ON for the owner's family first.** Checkpoint E is built and validated. Flip it on in the beta
   with the owner's family as the only parent account, keep guests working, then widen. The parent dashboard
   is a plain page over `/api/v1/family/*` plus the new progress routes.

Everything above is additive. The existing tests keep passing; new tests are added beside them.

## 3. Work breakdown: four lanes, run in parallel

Each lane is a branch off `main` (after `main` is fast-forwarded to `390e0b4`), in its own git worktree on the
Studio PC, touching disjoint code areas. An integration agent (or the Encounters agent, last thing each day)
merges the lanes into `integration/world-expedition`, runs `scripts\validate-studio.bat -PortablePostgres
-Recreate -CandidateSha <sha>`, and on PASS runs the deploy script (copy `deploy-390e0b4.ps1`, change the SHAs).
If validation fails at night, the morning's first job is the fix; nothing else starts before it is green.

### Lane A: Encounters

Owner: the strongest agent available for days 1 to 3, then any.

- `games/zoo-sprint/src/encounter/` NEW: `encounter-model.ts` (pure, unit-tested state machine: `idle ->
  question -> resolving -> strike|hit -> question ... -> won|lost`; hearts 3, strikes to win = questions in the
  node, charge 3 correct in a row, timer per question from `fluent` thresholds), `EncounterOverlay.ts`
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
- Tests: `encounter-model.test.ts` (Vitest, exhaustive transitions), one Playwright spec driving an encounter
  through QA hooks (`data-encounter`, `data-hearts`, `data-charge`, `data-node`).

### Lane B: Expedition (and Lane D: Content)

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
  the palette in visual/12 so the game is playable before art lands), then Petra and Andes (day 4), then the
  remaining four (days 8 to 10). Painted layers come from the owner's OpenArt pipeline with provenance, exactly
  as `basecamp/` was made; the manifest's fallback rule renders palette gradients until a layer exists.
- `packages/content-import` NEW (day 4 to 6): Hop Quest bank reader, skill mapping, emitter; a `npm run
  content:import -- <path>` command; integration tests that import a fixture and run the adaptive selection.
- Audio: `assets/audio/` CC0 only, `CREDITS.md`; muted until the first tap; toggle persists per device.

### Lane C: Progression, daily, parents

- Migration + routes from section 2.3 (day 1 to 2), with integration tests (the suite already has the harness:
  real PostgreSQL in `tests/integration`).
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

## 4. Schedule, derived from estimates (critical path 7 days; planned 9)

Method: every work item below has an estimate in agent-hours, based on measured velocity on this codebase
(November 7 to 8: a verified 15-line scene change with a sandbox Playwright pass took about 2.5 hours;
a full Studio validation takes 60 to 80 minutes; a deploy takes about 3 minutes). Items are grouped into lanes
by code area so lanes never edit the same files; lanes run in parallel. The calendar is the longest lane plus
the serialized integration cycles, with owner decisions assumed to arrive the same day. One agent-day is
taken as 10 productive agent-hours (agents wait on builds, tests and art generation).

### 4.1 Work items and estimates

Lane A, Encounters (`games/zoo-sprint/src/encounter/`, `session-client.ts`): A1 encounter model + unit tests 3h;
A2 overlay (code art) 4h; A3 session-client extraction shared with RunScene 2h; A4 charge, special move, timer,
lose state 3h; A5 boss node 2h; A6 challenger definitions, code-art fallbacks, painted loading 3h; A7 Playwright
encounter spec 2h; A8 pacing from `fluent`/`responseMs` 2h; A9 text-choice tile layout 2h. **Total 23h.**

Lane B, Expedition (`ExpeditionScene`, `SummitScene`, `basecamp/overlays.ts`, manifests, audio): B1 scene over a
manifest + extraction of Basecamp walker/parallax/input into `presentation/` 5h; B2 map board + overlay registry
3h; B3 artifacts + HUD 2h; B4 summit card + trailhead 3h; B5 gradient-fallback layers and six more manifests 3h;
B6 audio system + CC0 set 3h; B7 painted layer integration, 1h per destination, 7h. **Total 26h.**

Lane D, Content (`packages/content-import`, `packages/contracts` question kind, learning-core selection): D1
Hop Quest bank reader + math strand mapping + tests 6h; D2 reading strands 4h; D3 `PublicQuestion.kind: 'text'`
through contracts, API, grading tests 3h. **Total 13h.** Starts after D3's contract shape is agreed with Lane A
(A9) on day 1; otherwise independent.

Lane C, Progression (migrations, `/api/v1/me/*`, outfitter, passport, daily, identity, parent page): C1 migration
+ progress routes + integration tests 4h; C2 stamps written on session completion 2h; C3 gear catalog, routes,
outfitter overlay, gear on walker/bust 5h; C4 level curve + level-up moment 2h; C5 daily route + streak 4h; C6
passport overlay 3h; C7 identity ON config + deploy-check change + guest regression 2h; C8 parent progress page
5h; C9 Playwright for the whole loop 3h; C10 iPad Safari / low-end Android performance pass 4h. **Total 34h.**

Integration (serialized on the Studio PC): merge the lanes + resolve conflicts 1h, validation 1.2h, deploy 0.1h.
**About 2.5h per cycle; one cycle per day, seven cycles planned.**

Art generation (owner's OpenArt pipeline, asynchronous, not on the critical path for code): 7 destinations x
3 layers, 7 challengers, 1 boss variant each, gear sprites, passport and stamp art. Roughly 1 hour of pipeline
time per destination plus review; it lands into B7 as it is produced; gradient fallbacks ship until then.

### 4.2 Lane loads and the critical path

| Lane | Hours | Agent-days | Hard dependencies |
| --- | --- | --- | --- |
| A Encounters | 23 | 2.5 | none to start; A7 after B1 (the overlay runs inside the expedition) |
| B Expedition | 26 | 3 | B1 needs A2's overlay interface (a stub on day 1); B7 needs art as it lands |
| C Progression | 34 | 3.5 | C2 needs the session-completion hook (exists); C7 before C8; C9 after A, B integrate |
| D Content | 13 | 1.5 | D3 shape agreed day 1; D1 needs the Hop Quest bank files from the owner on day 1 |

Longest lane: C at 3.5 agent-days. Items that can only run after everything integrates: C9 (loop test), C10
(performance), A8 (pacing against real sessions). Those sit after integration day 4. Critical path:
days 1 to 4 build (lanes in parallel, nightly integration), day 5 integrate the tail (A8, C9, C10), days 6 to 7
fix what the owner's play and the validator find. **Seven days.** Two days of buffer are planned for the two
unknowns in section 9 (Hop Quest bank format; device performance). **Planned: nine days.**

### 4.3 Day by day

| Day | A | B | C | D | Live that night |
| --- | --- | --- | --- | --- | --- |
| 1 | A1, A2, A3 | B1, B2 (registry first, so C can add overlays) | C1, C2 | D3 agreed; D1 started | Great Wall path, five encounters, placeholder art, stamps recorded |
| 2 | A4, A5, A6 | B3, B4, B5 | C3, C4 | D1 | Boss, summit card, level, outfitter; three destinations as gradient |
| 3 | A7, A9 | B6, B7 (Great Wall painted as it lands) | C5, C6, C7 | D2 | Painted Great Wall, audio, daily + streak, passport; identity ON for the owner's family; real K-8 math |
| 4 | fixes from integration | B7 (next destinations) | C8 | D2 done | Reading encounters; parent progress page; five destinations |
| 5 | A8 | B7 (remaining) | C9, C10 | tests | Seven destinations; whole-loop Playwright; performance pass |
| 6 | fix list from owner play and validation | | | | Fix build |
| 7 | fix list | | | | **Release candidate; Studio validation; deploy** |
| 8 to 9 | buffer for section 9 unknowns; otherwise early finish | | | | Founding-family beta |

If a lane finishes early its agent takes B7 or C10, the two items that absorb extra hands without conflicts.

### 4.4 What would change the number

- Fewer than four agents: with three, D folds into B and the plan is 10 to 11 days; with two, 14 days.
- Validation time: sharding Playwright across the three worktrees (2h of tooling) brings a cycle from 2.5h
  to about 1.5h and allows two integrations a day; it is worth doing on day 1 by whichever lane is waiting.
- Art: if painted layers lag, the calendar does not move; destinations ship on gradient fallbacks and are
  repainted as art lands.
- Scope: dropping the parent progress page (C8) and reading content (D2) saves about a day; dropping gear (C3)
  saves half a day. Nothing else is separable without changing what the game is.

## 5. Rules for every agent on this repository

1. Every session ends with a player-visible change deployed to play.bidazoo.com or merged into the
   integration branch for that night's deploy. Reports and plans do not substitute for it.
2. Do not touch grading, XP or coin formulas except in Lane C's level curve and gear purchase, server-side.
3. Character Bible LOCKED rules and painted-v1 art rules stand. No new starters. Click is host only.
4. Never deploy without `validate-studio.bat` PASS on the exact SHA. Never skip it because it is slow; make it
   faster instead (the Playwright suite can be sharded across the three worktrees).
5. All art through the existing provenance convention; every asset has a code-drawn or gradient fallback.
6. Ask the owner only for product decisions (names, taunt lines, unlock rules, prices). Never for permission
   to build what this document already says.
7. Text a kid reads is owner-approved before deploy; keep a `docs/COPY.md` of all strings.
8. Logs stay on the PC. No cloud copies.

## 6. What the owner does

- Day 0: `main` is already at `390e0b4`; pull the docs commits (`git merge --ff-only
  origin/tooling/validator-e2e-ports`), create four worktrees, start the agents with the briefs in section 7,
  and give Lane D the Hop Quest bank files.
- Daily, 10 minutes: play the night's build on a phone; thumbs up or a list.
- Day 3: generate painted Great Wall layers and the first challenger through the OpenArt pipeline from Lane B's
  prompts (the pipeline and its prompts are in `docs/reference-art/world-expedition/painted-v1/README.md`).
- Days 7 and 12: the two review sessions.
- Approve the copy in `docs/COPY.md` before day 14.

## 7. One-line briefs to start the agents

- **A:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Lane A (Encounters). Branch
  `lane/encounters` off `main`. Deliver day 1 (A1, A2, A3): encounter model, overlay, session-client extraction,
  unit tests. Playable from the gate tonight."
- **B:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Lane B (Expedition). Branch
  `lane/expedition` off `main`. Deliver day 1 (B1, B2): ExpeditionScene over a Great Wall manifest with gradient
  layers, the overlay registry, the map board; nodes call the encounter overlay interface (stub until Lane A lands)."
- **C:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Lane C (Progression). Branch
  `lane/progression` off `main`. Deliver day 1 (C1, C2): migration, `/api/v1/me/expedition`, stamps written on
  session completion, integration tests."
- **D:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Lane D (Content). Branch `lane/content`
  off `main`. Day 1: agree the `PublicQuestion.kind` shape with Lane A, then start the Hop Quest bank reader
  (D1) from the files the owner provides."
- **Integration (nightly):** "Merge the lane branches into `integration/world-expedition`, run
  `scripts\validate-studio.bat -PortablePostgres -Recreate -CandidateSha <sha>`, on PASS deploy with a copy of
  `Documents\BidaZoo-release\deploy-390e0b4.ps1` retargeted to `<sha>`, record the SHA in
  `docs/PROJECT-STATE.md`. On FAIL, write the failure to `docs/NIGHTLY.md` and stop."

## 8. Basis of the estimate

Section 4 derives the calendar from per-item estimates, lane loads and the serialized integration cycle, so the
number can be checked item by item and re-derived if the team size or scope changes. The existing backend and
art pipeline are what keep the items small: every lane is wiring and presentation over systems that already work.

## 9. What could still go wrong

- The encounter must play well on day 1 with code-drawn art; layout and timing come before sprites.
- Hop Quest import: the bank's format and skill tags are the owner's; if the mapping is unclear, import math
  first and ask once, with a filled example.
- Agents merging daily will conflict in `BasecampScene.ts` (map board, outfitter door, daily banner).
  Rule: Lane B owns `BasecampScene.ts`; A and C add overlays through a small `basecamp/overlays.ts` registry
  that B creates on day 1.
- Identity ON changes the deploy script's `identity absent` check; flip the expectation deliberately in the
  same commit, or the nightly deploy will roll back correctly and nobody will understand why.
