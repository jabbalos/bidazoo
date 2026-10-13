# 04 Tarsier Production Sheet

Status: PROPOSED. Tags: LOCKED / CARRIED / PROPOSED / OPEN (see [00](00-master-direction.md)).

## Identity

| Trait | Tag |
| --- | --- |
| Small, agile silhouette | LOCKED |
| Large, expressive eyes | LOCKED |
| Scout / discovery personality | LOCKED |
| Goggles are part of the concept | LOCKED |

## Carried from the reference art (CARRIED)

The hood and clothing may remain because they preserve the scout identity.

- Very large round amber eyes with strong highlights.
- Yellow hooded jacket with goggles worn on the hood.
- Big, thin, rounded ears; small hands with long fingers; long thin tail.
- A low, gripping, climbing posture.

## Current transitional code (for reference)

`drawTarsier`: tan head scaled to 0.9, yellow scout vest, goggles pushed up on the forehead, huge
amber eyes, curled tail. Production follows the reference hood.

## Production notes (PROPOSED)

- **Silhouette signature.** The smallest overall body, with the largest eyes relative to the head.
  Big ears, a hood point, and a curled tail make it unmistakable at 48 px.
- **Eyes.** The eye is the character. Keep large highlights and room for a clear gaze direction.
  Eyes carry most of the expression in [07](07-expression-state-system.md).
- **Goggles.** Always visible, on the hood or forehead, with a lens color distinct from the eyes.
- **Agility.** Poses are crouched or mid-leap, never stiff. Tail balances the pose.
- **Scale.** The smallest starter. It must not be enlarged to match others in a lineup.

## Must not

- Lose the large eyes, goggles, or small agile build in any state.
- Shrink the eyes in `tryAgain`; the gaze softens, the eyes do not shrink.
- Look like a monkey or a lemur silhouette; keep the hood, big ears, and eye ratio.

## OPEN

Child-facing name beyond "Tarsier", voice or sound, animation set, alternate outfits.

## Ingestion findings (production sheet 04)

Source: `04_Tarsier_Character_Sheet.png`. Full catalog in [INGESTION-REPORT.md](INGESTION-REPORT.md).

- **Established by the render (CARRIED):** yellow hooded jacket with dark harness straps; aviator-style
  goggles with cyan lenses and a brown strap on the hood; a small explorer backpack (green with
  orange trim and a paw badge); binoculars in some poses.
- **Eyes:** the largest in the cast, with dark pupils, a thin amber ring, and multiple catchlights.
  The code uses amber irises. The render is darker.
- **Expressions shown:** Curious, Observant, Happy, Thinking, Surprised, Playful.
- **Scale:** 0.60 on 07, the smallest. The sheet says "1 head = body height (approx.)"; by eye the
  head is about 55 percent of height.
- **Note:** the Tarsier carries a backpack. No rule forbids it. Keep it distinct from Dino's single
  locked pack.

## Owner decision applied (October 12, 2026)

Preserve the approved character identity from the renders and the Bible (huge eyes, agile scout,
goggles, hood and jacket, small backpack as drawn). Tarsier is clearly the smallest character
(SPEC-LOCKED relative rule; exact numbers PROVISIONAL, see
[08](08-proportions-silhouettes.md)).
