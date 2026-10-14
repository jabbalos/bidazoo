# LOGO_ASSET master (M4-7) - BidaZoo World Expedition

Status: **RECONSTRUCTED MASTER (M4-7), OWNER-APPROVED for production-v1.1 (October 13, 2026).** A high-quality transparent raster reconstruction is accepted; do not auto-trace/vectorize it. A future professionally redrawn/vector brand master may supersede it later (outside M4 scope). Doc 15 status line: `LOGO_ASSET: RECONSTRUCTED MASTER (M4), OWNER-APPROVED`.

## Files
| File | Purpose |
| --- | --- |
| `BidaZoo_World_Expedition_logo_master.png` | The master. RGBA, 1467 x 633, transparent, tight padding (12 px at master scale). |
| `logo_validation_4bg.png` | Master on checkerboard, parchment #FEF5DF, navy #1E3A5F, gray #808080. |
| `logo_slot_fit_proof.png` | Doc-15 header geometry on parchment (1448 x 1086) with the asset in the LOGO slot. |
| `logo_slot_fit_proof_header_2x.png` | Same proof rendered at 2x (left half of the header, for legibility). |
| `logo_source_vs_master.png` | Source crop (left) vs master on parchment (right), same scale. |
| `logo_source_crop_box.png` | Source sheet header with the analysis box drawn. |
| `logo_validation_report.json`, `validate_stdout.txt`, `logo_build_meta.json` | Numeric checks and build metadata. |
| `make_logo.py`, `validate_and_proof.py` | Deterministic scripts. Run: `python3 make_logo.py SHEET OUT_DIR` then `python3 validate_and_proof.py MASTER SHEET OUT_DIR`. |

No SVG is delivered (see Fidelity).

## Source
- Sheet: `docs/reference-art/world-expedition/production-v1/02_Dino_Character_Sheet.png` (1448 x 1086, sha256 `993ae547844d004b8dc14f73e9e9ce4cfa2b7a55e5391f02f4ee311ec71d5413`), upper-left header.
- Crop box on the sheet: x 3..492, y 0..211 (489 x 211 native px). Logo content spans about x 10..489, y 3..206.
- Why this instance: it is the only one sitting on flat parchment with nothing overlapping it. Other instances sit on scenic
  backgrounds (jungle/sky behind leaves cannot be matted cleanly) or are overlapped by ribbons/panels (sheets 00, 04, 06, 09 have a
  ribbon over the bottom plank; 01 has the CLICK sign over the leaves; 07/08 have a bar over the foliage). The 00 sheets are larger
  (about 580 px wide) but the plank is covered by the "Visual Production Guide" ribbon and character ears.
- Native resolution is the limit: every instance is only about 400-580 px wide in the source. The master is therefore a 3x upscale.

## Mark / wordmark relationship (unchanged)
One lockup: a wooden sign with jungle leaves. Top line "Bida" (orange-yellow gradient) + "Zoo" (blue; a black paw print sits inside the
first "o" of "Zoo"), a stone/metal arch at the top-left of the sign, then a lower plank with a brass compass at its left end and the
cream/white text on the plank. Nothing was moved, resized relative to anything else, recolored, or retyped.

**Wordmark text, exactly as in the source:** `BidaZoo` (mixed-case stylized, "Bida" + "Zoo") over `WORLD EXPEDITION` (all caps on the plank).
The product name in prose is "BidaZoo World Expedition"; the logo spells the second line in caps only because that is how the artwork sets it.

## Method
1. Native-resolution matte on the source sheet. Parchment field modeled by normalized convolution of confident background pixels; per-pixel
   CIELAB distance; core mask d > 22; largest connected component only.
2. Neighbor contamination removed: the note panel's edge/shadow to the right (x >= 463 for y 140-183, x >= 467 below), the TURNAROUND panel
   edge (rows >= 207), stray decor leaves at the bottom-left (three small rectangles), stray leaves at the sheet top edge (separate components).
