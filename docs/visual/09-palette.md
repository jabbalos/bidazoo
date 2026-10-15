# 09 Exact Palette Proposal

Status: PROPOSED, with all reference-sampled values **PROVISIONAL**. Values below are proposals for
review, not contracts. "Code" means the value is used today in `characters.ts` or `theme.ts`.
"Ref" means sampled from the roster reference board; those values are approximate (the crops
include some background) and are **not final palette authority**.

**Owner decision applied (October 12, 2026): PARTIALLY LOCKED.** Semantic color identities are
SPEC-LOCKED. **No exact production hex is locked.** Conflicting render-sheet colors are resolved
before final hex values are proposed.

| Character | SPEC-LOCKED semantic identity |
| --- | --- |
| Click | orange/tan |
| Dino | teal body, orange dorsal spikes; a green backpack is acceptable |
| Koala | gray-lavender |
| Tarsier | preserve the approved identity from the renders and the Bible |
| Eagle | white head, brown wings, green varsity jacket |
| Bronco | maroon bandana |

**Color visual-authority order (RESOLVED, owner, October 12, 2026).** When production renders
disagree about a character's color treatment:

A. that character's dedicated production sheet (01 to 06)
B. expression, proportion, and palette sheet 07
C. master overview 00
D. the legacy approved brand board (11)
E. transitional Phaser/code-drawn art

Dedicated character sheets govern intended appearance, but final production hex values remain
PROVISIONAL until corrected, final production art is approved. This order decides which source
leads; it does not lock any hex. Where a sheet conflicts with a LOCKED Bible rule (Eagle crest,
Bronco bandana), the Bible wins.

Eagle eyes: BLUE (RESOLVED); yellow in code is transitional. Cleared conflicts are noted in the table in section 6.

Next step: once the approved render package is reviewed, re-sample character colors from the
cleaner approved renders, compare against the existing code colors, propose final production
values, and flag meaningful differences for owner approval. Established colors are not
overwritten silently.

Hex values are sRGB. Provide a 3:1 or better contrast for any text on a card.

## 1. Platform tokens (carry the current jungle look)

| Token | Hex | Source |
| --- | --- | --- |
| `jungle` | `#0f3d2e` | Code |
| `jungleDeep` | `#0a2c20` | Code |
| `leaf` | `#1f6f4a` | Code |
| `leafLight` | `#2f9566` | Code |
| `sun` | `#ffc83d` | Code |
| `sunDeep` | `#e0a21a` | Code |
| `card` | `#fff7e0` | Code |
| `cardShade` | `#e9dcb4` | Code |
| `ink` | `#14342a` | Code |
| `good` / `goodDeep` | `#2fbf71` / `#1d8f52` | Code |
| `bad` / `badDeep` | `#f08a3c` / `#c4631c` | Code (orange) |

## 2. World Expedition tokens (PROPOSED)

| Token | Hex | Use |
| --- | --- | --- |
| `expedition.parchment` | `#f3e6c4` | Map surfaces, cards |
| `expedition.brass` | `#c9922e` | Compass, trim, route markers |
| `expedition.timber` | `#8a5a2b` | Hub structures |
| `expedition.canvas` | `#efe3c8` | Tents, awnings |
| `expedition.route` | `#e0662a` | Dashed route lines |
| `expedition.skyDay` | `#7ec8e3` | Hub sky |
| `expedition.lantern` | `#ffb03a` | Warm lantern glow |
| `expedition.weave` | `#b8844a` | Woven/rattan trim |
| `expedition.bamboo` | `#c9b45a` | Bamboo accents |

## 3. Character palettes (PROPOSED unless marked LOCKED)

| Character | Role | Hex | Source |
| --- | --- | --- | --- |
| Click | Fur orange | `#fa9b4b` | Ref |
| Click | Fur shade | `#ca6f39` | Ref |
| Click | Fur deep | `#a84a1d` | Ref |
| Click | Tan muzzle/belly | `#f2cb98` | Ref |
| Click | Badge blue / gold ring | `#2f6fb5` / `#f2c94c` | Ref (approximate) |
| Click | Ink outline | `#24110a` | Ref |
| Dino | Teal body (LOCKED: teal) | `#2fc4b2` | Code |
| Dino | Teal shade | `#1d9e8e` | Code |
| Dino | Belly / snout | `#cdf3e4` / `#8de8d8` | Code |
| Dino | Spikes (LOCKED: orange) | `#ff8a2b` | Code |
| Dino | Backpack | `#8a5a2b` / `#5e3a1a` / `#c79a5b` | Code |
| Dino | Eye iris | `#5b3a8c` | Code |
| Koala | Fur (LOCKED: gray-lavender) | `#aaa0cc` | Code |
| Koala | Fur light | `#d9d2ee` | Code |
| Koala | Ear inner | `#f0d9e8` | Code |
| Koala | Hat/jacket dark | `#2b2236` / `#221a20` | Ref (approximate) |
| Koala | Book | `#8c3b3b` | Code |
| Tarsier | Fur | `#b98650` / `#8d6338` | Code |
| Tarsier | Hood/vest yellow | `#f2c230` | Code |
| Tarsier | Eye amber | `#f1b53d` | Code |
| Tarsier | Goggle lens | `#7fdcf2` | Code |
| Eagle | Head white (LOCKED: white) | `#fbfaf4` | Code |
| Eagle | Wings (LOCKED: brown) | `#7b4a25` / `#4b2c14` | Code |
| Eagle | Beak | `#f7c52b` | Code |
| Eagle | Jacket (LOCKED: green) | `#1f7d49` / `#145a33` | Code |
| Eagle | Letter and trim (canonical: gold, see `palettes.json` "Beak and letter gold") | gold | Sheet |
| Bronco | Coat | `#b9672a` / `#8f4a1c` | Code |
| Bronco | Mane | `#3a2314` | Code |
| Bronco | Muzzle / blaze | `#e9b790` / `#f7f1e6` | Code |
| Bronco | Bandana (LOCKED: maroon) | `#8e1b30`, highlight `#d6566d` | Code |
| Bronco | Hat | `#7a4a2a` | Ref (approximate) |

