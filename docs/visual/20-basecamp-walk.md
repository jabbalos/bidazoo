# 20 Checkpoint W1: Expedition Basecamp, the walkable home screen

Status: BUILT (branch `feature/w1-basecamp-walk`), owner-accepted look (November 4, 2026), pending
Studio validation and deploy. Presentation only.

## What it is

After "Choose Your Buddy" the game no longer jumps straight into a run. The chosen buddy stands,
whole body, in the World Expedition scenery (the approved palette, sky, ridges, paddy terraces,
lanterns, fronds and grass ledge from doc 18, now as separate parallax layers) and walks left or
right. Click, the host, waits beside the **Basecamp Gate**. Walking into the gate opening is the
portal: a warm flash, then the same server-owned Zoo Sprint run as before. Results end with "Back to
Basecamp", which drops the buddy just outside the gate so one step starts another run.

## Owner decisions (November 4, 2026)

- World / Explore / Basecamp was pulled ahead of roadmap G.
- Walk animation: **procedural puppet** from one approved picture (no generated walk frames).
- Entry: **Basecamp is the home screen** (land there after choosing; no "Explore" button).

## Art

- The walking pictures are the canonical **side-view turnarounds** from the M4 asset library, one
  per cast member (Click included), copied byte for byte into
  `games/zoo-sprint/assets/world-expedition/walk/` with `PROVENANCE.json`
  (`tests/integration/walk-runtime-assets.test.ts`). They all face right; the game flips them.
- Source size is 174 to 269 px wide and 229 to 289 px tall, so the walker is sized at 30% of the
  screen height, capped at 1.3x the source (`WALKER_MAX_UPSCALE`): sharp on phones, slightly small
  on a very large desktop window by design. Higher-resolution art remains an open item (doc 18).
- The expression crops (doc 16/18) are still used everywhere else: cards, the run, results, the HUD
  medallion. No approved file was edited.

## Motion (puppet)

One image at origin bottom-center: a step bob (`|sin|`, 5.5% of body height at top speed), a lean
into the walk (up to 0.06 rad), a footfall squash (3.5%) with width compensation, a soft ground
shadow that shrinks as the body rises, dust puffs on each footfall, idle breathing when still.
`prefers-reduced-motion` turns all of it off (the picture slides).

## Rules of the world (`presentation/explore-model.ts`, pure, tested)

- `unit = min(viewH, 1.4 viewW)`; world width `max(6.5 unit, 3 viewW)`; ground at 85% of the
  height; start at 25% of a unit; signpost at 30% of the world, gate at 62%, Click 0.24 unit past it.
- Top speed 0.62 unit/s, 140 ms acceleration, deterministic and frame-rate independent (dt capped).
- **Portal:** the gate opening is `gateCoreRadius = 0.09 unit` either side of the gate. Inside it the
  buddy is held to 35% speed (`GATE_DRAG`), and a progress value fills over 420 ms
  (`PORTAL_DWELL_MS`), draining twice as fast outside. A walk-through becomes a walk-in; brushing
  past the gate's wider "near" radius never opens it.
- Input: arrow keys / A, D first; otherwise the held screen half (left half walks left).
- Camera: eased follow with 8% look-ahead, never past the world's edges. HUD on a second camera.

## Accessibility and tests

- The screen-reader mirror always offers "Enter the gate and start (continue) a run", so keyboard
  and assistive users never have to walk. Tests about the run use that action
  (`tests/e2e/basecamp-helpers.ts`); `tests/e2e/basecamp.spec.ts` walks for real (touch halves,
  arrows, edges, the signpost, the gate prompt, the portal, resume wording, viewport change).
- Published page state (`#game[data-*]`): `scene=basecamp`, `player-x`, `camera-x`, `world-w`,
  `gate-x`, `gate-core`, `near`, `moved`, `facing`, `portal`, `walk-art`, `buddy-rect`,
  `click-rect`, `layers`; the "enter-gate" hit target while near the gate.

## Painted Basecamp (November 7, 2026)

The code-drawn scenery above is now the FALLBACK. When the painted art is present the Basecamp shows
it instead (presentation only; `src/basecamp-art.ts`, `src/presentation/backdrop-model.ts`):

