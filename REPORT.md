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
