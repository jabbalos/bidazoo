# BidaZoo World Expedition: fast-track proposal (the game, in 14 days)

Written Sunday, November 8, 2026, for the project owner, who will give this repository to whichever agents
execute it. It is written to be executed by any capable coding agent without further conversation with its
author. Everything referenced exists in this repository at `390e0b4` (live on play.bidazoo.com since
November 8, 2026, 1:35 AM CST) unless marked NEW.

## 0. The honest state of the project

- **Backend: done.** Fastify API, PostgreSQL, Drizzle, server-authoritative play sessions, grading, XP and
  coins, mastery, guest identity, full family identity (Checkpoint E, validated, never deployed), closed-beta
  deployment on the Studio PC with its own Caddy, tunnel, backups, a 276-test Playwright suite, a validator and
  a one-click deploy. None of it needs rework for anything in this proposal.
- **Art pipeline: done.** Painted Basecamp, five painted full-body starters, 36 painted expressions, painted
  side-view walkers, provenance per file, code-drawn fallbacks, a character bible, palettes per destination.
- **Game: a 10-question multiplication quiz.** `RunScene` shows a prompt and four integer choices; `ResultsScene`
  shows totals. Content is `packages/learning-core/multiplication.ts` only (single-digit products). The Basecamp
  is a 1.5-screen walk to a gate that starts the quiz. There is no world, no encounter, no progression a kid can
  see, no reason to return tomorrow.

Six weeks were spent making it impossible to break and nothing was spent making it fun. This proposal inverts
that: gameplay first, every day ends deployed, the existing safety net runs unchanged underneath.

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

## 3. Work breakdown: three tracks, run in parallel by three agents

Each track is a branch off `main` (after `main` is fast-forwarded to `390e0b4`), in its own git worktree on the
Studio PC, touching disjoint code areas. An integration agent (or the Encounters agent, last thing each day)
merges the three into `integration/world-expedition`, runs `scripts\validate-studio.bat -PortablePostgres
-Recreate -CandidateSha <sha>`, and on PASS runs the deploy script (copy `deploy-390e0b4.ps1`, change the SHAs).
If validation fails at night, the morning's first job is the fix; nothing else starts before it is green.

### Track A: Encounters (critical path; the first real game code)

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

### Track B: Expedition and content tooling

- `games/zoo-sprint/src/scenes/ExpeditionScene.ts` NEW: renders a manifest; reuses `presentation/world-layers.ts`,
  `backdrop-model.ts`, `explore-model.ts` and the Basecamp walker/input (extract shared code from
  `BasecampScene.ts` into `presentation/` rather than copying). Nodes are reached by walking; an encounter node
  opens Track A's overlay; artifacts are collected by walking through them (chime, HUD counter); a rest node is
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

### Track C: Progression, daily, parents

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

## 4. Schedule: 14 days, deployed every night

| Day | A: Encounters | B: Expedition | C: Progression | Live that night |
| --- | --- | --- | --- | --- |
| 1 | encounter model + overlay (code art), session-client extraction | ExpeditionScene skeleton, Great Wall manifest with gradient layers, map board | migration, `/me/expedition`, stamps | Great Wall path with five encounters, placeholder look. **The game loop exists.** |
| 2 | charge, special move, timer, lose state, boss | artifacts, HUD, SummitScene, trailhead card | gear catalog + routes + outfitter (code art), level curve | A full run: encounters, boss, stamp, level, buy a hat. |
| 3 | first challenger painted art, buddy reactions polish, Playwright spec | Great Wall painted layers pass 1, audio set 1 | daily route + streak, `data-daily` banner | **Demo-quality Great Wall.** |
| 4 | boss presentation, difficulty pacing from `fluent` | Petra + Andes manifests (gradient), content-import skeleton | identity ON for the owner's family in beta; parent page skeleton | Three destinations; parent can sign in. |
| 5 | challengers for Petra, Andes | Hop Quest import: math strands | parent progress page v1 | Real K-8 math in encounters. |
| 6 | reading-question tile layout (`kind: 'text'`) | Hop Quest import: reading strands; adaptive selection across strands | passport overlay (stamps, artifacts, best streaks) | Reading encounters. |
| 7 | **Review day (owner on phone, Fable 30 min):** fix list only | | | Fix build. |
| 8 | fixes; special-move animations per buddy | Maya + Taj manifests, painted Petra/Andes pass 1 | gear painted pass 1 | Five destinations. |
| 9 | difficulty tuning from real sessions | Nile + Philippine Highlands & Lantern Harbor manifests | parent weekly email (existing Resend) optional | Seven destinations (two still gradient). |
| 10 | Playwright: whole loop on 4 projects | remaining painted layers, audio set 2 | streak rewards, daily bonus | Full loop under test. |
| 11 | performance on iPad Safari and low-end Android (texture budget, DPR) | performance | performance | Smooth on the family's devices. |
| 12 | **Review day 2** | | | Fix build. |
| 13 | fixes | fixes | fixes | Release candidate. |
| 14 | Studio validation on the candidate, deploy, update `STUDIO-VALIDATION.md`, `PROJECT-STATE.md` | | | **Founding-family beta.** |