- **Backdrop:** `games/zoo-sprint/assets/world-expedition/basecamp/basecamp.json` names the layers,
  back to front (`basecamp-far.jpg` parallax 0.4, `basecamp-mid.webp` with transparent sky, parallax
  1), each scaled to fill the view height, bottom-aligned; the front layer sets the world width. The
  other fields are fractions of the picture: `groundY` (feet), `gateX`/`gateTopY` (the PAINTED gate is
  the portal: same core radius, dwell and prompt), `lodgeDoorX` (Click), optional `signpostX` (the
  "coming soon" signpost), `walkMinX`/`walkMaxX`, optional `walkerHeight` (default 0.3 of the view).
  The code-drawn layers, gate, signpost, ledge and fronds are not drawn. A missing or invalid manifest
  or a layer that fails to load gives the code-drawn Basecamp unchanged (`data-backdrop="code"`).
- **Painted cast:** `walk-painted/<id>_walk_side.webp|png` (faces right) replaces the canonical side
  view for the walker, anchored at the feet of its opaque pixels and sized with `castPresence`;
  `click_idle_front` is Click's standing pose at the lodge door. Missing files fall back to `walk/`.
- **Swapping art** is a file replacement, then `node tests/scripts/refresh-painted-provenance.mjs`
  (records size and SHA-256 in each folder's `PROVENANCE.json`, which the client bundle scan and
  `tests/integration/basecamp-painted-assets.test.ts` require) and re-measuring `basecamp.json`.
- Not done: rendering the canvas at device pixel ratio (a game-wide change to every scene's
  coordinates and hit targets); on a 2x phone the painting is upscaled by the browser.

## Painted screens: Choose Your Buddy, the run, Results (November 7, 2026)

The other screens now happen in the same painted place (presentation only; no API, database, grading,
XP, coin or mastery change):

- **Backdrops** (`src/painted-backdrop.ts`, crops in `PAINTED_VIEWS` in `src/presentation/backdrop-model.ts`):
  the Basecamp layers, already loaded at boot, cropped per screen. Choose Your Buddy: the whole plaza out of
  focus (a small flattened copy drawn scaled up) behind the menu, and a sharp crop of the lodge porch inside
  the hero card. Run: the lantern canopy and tables (portrait, full screen) or the observatory (landscape
  scene panel, with the plaza soft behind the page). Results: the paw-banner gate in warm light. Without the
  painted layers every screen draws its code-drawn backdrop as before. A soft dark gradient sits behind the
  HUD and the answers on portrait; the code-drawn grass ledge becomes a timber deck on painted screens.
- **Hero card:** the painted whole-body front pose (`walk-painted/<id>_idle_front`, all six cast members),
  feet on the name plate, with a contact shadow. It is one picture, so "Choose" plays the hop and ring only.
- **Painted expressions** (`assets/world-expedition/characters-painted/<id>/<id>_<state>.webp|png`, own
  PROVENANCE.json): used everywhere a bust is drawn (run, Results, medallions, Click's chip, the HUD avatar)
  when ALL SIX files of that character exist and loaded (`paintedExpressionCast`, `hasPaintedExpressions`);
  else the approved production expressions (unchanged, still loaded at boot) and then the code-drawn busts.
  One canvas per character, bottom-aligned on the flat chest cut: `computePaintedFit` gives one scale per
  character, the cut sits `overlap` px below the box under the card, deck or plate, and the whole picture is
  never wider than its box. The M4 eye-line/head-core numbers, the Dino tryAgain hidden-bounds polygon and
  the production `maxScale` apply to the production PNGs only (the polygon is keyed to their texture keys).
  Swapping a painted expression: replace the file, `node tests/scripts/refresh-painted-provenance.mjs`.
- **Palette:** answers are polished timber (`BUTTON_STYLES.answerTimber`), the HUD pill, route and neutral
  feedback pill timber brown, medallion backs canvas cream; right stays green, a miss stays amber.
- **QA hooks:** `data-painted-art` (painted expression textures loaded), `data-hero-art` (menu) and
  `data-buddy-art` (run, Results): `front`, `painted`, `production` or `fallback`.

## Not in W1 (open)

Destinations beyond the signpost ("Rice Terraces: coming soon"), the map room and plaza of doc 12,
NPCs other than Click, any reward, unlock or progression tied to the world (the server owns all of
that and nothing here asks it), real walk-cycle frames, higher-resolution character art.
