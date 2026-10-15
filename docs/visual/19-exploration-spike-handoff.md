# Exploration spike: handoff

Branch: `spike/world-hub-exploration` (from `feature/world-expedition-visual-recovery` at `6cedf93`). Nothing here is deployed or merged. `main` and production are untouched.

## Status
WIP, NOT visually accepted. Movement, camera follow, parallax and two landmarks work. The walking buddy looks wrong.

## What exists
- `games/zoo-sprint/src/presentation/explore-model.ts`: pure movement, camera and landmark rules (no Phaser).
- `games/zoo-sprint/src/presentation/world-layers.ts`: tileable World Expedition layers (sky, ridges, terraces, lanterns, ledge, fronds), Basecamp Gate and signpost. Reuses the existing palette and surface helpers.
- `games/zoo-sprint/src/scenes/ExploreScene.ts`: the scene. Keyboard (arrows / A, D) or hold-to-walk. HUD on a second camera. Click stands in the world with a speech bubble.
- `games/zoo-sprint/src/index.ts`, `apps/play/vite.config.ts`, `apps/play/package.json`: dev-only build mode. `npm run build:world-spike -w @bidazoo/play`, then `npm run preview:world-spike -w @bidazoo/play`, open `/?explore=1&buddy=dino`. Normal builds do not contain it.
- `tests/scripts/explore-capture.mjs`: Playwright capture (start, walked, signpost, gate and Click, walk left).
- `environment.ts`: helper functions were only made `export`; no behavior change.

## What is wrong / not done
1. **The buddy is a bust, not a walking character.** The approved expression PNGs are head/bust crops with a flat bottom edge. Hiding that edge behind a ledge makes a big head slide behind grass. This was the owner's main complaint. Next: check the approved library (hero poses, turnarounds under `games/zoo-sprint/assets/world-expedition/characters/*` and `docs/reference-art/world-expedition/production-v1.1/asset-library/`) for full-body art. If none works for walking, report that as the spike finding; do not fake it.
2. **Last edits never ran** (the final command was interrupted):
   - Click was placed left of the gate, off screen when the player reaches the gate. Move Click to the right of the gate (`clickX = gateX + 0.36 * unit`).
   - Gate and signpost were smaller than the characters on a tall phone. Size them from a landmark unit (`min(unit * 0.95, viewWidth)`).
   - A lighter rectangle seam in the far terrace tile came from the non-tileable mist; replace it with a full-width haze band.
   - The HUD should use `min(w, h)` for its own sizes while world distances use `unit = min(h, 1.4 * w)`.
   - The capture script should keep walking until Click is on screen before the gate shot.
3. No unit tests yet for `explore-model.ts` (add to `tests/integration`).
4. Real-device performance was never measured (software GL only). Walking uses per-frame tile updates; check on a real phone.
5. Not run for the spike build: full vitest, `scan:client` on the spike build, e2e.
6. Character sharpness limits from the source art still apply (see doc 18).

## Rules still in force
Presentation only. No backend, API, DB, progression, XP, coins, grading, identity or deployment changes. No merge to `main`, no deploy.
