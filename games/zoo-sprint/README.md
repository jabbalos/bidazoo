# @bidazoo/zoo-sprint

**Status: first playable slice (Checkpoint B).** A Phaser 3 game: Boot -> Menu (choose Panda,
Monkey, or Lion; Start Run) -> Run (question, four large answer buttons, feedback, the character
hops forward) -> Results. Graphics are placeholder primitives.

It talks to the platform **only** through `@bidazoo/game-sdk` (`BidaZooPlatform`). It never sees
cookies, tokens, SQL, or answer keys, and it never computes correctness, timing, XP, coins, or
mastery: it displays what the server returns. See [docs/GAME-SDK.md](../../docs/GAME-SDK.md).
