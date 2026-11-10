# Report: Lane B, Expedition (bake-off, day 1)

Started: see "Times" at the end. Branch `lane/expedition`.

## Art references (rule 13) -- sent to the orchestrator at run start

Awaiting owner confirmation. Until it reaches me, every visual in this lane is gradient or code-drawn only
(no painted-file reads into the build, no new image files), built from these references:

1. `docs/visual/12-destination-worlds.md` -- the seven destination palettes (3-5 colors plus accent), light,
   three layers per destination, avoid lists. Source of every gradient color in B5.
2. `docs/visual/09-palette.md` and `games/zoo-sprint/src/theme.ts` (`EXP`, `EXP_CSS`) -- UI tokens for the map board,
   trailhead card, HUD counter and summit card (parchment, navy, brass, orange).
3. `docs/visual/10-ui-component-style.md` -- panel, pill, ribbon and button style for map tiles and cards.
4. `docs/visual/11-environment-style.md` section 3 and `docs/visual/13-phaser-asset-spec.md` -- far/mid/near layering,
   1920x1080 layer size, 3 layers, portrait crop; used for the manifest layer rules and the art-request files.
5. `docs/visual/20-basecamp-walk.md` and `docs/visual/18-world-expedition-visual-recovery.md` -- walking feel and
   scale rules the shared walker keeps.
6. `docs/visual/14-do-dont-anti-drift.md` -- do/don't list applied to all new visuals.
7. `docs/CHARACTER-BIBLE.md` (LOCKED rules win) -- the buddy is shown only through the existing shared Walker and
   existing painted/walk files; no new character art, no new starters; Click is host only.
8. Painted-v1 files read as references only (not copied): `games/zoo-sprint/assets/world-expedition/basecamp/basecamp.json`
   (manifest scale rules), `basecamp-far.jpg`, `basecamp-mid.webp`, `walk-painted/*_walk_side.webp` (existing walkers).

For B1, B2, B4, B5 these are the full set. Per item: B1 uses 1, 4, 5, 7, 8; B2 uses 1, 2, 3, 7; B4 uses 2, 3, 6, 7;
B5 uses 1, 4, 8.


---

# Review 4 fixes (R4-High, R4-Medium)

## R4-High: short destination ids (done)
- `git mv` of the 6 destination folders to `petra`, `andes`, `maya`, `taj`, `nile`, `philippine-highlands`; each manifest `id` and every `unlock.requires` entry updated.
- `DESTINATION_IDS` is now great-wall, petra, andes, maya, taj, nile, philippine-highlands (in `games/zoo-sprint/src/presentation/destination-model.ts`).
- `tests/scripts/refresh-painted-provenance.mjs` id list updated. `docs/visual/INGESTION-REPORT.md` left alone.
- Owner-approved id-string-only test edits: `tests/e2e/expedition.spec.ts` (2 lines), `tests/integration/destination-model.test.ts` (3 lines). No assertion changed. No other existing test changed.

## R4-Medium: server-driven map unlocks (done)
- `destination-model.ts`: new `EXPEDITION_UNLOCKED_KEY` ('expeditionUnlocked'), `serverUnlockedIds(raw)` (array or Set of strings; anything else means only great-wall; great-wall always in), `mapTiles(manifests, unlockedByServer)` unlocks only ids in that set; manifest supplies only `unlock.rule` text. `isUnlocked` kept (existing tests use it) but is not on the map path.
- `basecamp/map-overlay.ts`: reads the registry key on open; listens to the registry `changedata` event (filtered to that key), redraws tiles in place (`drawTiles`), refreshes `data-map-tiles` and the a11y list (unless the trailhead card is open); listener removed on overlay destroy. The old 'expeditionStamps' path is removed.
- New tests: `tests/integration/destination-server-unlocks.test.ts`, 9 tests (pure functions; real manifests from disk, no mocks). The overlay in-place redraw itself is not unit-tested (Phaser); covered by the pure functions only.

## Check
`.bake\check.ps1 -Specs play.spec.ts,basecamp.spec.ts,expedition.spec.ts`: typecheck PASS, vitest PASS (787 passed, 3 todo), play-spec PASS (68 passed), **ALL CHECKS PASSED**.

## Cross-lane change requests (R4)
- Integration workspace: make `DESTINATION_IDS` in `games/zoo-sprint/src/presentation/destination-model.ts` come from the contracts `EXPEDITION_DESTINATIONS` list, re-exported through `@bidazoo/game-sdk`, so there is one source. Also add the API test that every manifest id is accepted by the server.
- Integration workspace: when the map opens, set `scene.registry.set('expeditionUnlocked', platform.getExpedition().unlocked)` (array of ids), and set it again whenever it changes.
