# Template rules v2 - expression cells (renderer-side rule set)

Status: renderer rule proposal implementing the owner decision of October 13, 2026 ("do not compress, squeeze or over-crop
characters for the 109 px rule"). It does NOT change the locked geometry of doc 15 (cell 125 x 214 at the listed boxes,
label pill y 732, eye line y 598, 109 px safe width, crown >= y 520, 8 px inset). Docs 08/15/16 are untouched; they are
synced later in one deliberate change.

## 1. Core box vs. effects

* **CORE box** = head + hat/hood/goggles + ears (+ mane for Bronco), in source px `x0,y0,x1,y1`. Not the whole image.
  Fists, paws, hooves, arms, jacket/harness, binoculars held up, thumbs, and detached effects (ticks, bursts, `?`, `!`, sparkles)
  are NOT core.
* **EFFECT / EXPRESSION ALLOWANCE** = everything that is not core (limbs, props, effects) plus ears when they sit outside the safe window.
  It may use the full **cell pitch**: the cell plus half of the 12 px gutter on each side, i.e. x from cell.x-6 to cell.x+131 (137 px), top >= cell.y+2,
  bottom bleed allowed (clipped at y 724). Effects may therefore reach the gutter midpoint but never enter a neighbor: the neighbor's core safe window starts
  8 px inside its own cell, and adjacent allowances only meet at the gutter midpoint (owner decision, October 13, 2026; v2.1).

## 2. Scale (never per cell squeeze)

1. ONE `head_scale` (px per source px) per character, shared by all six states.
2. Source density correction `units_per_source_px` (u_i) is 1 except for density outliers: a state whose crown-to-eye
   distance (`eye_line_src_y - core.y0`) deviates more than 27 % from the character's median is a differently scaled drawing
   (observed: Tarsier IDLE and TRY AGAIN, ~1.5x larger in source) and gets `u_i = median / own`. Documented in the manifest.
3. `head_scale = min( 100 / median(core_w_i x u_i) , 109 / max(core_w_i x u_i) )` (floored to 4 decimals): nominal 100 px core,
   but large enough that no core is ever scaled down for being wide and small enough that the widest core still fits 109.
   Fists/effects never enter this formula.
4. Eye line stays at y 598 for every state (locked); the matted core is centred horizontally in the cell.

## 3. Horizontal anchor (placement, not scaling)

The core is centred. If limbs/effects would leave the allowance, the art is slid sideways just enough to pull them inside. The core may sit anywhere in the
109 px safe window (x+8 .. x+117), never outside it. If both sides cannot be satisfied, the slide that minimizes the worst overflow inside the window is used.
There is no shrinking and no crop. Reported as `allowance_shift_dx`.

## 4. What is still a true flag (`ART/TEMPLATE REVIEW REQUIRED`)

| metric | condition |
| --- | --- |
| `core_width_px` | core wider than 109 px + 1 px tolerance (policy A) |
| `core_crown_y` | core top above y 520 (8 px under the cell top) |
| `art_left/right_outside_allowance_px` | any art pixel (core or effect) more than 1 px (policy A) outside x-6 .. x+131 (137 px) after the slide; wider art is first fitted down (policy B), so this flag now only appears if the fit-down is disabled or cannot reach the limit |
| `art_top_outside_allowance_px` | any art pixel above cell.y+2 |
| turnaround / hero / proportion flags | unchanged from doc 15 |

Not a flag: art bleeding off the bottom edge, art entirely inside the allowance but wider than 109, small effects inside the allowance.
Flags are never hidden by shrinking or cropping; the owner decides between a different pose, a larger allowance (e.g. spilling into the gutter) or a
different scale constant. `check_consistency.py` lists the measured excess per cell.

## 5. Where core boxes come from

Priority: (1) `core_overrides.json` (manual, with a reason); (2) `core_box` in `expression-batch/<c>/<c>_<state>_report.json`, unless it
is more than 15 % wider than the derived core (then rejected as including limbs/body, logged); (3) automatic derivation. Everything is
written to `core_boxes.json` with its source. Derivation heuristic (`tools/derive_core_boxes.py`): alpha >= 8; drop components below 8 % of the
largest (detached effects); cut everything below `chin = eye_line + 0.55 x (eye_line - crown)`; keep the component holding the face point plus any
component >= 25 % of it; measure the x-extent on rows crown..(eye + 10 % of eye-to-chin) so raised fists/hooves/paws do not widen the core.
Frozen IDLE assets are derived the same way. Known limits: a limb touching the head in 2D (Bronco CHEER hoof joined to the mane) cannot be separated
automatically (hence the manual override); `eye_line_src_y` estimates feed the chin cut.

