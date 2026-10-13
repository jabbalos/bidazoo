# 16 Character Art Production Plan

Status: ACTIVE PLAN. Owner decisions applied October 13, 2026. Document only.
Base checkpoint: `5cee4d7747fa2b8a9c779aa3a55af34ec9290045`
`docs(visual): lock canonical character sheet template`. Branch: `feature/world-expedition-visuals`.

This is the canonical execution checklist for finishing all six standardized character sheets (Click,
Dino, Koala, Tarsier, Eagle, Bronco). It turns the read-only art-gap inventory into work items. It
makes no artwork, changes no PNG, and changes no runtime code.

The sheet layout authority is [15-character-sheet-template.md](15-character-sheet-template.md)
(LOCKED). The template architecture is closed. Geometry is reopened only if real matted production art
proves an actual structural defect.

Related: [07 expressions](07-expression-state-system.md),
[08 proportions](08-proportions-silhouettes.md), [09 palette](09-palette.md),
[INGESTION-REPORT.md](INGESTION-REPORT.md).

---

## 1. Source authority

When sources disagree, use this order:

1. `CHARACTER-BIBLE.md` (LOCKED rules)
2. `docs/visual/`
3. the dedicated `production-v1` character sheets (`01` to `06`)
4. owner-approved `production-v1.1` corrections
5. composite reference sheets (`00`, `07`, `08`)
6. transitional runtime/code artwork

Rules:

- Dedicated character sheets outrank composites for character identity.
- `production-v1/` is **immutable**.
- `production-v1.1/` is an uncommitted **CORRECTION CANDIDATE — NOT FINAL**.
- The original ZIP is no longer an operational source of truth.
- The Eagle base is `production-v1/05_Eagle_Character_Sheet.png`. A newly generated alternate Eagle
  full-sheet poster is **not** canonical and is not a source.
- Existing approved artwork is reused whenever it is visually valid. A character is never regenerated
  because matting is inconvenient.

---

## 2. Status vocabulary

Only these four statuses are used:

| Status | Meaning |
| --- | --- |
| **READY WITH CROP/MATTING** | Approved art exists. It only needs extraction and matting onto the common background. |
| **NEEDS CONTROLLED EDIT** | Approved art exists but must be changed in a controlled edit. |
| **MISSING / TO AUTHOR** | No approved art exists for this slot. It is authored later. Never substituted. |
| **PROVISIONAL** | Art, mapping, hex or scale exists, but a decision or verification is still open. |

- No asset is plain READY. Every asset still has to be matted onto the common background.
- Nothing is silently upgraded out of PROVISIONAL. A PROVISIONAL cell changes status only by an explicit
  sign-off recorded in that character's manifest.
- A PROVISIONAL expression whose mapping is LOCKED (section 4) stays PROVISIONAL until the matted crop
  is visually verified to read as the state. The mapping is settled; the verification is not.

---

## 3. Current production-v1.1 facts (recorded October 13, 2026)

- The Bronco maroon-bandana correction exists.
- Click is removed from the selectable starter/profile choices.
- Exactly five starters remain.
- Click is shown separately as HOST & GUIDE.
- Miss feedback is orange/amber.
- A retry arrow replaces the punitive failure X.
- The copy reads "Try again!".
- The child-facing close control is brass/neutral.
- The Sheet `07` compressed palette layout was reverted.
- The dedicated Bronco maroon palette swatch on `07` remains deferred.
- Poppins remains in interim Sheet `08` and is **not** production-final.
- The current `production-v1.1/README.md` contains stale interim hashes.
- PNG rewrite operations create provenance-byte churn with no pixel change.
- Final PNGs are rewritten as few times as practical.

`production-v1.1/` and `.gitattributes` are not touched by this plan.

---

## 4. Locked expression decisions

### 4.1 Canonical order

IDLE, HAPPY, THINKING, CHEER, DISCOVER, TRY AGAIN (see template section 5).

