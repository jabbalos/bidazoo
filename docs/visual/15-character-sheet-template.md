# 15 Canonical Character Sheet Template

Status: **APPROVED — CANONICAL CHARACTER-SHEET TEMPLATE**. Final geometry revision applied October 13,
2026. This means the layout system is locked. It does **not** mean any character artwork is complete.
Document only.
Branch: `feature/world-expedition-visuals`.

This document locks the **sheet system**: the fixed layout, text and rules that every canonical
character sheet uses. It does **not** finish missing character art, render any sheet, or change any
PNG, `production-v1/`, `production-v1.1/`, runtime code, tests or identity.

**Owner decisions applied October 13, 2026:**

- Character art and character-sheet layout are separate systems. Art may be created or edited;
  layout is deterministic.
- Turnaround is exactly FRONT, 3/4 VIEW, SIDE VIEW, BACK VIEW.
- Expression order is IDLE, HAPPY, THINKING, CHEER, DISCOVER, TRY AGAIN. Missing art is marked
  `MISSING / TO AUTHOR`, and that never blocks the template.
- Exactly four detail cells. Exactly six palette slots. A relative-scale proportion guide with no
  fabricated numbers.
- One reusable header built around one fixed `LOGO_ASSET`. The asset is `REQUIRED / TO AUTHOR`. No
  logo is cropped from any historical sheet.
- Turnaround is a **full-width row** of four 335 px cells, so cast-relative Bronco and Eagle views fit.
  Hero, head close-up and expressions share the next row.
- Turnaround scale mode is **CAST-RELATIVE**. No per-character "fill the box" scaling.
- The silhouette panel is **not** an authority for cast-relative height (section 6).
- The proportion guide has no side/back thumbnails. It carries a larger front reference, a ruler, a
  common baseline and a visible `PROVISIONAL SCALE` status.
- Chrome is parchment/cream, navy, warm brass and warm-brown borders. Red is never part of the
  template chrome.
- Typography is **Nunito Sans** only. Poppins is not used for final production sheets.
- Backgrounds are deterministic and common. No whole-sheet generative images.
- Supplemental sheets stay inside the same header, grid, typography and chrome system.

Status tags used below: LOCKED = owner decision. PROPOSED = geometry or value chosen here. PROVISIONAL = value that depends on approved art. OPEN = undecided.

Authority is unchanged: `docs/CHARACTER-BIBLE.md` LOCKED rules, then `docs/visual/`, then the
reference art. All hex values for characters are PROVISIONAL. Related docs:
[07 expressions](07-expression-state-system.md), [08 proportions](08-proportions-silhouettes.md),
[09 palette](09-palette.md).

---

## 1. Coordinate map (canvas 1448 x 1086 px)

Format is `x, y, w, h` in pixels, origin top-left. Outer margin 24 px. Gutter between panels 12 px.
Panel padding 12 px (10 px for the hero art box). All numbers are integers.

Rows: header `y24-144`; turnaround `y156-456`; hero / head / expressions `y468-768`; bottom row
`y780-1062`. The bottom margin is 24 px (`y1062-1086`). Every row gap is 12 px.

