# Game SDK

Status: boundary defined, intentionally unimplemented (Checkpoint A).

`packages/game-sdk` establishes how an individual game and the BidaZoo platform talk to each
other. The goal is a boundary strong enough that a new game never needs to learn how the
platform works inside.

## The interface

```ts
interface BidaZooGame {
  start(config: GameConfig): Promise<GameSession>;
  submitAnswer(response: PlayerResponse): Promise<AnswerResult>;
  finish(): Promise<SessionResult>;
}
```

All types come from `@bidazoo/contracts` and are re-exported by the SDK. They are defined once,
so the API and every game agree by construction.

| Call | Meaning | Returns |
| --- | --- | --- |
| `start(config)` | Ask the platform to begin a play session for this game. | `GameSession`: a session id and the first `PublicQuestion`. |
| `submitAnswer(response)` | Submit the player's choice for the current question. | `AnswerResult`: whether it was correct, the revealed correct choice, rewards the server already committed, and the next question (or `null`). |
| `finish()` | Ask the platform to complete the session. | `SessionResult`: totals and rewards the server committed. |

Every call is a **request for a domain action**. Every result is a **fact the server already
decided**. The game's job is to present them: animate, play sound, move the camera.

## What a game must not know

A game never sees or depends on:

- database structure
- login internals
- how currency is stored
- how mastery is persisted
- subscription logic
- entitlement internals

If a game seems to need one of these, the platform is missing a domain action. Add the action;
do not widen the game's knowledge.

## What a game must not do

- Hold or compute the correct answer.
- Report its own score, XP, coins, or unlocks. There is no field for them in any request.
- Treat a `RewardGrant` as a suggestion. It is the committed outcome.

## What a game may own freely

Animation, camera, particles, sound, in-game menus, accessibility preferences, and temporary
visual effects. None of it is persisted by the platform or trusted by it.

## Open design questions (not decided)

- Whether `BidaZooGame` is implemented by the platform client the game receives, or by the game
  itself with the platform injected. Checkpoint A only fixes the method shapes.
- How a game declares required skills, difficulty, and session length.
- Error and retry semantics for network failures (the idempotency key is already in the contract).
- How games are loaded, packaged, and versioned.

## Testing a game against the boundary

When the SDK is implemented, it should ship an in-memory fake platform so a game can be tested
without a server, a database, or an account.