The reference bandana measured near `#c42223` (red). Maroon is locked as a semantic rule; the crimson look is not authoritative. `#8e1b30` is the current code value only, not a locked hex.

## 4. Destination palettes

Defined per destination in [12](12-destination-worlds.md). Each destination uses a base of three to
five colors plus one accent.

## 5. Palette rules (PROPOSED)

- Feedback UI: a miss uses the established orange/amber, never red (RESOLVED). The red "Not quite!"
  panel on the production UI sheet (08) is rejected (see [10](10-ui-component-style.md)).
- Backdrops must keep sufficient value contrast so the character reads. Do not place a teal Dino
  against a similarly saturated teal backdrop; use warm or neutral behind Dino.
- The maroon bandana must stay distinguishable from backdrop reds and terracottas.
- Avoid pink-and-gold pastel combinations, which push toward fairy-tale kingdom styling.

## 6. Production pack comparison (ingestion, October 12, 2026)

Source sheets `01` to `07`. Detail in [INGESTION-REPORT.md](INGESTION-REPORT.md) section 5. All
values below are **PROVISIONAL**. Highlights and shadows were excluded by method (hue mask plus the
middle lightness band), but they are still estimates. No value in `characters.ts` is overwritten.

Sheet 07 says its swatches are "core colors for each character, to maintain consistency across all
media." Its printed hex text matches the swatch pixels beside it for most entries but not all: Eagle
Secondary is off by about 64 summed RGB units and Eagle Detail by about 108. Printed text on
generated art is therefore not treated as exact.

Meaningful differences flagged for owner approval:

| Item | Code | Sheet swatch | 07 printed | Rendered base |
| --- | --- | --- | --- | --- |
| Click fur orange | none | `#FD6606` | `#F6A54A` | `#F1812F` |
| Click emblem blue | none | `#0054F8` | `#0D3B66` | `#0546B7` |
| Dino teal | `#2FC4B2` | `#04A898` | `#23D3C3` | `#03BCB2` |
| Dino spikes (LOCKED orange) | `#FF8A2B` | `#FD5F22` | `#FF7B2E` | `#F74A04` (reads red-orange) |
| Dino backpack | brown `#8A5A2B` | green `#0A5147` plus orange trim | Gear `#8B5E2B` | green (ACCEPTABLE, owner) |
| Koala fur (LOCKED gray-lavender) | `#AAA0CC` | `#8C85A8`, `#C2B1E5` | `#D9D9ED`, `#8B7DE6` | `#9D86B8` |
| Tarsier hood | `#F2C230` | `#FDC744` | `#FFCF5C` | `#FDC503` |
| Eagle jacket green | `#1F7D49` | `#0F5B3A` | `#167F5B` | `#114A2C` |
| Eagle "A" and trim | legacy code value (superseded) | gold `#FFC531` | Gear `#F2C94C` | gold |
| Bronco coat | `#B9672A` | `#DA6B2D` | `#C66A3A` | `#DE7138` |
| Bronco bandana (LOCKED maroon) | `#8E1B30` | `#9F0A26` ("Maroon") | none (`#E63946`, `#B91C1C`) | `#A30620`, lit `#D21D2C` |

Application of the color authority order above (sheets 01–06 lead, then 07, 00, 11, code) is what resolves these; hex stays PROVISIONAL. Items still to be tabulated: Click fur and emblem, Dino teal and spike hue, Koala fur, Eagle green and gold, Bronco coat, Tarsier fur. Eagle eye color is RESOLVED as blue (hex PROVISIONAL).

M4 status (October 13, 2026): the canonical sheets now define all six palette slots for every character, sampled
from final approved art ([15](15-character-sheet-template.md) section 2). Every hex stays **PROVISIONAL**, and the table
above is unchanged. Bronco's slot 6 is the maroon BANDANA; the red star / gear accent is a separate slot.

Next step after owner review: propose a single final production palette per character. Until then
nothing here is a palette authority. The earlier reference-board samples in section 3 are superseded
by these cleaner sheets.