| Zone | Element | Box |
| --- | --- | --- |
| Canvas | Sheet background | `0,0,1448,1086` |
| **A Header** | Header panel | `24,24,1400,120` |
| | LEFT: `LOGO_ASSET` slot | `24,24,336,120` |
| | CENTER: title | `376,52,664,40` |
| | CENTER: subtitle (role) | `376,96,664,24` |
| | RIGHT: role-tag pill | `1072,66,336,36` (slot `1056,24,368,120`) |
| **B Turnaround** (full width) | Panel | `24,156,1400,300` |
| | Chip "TURNAROUND" | `34,164,auto,28` |
| | Cell 1 FRONT | `36,200,335,214` art; pill `y420 h26` |
| | Cell 2 3/4 VIEW | `383,200,335,214` art; pill `y420 h26` |
| | Cell 3 SIDE VIEW | `730,200,335,214` art; pill `y420 h26` |
| | Cell 4 BACK VIEW | `1077,200,335,214` art; pill `y420 h26` |
| **C Hero / Action** | Panel | `24,468,320,300` |
| | Chip "ACTION POSE" | `34,476,auto,28` |
| | Art box | `34,512,300,246` |
| **D Head Close-up** | Panel | `356,468,220,300` |
| | Chip "HEAD CLOSE-UP" | `366,476,auto,28` |
| | Art box | `366,512,200,246` |
| **E Expressions** | Panel | `588,468,836,300` |
| | Chip "EXPRESSIONS" | `598,476,auto,28` |
| | Cell 1 IDLE | `601,512,125,214` art; pill `y732 h26` |
| | Cell 2 HAPPY | `738,512,125,214` |
| | Cell 3 THINKING | `875,512,125,214` |
| | Cell 4 CHEER | `1012,512,125,214` |
| | Cell 5 DISCOVER | `1149,512,125,214` |
| | Cell 6 TRY AGAIN | `1286,512,125,214` |
| **F Silhouettes** | Panel | `24,780,452,282` |
| | Chip "SILHOUETTES" | `34,788,auto,28` |
| | Standing x4 | `36,824,72,196` / `116,...` / `196,...` / `276,...`; labels `y1026 h20` |
| | Action | `356,824,108,196`; label `y1026 h20` |
| **G Details** | Panel | `488,780,316,282` |
| | Chip "DETAILS" | `498,788,auto,28` |
| | Four cells (2 x 2) | `500,824,142,106` / `650,824,142,106` / `500,938,142,106` / `650,938,142,106` |
| **H Palette** | Panel | `816,780,304,282` |
| | Chip "COLOR PALETTE" | `826,788,auto,28`, tag "PROVISIONAL" right-aligned in the chip row |
| | Six slots (3 x 2) | see section 2 |
| **I Proportion Guide** | Panel | `1132,780,292,282` |
| | Chip "PROPORTION GUIDE" | `1142,788,auto,28` |
| | Ruler / marker column | `1144,824,44,196` |
| | Front reference | `1196,824,216,196` |
| | Common baseline | line at `y1006` across `1144-1412` |
| | Scale-status label | `1144,1026,268,20` |

Checks:

- Turnaround: `4 x 335 + 3 x 12 = 1376`, plus 12 px panel padding on each side, equals 1400.
- Hero / head / expressions: `320 + 220 + 836 = 1376`, plus two 12 px gutters, equals 1400.
- Expression cells: `6 x 125 + 5 x 12 = 810`, centered in the 836 px panel with 13 px side padding.
- Bottom row: `452 + 316 + 304 + 292 = 1364`, plus three 12 px gutters, equals 1400.
- Vertical: `24 + 120 + 12 + 300 + 12 + 300 + 12 + 282 + 24 = 1086`.

### Shapes

| Item | Value (PROPOSED) |
| --- | --- |
| Panel radius | 16 px |
| Art box radius | 12 px |
| Panel chip | pill, radius 14, height 28, horizontal padding 12 |
| Label pill | pill, radius 13, height 26 |
| Swatch radius | 8 px |
| Panel border | 2 px inside the box |
| Art box border | 2 px inside the box |
| Label pill and swatch border | 1 px |
| Shadows, glows, textures | none |

### Safe areas

- Outer safe area: 24 px on all sides. Nothing renders in it.
- Art boxes keep an 8 px inner safe inset. No character pixel sits within 8 px of an art-box edge,
  except in the Hero and Head close-up boxes, where the common background fills the box to its edge.
  Turnaround cells are the one exception on the horizontal axis: wide poses may use the full 335 px
  cell width (section 6). The vertical limits in section 6 still apply.
- Text keeps 8 px from its container edge (12 px for chips and pills, which use horizontal padding).

---

## 2. Palette component: six slots

Canonical palette is **SIX core-color slots**. Do not add rows. Do not compress existing rows to fit
more colors; extra colors go to a supplemental sheet (section 12).

Inner area is `828,824,280,226`. Three columns of 88 px with 8 px gutters (x = 828, 924, 1020). Two
rows of 108 px with a 10 px gap (y = 824, 942).

