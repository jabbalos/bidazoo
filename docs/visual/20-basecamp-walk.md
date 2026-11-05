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

## Not in W1 (open)

Destinations beyond the signpost ("Rice Terraces: coming soon"), the map room and plaza of doc 12,
NPCs other than Click, any reward, unlock or progression tied to the world (the server owns all of
that and nothing here asks it), real walk-cycle frames, higher-resolution character art.
