# Report: Lane A (Encounters), day 1

Branch `lane/encounters`, Monday, November 9, 2026. Not pushed. Work in progress; sections are filled
in as each item lands.

## Art references

Rule 13: the files used for the visual work in A2 (overlay), A4 (special move) and A6 (challengers).
No owner confirmation has reached this lane. Until one does, all visual work is code-drawn only, built
from these references; no image file is generated, added or edited.

| Reference | Used for |
| --- | --- |
| `docs/reference-art/world-expedition/painted-v1/expressions/<id>/<id>_{idle,happy,thinking,cheer,discover,tryAgain}.png` (runtime copies in `games/zoo-sprint/assets/world-expedition/characters-painted/<id>/`) | The buddy bust on the left of the overlay, shown through the existing `Character` class unchanged (painted, else production, else code-drawn fallback). No new expression art. |
| `docs/reference-art/world-expedition/painted-v1/all-expressions.jpg` | Which expression goes with which moment: thinking on a question, happy or cheer on a strike, discover on the special move, tryAgain on a miss |
| `docs/reference-art/world-expedition/painted-v1/cast/*_idle_front.png`, `cast-lineup.jpg` | Outline weight, soft shading and warm light the code-drawn challengers imitate; challenger height against the buddy |
| `docs/reference-art/world-expedition/painted-v1/README.md` | Style baseline, quoted in the art requests |
| `docs/reference-art/world-expedition/painted-v1/basecamp/basecamp-full.png` | Painted palette and light the overlay sits in |
| `docs/reference-art/world-expedition/production-v1.1/07_Expressions_Proportions_Palettes.png` | Proportions for the challenger silhouettes |
| `docs/reference-art/world-expedition/production-v1.1/08_UI_and_Phaser_Asset_Spec.png` | Look of hearts, meter and panels (without the rejected red X panel) |
| `docs/CHARACTER-BIBLE.md` sections 1, 2, 4, 5, 6 (LOCKED) | No new starters (challengers are destination creatures, never selectable), Click host only (not in encounters), originality, ages 6 to 12 tone |
| `docs/visual/07-expression-state-system.md` | The six states, reaction timing, reduced motion |
| `docs/visual/09-palette.md` | Token colors |
| `docs/visual/10-ui-component-style.md` | Field-kit UI; a miss is orange/amber, never red, never an X; 44 px targets; 360x640 target |
| `docs/visual/12-destination-worlds.md` section 1 (Great Wall) | Challenger and boss palette (ridge green `#5c7c6b`, stone `#b9a98a`, mist `#dfe9e4`, dawn `#f3d9a8`, accent `#d9822b`); avoid pagoda caricature, dragon clichés, costume stereotypes |
| `docs/visual/13-phaser-asset-spec.md` | Size and format the challenger art requests ask for |
| `docs/visual/14-do-dont-anti-drift.md` | Review checklist: 48 px silhouette test, static fallback, no red failure styling |

## Copy (PENDING)

(filled in as strings are added)

## Cross-lane change requests

(none yet)

## Open questions

(none yet)

---

# Previous report: bake-off entry (claude), items A3 then A1

Branch `bake/claude`, on top of `9ff9d70` (bakeoff/base). Sunday, November 8, 2026. Not pushed.

Final check (`.bake\check.ps1`, run started 23:13:55): **ALL CHECKS PASSED**.

## Commits

| Commit | What |
| --- | --- |
| `b7d85ef` | A3: session client implementation; RunScene switched onto it; new session-client tests |
| `f3cbb05` | A1: encounter model rules and Vitest tests |
| `3400170` | STOP.md: an existing wiring test pinned the submitAnswer call inside RunScene |
| `1202b27` | Owner-approved test change (below); STOP.md deleted |
| (this commit) | REPORT.md |

## Files changed