| Slot | Box | Role (default label) |
| --- | --- | --- |
| 1 | `828,824,88,108` | PRIMARY |
| 2 | `924,824,88,108` | SECONDARY |
| 3 | `1020,824,88,108` | ACCENT |
| 4 | `828,942,88,108` | GEAR |
| 5 | `924,942,88,108` | DETAIL |
| 6 | `1020,942,88,108` | CHARACTER-SPECIFIC |

Inside each slot (offsets from the slot origin):

| Part | Box | Style |
| --- | --- | --- |
| Swatch | `0,0,88,52`, radius 8, 1 px border | flat fill |
| Role label | `0,56,88,12` | 10 px, ExtraBold, caps, 1 line |
| Name | `0,70,88,26` | 11 px, SemiBold, up to 2 lines |
| Hex | `0,96,88,12` | 10 px, Regular, tabular figures |

Rules:

- Slots 1-5 use the default role labels. Slot 6 may carry a character-specific name when that is
  clearer. Example: Bronco slot 6 is **BANDANA — MAROON**.
- The role label may be replaced by a character-specific semantic name for any slot, within the text
  limits in section 4.
- Unused slots stay blank: the swatch shows the empty pattern from section 10, the label reads
  `OPEN`, and the name and hex lines are empty.
- Hex is printed only when a value exists. Every printed hex is **PROVISIONAL**, and the panel always
  shows the "PROVISIONAL" tag. No final production hex is locked by this document.
- Red gear and star accents on Bronco remain separate from the maroon bandana.

---

## 3. Detail cells: exactly four

Four cells, 142 x 106 px each. Inside a cell: art area `0,0,142,82` (radius 12, 2 px border), caption
`0,86,142,20`.

- Choose the **four most identity-critical** items for the character. Examples (guidance, not
  locked content): Click guide gear/badge/harness/host accessory; Dino backpack/strap/spikes/explorer
  detail; Koala glasses/hat/book/scholar clothing; Tarsier goggles/hood/scout clothing/discovery
  gear; Eagle A jacket/varsity trim/wing-feather treatment/emblem; Bronco cowboy hat/maroon
  bandana/saddle gear/star treatment.
- If fewer than four useful source details exist, mark the empty cell **OPEN** (section 10) and
  record the future required detail crop in the sheet manifest. No filler crops.
- If more than four exist, the rest go to a supplemental sheet.
- Details are crops of approved art on the common cell background (section 9). They are never
  re-drawn to fill a slot.

---

## 4. Typography

Production family: **Nunito Sans** (LOCKED). No other family on a production sheet. No AI-generated
lettering. No Poppins. Weights used: Regular 400, SemiBold 600, Bold 700, ExtraBold 800.

Font binaries are **not** embedded or committed in this step. Font files and license handling are set
up explicitly before the first rendered sheet.

Sizes are nominal pixels on the 1448 x 1086 canvas. "Min" is the smallest size after shrink-to-fit.
Text color is the common ink color in section 9.

| Role | Weight | Size / line height | Case and tracking | Align | Max lines | Overflow |
| --- | --- | --- | --- | --- | --- | --- |
| Header title (`[NAME] — CHARACTER SHEET`) | 800 | 36 / 40 | caps, +0.02 em | center | 1 | shrink to min 28, then clip with ellipsis |
| Header subtitle (role) | 600 | 18 / 24 | sentence case | center | 1 | shrink to min 14, then ellipsis |
| Role tag | 800 | 13 / 16 | caps, +0.04 em | center | 1 | fixed strings only (section 8); never shrinks |
| Panel chip | 800 | 14 / 16 | caps, +0.04 em | left | 1 | fixed strings only; never shrinks |
| Cell label pill | 700 | 12 / 14 | caps, +0.04 em | center | 1 | fixed strings only; never shrinks |
| Silhouette label | 700 | 11 / 13 | caps, +0.04 em | center | 1 | fixed strings only |
| Detail caption | 600 | 11 / 13 | sentence case | left | 2 | shrink to min 10, then ellipsis on line 2 |
| Palette role label | 800 | 10 / 12 | caps, +0.06 em | left | 1 | shrink to min 10, then ellipsis |
| Palette name | 600 | 11 / 13 | sentence case | left | 2 | shrink to min 10, then ellipsis on line 2 |
| Palette hex | 400 | 10 / 12 | caps, tabular figures | left | 1 | fixed format `#RRGGBB` |
| Palette "PROVISIONAL" tag | 800 | 10 / 12 | caps, +0.06 em | right | 1 | fixed string |
| Proportion scale-status label (`PROVISIONAL SCALE`) | 800 | 10 / 12 | caps, +0.06 em | center | 1 | fixed string |
| Ruler comparison tag (optional) | 800 | 10 / 12 | caps, +0.06 em | left | 1 | 3 letters, fixed |
| Missing / open marker (and `LOGO_ASSET` placeholder) | 800 | 12 / 14 | caps, +0.04 em | center | 2 | fixed strings (section 10) |