TRY AGAIN means gentle determination, resilience, encouragement and readiness to continue. It is never
angry, ashamed, punished, defeated, or frustrated at the learner.

### 4.2 Seven locked mappings (OWNER-APPROVED, FINAL)

| Character | State | Source label |
| --- | --- | --- |
| Click | DISCOVER | Surprised |
| Dino | CHEER | Excited |
| Dino | DISCOVER | Surprised |
| Koala | DISCOVER | Surprised |
| Tarsier | DISCOVER | Observant |
| Bronco | DISCOVER | Surprised |
| Bronco | TRY AGAIN | Resilient |

These are not reopened unless the actual source art proves unusable.

### 4.3 Other label-equivalent mappings used in the matrix

These follow the template rule (`CELEBRATE` maps to `CHEER`) or are a direct label match. They are not
part of the seven.

| Character | State | Source label | Note |
| --- | --- | --- | --- |
| Click | HAPPY / THINKING / CHEER | Happy / Thinking / Celebrate | |
| Dino | HAPPY / THINKING / TRY AGAIN | Happy / Thinking / Try-again | Try-again reads gentle (winking smile) |
| Koala | IDLE | Calm (Neutral) | |
| Koala | THINKING | Focused or Analytical (both labeled Thinking) | one is chosen in the pilot |
| Koala | HAPPY | Happy | |
| Tarsier | HAPPY / THINKING | Happy / Thinking | |
| Eagle | HAPPY / CHEER / DISCOVER / TRY AGAIN | Happy / Celebrate / Surprised / Determined | DISCOVER mapping is not among the seven; see section 12 |
| Bronco | HAPPY / CHEER | Happy / Celebrate | |

Source cells that are **not** used (no forced substitution): Click Encouraging and Concerned; Dino
Curious; Koala Kind; Tarsier Curious, Surprised and Playful; Eagle Bold and Focused; Bronco Energetic
and Determined. The sheet-07 expression matrix is low-resolution reference only (about 160 x 85 px, with
the crowns cut off). It is not a production source.

### 4.4 Exactly 12 MISSING / TO AUTHOR expression assets

| Character | Missing states | Count |
| --- | --- | --- |
| Click | IDLE, TRY AGAIN | 2 |
| Dino | IDLE | 1 |
| Koala | CHEER, TRY AGAIN | 2 |
| Tarsier | IDLE, CHEER, TRY AGAIN | 3 |
| Eagle | IDLE, THINKING | 2 |
| Bronco | IDLE, THINKING | 2 |
| **Total** | | **12** |

No additional missing states are invented. Click's TRY AGAIN has no usable source: the `01` Concerned
cell is not the state, and the `07` Determined thumbnail has a furrowed brow and a flexed arm that fail
the tone review.

---

## 5. Art-gap matrix

Codes: **CM** = READY WITH CROP/MATTING; **CE** = NEEDS CONTROLLED EDIT; **MS** = MISSING / TO AUTHOR;
**PR** = PROVISIONAL.

### 5.1 Assets A, B, C, E, F, G, H

| | A Turnaround (front, 3/4, side, back) | B Hero | C Head | E Silhouettes | F Four details | G Six palette roles | H Proportion / scale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Click** | CM | CM | CM | CM (derive; only 3 exist) | CM | PR | PR |
| **Dino** | CM | CM | CM | CM | CM | PR | PR |
| **Koala** | CM | CM | CM | CM | CM (3 dedicated + 1 derived crop) | PR | PR |
| **Tarsier** | CM | CM | CM | CM (derive action) | CM (1 derived crop) | PR | PR |
| **Eagle** | **CE** | **CE** | **CE** | **CE** (re-derive after edit) | CM | PR | PR |
| **Bronco** | CM | CM | CM | CM | CM (1 derived crop) | PR | PR |

### 5.2 D Expressions (36 cells)