| File | Change |
| --- | --- |
| `games/zoo-sprint/src/session-client.ts` | Stub bodies replaced. New `PlaySessionClient implements SessionClient`; `createSessionClient(platform)` returns it. It holds the last session the server returned, the outstanding question and one attempt id per question (from the existing `makeAttemptId` in `ui.ts`). `startSession` sends only `gameId` and `mode` (the server schema forbids extra fields) and keeps `destination` on the client. `nextQuestion` returns the outstanding question without a call, or fetches the next one. `submitAnswer` reuses the question's attempt id, so a retry is the same attempt. `results` returns the server results once the session is completed, otherwise asks the server, and returns null while the session is active. Additions beyond the contract, not in the `SessionClient` interface: `session`, `destination` and `refresh(sessionId?)` (re-reads the session; RunScene's resync). No signature in the 2.6 contract changed. |
| `games/zoo-sprint/src/scenes/RunScene.ts` | Switched onto the session client only. `startSession`, `nextQuestion`, `submitAnswer` and the two `getSession` resyncs now go through `PlaySessionClient`. The attempt-id map and the `makeAttemptId` import are removed from the scene. Nothing else changed. |
| `packages/learning-core/src/encounter/encounter-model.ts` | Stub bodies replaced with the rules (below). Exported signatures unchanged. Added module-level exports: `ENCOUNTER_HEARTS`, `CHARGE_FULL`, `SPECIAL_MOVE_STRIKES`, `EXPEDITION_NODES`, `NODE_QUESTIONS`, `NODE_SPECIAL_MOVES`, `BOSS_QUESTIONS`, `BOSS_SPECIAL_MOVES`, `specialMoveReady(state)`. They are not re-exported from `learning-core/src/index.ts`, which is outside my write list. |
| `packages/learning-core/src/encounter/encounter-model.test.ts` | New, 37 tests: initial state and argument checks; every single transition; charge and special moves (including the boss's two, and no special moves); ending rules; **exhaustive** checks of every answer sequence for a node of 2 and a boss of 5, each from a starting charge of 0, 1, 2 and 3, against the rule invariants; the timer is not an input; `replayExpedition` against 10 hand-worked sequences (worked steps in the test comments). |
| `tests/integration/session-client.test.ts` | New, 12 tests against an in-memory fake platform with the server's rules (one outstanding question, server-side key, attempt ids are idempotency keys, completion with results). `ui.ts` is mocked to an attempt-id stub because it imports Phaser, which cannot load in Node. |
| `tests/integration/character-expression.test.ts` | **Owner-approved** change to one test only (see below). |
| `REPORT.md` | This report (replaces the base report). |

### Owner-approved test change

Test: "the answer sent to the API still has exactly attemptId, questionId and response". It read
`RunScene.ts` for the platform `submitAnswer` call, which A3 moves into the session client. I stopped
under rule 12 (STOP.md, commit `3400170`). The owner approved changing only this test:

1. The submitAnswer and startSession checks now read `games/zoo-sprint/src/session-client.ts`. Same
   assertions: exactly one submitAnswer call; its argument contains
   `attemptId, questionId: question.id, response: choice`; it matches none of
   expression/character/starter/mood/emotion/celebrat/wobble.
2. New assertion: `RunScene.ts` does not match `platform\.submitAnswer\(`.

Two adjustments the move made necessary, which you should check against your approval:

- **The regex now requires `platform.` before `submitAnswer(`/`startSession(`.** The old pattern
  `submitAnswer\(([^;]*)\);` also matches the client's own method declaration
  `submitAnswer(choice: number | string): Promise<AnswerResult> { const session = this.requireSession();`,
  which would give two matches. The method declaration is not an API request, so the check is limited to
  calls on the platform.
- **The startSession assertion is not the same string.** The old line expected the literal
  `startSession({ gameId: 'zoo-sprint', mode: 'multiplication' })`, which RunScene still contains (now
  calling the client). In the session client the platform call is
  `startSession({ gameId: request.gameId, mode: request.mode })`. The test now asserts exactly one platform
  `startSession` call whose argument is exactly `{ gameId: request.gameId, mode: request.mode }` and contains
  none of the expression words. The check still guarantees that the start request carries no character.
  Writing the literal values into the client only to match the old string would be special-casing (rule 13).

No other test, assertion, snapshot, config or file in `tests/` was changed.

## Encounter rules implemented (A1)

- Hearts 3 per encounter. A correct answer is a strike; a wrong answer costs a heart.
- Three correct in a row fill the charge meter (`charge` 0 to 3). While it is full and a special move is
  left, the next correct answer is a double strike, uses one special move and empties the meter. A wrong
  answer empties the meter and the streak; `bestStreak` is kept.
- Hearts 0 ends the encounter at once: `lost`. Otherwise it ends after `questions` answers: `won` if
  strikes ≥ questions, else `lost`. Answers after the end are ignored (the same state object is returned).
  Inputs are never mutated.
- The timer is not an input (owner decision: display only); a test checks that extra fields such as
  `timedOut` change nothing, and that no state field or export is time-related.
- `replayExpedition`: five nodes (2 questions, 1 special move), then the boss (5 questions, 2 special
  moves). Each encounter starts with the previous one's final charge. The encounters take answers in
  order. Beacons = nodes won. An encounter the answers do not finish counts as neither lit nor won.
  Answers after the boss are ignored.

## Assumptions

1. **An encounter does not end early on a win.** It always takes its full `questions` answers unless
   hearts reach 0. Otherwise a carried double strike could end a node after one answer, and the client
   and the server's fixed-shape replay (five nodes of two, boss of five, 15 questions) would assign
   answers to different encounters.
2. **Nodes get one special move.** The spec gives the boss two ("two special moves allowed"); one for a node
   is my reading of that contrast.
3. **A wrong answer empties the charge meter**, including a full one ("three correct in a row").
4. **The answer that fills the meter is a single strike;** the next correct answer is the double ("on charge,
   the next correct answer counts double strike").
5. **Text answers are refused in the client for now.** `submitAnswer(choice: string)` throws without a request,
   because `SubmitAnswerRequest.response` is still an integer until Lane D (D3). The signature already accepts
   strings, so only the body changes when D3 lands.
6. `startSession` keeps `destination` client-side; the server has no field for it yet.
7. The encounter overlay (`encounter/index.ts`, item A2) was left as the base stub; it already works with the
   real session client.

## Commands run and output

| Command | Output |
| --- | --- |
| `git log --oneline -3`, `git show --stat HEAD`, `git show HEAD -- <contract files>` | Read the base and the contracts commit `9ff9d70`. |
| Read-only `grep`/`sed`/`cat` over RunScene, game-sdk, contracts, tests config, purity test | No output to report. |
| `npx vitest run integration/session-client.test.ts` (tests/) | 12 passed. |
| `npm run typecheck` | First run: 1 error, `session-client.test.ts(126,9)`: the fixture's answers lacked `fluent`. Fixed the fixture; second run exit 0. |
| `npx vitest run src/encounter` (learning-core) | 37 passed. |
| `npx tsc -p tsconfig.json` (learning-core) | First: `TS2304: Cannot find name 'structuredClone'` in the new test (learning-core has no DOM/node lib). Replaced with a spread copy; exit 0. |
| `npx vitest run` (learning-core) | 7 files, 88 passed. |
| `npx vitest run integration/learning-core-purity.test.ts` | 4 passed. |
| `.bake\check.ps1` (first attempt, redirected to a temp file) | Denied by the permission classifier; did not run. |
| `.bake\check.ps1` with an unquoted backslash path | PowerShell: "The argument '.bakecheck.ps1' ... does not exist." Did not run. |
| `.bake\check.ps1` (run 20261108-225135) | typecheck PASS, databases PASS, **vitest FAIL** (1 failed, 758 passed, 3 todo: `character-expression.test.ts:221`), migrate-e2e PASS, play-spec PASS (24 passed, 9.0m). `CHECKS FAILED`. → STOP.md. |
| `npx vitest run integration/character-expression.test.ts` (after the approved change) | 23 passed. |
| `.bake\check.ps1` (run 20261108-231355) | typecheck PASS; databases PASS; vitest PASS (learning-core 7 files, 88 passed; tests 36 files passed, 1 skipped; 759 passed, 3 todo of 762); migrate-e2e PASS; play-spec PASS (24 passed, 11.3m). **ALL CHECKS PASSED**. |
| `git add` / `git commit` (5 commits), `git rm STOP.md`, `git status`, `git diff --stat` | All succeeded; no lock collisions. |

## Hours spent

About 0.9 hours of agent time (about 22:40 to 23:30 CST), including two full check runs of about 12 minutes
each and the wait for the owner's decision on STOP.md.
