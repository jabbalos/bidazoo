# Art request: Great Wall node challenger (Lane A, item A6)

Status: **REQUEST, waiting for the owner.** The design (a takin), its name and its taunt lines need
owner approval before any picture is made (proposal section 5, rule 13). Until a painted file is
approved and integrated, the game shows the code-drawn picture in
`games/zoo-sprint/src/encounter/challengers.ts` (`drawTakin`).

## Asset

| Field | Value |
| --- | --- |
| Asset | Great Wall node challenger, faced in the five path encounters |
| Challenger id | `great-wall-takin` |
| Runtime file | `games/zoo-sprint/assets/world-expedition/destinations/great-wall/challengers/great-wall-takin.webp` (the game finds it there by name; no code change) |
| Master | `docs/reference-art/world-expedition/comfyui-v1/great-wall/great-wall-takin.png` (or OpenArt, if the owner keeps characters there; open decision in proposal section 11) |
| Master size | about 1,400 px tall, transparent RGBA |
| Runtime size | 900 px tall WebP with alpha (shown up to about 520 px tall on a desktop) |
| Layer | Character, not a backdrop layer; transparent background required |
| Framing | Full body, standing on all four legs, **facing left** (toward the buddy), feet on the bottom edge of the opaque pixels, plain white background for generation, then background removed |

## Design (PROPOSED, needs approval)

A sturdy, friendly **golden takin**: a goat-antelope of the Chinese mountains. Chosen because it is a
real mountain animal of the region and avoids the dragon and pagoda clichés the destination's avoid
list names (`docs/visual/12-destination-worlds.md` section 1).

- Stocky body with a rounded shoulder hump, short thick legs, dark hooves.
- Broad face with a dark, arched nose; small horns that sweep out and curl back.
- Golden-tan coat (about `#d2a45e`), lighter dawn-colored belly (`#f3d9a8`), dark face (`#6b4a2e`).
- A knitted scarf in ridge green `#5c7c6b`; no costume or cultural dress.
- Friendly, determined expression: a playful guard, never scary, never angry (ages 6 to 12, Character
  Bible section 1). It is a destination creature, not a starter: no backpack, no jacket, nothing that
  reads as one of the five starters.
- Must read against the Great Wall dawn palette and pass the 48 px silhouette test (`docs/visual/14`).

## Palette

From `docs/visual/12-destination-worlds.md` section 1: ridge green `#5c7c6b`, stone `#b9a98a`, mist
`#dfe9e4`, sky dawn `#f3d9a8`; accent autumn orange `#d9822b`. All hex values PROVISIONAL.

## References (rule 13)

- Style: `docs/reference-art/world-expedition/painted-v1/cast/*_idle_front.png` and `cast-lineup.jpg`
  (painted look, outline weight, soft warm light). Generate image-to-image with one of these as the style
  reference, as described in `docs/reference-art/world-expedition/painted-v1/README.md`.
- Scale against the buddy: `docs/reference-art/world-expedition/painted-v1/cast-lineup.jpg`; the takin
  stands about as tall as Bronco's shoulder.
- Proportions: `docs/reference-art/world-expedition/production-v1.1/07_Expressions_Proportions_Palettes.png`.
- Rules: `docs/CHARACTER-BIBLE.md` (sections 1, 2 and 6, LOCKED), `docs/visual/14-do-dont-anti-drift.md`.

## What the fallback shows today

A code-drawn takin in the colors above (outlined flat shapes, three eye states: open, squeezed on a
strike, happy arcs when it wins the encounter). It flinches on a strike and hops when the child loses the
encounter. The painted file needs only one pose; the reactions are motion on the picture.

## Copy (PENDING)

| String | Where |
| --- | --- |
| `Ridge Takin` | Name in the encounter's status bar |
| `Can you climb past me?` | Taunt when the encounter opens (one of three, chosen at random) |
| `These steps are mine to guard!` | Taunt |
| `Show me your best math!` | Taunt |
