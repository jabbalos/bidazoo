# Art request: Great Wall boss (Lane A, items A5 and A6)

Status: **REQUEST, waiting for the owner.** The design (a snow leopard), its name and its taunt lines
need owner approval before any picture is made (proposal section 5, rule 13). Until a painted file is
approved and integrated, the game shows the code-drawn picture in
`games/zoo-sprint/src/encounter/challengers.ts` (`drawSnowLeopard`).

## Asset

| Field | Value |
| --- | --- |
| Asset | Great Wall boss, faced at the summit (five questions, two special moves) |
| Challenger id | `great-wall-snow-leopard` |
| Runtime file | `games/zoo-sprint/assets/world-expedition/destinations/great-wall/challengers/great-wall-snow-leopard.webp` (found by name; no code change) |
| Master | `docs/reference-art/world-expedition/comfyui-v1/great-wall/great-wall-snow-leopard.png` (or OpenArt; open decision in proposal section 11) |
| Master size | about 1,600 px tall, transparent RGBA |
| Runtime size | 1,000 px tall WebP with alpha (the boss is drawn larger than a node challenger, up to about 640 px tall on a desktop) |
| Layer | Character; transparent background required |
| Framing | Full body, **sitting upright, facing left** (toward the buddy), long tail curled up behind, paws on the bottom edge of the opaque pixels, plain white background for generation, then background removed |

## Design (PROPOSED, needs approval)

A calm, proud **snow leopard** of the high ridges: a real mountain animal of the region, chosen over
dragon or guardian-statue imagery (destination avoid list, `docs/visual/12-destination-worlds.md`).

- Mist-gray coat (about `#dcdcd2`) with dark ring rosettes, cream chest and muzzle, pale green eyes.
- Very long, thick tail curling up behind it: its silhouette anchor at small sizes.
- An autumn-orange scarf (`#d9822b`), the destination's accent, so it reads as the summit's champion.
- Big and impressive, but warm: a respected rival, never frightening, never angry, no bared teeth.
- Not a starter and nothing that reads as one (no jacket, bandana, goggles or backpack).

## Palette

From `docs/visual/12-destination-worlds.md` section 1: ridge green `#5c7c6b`, stone `#b9a98a`, mist
`#dfe9e4`, sky dawn `#f3d9a8`; accent autumn orange `#d9822b`. All hex values PROVISIONAL.

## References (rule 13)

- Style: `docs/reference-art/world-expedition/painted-v1/cast/*_idle_front.png` and `cast-lineup.jpg`;
  method in `docs/reference-art/world-expedition/painted-v1/README.md` (image-to-image, white background,
  background removed).
- Scale: sitting, about one and a half times Bronco's standing height in `cast-lineup.jpg`.
- Proportions: `docs/reference-art/world-expedition/production-v1.1/07_Expressions_Proportions_Palettes.png`.
- Rules: `docs/CHARACTER-BIBLE.md` (sections 1, 2 and 6, LOCKED), `docs/visual/14-do-dont-anti-drift.md`.

## What the fallback shows today

A code-drawn sitting snow leopard in the colors above, with the same three eye states as the node
challenger. It gets the wider share of the face-off and is drawn taller than a node challenger.

## Copy (PENDING)

| String | Where |
| --- | --- |
| `Summit Snow Leopard` | Name in the encounter's status bar |
| `Only the bravest reach the top!` | Taunt when the boss opens (one of two, chosen at random) |
| `Five questions stand between you and the summit.` | Taunt (assumes the boss has five questions) |
