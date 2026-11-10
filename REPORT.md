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


---

# Lane C (progression), run 4 (Opus, November 9, 2026)

Item: C3 (gear catalog, GET/PUT /api/v1/me/gear with a server-side coin debit, OutfitterOverlay, gear
drawn as code sprites). Started 20:07 CST.

## Art references

Listed before any visual change (rule 13). The OutfitterOverlay and the code-drawn gear sprites will use
only these:

- `docs/CHARACTER-BIBLE.md` sections 2, 4 and 5 (LOCKED anchors win: Dino has exactly one backpack,
  Koala has no backpack, Tarsier's goggles, Eagle's white head and green "A" jacket, Bronco's maroon
  bandana; no new starters; Click is host only, so Click never wears gear).
- `docs/visual/09-palette.md` (platform and World Expedition tokens for gear colors).
- `docs/visual/10-ui-component-style.md` (field-kit panels: parchment card, brass edge, timber;
  `TapButton` and `BUTTON_STYLES` reused, hit targets published).
- `docs/visual/14-do-dont-anti-drift.md` (what gear must not do to a character).
- `docs/visual/20-basecamp-walk.md` (walker anchoring at the feet, puppet motion, painted walker and
  painted bust fitting).
- `games/zoo-sprint/assets/world-expedition/walk-painted/<id>_walk_side.webp` for the five starters
  (anchor points on the painted walker; read only, not edited).
- `games/zoo-sprint/assets/world-expedition/characters-painted/<id>/<id>_idle.webp` for the five
  starters (anchor points on the painted bust; read only, not edited).

No image file is added or changed: gear is drawn with Phaser Graphics.

Owner confirmation of the art references (relayed by the orchestrator, November 9): confirmed exactly as
listed, with the held "trail stick" in place of a pack. Orchestrator decision: no gear may cover or replace a
LOCKED feature; a unit test checks every anchor.

## Files changed (C3)

Server (commit cc7ad31):

- `packages/contracts/src/progress.ts`: `GearItemSchema` (new); `GearSchema` grows `coins` and `catalog`
  (Lane C's shape to grow, per `contracts.check.ts`; exported names unchanged); `UpdateGearRequestSchema` (new:
  `{ buy?: itemId, equipped: itemId[] }`, strict, no price or coins field).
- `apps/api/src/modules/progress/gear-catalog.ts` (new): the server-side catalog, 3 slots (`hat`, `scarf`,
  `stick`) x 4 items, frozen. Names and prices PENDING.
- `apps/api/src/modules/progress/gear.ts` (new): `getGear` (read-only, writes nothing), `updateGear` (one
  transaction: lock the `player_progress` row FOR UPDATE, optional purchase, equip validation, save).
- `apps/api/src/modules/progress/routes.ts`: `GET` and `PUT /api/v1/me/gear`. `index.ts`: exports.
- `database/migrations/0007_gear_purchases.sql` (new) + `meta/_journal.json`: `wallet_transactions_source_ck`
  also allows `gear_purchase`; new `wallet_transactions_debit_ck` (a row is negative exactly when it is a gear
  purchase) and `wallet_transactions_gear_ck` (a purchase is keyed to the paying player).
- `tests/integration/progress-gear.test.ts` (new, 16 tests: 3 pure + 13 on real PostgreSQL).

Client (commit e34498f), all under `games/zoo-sprint/src/basecamp/outfitter/` (new):

- `index.ts`: `registerOverlay('outfitter', { hotspot: 'lodge-door', open: openOutfitter })`, plus exports.
- `OutfitterOverlay.ts`: parchment panel, coin pill (the server's balance), 3 rows x 4 item cards (code-drawn
  icon, name, price or Owned/Wearing), Close. Tap = buy and wear, wear, or take off. Emits `'close'` before it
  destroys itself; publishes `data-outfitter` and `data-outfitter-targets`; sets the a11y mirror (one real
  button per card, and Close). MINIMAL code-drawn version from the listed references.
- `gear-model.ts`: pure. Per starter and view (`walk`, `bust`): the LOCKED features as rectangles (fractions of
  the painted picture) and the slot anchors that clear them; `SKIPPED` with reasons; `GEAR_LOOKS` (colors per
  item); `gearPlacements`.