## 6. Vertical rules and the head-only placement policy (OWNER-VISIBLE RULE CHANGE, v2.1)

* **Full-bust expression assets** (`crop_kind: "bust"`, the default): the doc 15 eye-line lock stays. Eye line y 598, crown >= y 520, shoulders/chest bleed off
  the bottom (clip at y 724). Their art bottom varies with the amount of body below the eyes; the checker requires the spread to be <= 30 px.
* **Head-only crops** (`crop_kind: "head_only"`): an asset whose art ends at a hard crop (neck/chin) well above the character's other states. **These are
  bottom-anchored: the art bottom sits on the cell bottom (y 724, inside the border), so the hard edge is hidden by the cell bottom and the head does not float.**
  The eye-line lock does NOT apply to them (their eye line is whatever follows from the bottom anchor, reported per cell). Scale is still the character's core scale.
  Classification is automatic in `tools/make_v2_manifests.py`: an eye-line-anchored art bottom more than 15 px above the character's median art bottom => head-only.
  Currently: Dino IDLE, Tarsier IDLE, Eagle IDLE. Override per asset with `transform.crop_kind`.
* **Head close-up boxes** (200 x 246): all heads use `anchor: "bottom"` - art bottom on the box bottom edge (y 754), cropped/bleeding there, instead of the eye-line y 610
  lock. Head width stays 88 % of the box (176 px) of the core. No fade or mask is applied (matting is never altered); the box bottom hides the hard edge.
  The checker requires the art top to be no more than 86 px (35 % of the box height) below the box top; otherwise the asset is too short for the box and must be re-extracted taller.
* `vertical_anchor: "bottom"` on `expressions` would bottom-anchor every cell; unused.

## 7. Short head close-ups and short busts (OWNER-VISIBLE RULE, v2.2, superseded in part by policy C below)

Head close-ups are always bottom-anchored (art bottom on the box bottom, y754) at 88% core width, never scaled to fill the box. If the head asset is shorter than the box allows (art top more than 35% of 246 px below the box top), it STAYS bottom-anchored and the empty space is left above the head. No vertical centering (it would float the hard crop edge). Since v2.3 (policy C) `check_consistency.py` reports this only as `INFO  short bust, art top N px below box top`; it is not a failure and not a warning. Re-extracting taller is optional.

## 8. Owner policies A-D (OWNER-VISIBLE RULE LIST, v2.3, October 13, 2026)

Complete list of the expression-size rules in force. They change no geometry of the locked template (docs 15/16).

* **A. Width tolerance.** Every width check (core <= 109 px, art inside the 137 px allowance) has a 1 px tolerance for resampling and rounding. An excess of 1 px or less is neither flagged nor fitted (fit-down factor stays 1.0000).
* **B. Wide expression art.** Expression portraits are not cast-scale authority. If a cell exceeds the safe width by more than the tolerance (core wider than 109 px, or art outside the allowance after the sideways slide), the ENTIRE asset is scaled down uniformly: aspect preserved, no independent X squash, no cropping of ears, hats, crest or muzzle, eye line unchanged (y 598 on bust cells; bottom anchor kept on head-only cells), scaled about the core centre. The factor is the largest value (4 decimals, rounded down) at which the width excess is zero; it is recorded per cell as `fit_down_factor` (also `expression_fit_down` in the report, `width_excess_before_fit_px`, and a `fit_down` line in `check_report`). `head_scale` itself is not changed; a fitted cell is simply smaller than its siblings by that factor. Factor 1.0 = untouched.
* **C. Short busts.** A portrait does not have to fill the vertical box. Transparent space above (head close-up) or below (expression cells) is valid. A bust is judged by consistent head/face scale (the `core_scale` crown-to-eye check), correct eye line, and semantic framing. It is never stretched vertically, no torso is invented, and it is not enlarged until its ears/hats overflow. Koala and Tarsier head close-ups being short is INFO only.
* **D. Cast scale factors** Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57 govern the turnaround and proportion-guide presentation only. They are not applied to expression fill: expressions use the per-character core `head_scale` (section 2) plus, only where needed, the per-cell fit-down of policy B.

Stale hand-set boxes (v2.3): `tools/derive_core_boxes.py` ignores, with a loud `STALE manual override` warning, any `core_overrides.json` entry whose box lies outside the current asset or whose optional `sha256` no longer matches the asset (a re-authored asset invalidates a hand-set box; example: Bronco CHEER override `[68,24,218,135]` against the re-authored 172 x 147 asset caused a 9.7 px overflow). Prefer the worker `core_box` from the QA report and leave `core_overrides.json` empty.
