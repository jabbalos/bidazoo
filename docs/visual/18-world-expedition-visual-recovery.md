# 18. World Expedition visual recovery

Presentation-only pass on branch `feature/world-expedition-visual-recovery`. No backend, API contract, schema,
progression, XP/coin, question, grading, mastery, identity or deployment change. The live build stays the
technical beta baseline.

## Why the first integration undershot

1. Characters were sized as a *square bust box* from the head core (`headScale x 0.62`), which at card/track sizes
   gave 50-100 px heads. The art is head-and-bust crops with a hard flat bottom edge, so it was never placed where a
   large crop could be hidden.
2. Backgrounds were flat jungle-green fills; no depth, no terraces, no light.
3. Layouts were the legacy prototype: a 2-column card grid on select, a progress track with a sticker on it in play.
4. The documented scale relationships existed in data but did not drive composition.
5. Source art is small (about 130-430 px wide), so large presentation needs deliberate upscaling and foreground
   pieces, not just bigger boxes.
6. The canvas is CSS-pixel based (no DPR resolution), so upscaled art and text were softer than they should be.

## What changed

- `computeHeroFit()` sizes a character to the space it is given (one uniform scale, same eye line, flat crop pushed
  below a foreground plate/card/ledge). `castPresence()` (factor^0.4) keeps Eagle > Bronco > Dino > Koala > Tarsier
  while still letting the smallest buddy read as a hero.
- Shared presentation layer under `games/zoo-sprint/src/presentation/`: responsive layout rules (stack vs split by
  screen shape), baked environment backdrops (sky, ridges, rice terraces, mist, lanterns), surfaces (parchment,
  timber, glossy buttons, ribbon, ledge), icons, hero stage, medallions, guide chip.
- Nunito Sans (OFL), self-hosted, loaded before first paint.
- Choose Your Buddy, gameplay and results rebuilt on that layer. Click is the host/guide only and has no hit target.
- Expressions: idle waiting/loading, discover on the first question, thinking while a question is open and while
  submitting, happy on correct, cheer on a streak of 3+, tryAgain on wrong (amber, never red), cheer/discover on results.

## Owner decisions still open

- Trait copy in `presentation/traits.ts` is proposed.
- `PRESENCE_EXPONENT` (how much the smallest buddies are enlarged).
- Voice preview: not built (no audio assets exist).
- Upscale softness (about 2-3.4x) until higher-resolution runtime art exists.