Rules:

- Minimum rendered text size is 10 px. Nothing smaller.
- Line-break only at spaces, never mid-word. Never hyphenate.
- Text is always rendered by the layout engine from the manifest. No text is baked into character art.
- Fixed strings are listed in this document. A fixed string that does not fit is a template defect,
  not something to shrink.

---

## 5. Canonical expression order and states

Six cells in this order, left to right (LOCKED):

| # | Cell label | State key | Notes |
| --- | --- | --- | --- |
| 1 | IDLE | `idle` | resting, friendly |
| 2 | HAPPY | `happy` | |
| 3 | THINKING | `thinking` | |
| 4 | CHEER | `cheer` | |
| 5 | DISCOVER | `discover` | wonder / found something |
| 6 | TRY AGAIN | `tryAgain` | gentle determination |

Mapping from older source labels:

- `CELEBRATE` maps to `CHEER`.
- `SURPRISED` maps to `DISCOVER` **only** when the artwork genuinely communicates discovery or
  wonder. The mapping decision and who made it are recorded in the manifest. Otherwise the cell is
  `MISSING / TO AUTHOR`.
- No other existing expression is relabeled. Do not force a nearby expression into a state.

**TRY AGAIN requirement (LOCKED):** focused, encouraging, resilient, ready to continue. Never angry,
ashamed, punished, defeated or frustrated at the learner. An art cell that reads otherwise is not
approved for this slot, even if it exists. Known cases to resolve in the art phase: Eagle (scowls)
and Click (review required).

The label text above is the canonical wording. The older `07` composite labels (`CELEBRATE`,
`SURPRISED`) are not used on canonical sheets.

---

## 6. Turnaround placement, baseline and scale

Four cells only (LOCKED), in one **full-width row** (`24,156,1400,300`). Extra source views (for example
Bronco 3/4 BACK) belong on a supplemental sheet.

### Scale mode: CAST-RELATIVE (LOCKED)

Characters are drawn at a scale tied to the cast, not to the box.

- Each character manifest carries a **relative scale factor** `k` (1.00 is the cast reference
  height). The factors are **PROVISIONAL** until final approved turnaround art establishes the
  normalized cast proportions. The working reference is the table in
  [08](08-proportions-silhouettes.md).
- The sheet scale is `px per source unit = S0 x k`, with the cast constant `S0` chosen once for the
  whole cast so that the tallest cast member fits the turnaround height limit (184 px). `S0` is
  PROVISIONAL and is the same for all six sheets.
- **All four views of one character use exactly the same scale.** FRONT, 3/4, SIDE and BACK never
  scale independently.
- **No character is enlarged to remove empty space or fill a cell.** A small character (Tarsier) sits
  small in its cells. Tarsier must remain visibly the smallest member of the cast. Click and Bronco
  remain among the taller, larger characters.
- **One baseline.** Every view's lowest ground-contact point sits on `y = 400` (the art box bottom
  `414` minus 14), shared by all four cells.
- **Horizontal placement.** Each view is centered on its cell center (`cell x + 167.5`: 203.5, 550.5,
  897.5, 1244.5) using the view's matted bounding box.
- **Height limit.** The tallest point of any view is at or below `y = 216` (16 px under the art box
  top), so the maximum drawn height is 184 px.
- **Width limit.** Art may use the full 335 px cell width. The 8 px horizontal safe inset is waived in
  the turnaround so that wide poses (tails, wings, horse bodies) fit.