| | IDLE | HAPPY | THINKING | CHEER | DISCOVER | TRY AGAIN |
| --- | --- | --- | --- | --- | --- | --- |
| **Click** | MS | CM | CM | CM | PR | MS |
| **Dino** | MS | CM | CM | PR | PR | CM |
| **Koala** | CM | CM | CM | MS | PR | MS |
| **Tarsier** | MS | CM | CM | MS | PR | MS |
| **Eagle** | MS | CE | MS | CE | CE | CE |
| **Bronco** | MS | CM | MS | CM | PR | PR |

Tally: 13 CM, 4 CE, 7 PR, 12 MS (total 36).

The seven PR cells are exactly the seven locked mappings. Their mapping is final. Their status stays PR
until the matted crop is verified (section 2).

### 5.3 Notes on A, B, C, E, F, G, H

- **A Turnaround:** all five non-Eagle characters have four views on parchment cells. Bronco's sheet has
  a fifth view (3/4 BACK) that is not canonical and goes to a supplemental sheet. Koala's turnaround
  includes a reading action pose that serves as hero material.
- **B Hero:** non-Eagle heroes sit on scenic backgrounds (harder matting).
- **C Head:** close-ups sit on scenic or gradient backgrounds. Koala's close-up is wide and landscape
  with a baked annotation arrow. See section 8.
- **E Silhouettes:** all are derived from the matted alpha of approved art. Click, Tarsier and Bronco
  existing counts (3, 4, 6) differ from the canonical five (front, 3/4, side, back, action) and are
  re-derived from the matted turnaround and action art. Eagle's old brown-headed silhouettes are not
  kept for consistency.
- **F Details:** exactly four per character, proposed selection in section 9. Eagle's four detail crops
  do not require redesign.
- **G Palette:** all hex values are PROVISIONAL. See section 7 for Bronco.
- **H Scale:** working cast-relative factors from [08](08-proportions-silhouettes.md): Eagle 1.10, Click
  1.00, Bronco 1.00, Dino 0.90, Koala 0.80, Tarsier 0.60. All PROVISIONAL. Eagle's front reference also
  depends on the corrected Eagle art.

---

## 6. Eagle controlled edit (LOCKED)

Base authority: `production-v1/05_Eagle_Character_Sheet.png`. Preserve the established Eagle identity.

Required appearance:

- clearly **WHITE-HEADED**
- blue eyes
- brown wings
- green varsity jacket
- original prominent A
- yellow beak
- orange/yellow feet

Controlled-edit targets (CE):

| Group | Target |
| --- | --- |
| Turnaround | front |
| | 3/4 |
| | side |
| | back / nape (white nape) |
| Other | hero / action |
| | head close-up |
| Expressions | happy |
| | cheer |
| | discover |
| | tryAgain (also emotional softening) |

- TRY AGAIN must read as gentle determination (section 4.1). The current Determined cell scowls.
- After corrected Eagle art is approved, **all** canonical Eagle silhouettes are re-derived. The old
  brown-headed silhouette is not preserved.
- Eagle IDLE and THINKING are MISSING / TO AUTHOR (section 4.4), not edits.
- Eagle's four identity-detail crops do not currently require redesign.
- Composite Eagle instances in `00`, `07` and `08` are updated only **after** the primary Eagle
  correction is approved.
- Edit source details and approximate instance boxes: `production-v1.1/EAGLE-EDIT-SOURCES.md`.

---

## 7. Bronco color semantics (LOCKED)

Bronco has two distinct semantic colors:

| Template palette slot | Meaning |
| --- | --- |
| ACCENT (slot 3) | red star / gear treatment |
| CHARACTER-SPECIFIC (slot 6) | **BANDANA — MAROON** |