- `gear-sprites.ts`: Phaser Graphics only (no image file): `buildGearLayer` (walker or bust), `syncGearLayer`
  (follows the walker's bob, lean, squash and facing), `drawGearIcon`.
- `gear-client.ts`: `gearPlatform(platform)` (null until the platform has `getGear`/`updateGear`; then the
  outfitter says it is closed and no gear is drawn), `loadGear`, `currentGear`, `equippedGear`,
  `onGearChange`, `requestForTap` (pure).
- `tests/integration/gear-anchors.test.ts` (new, 10 unit tests).

## Behavior (C3)

- Purchase: the item must be in the catalog (400). Already owned: no charge, 200 (retries and concurrent
  repeats never double-charge; the ledger's unique key also forbids a second debit). Otherwise the server
  compares ITS price with ITS coin total (the sum of the ledger) under the row lock: short = 409
  `invalid_request` "Not enough coins." and nothing written; else one ledger row `amount = -price`,
  `source_type = 'gear_purchase'`, `source_id = player`, `reason = 'gear:<id>'`, no session. `/me` totals and
  the GET show the debited balance. Concurrent purchases cannot spend the same coins twice (tested).
- Equip: catalog items only, no duplicates, one per slot (400); owned only (403 `forbidden`). An invalid equip
  list rolls back a purchase made in the same request.
- Guests work (everything keys off the player id; the tests use guests). A cross-site PUT gets 403
  `forbidden_origin` (existing hook).
- Gear on the buddy: anchors clear every LOCKED feature (unit-tested). Not drawn, by design: Dino hat (the head
  top is the dorsal crest), Tarsier hat (goggles), Eagle hat (white head) and scarf (jacket collar), Bronco
  scarf (maroon bandana). The stick is a held item: walker only, never on a bust. Click never wears gear.
  Koala and Bronco wear the hat over their painted hats (not LOCKED).

## Copy (PENDING)

Item names (server catalog, `gear-catalog.ts`) and prices in coins (placeholders):

| id | name | price |
| --- | --- | --- |
| hat-sun | Sun Hat | 20 |
| hat-ranger | Ranger Hat | 40 |
| hat-beanie | Wool Beanie | 60 |
| hat-explorer | Explorer Helmet | 90 |
| scarf-red | Red Scarf | 15 |
| scarf-striped | Striped Scarf | 30 |
| scarf-woven | Woven Scarf | 50 |
| scarf-silk | Silk Scarf | 80 |
| stick-bamboo | Bamboo Stick | 25 |
| stick-oak | Oak Trail Stick | 45 |
| stick-lantern | Lantern Stick | 70 |
| stick-compass | Compass Stick | 100 |

Outfitter strings (`OUTFITTER_COPY` in `OutfitterOverlay.ts`): "Outfitter"; "Hats"; "Scarves"; "Trail Sticks";
"Owned"; "Wearing"; "Close"; "Opening the outfitter..."; "The outfitter is closed right now. Come back soon!";
"Not enough coins yet. Play a run to earn more!"; "That did not work. Please try again."; screen reader:
"Outfitter. You have {n} coins. Tap an item to buy it, wear it, or take it off."; "Buy {name} for {price}
coins"; "Wear {name}"; "Take off {name}"; "Close the outfitter". API error message: "Not enough coins."

## Cross-lane change requests (C3)

1. `games/zoo-sprint/src/index.ts` (startup): add `import './basecamp/outfitter';` (registers the overlay).
2. `packages/game-sdk/src/index.ts`: in `BidaZooPlatform` add `getGear(): Promise<Gear>;` and
   `updateGear(request: UpdateGearRequest): Promise<Gear>;`, and add `Gear`, `GearItem`, `UpdateGearRequest`
   to the type imports and re-exports from `@bidazoo/contracts`. `apps/play/src/platform.ts`: widen `call`'s
   method to `'GET' | 'POST' | 'PUT'` and add `getGear: () => call<Gear>('GET', ApiPaths.meGear),` and
   `updateGear: (request: UpdateGearRequest) => call<Gear>('PUT', ApiPaths.meGear, request),`. Until then the
   outfitter shows its "closed" line and no gear is drawn (there is no stand-in fetch in the game). Any test
   fake that implements `BidaZooPlatform` then needs the two methods.
3. `games/zoo-sprint/src/scenes/BasecampScene.ts` (Lane B), importing `loadGear`, `equippedGear`,
   `buildGearLayer`, `syncGearLayer` from `../basecamp/outfitter`:
   - in `create()`: `void loadGear(ctx.platform).then(() => { if (this.sys.isActive() && this.ready) this.build(false); });`
   - in `Walker`'s constructor, only when `this.painted`, after the figure:
     `this.gear = buildGearLayer(scene, id, 'walk', equippedGear(), { x: -this.bodyW / 2, y: -this.bodyH, w: this.bodyW, h: this.bodyH }); this.add(this.gear);`
     and at the end of `puppet()` and `face()`: `if (this.gear) syncGearLayer(this.gear, this.figure, this.baseScale, facing);`
     (`face` passes `dir`; `hop` tweens the figure only, so tween the gear layer with it).
   - when an overlay container emits `'close'`: restore the Basecamp a11y actions and `this.build(false)` so new
     gear shows. Pause walking (arrow keys) while an overlay is open.
4. Busts (`games/zoo-sprint/src/characters.ts`, painted-expression path): after the painted image is fitted, for
   the five starters only, add `buildGearLayer(scene, id, 'bust', equippedGear(), <the displayed picture's
   bounds in the Character's local coordinates>)` above the image.
5. `database/schema/ledger.ts`: mirror migration 0007 in the Drizzle definition (the source check gains
   `'gear_purchase'`; add `wallet_transactions_debit_ck` and `wallet_transactions_gear_ck`). No behavior depends
   on it today (my file list allows only a new migration under `database/`).
6. Still open from run 3: `apps/api/src/modules/index.ts` registers `progressModule` (the gear routes ride on it;
   my tests register it themselves when it is missing).

## Open questions (C3)

- No dedicated error code for "not enough coins": it is 409 `invalid_request` with the fixed message "Not enough
  coins." An `insufficient_coins` code would be a contracts change (`ErrorCodeSchema`).
- Hats are drawn only on Koala and Bronco; Dino, Tarsier and Eagle wear no hat, Eagle and Bronco no scarf
  (LOCKED features). Owner: are these skips right, or should painted gear later find another spot?
- Prices vs earnings: a perfect 10-question session earns 30 coins today (10 x 2 + 10), so the PENDING prices
  mean 1 to 4 sessions per item.
- Bust gear has no hook yet (request 4).