Day 1 cannot slip. If the encounter model is not playable by the end of day 1, the Encounters agent is
replaced, not extended.

## 5. Rules for every agent on this repository

1. A session that does not end with a kid-visible change deployed to play.bidazoo.com (or merged into the
   integration branch for that night's deploy) is a failed session. Reports, checkpoints and plans do not count.
2. Do not touch grading, XP or coin formulas except in Track C's level curve and gear purchase, server-side.
3. Character Bible LOCKED rules and painted-v1 art rules stand. No new starters. Click is host only.
4. Never deploy without `validate-studio.bat` PASS on the exact SHA. Never skip it because it is slow; make it
   faster instead (the Playwright suite can be sharded across the three worktrees).
5. All art through the existing provenance convention; every asset has a code-drawn or gradient fallback.
6. Ask the owner only for product decisions (names, taunt lines, unlock rules, prices). Never for permission
   to build what this document already says.
7. Text a kid reads is owner-approved before deploy; keep a `docs/COPY.md` of all strings.
8. Logs stay on the PC. No cloud copies.

## 6. What the owner does

- Day 0 (tonight or morning): fast-forward `main` to `390e0b4` (`git merge --ff-only
  origin/tooling/validator-e2e-ports`), create the three worktrees, start three agents with the one-line
  briefs in section 7.
- Daily, 10 minutes: play the night's build on a phone; thumbs up or a list.
- Day 3: generate painted Great Wall layers and the first challenger through the OpenArt pipeline from Track B's
  prompts (the pipeline and its prompts are in `docs/reference-art/world-expedition/painted-v1/README.md`).
- Days 7 and 12: the two review sessions.
- Approve the copy in `docs/COPY.md` before day 14.

## 7. One-line briefs to start the agents

- **A:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Track A (Encounters). Branch
  `track/encounters` off `main`. Deliver day 1 today: encounter model, overlay, session-client extraction,
  unit tests. Playable from the gate by tonight."
- **B:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Track B (Expedition). Branch
  `track/expedition` off `main`. Deliver day 1 today: ExpeditionScene over a Great Wall manifest with gradient
  layers, map board on Basecamp, nodes that call the encounter overlay interface in section 3A (stub it until
  Track A lands)."
- **C:** "Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md. You are Track C (Progression). Branch
  `track/progression` off `main`. Deliver day 1 today: migration, `/api/v1/me/expedition`, stamps written on
  session completion, integration tests."
- **Integration (nightly):** "Merge the three track branches into `integration/world-expedition`, run
  `scripts\validate-studio.bat -PortablePostgres -Recreate -CandidateSha <sha>`, on PASS deploy with a copy of
  `Documents\BidaZoo-release\deploy-390e0b4.ps1` retargeted to `<sha>`, record the SHA in
  `docs/PROJECT-STATE.md`. On FAIL, write the failure to `docs/NIGHTLY.md` and stop."

## 8. Why 14 days and not 6 weeks

Credits are not the constraint on an Ultra plan; serial human review was. Three agents in parallel on
disjoint code, an integration run every night, and the owner reviewing on a phone instead of reading reports
compresses the calendar roughly fourfold. The backend and art pipeline that already exist are what make it
possible: every track above is wiring and presentation over systems that already work.

## 9. What could still go wrong

- The encounter has to feel good on day 1 with code-drawn art, or the owner will judge the art instead of
  the loop. The overlay's layout and timing matter more than its sprites.
- Hop Quest import: the bank's format and skill tags are the owner's; if the mapping is unclear, import math
  first and ask once, with a filled example.
- Three agents merging daily will conflict in `BasecampScene.ts` (map board, outfitter door, daily banner).
  Rule: Track B owns `BasecampScene.ts`; A and C add overlays through a small `basecamp/overlays.ts` registry
  that B creates on day 1.
- Identity ON changes the deploy script's `identity absent` check; flip the expectation deliberately in the
  same commit, or the nightly deploy will roll back correctly and nobody will understand why.
