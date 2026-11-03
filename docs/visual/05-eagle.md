# 05 Eagle Production Sheet

Status: PROPOSED. Tags: LOCKED / CARRIED / PROPOSED / OPEN (see [00](00-master-direction.md)).

## Identity

| Trait | Tag |
| --- | --- |
| White head | LOCKED |
| Brown wings | LOCKED |
| Green varsity-style letter jacket | LOCKED |
| Prominent letter "A" that is original | LOCKED |
| May subtly evoke school spirit; must not reproduce any school logo or mascot | LOCKED |

## Carried from the reference art (CARRIED)

Do not change established trim or colors solely because generic sports designs may use similar
colors. Originality comes from the total design, letterform, and proportions.

- Fierce, confident brows and a hooked yellow beak.
- Green jacket with an original gold varsity "A" patch (canonical, owner lock October 13, 2026), ribbed cuffs, and gold or cream trim.
- Broad brown wings with lighter feather edges; white head and neck feathers.
- **Eyes are BLUE** (RESOLVED, owner, October 12, 2026). The Bible does not lock eye color, so the approved production rendering governs. The yellow eyes in `characters.ts` are transitional and not canonical.

## Current transitional code (for reference)

`drawEagle` (legacy, superseded; not canonical): white head, brown raised wings, green jacket with a stripe on each
sleeve, a block "A" with a dark-green shadow, yellow eyes. The canonical A is gold and the canonical eyes are blue.

## Production notes (PROPOSED)

- **Silhouette signature.** Wide wings cut a wedge shape; the white head sits on top. At 48 px it
  reads as a triangle with a pale top.
- **Originality of the "A".** Design a custom letterform, not a stock typeface. Proposed traits:
  slightly asymmetric crossbar shaped like a feather notch, a counter shaped like a small peak,
  and unique stroke proportions. Draw it fresh; do not trace any existing mark.
- **Human look-alike review is required** on the final jacket, letter, trim, and colors before
  they are approved, as the Bible recommends (section 6). This package does not claim clearance.
- **Wings.** Wings frame the body in portraits and fold or lift per state. The wing color stays
  brown in every state.
- **Brows.** The strongest brows in the cast. In `tryAgain` they must soften, never scowl (see
  [07](07-expression-state-system.md)).

## Must not

- Copy a real school's letter, colors as a set, crest, or mascot.
- Drop the white head, brown wings, green jacket, or the prominent "A" in any state or size.
- Look angry or aggressive in any state.

## OPEN

Exact letterform, trim color, voice
or sound, animation set, alternate outfits.

## Ingestion findings (production sheet 05)

Source: `05_Eagle_Character_Sheet.png`. Full catalog in [INGESTION-REPORT.md](INGESTION-REPORT.md).

- **Eye color (RESOLVED, owner):** BLUE. Bright blue with an amber rim in the production sheet and the
  legacy board. The yellow in the transitional code is not canonical. Exact blue hex stays PROVISIONAL.
- **Jacket:** green varsity-style, open at the front, with a gold-striped collar and cuffs, paw-print
  buttons, a gold block "A" on the left chest, a small crest patch on the right chest, and a gold
  mountain emblem on the back. The "A" is gold (ORIGINAL VARSITY "A" — GOLD, owner lock). The legacy
  `drawEagle` code is superseded for the A colour.
- **RESOLVED (owner, October 12, 2026):** the Bible's "white head" governs. The Eagle must clearly
  read as white-headed at normal gameplay and portrait size. The brown crest that sweeps across the
  crown and nape in this render is **NOT canonical**.
  **CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER: DONE in `production-v1.1`** (white head applied; the
  corrected sheet is the Eagle source for the M4 library). A small rear feather or accent of brown may
  remain OPEN only if the head still unambiguously reads white. The Bible is not reinterpreted to
  fit the crest.
- **Originality:** the "A" is a gold block letter (ORIGINAL VARSITY "A" — GOLD). This document does not claim
  clearance. PRE-COMMERCIAL BRAND/IP REVIEW REQUIRED (not legal
  clearance; not an M4 release blocker): the green-and-gold varsity A must be reviewed before broad commercial
  merchandising or licensing. The earlier suggestion of a feather
  notch and peak counter is only a proposal and is not shown in the render.
- **Expressions shown:** Bold, Focused, Happy, Determined, Surprised, Celebrate. On 07, TRY AGAIN
  reads stern. **DONE in `production-v1.1`:** TRY AGAIN was re-authored as encouraging (OWNER-ACCEPTED MINOR).
- **Scale:** cast factor 1.000, the cast reference and the tallest (sheet 07 v1 printed 1.10); wingspan about 2.5 times body width.
- **Palette:** the printed jacket green differs between 05 (`#0F6B3A`) and 07 (`#167F5B`).

## Owner decision applied (October 12, 2026)

Semantic identity SPEC-LOCKED: white head, brown wings, green varsity jacket with an original
prominent "A". A human visual-originality review stays required for the "A" and for any element that
could resemble existing mascot or team branding. Common symbols are not removed merely because they
are common; the review judges total composition, letterform, proportions, and treatment. No
clearance is claimed here.