- Wings, tails, hats and crests count toward bounding boxes.

### Overflow at cast-relative scale

If approved art still exceeds its canonical box at the required cast-relative scale (taller than 184 px
or wider than 335 px), the sheet manifest flags:

**ART/TEMPLATE REVIEW REQUIRED**

The renderer does not silently shrink that pose, does not shrink one view, and does not crop. The flag
goes to the owner to decide between changing the approved pose, the cast constant `S0`, or the cell
geometry.

Cell art sits on the common cell background (section 9). The label pill sits centered under the cell
at `y420`, width `min(335 - 16, text width + 24)`.

### Cast-relative scale authority

The canonical authority for cast-relative character height is, in order:

1. the **turnaround** (this section), and
2. the **proportion guide** (section 7).

The silhouette panel is **not** an authority for cast-relative height. Its purpose is silhouette
recognition, shape differentiation and small-size readability. Silhouettes may be uniformly fit within
their individual silhouette cells while preserving aspect ratio. Silhouette-cell scale must never be
used to infer actual cast size.

### Other boxes

Head close-up (`366,512,200,246`): portrait box. Head bounding box about 88 percent of the box width
(176 px), horizontally centered, eye line at 40 percent of the box height (`y = 610`). Crop-to-fill is
allowed here and in the hero.

Expression cells (`125 x 214`, portrait head-expression views): all six cells for one character use the
same head scale, centered horizontally.

- Usable width after the 8 px inset is 109 px. The nominal head bounding-box width is 100 px.
- Eye line at 40 percent of the cell height (`y = 512 + 86 = 598`).
- Crown at least 8 px inside the top of the box. Shoulders and chest may bleed off the bottom edge.
- If the widest head among the six (ears, crest, hat brim) exceeds 109 px at the character's head
  scale, flag **ART/TEMPLATE REVIEW REQUIRED**. Do not shrink one cell.
- Cells show a cutout on the common expression-cell background (section 9). A missing state shows the
  section 10 marker and keeps its label pill at `y732`.

Hero / Action (`34,512,300,246`): one approved action pose, centered, 24 px minimum clearance to the
box edge except where the pose intentionally extends (a wing tip may reach 8 px from the edge). Its
scale is the pose's own and is not tied to the turnaround scale.

Silhouettes (`24,780,452,282`): the four standing silhouettes (front, 3/4, side, back) sit on one
baseline at `y = 1006`, each uniformly fit inside its own 72 x 182 cell with aspect ratio preserved. The
action silhouette is uniformly fit inside 108 x 182 on the same baseline. Every silhouette is the
matted alpha of approved art, flat navy fill. Labels: FRONT, 3/4, SIDE, BACK, ACTION. Fit scale here is
for recognition only (see "Cast-relative scale authority").

---

## 7. Proportion guide (relative scale only)

The panel box stays `1132,780,292,282`. The side/back thumbnails are **removed**: they duplicate the
canonical turnaround and are too small to be useful.

No numeric heads-tall values and no centimeter or other printed measurements are used. The exact
normalized cast scale remains open until turnaround art is finalized.

Inner area `1144,824,268,226`:

| Part | Box | Content |
| --- | --- | --- |
| Ruler / marker column | `1144,824,44,196` | vertical ruler line with a dashed cast-reference tick and a solid character-height marker; no numbers |
| Front reference | `1196,824,216,196` | one larger front character or silhouette reference |
| Common baseline | `1144,1006` to `1412,1006` | 2 px line; the ruler, the front reference and the optional comparison marker all stand on it |
| Scale-status label | `1144,1026,268,20` | `PROVISIONAL SCALE` (always shown) |
| Optional comparison marker | inside the ruler column | one short dashed tick with a 3-letter tag |

Rules:

- The cast reference height `R` is 168 px, from baseline `y = 1006` up to `y = 838`. The front
  reference is drawn at `R x k`, where `k` is the character's cast-relative scale factor (the same
  value used for the turnaround). `k` is PROVISIONAL.
- The solid marker shows where this character's top sits against the dashed reference tick. It is the
  only height cue. No number is printed.