- Do **not** recolor the red star/gear treatment to maroon.
- Do **not** treat the old crimson Accent entry (on sheet `07`) as the bandana definition.
- Exact final hex values remain PROVISIONAL.
- The dedicated maroon swatch on `07` is deferred to the final composite correction (step 13).
- Open item for step 9: sheet `07` also lists a red value under Gear. The GEAR slot content (saddle and
  leather versus red) is decided in the palette-role mapping. Red stays on ACCENT only.

---

## 8. Matting and extraction

Reuse approved art. Do not regenerate a character because a matte is hard.

**Generally straightforward:** parchment turnaround art; many Click, Dino, Koala and Bronco expressions;
detail crops.

**More difficult:** scenic hero poses; scenic close-ups; Tarsier expression backgrounds; Eagle expression
backgrounds.

Known or observed partial-crop and matting limitations (documented, not hidden; confirm in the pilot):

- Tarsier's head close-up appears to clip an ear at the source edge.
- Click's head close-up may clip an ear at the source edge (verify).
- Koala's head close-up is landscape, with a baked "Expressive eyes!" arrow and paw to remove. The head
  is wide (large ears), so a portrait fit may trigger `ART/TEMPLATE REVIEW REQUIRED`.
- Source turnaround cells for Koala, Tarsier and Click appear to touch a neighbor (ears, tails). Matting
  must separate the touching views.
- Wide heads in the 125 px expression cells (Koala ears, Tarsier ears, Eagle crest and wings, Bronco
  mane and hat) may trigger `ART/TEMPLATE REVIEW REQUIRED`.
- Hero poses carry scene props (branches, dust, rocks) that may stay in or be removed by the matte; the
  character must not be altered.
- Sheet-07 matrix cells have clipped crowns and are not extractable.

Any `ART/TEMPLATE REVIEW REQUIRED` flag goes to the owner. The renderer does not shrink or crop around it.

---

## 9. Four identity details (proposed selection, confirmed in manifests)

Each character has exactly four detail cells. Items beyond four go to a supplemental sheet.

| Character | Four details (source) | Derived crop? |
| --- | --- | --- |
| Click | explorer harness and backpack; C emblem; strap and buckle; back-view pack detail (all `01`) | no |
| Dino | backpack (front); strap and buckle; paw badge; dorsal spikes | spikes: crop from turnaround |
| Koala | scholar hat; signature glasses; scholar's book (`03`); scholar jacket | jacket: crop from turnaround |
| Tarsier | goggles (front); explorer backpack; paw emblem; hood / scout jacket | hood: crop from turnaround |
| Eagle | Academy A patch; varsity collar and stripes; mountain emblem; wing-feather treatment | wing treatment: crop from wing art (wings are not edited) |
| Bronco | cowboy hat (star badge); maroon bandana; saddle and pack; star treatment | star treatment: crop from hat or pack plate (red stays red) |

Dino, Koala, Tarsier, Eagle and Bronco each have exactly one derived crop. Click has none. Any detail slot that
cannot be filled stays `OPEN` (template section 10). No filler crops.

---

## 10. LOGO_ASSET

`LOGO_ASSET` status: **MISSING / TO AUTHOR**.

It must eventually be **one** reusable, clean, transparent brand asset used identically by every sheet.
Six different logos are never cropped from historical sheets, and no historical crop becomes canonical.
Existing production artwork is visual reference only. Until it exists, renders show the template's
layout-proof marker.

---

## 11. Per-character execution checklists

Status tags follow section 5. Check a box only when the asset is produced, matted on the common
background, and recorded in the character manifest.

### Click (HOST & GUIDE — NOT SELECTABLE)

- [ ] A Turnaround, 4 views (CM), from `01`
- [ ] B Hero (CM), from `01` action pose
- [ ] C Head close-up (CM), from `01`
- [ ] D IDLE (MS)
- [ ] D HAPPY (CM), THINKING (CM), CHEER (CM, Celebrate)
- [ ] D DISCOVER (PR, Surprised, LOCKED mapping)
- [ ] D TRY AGAIN (MS). Author as gentle determination. No furrowed-brow or clenched-fist read.
- [ ] E Silhouettes, 5 (CM, derive)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR)
- [ ] H Scale reference (PR, k about 1.00)

