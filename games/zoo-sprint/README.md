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
