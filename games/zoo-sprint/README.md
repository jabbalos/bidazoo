# @bidazoo/zoo-sprint

**Status: first playable slice (Checkpoint B) with the five-starter presentation (Checkpoint C).**
A Phaser 3 game: Boot -> Menu (choose Dino, Koala, Tarsier, Eagle, or Bronco; Start Run) -> Run
(question, four large answer buttons, feedback, the character hops forward) -> Results.

Structure: `roster.ts` (pure: ids, labels, default, saved choice) -> `characters.ts` (code-drawn
transitional art, one cached texture per character and mood, plus `Character` with idle, celebrate,
and wobble) -> scenes. Click, the future host, is deliberately not here. To swap in portraits or
spritesheets later, replace `ensureCharacterTexture`; scenes do not change.

It talks to the platform **only** through `@bidazoo/game-sdk` (`BidaZooPlatform`). It never sees
cookies, tokens, SQL, or answer keys, and it never computes correctness, timing, XP, coins, or
mastery: it displays what the server returns. See [docs/GAME-SDK.md](../../docs/GAME-SDK.md).

## Production character art (F3: Dino only)

Dino is drawn from six curated production expressions (`idle, happy, thinking, cheer, discover, tryAgain`); the other four starters still use the code-drawn art in `src/characters.ts`, which is also Dino's fallback if any of his six textures is missing.

| Piece | Where |
| --- | --- |
| Contract (ids, states, scale factors) | `src/character-definitions.ts` |
| Source mapping, runtime table, anchors, placement rule | `src/character-assets.ts` |
| Loading (Vite URLs, `HTMLImageElement` loader) | `src/character-art.ts`, `src/index.ts` |
| Runtime PNGs + `PROVENANCE.json` | `assets/world-expedition/characters/dino/` |

- The runtime PNGs are **byte-for-byte copies** of the canonical M4 files (`docs/reference-art/world-expedition/production-v1.1/expression-batch/dino/`), stored as normal Git blobs (not LFS). `PROVENANCE.json` records each file's canonical path and sha256; `tests/integration/dino-runtime-assets.test.ts` verifies them.
- Placement uses M4 metadata, not hand offsets: one scale per character (`head_scale`), head-core center on the horizontal anchor, eye line on the vertical anchor.
- Images load as same-origin `<img>` (`loader.imageLoadType: 'HTMLImageElement'`). Phaser's default XHR path creates `blob:` images that the client CSP (`img-src 'self' data:`) blocks; the CSP is unchanged.
- **Developer lab** (not in normal builds): `npm run build:character-lab -w @bidazoo/play`, then `npm run preview:character-lab -w @bidazoo/play` and open `/?character-lab` (options `state=<expression>`, `view=strip`, `guides=0`; keys 1-6, N, G). It never talks to the API.
