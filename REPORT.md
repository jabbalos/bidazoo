# Report: section 2.6 interfaces with stubs (bake-off base, November 8, 2026)

One commit on `bakeoff/base` on top of `5832a7d`: "contracts: section 2.6 interfaces with stubs (bake-off base)".
Not pushed.

**`packages/learning-core/src/encounter/encounter-model.ts` and `games/zoo-sprint/src/session-client.ts` are
stubs.** They contain the interfaces only. Neither file contains game rules or session logic.

## Files changed and why

| File | Change | Why |
| --- | --- | --- |
| `packages/learning-core/src/encounter/encounter-model.ts` (new) | `EncounterKind`, `EncounterPhase`, `EncounterState`, `createEncounter`, `applyAnswer`, `replayExpedition`. **Stubs:** `createEncounter` returns an initial state (phase `question`, every counter 0, `questions` and `specialMovesLeft` taken from `opts`); `applyAnswer` returns the state unchanged; `replayExpedition` returns `{ beaconsLit: 0, bossWon: false }`. Each body has the comment `// STUB: Lane A item A1 implements this.` | 2.6 item 6. Lane A (A1) implements the rules. |
| `packages/learning-core/src/index.ts` | Exports the three functions and three types above. | So the game and the API can import item 6. |
| `games/zoo-sprint/src/session-client.ts` (new) | `DestinationId`, `SessionClient`, `createSessionClient`. **Stubs:** every method throws `new Error('STUB: Lane A item A3 implements this')`. `submitAnswer(choice: number \| string)`. RunScene does not import it. | 2.6 item 2, and the owner's decision that a text answer sends the chosen value. |
| `games/zoo-sprint/src/contracts.check.ts` (new) | Type-level assertions on every 2.6 signature, compiled by `npm run typecheck`. The `submitAnswer` assertion is now `(choice: number \| string) => Promise<AnswerResult>`. | Any signature change fails the typecheck. |
| `games/zoo-sprint/src/encounter/index.ts` (new) | `startEncounter(scene, opts): Promise<EncounterOutcome>`, `EncounterOutcome`, `ChallengerId`. | 2.6 item 1 (unchanged from the earlier staged work). |
| `games/zoo-sprint/src/basecamp/overlays.ts` (new) | `registerOverlay`, `overlaysAt`, `OverlayId`, `OverlayHotspot`, `OverlayDef`. | 2.6 item 3 (unchanged). |
| `packages/contracts/src/progress.ts` (new), `packages/contracts/src/index.ts` | Progress schemas; `PublicQuestionSchema` gets `kind?: 'number' \| 'text'` and `choices: number[] \| string[]`. | 2.6 items 4 and 5 (unchanged). |
| `packages/contracts/src/paths.ts` | `ApiPaths.meExpedition`, `meGear`, `meDaily`. | 2.6 item 4 (kept as is, per the owner). |
| `apps/api/src/modules/sessions/service.ts`, `games/zoo-sprint/src/scenes/RunScene.ts` | The `number` casts that keep existing consumers compiling after item 5. | Kept as is, per the owner. |
| `tests/integration/contracts-boundary.test.ts` | Three expectations describe the new `PublicQuestion` shape. | Approved by the owner; kept as is. |
| `docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md` | One row added to section 10: `Text answers`. Nothing else changed. | Owner decision. |
| `REPORT.md` | This report. | |

Removed from the earlier staged work:

- All rule logic in `encounter-model.ts`: hearts, strikes, charge, special moves, the boss and the expedition
  replay.
- The exported constants `ENCOUNTER_HEARTS`, `CHARGE_FULL` and `EXPEDITION_SHAPE`, and their re-exports from the
  learning-core index. These constants were game rules, not types or signatures, and nothing else used them.
  If you want them back as part of the interface, they can be added again.
- All session state, attempt-id and results logic in `session-client.ts`. Its `makeAttemptId` import is gone.
- Tests: none had been added for the encounter model or the session client, so none were deleted.

## Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Exit 0. Every workspace passes, including `contracts.check.ts`. |
| `npm test` | Exit 0. learning-core: 6 files, 51/51 passed. tests: 17 files passed, 19 skipped; 459 passed, 288 skipped, 3 todo (750). These are the same counts as the baseline. The skipped files are the PostgreSQL-backed suites (no database here). |

No check failed, so there is no STOP.md.

## Notes for the lanes

- `encounter/index.ts` (item 1 stub) still throws on a text choice before it calls `submitAnswer`. The new
  signature accepts strings, so Lane A can remove that guard when it builds the overlay.
- The section 10 row was added verbatim. Its `number | string` contains an unescaped `|`, so Markdown renders
  that row with an extra cell. Escaping it as `\|` would fix the rendering; I did not, because the row was
  specified exactly.


---

# Lane C (progression), run 2 (Sonnet, November 9, 2026)

