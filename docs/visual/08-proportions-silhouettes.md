# 08 Standardized Proportions and Silhouettes

Status: PROPOSED, revised after ingesting the production pack (October 12, 2026); cast scale factors
finalized October 13, 2026 (M4 docs sync). Exact proportions are OPEN in the Bible. See
[INGESTION-REPORT.md](INGESTION-REPORT.md) sections 3 and 6.

**Owner decision applied (October 12, 2026): WORKING REFERENCE ONLY.** The sheet-07 numeric
heights are not canonical. The head-unit numbers in section 3 are PROVISIONAL.

**Owner decision applied (October 13, 2026): CAST FACTORS FINAL.** The cast scale factors in section 2 are
authoritative for the turnaround and the proportion guide. They replace the sheet-07 working reference.

## 0. SPEC-LOCKED relative silhouette rules

1. Tarsier is clearly the smallest character.
2. Click and Bronco read among the taller, larger characters.
3. Each character stays identifiable at small silhouette size.
4. No two characters collapse into the same visual mass.
5. The production turnaround sheets determine the final normalized scale.

## 1. What changed from the first draft

The first draft used head-unit heights (Click 3.4, Eagle 3.0, Dino 2.6, Koala 2.4, Tarsier 2.0).
Those numbers are not preserved. The production sheets show:

- Printed head counts (about 3.5 to 4) that do not match the drawn figures.
- A relative height lineup on `07_Expressions_Proportions_Palettes.png` that is internally
  consistent. It is the better source.

## 2. Cast scale factors (AUTHORITATIVE, owner, October 13, 2026)

| Character | Cast factor `k` | Printed on 07 (v1 / v1.1 interim, historical) |
| --- | --- | --- |
| Eagle | 1.000 (cast reference) | 110 cm |
| Click | 0.92 | 100 cm |
| Bronco | 0.92 | 100 cm |
| Dino | 0.85 | 90 cm |
| Koala | 0.76 | 80 cm |
| Tarsier | 0.57 | 60 cm |

Tarsier is the smallest (SPEC-LOCKED). Eagle is the cast reference (`k` = 1.000) and the tallest, with a wingspan of about 2.5 times its body width
(05). The earlier rule that Click appears smaller than a starter is **withdrawn**: Click equals
Bronco and is taller than Dino, Koala, and Tarsier.

Rule text:

- `k` is a relative factor against the Eagle reference height. It is not a measurement in centimeters. The
  sheet-07 centimeter readings in the third column are history; the final sheet 07 composite in `production-v1.1`
  (single M4 composite pass) prints the factors without units.
- The factors govern the turnaround and the proportion guide only ([15](15-character-sheet-template.md)
  sections 6 and 7).
- Expression cells are not cast-scale authority. They use the per-character core head scale: core safe width
  109 px, effect allowance 137 px, 1 px tolerance, uniform fit-down of a whole asset when a cell is too wide,
  and short busts bottom-anchored (15 section 6).

## 3. Head-to-height, descriptive only (PROVISIONAL)

Measured by eye on the front turnarounds (coarse, plus or minus 0.3 head units):

| Character | Sheet label | By eye |
| --- | --- | --- |
| Click | ~3.5 | ~2.9 |
| Dino | ~4 | ~2.7 |
| Koala | ~4 | ~2.5 (with hat) |
| Tarsier | "1 head = body height (approx.)" | ~1.8 |
| Eagle | 3.5 | ~2.9 |
| Bronco | ~3.5 | ~2.6 |

Use these to describe the style (large heads, chibi-leaning), not as a construction spec.

## 4. Silhouette signatures (confirmed by the 07 and per-sheet silhouette panels)

| Character | Signature shape | Distinguishing feature |
| --- | --- | --- |
| Click | Tall upright ears, upright lean | Thick tail, harness and pack, "C" emblem |
| Dino | Round head, spike crest down the back and tail | One backpack bump |
| Koala | Two very large round ears | Brimmed fedora, seated bulk |
| Tarsier | Huge eyes and ears in a small crouched body | Hood point, curled tail |
| Eagle | Wide wedge (wings) | Spiky crest, hooked beak |
| Bronco | Long face under a wide hat brim | Wavy mane, full tail, feathered socks |

**Canonical silhouette artwork (M4).** The silhouettes used on the canonical sheets are derived
deterministically from approved matted alpha: front, 3/4, side and back from the approved turnaround
cutouts, and the action silhouette from the approved hero/action asset (for Koala, the reading hero is the
action slot). Ears, tails, wings, hats, crests and packs are preserved. The earlier flat-sheet silhouette
artwork is historical and used for QA comparison only; it never fills a canonical slot.

## 5. The 48 px silhouette test (PROPOSED)

Render each character flat at 48 px. All six must be distinguishable. Pairs to watch: Click and
Bronco (both tall); Koala and Tarsier (both big-eared). Change the shape, not just the color.

## 6. Rendering consistency (revised)

- The production style is a soft 3D-animated look with **no hard ink outline**. The earlier rule
  about a fixed outline weight is withdrawn. Silhouette clarity comes from shape and value contrast.
- Soft, consistent lighting with a gentle rim light across the cast.
- Eyes are large and glossy with several catchlights.
- Hands, paws, and feet are simplified and rounded.
- The transitional code art uses a thick dark outline. It is fallback art, not the target look.

## 7. Portrait and bust box

The code's 320 px bust square and the production spec's 512 by 768 portrait card are different
shapes. Which one the selection screen uses is a later integration decision.
