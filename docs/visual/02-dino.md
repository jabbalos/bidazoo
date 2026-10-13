# 02 Dino Production Sheet

Status: PROPOSED. Tags: LOCKED / CARRIED / PROPOSED / OPEN (see [00](00-master-direction.md)).

## Identity

| Trait | Tag |
| --- | --- |
| Teal explorer dinosaur | LOCKED |
| Orange dorsal spikes | LOCKED |
| **Exactly one** explorer backpack. No second bag, chest pack, or duplicate backpack. | LOCKED |
| Personality: adventurous and curious | LOCKED |

## Carried from the reference art (CARRIED)

- Rounded, friendly head with a large open-mouth grin; large purple-violet eyes.
- Orange-red spikes on the head crest and along the back.
- Lighter mint belly; slightly textured scale detail; thick tail.
- One brown explorer backpack with visible straps.

## Current transitional code (for reference)

`drawDino` in `characters.ts`: teal head and body, five orange spikes, one brown backpack behind the
left shoulder with straps, mint snout and belly, purple eyes. The one-backpack rule is honored.

## Production notes (PROPOSED)

- **Silhouette signature.** Spiky crest plus a tail plus a single pack bump. A triangular spike
  rhythm is the readable shape at 48 px.
- **The one pack.** One rounded backpack with a flap, side pockets, and buckles. Straps may
  show. The production color is green with orange trim (see the ingestion findings below).
- **Other accessories are OPEN.** Utility pouches and similar items are not categorically
  prohibited. The test is visual: if an accessory reads as a second bag, a chest pack, or a
  duplicate backpack, reject it. Otherwise it stays open for review.
- **Face.** Wide eyes, big smile, upturned snout. Curious tilt in `discover`.
- **Scale.** Short and sturdy; 0.90 on the 07 lineup (see [08](08-proportions-silhouettes.md)).
- **Texture.** Subtle speckles only. Keep shapes clean so the sprite stays readable on busy
  backdrops. Dino's teal must stay distinct from teal water and sky in the destinations.

## Must not

- Have a second bag, a chest pack, or a duplicate backpack in any pose or state, or any accessory
  that visually reads as one.
- Lose the orange dorsal spikes in any state, including `tryAgain`.
- Use red-brown spikes that read as a different color than orange.
- Add a second bag. A green backpack is acceptable; two packs are not.

## OPEN

Child-facing name beyond "Dino", voice or sound, full animation set, alternate outfits.

## Ingestion findings (production sheet 02)

Source: `02_Dino_Character_Sheet.png`. Full catalog in [INGESTION-REPORT.md](INGESTION-REPORT.md).

- **One backpack confirmed in every view** (turnaround, back view, action pose): green with orange
  trim, a paw badge, buckles, and a leaf zipper pull, on brown leather straps. A horizontal chest
  strap with a buckle appears; it is visually part of the same pack. Keep it clearly attached.
- **Pack color:** the legacy board and code show brown. The production sheet is green with orange
  trim, and the owner has accepted green.
- **Expressions shown:** Excited, Curious, Happy, Thinking, Surprised, Try-Again (a wink with a raised
  fist, confident).
- **Spikes:** orange-red in the render (measured about `#F74A04`). LOCKED says orange, and the
  semantic identity is "orange dorsal spikes" (SPEC-LOCKED). No hex is locked. The final palette must
  read clearly orange.
- **Backpack color (RESOLVED):** a green backpack is acceptable (owner, October 12, 2026). The
  one-backpack rule is unchanged.
- **Scale:** 0.90 on 07. Dino is the third smallest of the six (after Tarsier and Koala).