3. Solid interior: enclosed light areas (letter highlights, compass face, white plank text) filled only where surrounded by sign body, never
   foliage gaps (green-ring test); small light concavities on the plank outline closed (edge highlights read as background); cream/white
   parchment specks within 4.5 px of the foliage edge, and away from wood/letters, scrubbed.
4. Edge alpha by color-line projection between the local parchment color and the nearest interior foreground color; foreground color
   decontaminated (extended from the interior) so no parchment tint stays in edge pixels.
5. One reconstructive edit: the TURNAROUND panel clipped the bottom foliage flat at y = 207. Rows 201-206 are tapered (linear fade) so the
   foliage ends softly instead of at a straight cut. No leaves were redrawn or extended.
6. 3x upscale: color Lanczos + mild unsharp (0.45, sigma 1.6), alpha bicubic with a slight edge firming, color and alpha handled separately so
   parchment never bleeds in. Isolated specks under 100 px removed.

## Checks (see `logo_validation_report.json`)
- Zero non-transparent pixels on the outer rows/columns (no clipping at the bounding box).
- 2 alpha components: the main logo (99.7% of alpha mass) and one leaf clump at the bottom-right that is part of the foliage. No panel pieces.
- Parchment-tinted semi-transparent pixels: 92 of 65,326 (0.14%); checked visually on navy/gray/checkerboard, no halo or fringe seen.
- Interior fidelity vs source (master downscaled to native, opaque interior, 57,105 px): mean abs diff 0.64/255, PSNR 44.9 dB.
  The upscale and light sharpening do not change colors or shapes.

## Fidelity assessment
- **Identity unchanged: yes.** Same composition, palette, lettering, paw, compass, arch, planks and foliage as the Dino-sheet instance.
- **Text exactly the same: yes** ("BidaZoo" / "WORLD EXPEDITION"). Verified at high zoom against the lockups on sheets 01, 03, 04, 05, 06, 07, 09 (v1) and 00 (v1.1).
- **Not the same as any hand-authored vector:** the source is generated raster art, so the master carries its softness. No detail was invented.
- **Minor deviations from the source instance:** background removed; bottom 6 native rows of foliage tapered (clipped by the sheet panel);
  small leaf-edge cream highlights next to the foliage edge removed; a few plank-edge highlight pixels merged into the plank.
- **Across instances:** the wording is identical everywhere ("World Expedition" is never replaced by another phrase in the lockup). The lockups
  are not pixel-identical copies: leaf arrangement, arch detail and plank grain vary slightly per sheet (each was rendered separately).
  The master reflects the Dino-sheet instance only. Text near the logo differs but is not part of it: ribbons "Visual Production Guide - Master
  Overview" (00), "Tarsier Character Sheet", "Bronco Character Sheet", "World & Environment Guide", and the per-sheet title panels.

## SVG: not delivered
A faithful vector reconstruction is not practical. The lockup is a glossy 3D render (gradients, bevels, wood grain, about 60 individual
shaded leaves). "Bida" and "Zoo" are a custom heavy display face, not Nunito Sans, and tracing flat paths would visibly change the
identity. Per the task, raster only. If a vector is wanted later it needs redrawing by a designer, not tracing.

## Slot fit (doc 15 section 8)
Slot `24,24,336,120`, contain-fit with 12 px padding, so the available box is `36,36,312,96`. Aspect 1467:633 = 2.318 is height-limited:
the logo draws at **222 x 96 at (81, 36)**, centered in the slot (60 px free on each side). At this size "WORLD EXPEDITION" cap height is only about 8 px
(readable but small); the master downscales about 6.6x, so it stays crisp at 1x and 2x. A wide slot (336 x 120) is poorly matched to this
2.3:1 lockup: it uses about 66% of the slot width. If the owner wants a fuller slot, the slot geometry would have to change (not done here).

## Reuse notes
- Place on parchment/cream or navy chrome; verified on both. Do not recolor or add a drop shadow in the template.
- Use one instance for every sheet; do not crop other logos from historical sheets.