### Dino

- [ ] A Turnaround, 4 views (CM), from `02`
- [ ] B Hero (CM)
- [ ] C Head close-up (CM)
- [ ] D IDLE (MS)
- [ ] D HAPPY (CM), THINKING (CM), TRY AGAIN (CM)
- [ ] D CHEER (PR, Excited, LOCKED), DISCOVER (PR, Surprised, LOCKED)
- [ ] E Silhouettes, 5 (CM)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR). Identity: teal body, orange dorsal spikes, exactly one backpack.
- [ ] H Scale reference (PR, k about 0.90)

### Koala

- [ ] A Turnaround, 4 views (CM), from `03`
- [ ] B Hero (CM)
- [ ] C Head close-up (CM; wide, see section 8)
- [ ] D IDLE (CM, Calm), HAPPY (CM), THINKING (CM; choose Focused or Analytical)
- [ ] D CHEER (MS)
- [ ] D DISCOVER (PR, Surprised, LOCKED)
- [ ] D TRY AGAIN (MS)
- [ ] E Silhouettes, 5 (CM)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR). Identity: gray-lavender scholar, no backpack.
- [ ] H Scale reference (PR, k about 0.80)

### Tarsier

- [ ] A Turnaround, 4 views (CM), from `04`
- [ ] B Hero (CM; scenic)
- [ ] C Head close-up (CM; ear clipped at source, see section 8)
- [ ] D IDLE (MS)
- [ ] D HAPPY (CM), THINKING (CM; scenic backgrounds)
- [ ] D CHEER (MS)
- [ ] D DISCOVER (PR, Observant, LOCKED)
- [ ] D TRY AGAIN (MS)
- [ ] E Silhouettes, 5 (CM, derive action)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR). Identity: huge eyes, goggles, scout/discovery.
- [ ] H Scale reference (PR, k about 0.60; clearly the smallest cast member)

### Eagle

- [ ] A Turnaround, 4 views (CE), base `production-v1/05`
- [ ] B Hero (CE)
- [ ] C Head close-up (CE)
- [ ] D IDLE (MS), THINKING (MS)
- [ ] D HAPPY (CE), CHEER (CE), DISCOVER (CE)
- [ ] D TRY AGAIN (CE; soften)
- [ ] E Silhouettes, 5 (CE, re-derive after approval)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR). Identity: white head, blue eyes, brown wings, green varsity jacket, A.
- [ ] H Scale reference (PR, k about 1.10; depends on corrected front view)

### Bronco

- [ ] A Turnaround, 4 views (CM), from `production-v1.1/06` (maroon bandana). 3/4 BACK goes supplemental.
- [ ] B Hero (CM)
- [ ] C Head close-up (CM)
- [ ] D IDLE (MS), THINKING (MS)
- [ ] D HAPPY (CM), CHEER (CM, Celebrate)
- [ ] D DISCOVER (PR, Surprised, LOCKED)
- [ ] D TRY AGAIN (PR, Resilient, LOCKED)
- [ ] E Silhouettes, 5 (CM)
- [ ] F Four details (CM)
- [ ] G Six palette roles (PR). ACCENT = red star/gear; CHARACTER-SPECIFIC = BANDANA — MAROON.
- [ ] H Scale reference (PR, k about 1.00)

---

## 12. Production sequence (LOCKED, 19 steps)