- The optional comparison marker is a second dashed tick for one other cast member (for example the
  smallest, Tarsier) with a 3-letter tag. It is optional and listed in the manifest. When absent, the
  column holds only the reference tick and the character marker.
- The status label `PROVISIONAL SCALE` stays on every canonical sheet until the owner approves final
  normalized proportions. The label is then changed by owner decision, not by the renderer.
- Locked relative requirements (from the Bible and [08](08-proportions-silhouettes.md)): Tarsier is
  clearly the smallest; Click and Bronco read among the taller, larger characters; every silhouette
  stays distinct at small size.
- If the front reference exceeds its `216 x 196` box at `R x k`, flag **ART/TEMPLATE REVIEW REQUIRED**.
  It is not silently shrunk.

---

## 8. Header and role tag

One header specification, identical for every canonical sheet. Placement of the logo, title and role
tag never varies by character.

Structure (LOCKED): **LEFT** fixed `LOGO_ASSET`; **CENTER** `[CHARACTER NAME] — CHARACTER SHEET` with
the character's role/subtitle below it; **RIGHT** role tag.

| Part | Box | Content |
| --- | --- | --- |
| Header panel | `24,24,1400,120` | common header background (section 9), 2 px border, radius 16 |
| LEFT: `LOGO_ASSET` slot | `24,24,336,120` | the one reusable logo asset, centered, contain-fit with 12 px padding |
| CENTER: title | `376,52,664,40` | `[CHARACTER NAME] — CHARACTER SHEET` |
| CENTER: subtitle | `376,96,664,24` | one-line character role/subtitle |
| RIGHT: role tag pill | `1072,66,336,36` | fixed strings below, radius 18 |

Title and subtitle are centered horizontally in the 664 px block. The title and subtitle together are
64 px tall and are centered vertically in the header (24 px above and below).

### Logo

- `LOGO_ASSET` = **REQUIRED / TO AUTHOR**.
- The logo contains the product name "BidaZoo World Expedition". The name is **not** repeated as
  separate typeset text anywhere in the header.
- One asset is used for every sheet. A separate logo is **never cropped from any historical character
  sheet**, and no historical crop becomes canonical automatically.
- Existing production artwork may be used as a **visual reference** for authoring the clean logo master.
- Until the asset exists, the slot renders the section 10 empty-pattern marker with the text
  `LOGO_ASSET` over `REQUIRED / TO AUTHOR`. A sheet rendered with the marker is a layout proof only.
- The clean master and its license/provenance are set up explicitly before the first final render.

### Role tag (LOCKED strings)

| Character | Role tag |
| --- | --- |
| Click | `HOST & GUIDE — NOT SELECTABLE` |
| Dino, Koala, Tarsier, Eagle, Bronco | `SELECTABLE STARTER` |

Styling: the tag is a pill with a 2 px brass outline. The five starters use the filled navy treatment
with white text. Click uses the host treatment: cream fill with navy text. The two treatments are fixed
tokens and are never chosen per sheet. A starter sheet never shows "HOST & GUIDE". The Click sheet
never shows "SELECTABLE STARTER".

### Other header rules

- The title uses the character's display name exactly: Click, Dino, Koala, Tarsier, Eagle, Bronco.
- No scenic header artwork. No per-character header decoration.
- The same header, tag treatment and positions apply on supplemental sheets (section 12).

---

## 9. Deterministic background and chrome tokens

Everything on the sheet except character art is rendered by the layout engine from fixed tokens. No
scenic, parchment or jungle pixels come from source art.

### Chrome semantic rules (LOCKED)

- Parchment / cream page and panels.
- Navy section bars and chips.
- Warm brass / gold accents.
- Restrained warm-brown borders.
- One consistent family of rounded corners (section 1).
- **Red is not part of the template chrome.** Nothing child-facing in the chrome (borders, chips, tags,
  hatch patterns, markers) uses red.
