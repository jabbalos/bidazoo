# @bidazoo/zoo-sprint

**Status: first playable slice (Checkpoint B) with the five-starter presentation (Checkpoint C).**
A Phaser 3 game: Boot -> Menu (choose Dino, Koala, Tarsier, Eagle, or Bronco; Start Run) -> Run
(question, four large answer buttons, feedback, the character hops forward) -> Results.

Structure: `roster.ts` (pure: ids, labels, default, saved choice) -> `characters.ts` (code-drawn
transitional art, one cached texture per character and mood, plus `Character` with idle, celebrate,
and wobble) -> scenes. Click, the future host, is deliberately not here. To swap in portraits or
spritesheets later, replace `ensureCharacterTexture`; scenes do not change.

This README describes `main`. On the runtime branch (`feature/world-expedition-runtime-integration`,
Checkpoints F1 to F6, closed) the characters use the production art with six expressions each, and
Click is integrated as the non-selectable host; that reaches `main` at release-candidate integration.

It talks to the platform **only** through `@bidazoo/game-sdk` (`BidaZooPlatform`). It never sees
cookies, tokens, SQL, or answer keys, and it never computes correctness, timing, XP, coins, or
mastery: it displays what the server returns. See [docs/GAME-SDK.md](../../docs/GAME-SDK.md).

## Production character art (F4: the whole cast)

Every cast member is drawn from six curated production expressions (`idle, happy, thinking, cheer, discover, tryAgain`): 36 files for Dino, Koala, Tarsier, Eagle, Bronco and Click. If any of one character's six textures is missing, that character falls back as a whole to the code-drawn art in `src/characters.ts` (Click, the host and guide, has no code-drawn art and is simply not drawn). Click has art but is **not selectable**: the starter menu, saved choice and server never see him. Cast-relative scale factors (Eagle 1.000, Click and Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57) are for turnaround and proportion guides; a bust is never resized by them.

| Piece | Where |
| --- | --- |
| Contract (ids, states, scale factors) | `src/character-definitions.ts` |
| Source mapping, runtime table, anchors, placement rule | `src/character-assets.ts` |
| Loading (Vite URLs, `HTMLImageElement` loader) | `src/character-art.ts`, `src/index.ts` |
| Runtime PNGs + `PROVENANCE.json` | `assets/world-expedition/characters/{dino,koala,tarsier,eagle,bronco,click}/` |

- The runtime PNGs are **byte-for-byte copies** of the canonical M4 files (`docs/reference-art/world-expedition/production-v1.1/expression-batch/{character}/`; Koala's THINKING is the canonical `koala_thinking_analytical.png`, shipped as `koala_thinking.png`), stored as normal Git blobs (not LFS). `PROVENANCE.json` records each file's canonical path and sha256; `tests/integration/character-runtime-assets.test.ts` verifies them for all six characters.
- Placement uses M4 metadata, not hand offsets: one scale per character (`head_scale`), head-core center on the horizontal anchor, eye line on the vertical anchor.
- Images load as same-origin `<img>` (`loader.imageLoadType: 'HTMLImageElement'`). Phaser's default XHR path creates `blob:` images that the client CSP (`img-src 'self' data:`) blocks; the CSP is unchanged.
- **Developer lab** (not in normal builds): `npm run build:character-lab -w @bidazoo/play`, then `npm run preview:character-lab -w @bidazoo/play` and open `/?character-lab` (options `cast=<dino|koala|tarsier|eagle|bronco|click>`, `state=<expression>`, `view=strip`, `guides=0`; keys 1-6, N, G). It never talks to the API.
