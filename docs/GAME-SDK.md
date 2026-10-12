# Game SDK

Status: implemented for the first game, Zoo Sprint (Checkpoint B). Still small on purpose.

`packages/game-sdk` is how an individual game and the BidaZoo platform talk to each other. The
goal is a boundary strong enough that a new game never needs to learn how the platform works
inside. It contains types and one small error class; it has no runtime dependencies beyond
`@bidazoo/contracts`.

## The interface

```ts
// What the platform offers a game. The shell supplies the implementation.
interface BidaZooPlatform {
  ensureGuest(): Promise<GuestResponse>;
  startSession(request: StartPlaySessionRequest): Promise<StartPlaySessionResponse>;
  getSession(sessionId: string): Promise<PlaySession>;
  nextQuestion(sessionId: string): Promise<QuestionResponse>;
  submitAnswer(sessionId: string, request: SubmitAnswerRequest): Promise<AnswerResult>;
}

// What a game package exports.
interface BidaZooGame {
  mount(options: { parent: HTMLElement; platform: BidaZooPlatform }): MountedGame; // { destroy() }
}
```

All data types come from `@bidazoo/contracts` and are re-exported by the SDK. They are defined
once (as TypeBox schemas), so the API and every game agree by construction.

| Call | Meaning | Returns |
| --- | --- | --- |
| `ensureGuest()` | Make sure this browser has a guest identity. | The player, the saved XP and coin totals, and `activeSessionId` (so a refresh can resume). |
| `startSession(req)` | Begin a run, or resume the one in progress (`resumed: true`). | The session, with its current question if one is outstanding. |
| `getSession(id)` | Re-read progress, for example after a refresh or a conflict. | The session (and its results once completed). |
| `nextQuestion(id)` | Ask for the next question, or the outstanding one unchanged. | A `PublicQuestion` and the session. **No answer information.** |
| `submitAnswer(id, req)` | Submit `{attemptId, questionId, response}`. | `AnswerResult`: correctness, the revealed answer, server-measured `responseMs`, rewards **already committed**, a mastery summary, new totals, and the updated session. |

Every call is a **request for a domain action**. Every result is a **fact the server already
decided**. The game's job is to present them: animate, play sound, move the camera.

### Error handling

A failed call throws `PlatformError` with `status` (0 for a network failure), a machine-readable
`code` (for example `question_already_answered`), and a fixed message. `isNetwork` is true for
status 0.

### Retries and the idempotency key

A game creates **one `attemptId` per question** and reuses it for every retry of that question.
The HTTP platform retries network failures (up to 3 times) with the same `attemptId`, which is
safe: the server returns the stored result with `replayed: true` instead of grading again. If the
server answers 409 `question_already_answered` or `session_not_active`, the game does not guess;
it calls `getSession` and resynchronizes.

### How the platform is supplied

`apps/play` implements `BidaZooPlatform` over `fetch` (`credentials: 'same-origin'`, JSON bodies,
the guest cookie handled entirely by the browser) and calls `zooSprint.mount({ parent, platform })`.
The game never touches cookies, tokens, URLs, or SQL. Tests can pass an in-memory platform.

## What a game must not know

A game never sees or depends on:

- database structure
- login internals (it never sees a token; the cookie is HttpOnly)
- how currency or XP are stored
- how mastery is persisted
- subscription logic
- entitlement internals

If a game seems to need one of these, the platform is missing a domain action. Add the action;
do not widen the game's knowledge.

## What a game must not do

- Hold or compute the correct answer.
- Report its own score, XP, coins, mastery, or timing. There is no field for them in any request.
- Treat a `RewardGrant` as a suggestion. It is the committed outcome; display it.
- Count animation time as response time. Timing belongs to the server; the game requests the
  next question *after* its feedback animation.

## What a game may own freely

Animation, camera, particles, sound, in-game menus, which character the player picked,
accessibility preferences, and temporary visual effects. None of it is persisted by the platform
or trusted by it. (Zoo Sprint keeps the chosen starter in `localStorage`; it is presentation only.)

## Zoo Sprint (the first game)

Scenes: **Boot** (guest handshake) -> **Menu** (choose one of five starters: Dino, Koala, Tarsier, Eagle, Bronco; Start Run) ->
**Run** (question, four large answer buttons, feedback, the character hops forward) ->
**Results** (shows the chosen starter). The starters are drawn in code (transitional art) behind
a small registry (`roster.ts`) and renderer (`characters.ts`); scenes never contain character
drawing or any grading logic. The menu is a responsive grid (about 2 columns on small phones,
vertical scroll allowed, more columns on larger screens). The game also exposes a hidden real-DOM
mirror (`#bz-a11y`) and data attributes on `#game` so that browser tests and screen readers can
read state; they never contain anything that is not already on screen.

## Open design questions (not decided)

- How a game declares required skills, difficulty, and session length (today the server fixes
  multiplication, ten questions).
- How games are loaded, packaged, and versioned, and whether a second game shares the shell.
- Whether the SDK should ship an in-memory fake platform (tests currently write their own).
- Streaming or push updates (not needed yet).