- Character-specific red accents (for example Bronco's saddle-pack star plate and gear accent) are
  character art. They are separate from the sheet chrome.

### Tokens

All exact values are **PROVISIONAL** until corrected production art is approved. They are UI chrome
only, not character color.

| Token | Value (PROVISIONAL) |
| --- | --- |
| Sheet background (parchment) | flat `#FEF5DF` |
| Panel fill (cream) | flat `#FBECD4` |
| Panel and art-box border (warm brown, restrained) | `#B89A6A` |
| Common cell background (turnaround, expressions, details, silhouettes, proportion) | flat `#FFF8E8` |
| Common stage background (hero and head close-up) | one fixed vertical gradient `#FFF6DD` to `#F3DFB5` |
| Chip and section bar fill / text | navy `#1E3A5F` / white |
| Brass accent | `#C9A24A` |
| Ink (text) | `#2B2A33` |
| Silhouette fill | flat navy `#1E3A5F` |

Brass is used for: the 2 px bottom edge of each chip, the role-tag outline, and the ruler marker.

### Backgrounds

- **Common expression-cell background:** all six expression cells for every character use the same
  flat cell background. Expression art must be a cutout or cleanly matted on that background.
- **Characters** come as transparent or cleanly matted art. Scenic backgrounds baked into existing
  source crops are source-art limitations and are not carried into canonical sheets.
- Matting must not alter character art, and a background problem is never solved by redesigning a
  character.
- Scenic environment art is mood reference only and lives on supplemental sheets or the destination
  documents, not on the canonical sheet.

---

## 10. Missing-art and OPEN behavior

Every art slot has a status in the sheet manifest: `approved`, `provisional`, `missing` or `open`.
The renderer never fills a slot with something that is not approved for it.

| Status | Rendering |
| --- | --- |
| `approved` | the art, on the common cell background |
| `provisional` | the art, plus a 10 px `PROVISIONAL` tag in the slot's top-right corner |
| `missing` | empty-pattern cell with the marker text `MISSING /` over `TO AUTHOR` |
| `open` | empty-pattern cell with the marker text `OPEN —` over `TO AUTHOR` (detail or palette slots) |

Empty-pattern cell: fill `#EFE0BC`, 45 degree 1 px hatch lines of `#DCC9A0` at 12 px pitch, dashed 2 px
border `#B89A6A` (all warm tan or brown, never red; PROVISIONAL). Marker text uses the "Missing / open
marker" role, centered.

- A missing cell **keeps its canonical label pill** (for example `THINKING`).
- A missing state is never replaced by a nearest-match expression. Do not copy one state into
  another cell.
- Missing art does not block locking this template or rendering a sheet. It does block calling a
  sheet final.
- The manifest lists each missing and open slot, so the production backlog is generated from it.
- A sheet with any `missing`, `open` or `provisional` slot carries the sheet status line in the
  manifest, not on the artwork.

---

## 11. Overflow and fallback behavior

| Case | Behavior |
| --- | --- |
| Title too wide | shrink-to-fit from 36 to 28, then ellipsis |
| Subtitle or caption too long | shrink to the role minimum, then ellipsis on the last permitted line |
| Palette name too long | shrink to 10, wrap to 2 lines, ellipsis on line 2 |
| Fixed string does not fit (chip, pill, role tag) | template defect; fix the template, never shrink |
| Approved art overflows its box at the cast-relative scale | flag `ART/TEMPLATE REVIEW REQUIRED` in the manifest; do not silently shrink that pose, one view, or crop |
| More than four useful details | first four by identity priority on the sheet, the rest supplemental |
| More than six core colors | the six semantic slots on the sheet, the rest supplemental |
| Hex value unknown | hex line blank; the swatch may still be sampled from approved art and marked PROVISIONAL |
| `LOGO_ASSET` missing | section 10 marker; layout proof only, never a final render |
| Expression art unavailable | `MISSING / TO AUTHOR` (section 10) |
| Art alpha edge artifacts | fix the matte; do not paint over the character |

Locale and characters: all strings are US English. Text that needs glyphs Nunito Sans lacks is a
defect to fix, not to swap for another font.

---

## 12. Canonical sheet versus supplemental reference sheet

| | Canonical character sheet | Supplemental character reference sheet |
| --- | --- | --- |
| Purpose | the single standard sheet for a character | extra reference that does not fit the canonical template |
| Internal layout | exactly this template, identical for all six | flexible internal content layout |
| Canvas | 1448 x 1086 | 1448 x 1086 (required) |
| Count per character | one | zero or more |
| Header | the standard header (section 8) | the same fixed `LOGO_ASSET` and header system; title `[NAME] — SUPPLEMENTAL REFERENCE`; same positions |
| Role tag | fixed strings, section 8 | the same role-tag treatment and strings |
| Margins and grid | 24 px margin, 12 px module | the same 24 px margin and 12 px layout grid |
| Typography | section 4 | the same Nunito Sans rules |
| Background and chrome | section 9 | the same background and chrome language |
| Turnaround | FRONT, 3/4, SIDE, BACK only | may add extra views (3/4 BACK, top, kneeling) |
| Poses | one hero / action pose | may add extra poses |
| Expressions | the six canonical states | may add extra expressions (`ready`, `proud`, `wave`, `point`, variants) |
| Details | exactly four | may add more detail callouts |
| Palette | six slots | may carry an extended palette |
| Scenic / mood art | none | allowed as clearly labeled mood reference |
| Authority | the canonical sheet; the Bible outranks it for LOCKED rules | never higher than the canonical sheet |

Supplemental sheets **must retain**: the 1448 x 1086 canvas; the same fixed logo/header system; the
same margins; the same Nunito Sans typography rules; the same background and chrome language; the same
12 px layout grid (24 px outer margin, 12 px gutters and padding, and panel edges snapped to that
module); and the same role-tag treatment.

Supplemental sheets **may contain**: extra turnaround views; extra poses; extra expressions;
additional detail callouts; extended palettes; scenic and mood references.

Supplemental sheets **may not**:

- redefine canonical character identity;
- redefine canonical sheet geometry;
- introduce a separate branding or layout system;
- contradict `CHARACTER-BIBLE.md`;
- become higher authority than the canonical sheet;
- add a character to the selectable starters.

They are named `[Character] Supplemental Reference` and numbered separately from canonical sheets.
They use the same missing-art behavior (section 10). The canonical sheet is never edited to hold
supplemental content.

---

## 13. Application and open items

Applies identically to Click, Dino, Koala, Tarsier, Eagle and Bronco. Only manifest content changes.

### Current art state (recorded October 13, 2026)

- `production-v1/` is **immutable** and unchanged.
- `production-v1.1/` is a **CORRECTION CANDIDATE — NOT FINAL**, uncommitted. Neither folder is touched
  by this document.
- Accepted candidate corrections that exist in v1.1: the Bronco bandana is maroon; Click is removed
  from the selectable starter/profile options; exactly five starter choices remain; Click is separated
  as HOST & GUIDE; the miss feedback is orange/amber with a retry arrow and the copy "Try again!"; and
  the child-facing modal close button is brass/neutral.
- Sheet `07` palette-row compression was removed, and the dedicated Bronco maroon palette swatch is
  deferred.
- Poppins remains in interim Sheet `08` and is not production-final. It is replaced during final
  typesetting.
- The v1.1 `README.md` hashes are stale/interim and must not be treated as final.
- Unnecessary PNG rewrites create provenance-byte churn with no pixel change. Final PNGs should be
  written as few times as practical, after art approval.
- Eagle art is pending the controlled correction. The base source is
  `production-v1/05_Eagle_Character_Sheet.png`, plus the owner-approved correction: clearly
  white-headed, blue eyes, brown wings, green varsity jacket, original prominent A. The corrected Eagle
  art will later be inserted into this template.
- A newly generated alternate Eagle full-sheet poster is **not** canonical sheet authority and is not
  added to the repo.

### OPEN items

1. `LOGO_ASSET`: REQUIRED / TO AUTHOR (clean master and its license/provenance).
2. Cast-relative scale factors `k` and the cast constant `S0`: PROVISIONAL until approved turnaround
   art establishes normalized proportions.
3. Chrome token hex values (section 9): PROVISIONAL.
4. Font files and license setup for Nunito Sans (before the first render).
5. Per-character manifests: expression mapping, the four details, palette roles, status per slot.
6. Matting approach for turnaround, expression, silhouette and detail art.
7. Review of art that overflows at cast-relative scale (`ART/TEMPLATE REVIEW REQUIRED`).
