# STOP: `.bake\check.ps1` failed 3 times in a row (Lane C, item C1)

The check: `cd "C:\Users\jonat\Documents\BidaZoo-lane-progression" && powershell -NoProfile -ExecutionPolicy Bypass -File .bake\check.ps1`
(default specs: play.spec.ts). Code under test: commit `0452d97` (C1) in all three runs.

## The 3 logs (in `.bake\logs\`, UTF-16)

| Run | Time (Central) | Result | Failing tests | Cause in the log |
| --- | --- | --- | --- | --- |
| 1 | 14:14 to 14:39 | typecheck, databases, vitest (36 files passed, 765 tests passed), migrate-e2e PASS; play-spec FAIL | play.spec.ts:311 (full run) and :388 (refresh mid-run), desktop | API: `Connection terminated due to connection timeout` in `createGuest` (pg pool on 127.0.0.1:54330); game shows `boot-error`. Log `20261109-141421-play-spec.log` |
| 2 | 14:40 to 16:28 | vitest FAIL, play-spec FAIL | Vitest: 18 tests in identity-guardian-auth (13), identity-security-constraints (4), identity-guest-claim-available (1). play.spec: same as run 1 | The same pg `connection timeout` errors in both logs; identity tests find no mail and hit timeouts. Run took 1 h 48 min. Logs `20261109-144021-vitest.log` and `20261109-144021-play-spec.log` |
| 3 | 16:28 to 17:14 | play-spec PASS (22 passed, 2 flaky); vitest FAIL | 6 integration tests in identity-pin (3), identity-security-leaks (2), identity-security-restart (1), and the PURE unit test learning-core `src/question.test.ts` (generateQuestion) | `Test timed out in 5000ms` / `30000ms`, `link request failed: 500`. Log `20261109-162844-vitest.log` |

`tests/integration/progress-expedition.test.ts`, the new C1 file, passed in all three runs. It never appears in a
failure list. No failing test touches the progress module, and the progress module is not registered in the API
(see the cross-lane change request), so the play.spec runs cannot reach C1 code.

## Hypothesis

Machine load, not C1. The failing set changes from run to run. Every failure is a timeout or a dropped
PostgreSQL connection on the shared server at 54330. Run 3 also timed out a pure learning-core unit test with no
database and no I/O. The runs overlapped the live-site outage and the other lanes' checks. Proposed next step:
rerun the check once the machine is quiet. I will not start another run until the orchestrator replies.
