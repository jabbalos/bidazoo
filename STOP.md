# STOP: an existing test conflicts with item A3 (rule 12)

Stopped on Sunday, November 8, 2026, about 23:05 CST. Waiting for the owner. Nothing else will be
done until you reply.

## The check

`powershell -NoProfile -ExecutionPolicy Bypass -File .bake\check.ps1` (run started 22:51:35; logs in
`.bake\logs\20261108-225135-*.log`).

| Step | Result |
| --- | --- |
| typecheck | PASS |
| databases | PASS |
| vitest | **FAIL**: 1 failed, 758 passed, 3 todo (762). learning-core: 7 files, 88/88 passed. |
| migrate-e2e | PASS |
| play-spec | PASS: 24 passed (9.0m). The real gate run plays through RunScene on the session client. |

This is the first failure of this check, not the third. I stopped under rule 12 ("If a test seems
wrong, stop and report it in STOP.md"), not rule 14.

## The failing test

`tests/integration/character-expression.test.ts:216`, "the answer sent to the API still has exactly
attemptId, questionId and response":

```ts
const code = sceneCode('RunScene.ts');
const calls = [...code.matchAll(/submitAnswer\(([^;]*)\);/g)];
expect(calls).toHaveLength(1);
const argument = (calls[0] as RegExpMatchArray)[1] as string;
expect(argument).toContain('attemptId, questionId: question.id, response: choice');   // line 221 fails
```

Log excerpt (`20261108-225135-vitest.log`):

```
FAIL  integration/character-expression.test.ts > character expressions: presentation only (wiring) >
the answer sent to the API still has exactly attemptId, questionId and response
AssertionError: expected 'choice' to contain 'attemptId, questionId: question.id, response: choice'
Expected: "attemptId, questionId: question.id, response: choice"
Received: "choice"
 ❯ integration/character-expression.test.ts:221:22
Test Files  1 failed | 35 passed | 1 skipped (37)
     Tests  1 failed | 758 passed | 3 todo (762)
```

## Why this is a conflict, not a bug in my change

- The test reads the **source text of RunScene.ts** and requires the platform's
  `submitAnswer(sessionId, { attemptId, questionId: question.id, response: choice })` call to be written
  in that file.
- Item A3 (proposal section 3, Lane A, and 2.6 item 2) says to move exactly that call out of RunScene into
  `session-client.ts` "so RunScene and the encounter share one implementation". The fixed contract
  `SessionClient.submitAnswer(choice: number | string)` takes only the choice, so RunScene can no longer
  pass an attempt id or question id.
- The call now lives in `games/zoo-sprint/src/session-client.ts` (`PlaySessionClient.submitAnswer`), with
  exactly `{ attemptId, questionId: question.id, response: choice }`. What the test protects (the request
  carries no expression, character or mood data) still holds; only the file it looks in changed.
- The only way to make the test pass without changing it is to put a request built in RunScene back, or to
  write text into RunScene that matches the regex. The first undoes A3; the second is special-casing code
  to match a test (rule 13). I did neither.

## Hypothesis

The test was written before A3 existed and pins the call's location, not its behavior. It needs the
integration workspace to point it at `session-client.ts` (for example, scan that file for
`submitAnswer(session.id, { attemptId, questionId: question.id, response: choice })` and scan RunScene for
`this.client.submitAnswer(choice)`). Under rule 12 I may not change it.

## Options for the owner

1. **Update the test** (owner or integration workspace) to scan `session-client.ts` for the request
   shape. My branch then needs no change.
2. **Keep RunScene off the session client for now**: I revert only the RunScene part of commit `b7d85ef`;
   the session client and its tests stay. RunScene and the encounter would then not share one
   implementation until the test is updated.
3. Something else you prefer.

## State of the branch (bake/claude)

- `b7d85ef` A3: session client implementation; RunScene switched onto it (with
  `tests/integration/session-client.test.ts`, 12 tests, passing).
- `f3cbb05` A1: encounter model rules and Vitest tests
  (`packages/learning-core/src/encounter/encounter-model.test.ts`, 37 tests, passing).
- No existing test, snapshot, config or validator was modified. REPORT.md is not written yet (step 18
  comes after the checks pass).

Final line printed by the check: `CHECKS FAILED` (vitest is the only failing step).