C1 check: `.bake/check.ps1` at 18:23 to 18:37 CST: ALL CHECKS PASSED (36 files, 765 tests; play-spec 24 passed). C2: not started (blocked, see Open questions). C4: level curve done, results data blocked. C-text: done; check at 18:44 to 18:55 CST on 1d9d5b0: ALL CHECKS PASSED (37 files, 782 tests; play-spec passed). Full details in the final message to the orchestrator.

Files: `packages/learning-core/src/progression/{level,level.test,index}.ts`; `database/migrations/0006_text_answers.sql`, `meta/_journal.json`, `database/schema/attempts.ts` (type only); `apps/api/src/modules/sessions/{service,views}.ts`; `tests/integration/text-answers.test.ts`.


---

# Lane C (progression), run 3 (Sonnet, November 9, 2026)

Items: C2 (expedition completion hook) and C4 (level data in the results). Orchestrator-authorized contract edits.

## Files changed

- `packages/contracts/src/index.ts`: `SessionResultsSchema` gains OPTIONAL `beaconsLit` (0 to 5), `stampEarned`, `level` (>= 1), `levelUp` (null or `{ fromLevel, toLevel, gained }`, strict). Nothing else in the file.
- `packages/contracts/src/paths.ts`: `ApiPaths.meExpeditionRuns` (addition only).
- `packages/contracts/src/progress.ts`: `StartExpeditionRunRequestSchema`, `StartExpeditionRunResponseSchema` (additions only).
- `apps/api/src/modules/progress/{service,routes,index}.ts`: `POST /api/v1/me/expedition/runs`, `startExpeditionRun`, `getSessionDestination`, `getExpeditionRunOutcome`.
- `apps/api/src/modules/progress/level.ts` (new): the one place the API reaches the level curve (see cross-lane requests).
- `apps/api/src/modules/sessions/service.ts`: the one hook (`recordExpeditionIfStarted`, inside the completion transaction).
- `apps/api/src/modules/sessions/views.ts`: results carry `level`, `levelUp`, and (when a run was recorded) `beaconsLit`, `stampEarned`. Re-reading a finished session returns the same facts.
- `tests/integration/expedition-completion.test.ts` (new, 13 tests, real PostgreSQL). `replayExpedition` is MOCKED (it is a stub on this branch); everything else is real.

## Behavior

- Route: session must be the caller's (404 otherwise, same answer as missing) and active (409). Destination unknown or locked: 403. One `expedition_events` row, kind `start`, payload `{ destination }`; repeat with the same destination is 200 and idempotent; a different destination is 409 `idempotency_key_conflict` (reused existing code, no new ErrorCode). First call 201. Guests work.
- Unlock rule used is the existing `unlockedDestinations` (great-wall always, each next one after a stamp on the previous). This equals "petra after a great-wall stamp"; andes onward need a prior stamp chain, so they are effectively locked for now.
- Hook: at the completing answer, if a `start` event exists, the stored answers are replayed in order (`replayExpedition`), `recordExpeditionRun` is called in the same transaction (exactly-once via its unique event), and bestStreak is the longest correct run. No start event: no replay, no stamp, fields absent.
- Level: derived from the xp ledger as of the end of this session (events written at or before the session's last xp event), so later sessions never change an older session's `levelUp`. Curve unchanged (xpStep 100, maxLevel 50), still PENDING owner tuning.

## Art references

None (no visual work).

## Copy (PENDING)

None (no new kid-facing text).

## Cross-lane change requests

1. `packages/learning-core/src/index.ts`: add `export * from './progression';` (or `export { LEVEL_CURVE, levelForXp, levelProgress, levelUpBetween, xpForLevel } from './progression'; export type { LevelProgress, LevelUp } from './progression';`). Then replace the single line in `apps/api/src/modules/progress/level.ts` with `export { levelForXp, levelUpBetween } from '@bidazoo/learning-core';` (it imports by relative path until then).
2. `apps/api/src/modules/index.ts`: register `{ name: 'progress', plugin: progressModule }` (import from `./progress`). My tests register it themselves when it is missing.
3. `games/zoo-sprint/src/session-client.ts` (Lane A): right after `startSession` succeeds, when a destination is given, call
   `await http.post(ApiPaths.meExpeditionRuns, { sessionId: session.id, destination })` (same cookie/credentials as the other calls; 201 or 200 means recorded; 403 means locked, 409 means a different destination was already recorded for that session). Then results carry `beaconsLit` and `stampEarned` for the end screen, and `level` and `levelUp` for every session.

## Open questions

- A different destination for the same session returns 409 with the existing code `idempotency_key_conflict`. Say if you want a dedicated error code.
- The level is not stored, so a changed curve changes old results' `level` on re-read (levelUp is recomputed the same way). Intended, but worth knowing.

Check (`.bake/check.ps1`, 19:51 to 20:04 CST, on d42ba54 plus the REPORT commit): ALL CHECKS PASSED (typecheck, vitest incl. 13 new tests, play-spec 24 passed). No existing test changed. Waited about 50 minutes for the integration CI's two stacks (retried every 10 minutes) before starting.
