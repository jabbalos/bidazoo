# HISTORICAL M3 working notes (superseded)

These notes document the earlier prototype stages (placeholder sheets, DejaVu fallback, `manifests_real/`, `out_v2_dev/`). They are kept as history only; `README.md` and `template-rules-v2.md` are authoritative.

Renders the LOCKED canonical template of `docs/visual/15-character-sheet-template.md` (1448 x 1086)
from a per-character manifest. Layout is code; art is only ever composited, never generated, shrunk
to hide overflow, or cropped to hide overflow.

## Run

```
python3 render_sheet.py MANIFEST.json OUT.png [--assets-root DIR] [--fonts-dir DIR] [--debug-boxes]
python3 run_all.py            # renders all six + selftest twice, writes out/determinism.txt + out/contact_sheet.png
python3 -I selftest/make_fixtures.py     # rebuilds the synthetic selftest assets/manifest
python3 -I tools/make_example_manifests.py   # regenerates manifests/*.json
python3 -I tools/validate_manifests.py       # validates manifests against manifest.schema.json (needs jsonschema)
```

Example: `python3 render_sheet.py manifests/dino.json out/dino_sheet_placeholder.png --assets-root /mnt/user-data/outputs`

Needs only Python 3, Pillow, numpy. Output is RGB PNG, exactly 1448x1086, no ancillary chunks
(IHDR/IDAT/IEND only), `compress_level=9`. `OUT.report.json` is written next to it (no timestamps).
`--debug-boxes` draws magenta placement boxes and is for review only.

## Files

`render_sheet.py`, `manifest.schema.md`, `manifest.schema.json`, `manifests/{click,dino,koala,tarsier,eagle,bronco}.json`,
`run_all.py`, `tools/`, `selftest/` (synthetic art that exercises every populated path, including overflow),
`out/` (six placeholder sheets + reports, `contact_sheet.png`, `determinism.txt`, `selftest_sheet.*`).

## Report (`OUT.report.json`)

`placeholders` (every empty slot, reason, status, plan_status, box), `overflows` (flag
`ART/TEMPLATE REVIEW REQUIRED` with metric/value/limit), `placements` (computed boxes, scales, image
origins, matted bboxes), `provisional`, `template_defects` (fixed strings that do not fit),
`text_adjustments`, `warnings`, `assets` (path, sha256, size), `fonts`, `computed_sheet_status`
(never "final"), output sha256.

## Placement and scale math (doc 15)

* Turnaround: scale = `S0 x k x u` (same for all four views; `u` is the asset-specific transform).
  Lowest ground contact on y = 400, matted bbox centered on cell centers 203.5 / 550.5 / 897.5 / 1244.5,
  max 184 px above baseline, max 335 px wide. No per-character fill-the-box scaling.
* Expressions: one `head_scale` per character; eye line y = 598; widest head 109 px; crown >= y 520; labels at y 732.
* Head close-up: head width 176 px (88 %), eye line y = 610, crop allowed.
* Hero: pose's own scale; 24 px clearance (default fit mode).
* Silhouettes: matted alpha, flat navy, uniform fit in 72x182 / 108x182, baseline 1006; not a size authority.
* Proportion guide: `R = 168`, front reference drawn at `R x k`, dashed k = 1.0 tick, solid brass marker at `1006 - 168k`,
  optional comparison tick, baseline 1006, `PROVISIONAL SCALE` always shown.