| # | Step | Done when |
| --- | --- | --- |
| 1 | Eagle controlled edit | all Eagle targets in section 6 are owner-approved |
| 2 | Matting/extraction pilot using Dino | Dino turnaround, head, expressions and details are matted and checked on the common background |
| 3 | Validate the provisional cast constant against real matted turnaround art | the cast constant is tested, and any overflow is listed as `ART/TEMPLATE REVIEW REQUIRED` |
| 4 | Author missing IDLE states | Click, Dino, Tarsier, Eagle and Bronco IDLE approved |
| 5 | Author missing TRY AGAIN states | Click, Koala and Tarsier TRY AGAIN approved, all gentle determination |
| 6 | Author missing THINKING states | Eagle and Bronco THINKING approved |
| 7 | Author missing CHEER states | Koala and Tarsier CHEER approved |
| 8 | Produce the clean reusable `LOGO_ASSET` | one clean transparent asset approved |
| 9 | Finalize the six palette-role mappings | per-character manifests list six roles; Bronco semantics per section 7 |
| 10 | Finalize provisional cast factors | `k` values approved from real turnaround art |
| 11 | Build the deterministic character-sheet renderer | renders the locked template from manifests |
| 12 | Generate all six canonical character sheets | six sheets rendered and reviewed |
| 13 | Correct composite sheets `00`, `07`, `08` | corrected Eagle and the Bronco swatch applied; final typesetting replaces Poppins |
| 14 | Final v1.1 visual review | owner review complete |
| 15 | Finalize README and manifest | stale interim hashes replaced; manifest final |
| 16 | Generate final SHA-256 hashes | hashes computed on the final bytes |
| 17 | Verify Git LFS handling | `production-v1.1/*.png` stored as LFS |
| 18 | Commit and push `production-v1.1` | operator commit and push |
| 19 | Only then begin Phaser asset integration | not started earlier |

Rules for the sequence:

- Steps run in order. A later step does not start until the earlier gate is met, except that independent
  authoring in steps 4 to 7 may overlap once step 3 is done.
- Final PNGs are written as few times as practical, after art approval (steps 12 to 16).
- No Phaser, atlas, runtime, test, identity, API, database or deployment work happens before step 19.

---

## 13. Hard boundaries

- Do not modify `production-v1/`.
- Do not modify `production-v1.1/` or `.gitattributes` while executing this plan document.
- Do not generate whole character sheets as single generative images. Character art and sheet layout
  are separate systems.
- Do not use the alternate generated Eagle poster as a source.
- Do not substitute a nearby expression for a missing state.
- Do not recolor the Bronco red star/gear treatment to maroon.
- Do not repeat "BidaZoo World Expedition" as separate header text (the logo carries it).

---

## 14. Conflict and open-item register

Items found when reconciling the inventory with the locked template and the owner decisions:

1. **PROVISIONAL after locked mappings.** Seven expression cells stay PROVISIONAL even though their
   mappings are final, because the vocabulary has no status for "mapping locked, art not yet verified".
   Section 2 defines how they change. The owner may instead upgrade them to READY WITH CROP/MATTING.
2. **Eagle DISCOVER mapping.** Surprised to DISCOVER for Eagle is not among the seven locked mappings,
   but Eagle DISCOVER is a locked controlled-edit target. It is treated as the same mapping. Confirm.
3. **Koala THINKING has two candidates** (Focused and Analytical, both labeled Thinking). Pick one in the
   pilot. Koala IDLE comes from Calm (Neutral); that mapping is not among the seven.
4. **Bronco palette.** Sheet `07` lists red under both Accent and Gear. Only ACCENT is red by decision.
   The Bronco GEAR slot is decided in step 9.
5. **Silhouette "re-derive".** The vocabulary has no status for derived art. Derived silhouettes use CM
   (Eagle: CE, because the source art changes).
6. **Details.** Selections in section 9 are proposed. Five characters include one derived crop. They are
   confirmed in the manifests.
7. **No template conflict found.** The 36-cell expression grid, four-view turnaround, four details and six
   palette slots all fit the locked template. Geometry risks (wide heads and poses at cast-relative scale)
   are handled by the `ART/TEMPLATE REVIEW REQUIRED` flag, not by changing the template.