* Chrome tokens, shapes, hatch (#EFE0BC / #DCC9A0, 12 px pitch, dashed 2 px #B89A6A border) as in sections 1, 9, 10.
  Chrome is supersampled 2x; text and art are drawn at 1x.

## Status of this build

Works: full template geometry, all zones, placeholders for every MISSING / OPEN / NEEDS CONTROLLED EDIT slot,
PROVISIONAL tags, overflow flags and report, fixed-string fit checks, byte-identical output
(see `out/determinism.txt`). The six sheets are layout proofs: `LOGO_ASSET` is missing and only the existing
idle / tryAgain expression PNGs are wired (all PROVISIONAL because no sign-off is recorded; doc 16 s2).
Turnaround/hero/head/silhouette/proportion art paths were verified only with synthetic fixtures (`selftest/`).

Fonts: Nunito Sans (LOCKED) is not installed here. The fallback is DejaVu Sans (Regular for 400/600, Bold for 700/800);
it is wider than Nunito Sans, so "does not fit" results are conservative. Drop `NunitoSans-{Regular,SemiBold,Bold,ExtraBold}.ttf`
into a folder and pass `--fonts-dir`. Final renders must use Nunito Sans.

Wired expression assets: `eye_line_src_y` values in `manifests/*.json` are manual visual estimates (about +-3 source px),
and `head_scale` is provisional (first wired asset's matted width = nominal 100 px).

## Open questions / ambiguities (not resolved; none changes the locked template)

1. **Cast factors disagree.** Doc 16 s5.3 / doc 08 list Eagle 1.10, Click 1.00, Bronco 1.00, Dino 0.90, Koala 0.80, Tarsier 0.60;
   the Lane-3 brief gives EAGLE 1.000, CLICK 0.92, BRONCO 0.92, DINO 0.85, KOALA 0.76, TARSIER 0.57 (the brief's Eagle = 1.0 matches
   doc 15's "S0 chosen so the tallest fits 184", but dividing the doc values by 1.10 gives 0.91 / 0.82 / 0.73 / 0.55). Manifests use the brief's values.
2. **S0 and "reference height" are not numerically defined.** I defined 1 unit = 1/1000 cast reference height and S0 = 0.184. What counts toward the
   reference height (body only, or crest/hat/wings) is unspecified; doc 15 counts wings/tails/hats/crests for the *bounding box* overflow tests only.
3. **R = 168 vs 184.** The proportion front reference is drawn at 168 x k, the turnaround at 184 x k, so one character has two scales on one sheet.
   Also the front-reference box top (y 824) leaves only 182 px above the 1006 baseline although the box is 196 tall; overflow is tested against the 216x196 box literally.
4. **Source label vs doc 15 status vocabulary.** Doc 15 s10 uses approved/provisional/missing/open; doc 16 uses four other statuses. Mapping used: see `manifest.schema.md`.
   `NEEDS CONTROLLED EDIT` has no doc 15 rendering rule; I render a placeholder with a new fixed string (`NEEDS EDIT — / NOT APPROVED`).
5. **Eagle TRY AGAIN.** `try-again-review/eagle_tryagain.png` visibly scowls; doc 15 s5 says such art is not approved for the slot (doc 16: controlled-edit target).
   It is wired as PROVISIONAL per the brief; set its status to `NEEDS CONTROLLED EDIT` to suppress it. Eagle IDLE/Click IDLE etc. are also MISSING in doc 16 although files exist; their status stays PROVISIONAL.
6. **Fixed strings that do not fit.** `MISSING / TO AUTHOR` does not fit the 72 px silhouette cells with the 8 px text inset even at 10 px (reported as `template_defects`; drawn at 10 px anyway). The palette default label `CHARACTER-SPECIFIC` (and `BANDANA — MAROON`) cannot fit 88 px at 10 px, so labels ellipsize; example manifests use `BANDANA` + name `Maroon`.
7. **Detail caption box is 20 px high but allows 2 lines at 13 px (26 px).** Rendered literally (2 lines may extend 6 px below the cell, inside the panel).
8. **Tokens missing:** header background, label-pill fill, `PROVISIONAL` tag colors/size/placement box, baseline/ruler colors, hatch of palette swatches. I used panel cream, cell background, navy.
9. **Role-tag pill width.** Box `1072,66,336,36` is used literally as the pill (full width), not auto-width right-aligned.
10. **Expression cells vs head-only art.** Eye line at 40 % and 100 px head width leave ~90 px of empty cell below head-only crops (the template assumes shoulders/chest bleeding off the bottom). Whether ears/crest count toward the 100 px nominal width is unstated (I use the full matted bbox, so large-eared characters render with small faces).
    The `PROVISIONAL` tag (top-right) sits over the crown zone (crown min y = 520).
11. **Head close-up "about 88 %".** Treated as exactly 176 px of matted/declared head width; ear inclusion unspecified (`head_width_src_px` lets the author decide).
12. **Hero "pose's own scale".** Default `fit` auto-fits within the clearance box (cannot overflow); `fixed` mode is available for authored scales.
13. **Overflow rendering.** Overflowing art is drawn at true scale unclipped (it may spill across neighbors/panel border and the 24 px margin) so the problem stays visible; the flag is only in the report, not on the sheet (doc 15 s10 keeps status off the artwork).
14. **Tagline** is requested in the manifest but doc 15 has no tagline zone; stored, not rendered.
15. **Matte observations on the wired PNGs (not altered):** `dino_tryagain.png` has a small rectangular alpha remnant at its bottom-left, and `dino_idle2.png` and `tarsier_*` heads appear cropped at the source edge (doc 16 s8 already notes ear clipping).
16. **Nunito Sans binaries/licence** (doc 15 open item 4) are not available; layout proofs only.
17. **Doc 15 s6 silhouette cell** is 72x196 in s1 but fitted in 72x182; both are drawn (box 196, fit 182, baseline 1006).
18. **Palette content** in the example manifests is a proposal from doc 09 s3 code/ref values (provisional, not authority) pending production-plan step 9; Bronco GEAR left OPEN.


## Real-asset pass (`manifests_real/`, `out_real/`)

Regenerate: `python3 -I tools/make_real_manifests.py && python3 run_all.py --manifests manifests_real --out out_real --suffix real --no-selftest`
(asset paths are relative to `--assets-root /mnt/user-data/outputs`; nothing is copied; sha256 of every wired file is stored in the manifests).
Results: `out_real/<char>_sheet_real.png` + `.report.json`, `contact_sheet.png`, `determinism.txt` (all six byte-identical on a second fresh-process run).

Mapping rules used
* Library statuses are passed through. Drawable: READY WITH CROP/MATTING, PROVISIONAL (tagged). **NEEDS CONTROLLED EDIT => placeholder** `NEEDS EDIT - / NOT APPROVED` (the file stays in the report as `source_ref`), per the existing rule.
* Turnaround: `turnaround_front/34/side/back`. Transform: one `ref_height_src_px` per character = tallest matted view among its four (all four views share one source scale because they come from one sheet row), so the character's tallest view is exactly `184 x k` px. Vertical overflow is therefore impossible by construction for k <= 1; width overflow is still tested. This reference-height definition is mine (see open question 2).
* Hero = `hero` (Koala: `hero_reading`, the library's READY pose; `hero_overview` is CE and unused). Head = `head`, `eye_line_src_y` from the library `recommended_eye_line_src_y`.
* Details: the four doc 16 s9 items in order, captions from doc 16.
* Silhouettes: library silhouette artwork for confirmed slots (alpha only is used; recolored to the navy token). Slots with no artwork (Click 3/4 + action; Tarsier back and 3/4) are derived from the matted turnaround/hero alpha.
* Expressions: `<char>_<state>.png` from expression-batch (Koala thinking = `thinking_analytical`). Status = READY WITH CROP/MATTING only when its QA report says `pass: true` AND doc 16 plans it CM; otherwise PROVISIONAL (QA failed or missing, mapping locked-but-unverified, or newly authored). `head_scale` = 100 / matted width of the IDLE asset. **`eye_line_src_y` for all 36 expressions are my visual estimates (+-4 src px)**; the library supplies none for expressions.
* Template-defect handling is unchanged from the logged behavior (no real-asset sheet triggers one now).

Slots filled vs placeholder per sheet (placeholders excluding palette swatches; LOGO_ASSET is missing on all six)

| sheet | placeholders | overflow flags (ART/TEMPLATE REVIEW REQUIRED) |
| --- | --- | --- |
| click | 1 (header.LOGO_ASSET) | - |
| dino | 2 (header.LOGO_ASSET, head.head) | expressions.thinking, expressions.cheer, expressions.discover, expressions.tryAgain |
| koala | 4 (header.LOGO_ASSET, turnaround.threeQuarter, turnaround.side, details.detail2) | expressions.tryAgain |
| tarsier | 1 (header.LOGO_ASSET) | - |
| eagle | 1 (header.LOGO_ASSET) | expressions.cheer, expressions.discover |
| bronco | 1 (header.LOGO_ASSET) | expressions.cheer |

Overflow flags are all expression head widths (> 109 px at the idle-based head scale; raised fists, hooves, wide ears, cheer poses). See each report for exact values. Turnaround width/height and the proportion front reference raised none.

Library entries that map to no template slot
* Dino: `detail_backpack_back`, `detail_backpack_side`, `detail_zipper_pull` (supplemental extras).
* Koala: `hero_overview` (CE alternate hero).
* Tarsier: `detail_backpack_back`, `detail_goggles_side` (extras); `silhouette_34_or_back_UNVERIFIED` (slot unknown, derived silhouettes used instead).
* Eagle: `detail_cuff`, `detail_custom_buttons` (extras).
* Bronco: `turnaround_34back_SUPPLEMENTAL`, `silhouette_34back_SUPPLEMENTAL` (supplemental sheet).
* Expression batch: `_superseded`, `_candidates`, `_alternates` folders, `*_4bg`, `*_src`, `*_compare`, `*_sidebyside` previews, and Click's `click_tryagain_candidate_encouraging` are not referenced.

Added open questions
19. **Doc 15 s6/s7 wording about "k = 1.00 is the cast reference height"** and R = 168 now sits beside doc 16's normalized factors (Eagle 1.000 ...). Needs an owner call on whether k=1.0 means the Eagle's tallest view and what R represents. Not edited.
20. Reference height = tallest matted turnaround view (see above) hides the wing/crest/hat overflow test at the turnaround (by definition the tallest view fits). An owner-defined body-height reference would make that test meaningful.
21. Silhouettes use the library's sheet artwork (PROVISIONAL for Click, Koala, Eagle); doc 16 says silhouettes are derived from matted approved art and Eagle's must be re-derived after the edit.
22. Dino head is CE and Koala 3/4, side and glasses are CE, so they render as placeholders; Tarsier head and Eagle/Bronco heroes carry source-edge clipping notes in the library and are drawn PROVISIONAL.


## Template rules v2 (core scale, allowance) - added after the owner decision

See `template-rules-v2.md` for the full rule text (core box definition, allowance size, true flags, effects, derivation heuristic).
Summary: expression scale comes from the CORE box (head/hat/ears), one `head_scale` per character; fists, props and effects use the 121 px cell allowance;
nothing is squeezed or cropped; true flags are core > 109 px, core crown < y520, and art outside the allowance after a sideways slide.

Pipeline: `tools/derive_core_boxes.py` -> `core_boxes.json` (+ `core_overrides.json`, `core_boxes_preview.png`) -> `tools/make_v2_manifests.py` -> `manifests_v2/` ->
`python3 run_all.py --manifests manifests_v2 --out <dir> --suffix v2 --no-selftest` -> `python3 check_consistency.py --out <dir>` (writes `check_report.json/.txt`).
Interim renders for testing go to `out_v2_dev/`; the final run goes to `out_real_v2/` when the coordinator signals that the asset batch is done.
Note: something outside this session overwrote PNGs inside `out_real_v2/` while it held my interim renders (report sha != file sha); I removed that folder and
test in `out_v2_dev/`. `check_consistency.py` includes a determinism check against the file on disk and an `assets_current` check that catches this and changed assets.

Open question 23: `eye_line_src_y` for the 36 expressions are manual estimates (+-4 px); the v2 core-based placement is more sensitive to them than v1, and the density
outlier test (crown-to-eye) inherits that noise (threshold 30 %).


### v2.1 decisions (owner, October 13, 2026)
* Effect allowance = cell pitch: cell +/- 6 px (gutter midpoint), 137 px wide; flags only beyond that. Core still limited to 109 px and may slide anywhere inside its safe window.
* OWNER-VISIBLE RULE CHANGE: head-only crops (Dino/Tarsier/Eagle IDLE) and all head close-ups are bottom-anchored (hard crop edge hidden by the cell/box bottom); the eye-line lock
  (y 598 / y 610) now applies only to full-bust expression assets. Details in `template-rules-v2.md` section 6.
* Final render goes to `out_final/` after the coordinator freezes assets: `python3 tools/derive_core_boxes.py && python3 tools/make_v2_manifests.py && python3 run_all.py --manifests manifests_v2 --out out_final --suffix v2 --no-selftest && python3 check_consistency.py --out out_final`.

## v2.2: short head close-ups (owner-visible rule)
Short head busts (Koala, Tarsier) stay bottom-anchored and are not scaled to fill the box; since v2.3 `check_consistency.py` reports `short bust, art top N px below box top` as INFO only (not a warning, not a failure). See template-rules-v2.md sections 7 and 8.

## v2.3: owner policies A-D (owner-visible rule list; October 13, 2026)
Full text in `template-rules-v2.md` section 8. Summary:
* **A. 1 px tolerance** on all width checks (core <= 109 px, art inside the 137 px allowance), in both `render_sheet.py` and `check_consistency.py`.
* **B. Wide expression art** is fitted down, never cropped or squashed: if a cell exceeds the safe width by more than 1 px the ENTIRE asset is scaled uniformly (aspect preserved, eye line y 598 preserved, ears/hats/crest/muzzle intact); the factor is recorded per cell (`fit_down_factor`, `expression_fit_down`, `fit_down` check line). 1.0 = untouched.
* **C. Short busts** are valid: transparent space is allowed, no vertical stretch, no invented torso, no enlarging until ears/hats overflow. Judged by head/face scale, eye line and framing. Koala/Tarsier short head close-ups are INFO only.
* **D. Cast scale factors** (Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57) govern turnaround/proportion presentation only, not expression fill.
* Stale-override guard: `tools/derive_core_boxes.py` ignores (with a warning) a `core_overrides.json` box that no longer fits its asset or whose `sha256` differs. `core_overrides.json` is `{}`; worker `core_box` values are used.
* New library status `OWNER-ACCEPTED MINOR` is accepted and drawn like READY (no PROVISIONAL tag).
* Pipeline order (manifests_real carries asset sha256 and statuses, so refresh it first after any asset change):
  `python3 -I tools/make_real_manifests.py && python3 -I tools/derive_core_boxes.py && python3 -I tools/make_v2_manifests.py && python3 run_all.py --manifests manifests_v2 --out out_v2_dev --suffix v2 --no-selftest && python3 check_consistency.py --out out_v2_dev`
