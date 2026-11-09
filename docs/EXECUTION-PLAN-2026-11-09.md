# BidaZoo World Expedition: Execution Plan for Claude

Nov 8, 2026 · @Jabba

## Executive summary (Monday, November 9, 2026, 5:48 AM)

Both bake-off contestants report their work committed. No winner is decided: scoring, cross-vendor reviews and end usage are still to run. Each contestant had one owner intervention, the same approval for the same test.

### Timeline (Central time)

| When | Event |
| --- | --- |
| Nov 8, 9:31 PM | Setup scripts delivered; `1-prepare-base` created `bakeoff/base` from `main` at `b61ad9c` with the revised proposal (`5832a7d`) |
| 9:48 PM | Gemini's read-only review of the contracts commit found `encounter-model.ts` and `session-client.ts` fully implemented (the A1 and A3 tasks) instead of stubbed |
| 9:57 PM | Contracts rebuilt as one stub-only commit; owner approved the `contracts-boundary.test.ts` shape update and `submitAnswer(choice: number \| string)`; Gemini re-review: no findings |
| \~10:06 PM | Old full-code commits removed from history (`reflog expire` and `gc`) |
| 10:03–10:05 PM | `2-create-worktrees` created both worktrees, ports and a separate PostgreSQL on 54330 |
| 10:17–10:38 PM | First dry run failed after 11 of 24 browser tests; cause: the bake-off database stopped when its console window closed. Restarted in a hidden window; both worktrees passed all checks |
| 10:40 PM | Start usage: Claude weekly 10%; Gemini window 3% (reset 11:35 PM), weekly 8% |
| \~10:42 PM | Both contestants started (Claude Opus 5.5; Gemini 4 Argon, medium) |
| \~10:50 PM | Both switched to auto mode |
| \~11:05 PM / 11:12 PM | Claude STOP (rule 12) on `character-expression.test.ts`; owner reply sent |
| \~11:13 PM / 11:14 PM | Gemini STOP on the same test; identical owner reply sent |
| by Nov 9, 5:46 AM | Both report work committed. Claude (from 3-score): 5 commits, first 10:49:07 PM, last 11:27:28 PM, 7 files changed, REPORT.md committed, no STOP.md. Gemini final commit a7488d0; its times and any usage pause are not yet recorded |

### Issues found

| Issue | Cause | Status |
| --- | --- | --- |
| Contracts commit implemented A1 and A3 | Contracts agent exceeded "stub implementations"; its report called them stubs | Fixed: rebuilt as stubs, history cleared |
| Repo proposal lacked section 2.6 | Repo held an older revision | Fixed: revised proposal is the first commit on `bakeoff/base` |
| Section 10 table row broke | Unescaped pipe in `number \| string` | Fixed by amend |
| Draft briefs' test commands would skip database tests | `npx vitest` without `TEST_DATABASE_URL` | Fixed: one `.bake\check.ps1` for both contestants |
| Script 2 reported a false database-start failure | PowerShell 5.1 lost `pg_ctl`'s exit code | Patched on the studio PC |
| Database stopped mid-test | Started inside the script's console window | Worked around (hidden window). `2-create-worktrees.ps1` still needs `-WindowStyle Hidden` for future runs |
| Zip unpacked into a nested folder | Zip contains its own top folder | Fixed by moving files |
| Existing test blocked A3 | `character-expression.test.ts` scans `RunScene.ts` for the submit call A3 moves | Owner approved a narrow update for both contestants |

### Next steps

3-score result (Monday, November 9, 2026, 6:01 AM): both entries passed every automated check (typecheck, Vitest with database, 24/24 `play.spec.ts`), branch safety clean. The only flagged item on each was the owner-approved edit to `character-expression.test.ts`; both edits are within the approval, so required checks pass for both. Each edit drops the old literal check that RunScene starts `zoo-sprint` multiplication (one Low finding each). Claude also tightened the start-call check (exactly one call, exact payload, no character words); Gemini kept the original assertion form.

| Entry | Commits | First commit | Last commit | Working time from 10:42 PM, minus STOP wait |
| --- | --- | --- | --- | --- |
| Claude | 5 | 10:49:07 PM | 11:27:28 PM | about 38 min |
| Gemini | 6 | 11:01:05 PM | 11:42:04 PM | about 59 min |

Cross-vendor reviews (Monday, November 9, 2026, about 6:30 AM): Gemini reviewing \`bake/claude\`: 0 High, 0 Medium, 3 Low (text answers throw instead of forwarding; start-call literal check dropped; unused exports and getter). Claude reviewing \`bake/gemini\`: 1 High, 2 Medium, 6 Low. High: \`replayExpedition\` runs each encounter until won or lost instead of a fixed 2 answers per node and 5 for the boss, which breaks the 15-question run and makes the server's stamp depend on answer alignment (its own test uses a 19-answer sequence). Medium: text answer sent while the contract's \`response\` is still integer; RunScene resync now issues an extra start-session call. Owner check (6:34 AM): Gemini's own test replays \`000 11 1000 11 011 11011\`, 19 answers with nodes of 3 and 4 answers, confirming the High finding. Result: Claude wins the bake-off by the decision rule (fewest findings among entries passing required checks; also faster). \`bake/claude\` becomes \`lane/encounters\`; per §4, Claude runs Lanes A to D and Gemini reviews. Reviewer depth differed (9 findings versus 3), which is noted as a limit of cross-vendor review.

Cost is not comparable: both plans reset before end usage was captured (Claude also changed from Ultra to Max). Gemini's figures are its own estimate (about 1.1M to 1.3M input tokens, about 90% cached; 22,000 to 28,000 output tokens), not a measurement. Claude's own estimate: about 50 model calls, 3 to 4 million input tokens (mostly cached), 35,000 to 50,000 output tokens; also not a measurement. Claude's measured session tokens can be read on the studio PC with `npx ccusage@latest session`. Cost is recorded, not scored.

Gemini measured usage, from its own session transcript (bake-off steps 1 to 144, final commit `a7488d0`): 58 model turns; 298,564 uncached input + 9,075,179 cached = 9,373,743 input tokens (96.8% cached); 87,765 output tokens; peak context 254,958. Its earlier self-estimate was about 7 times low on input. When asked how to determine actual usage, Gemini read its own transcript and reported measured counts; Claude reported estimates and pointed to a command. Claude measured usage, from Claude Code's session usage panel (whole session, including a few post-run questions): Opus 5.5 1.4k uncached input + 6.1M cache read + 239.1k cache write = about 6.34M input tokens, 53.0k output tokens; Haiku 5.5 1.2k input, 27 output; $4.19 at API list price; 986 lines added, 73 removed; API time 8m 23s, wall time 7h 16m 51s (session left open). Token counts are not directly comparable across vendors because their tokenizers differ. Claude's transcripts give 51 model turns, 110 uncached input + 236,523 cache write + 5,363,137 cache read = 5,599,770 input tokens, and 52,738 output tokens. The panel's 6.1M cache read is about 0.74M higher; the panel covers the whole session, and the gap is consistent with the post-run question turns or a sub-agent log stored elsewhere (not verified). Transcripts are in `.claude\projects`.

1. End usage screenshots (Claude and Gemini).
2. `3-score.bat`; the approved `character-expression.test.ts` change is expected in its output.
3. Both `REPORT.md` files.
4. Cross-vendor reviews: Gemini reviews `bake/claude`, Claude reviews `bake/gemini`.
5. Fill the score table; winner's branch becomes `lane/encounters`; remove the other worktree.
6. Before day 2 of the build: check that Checkpoint E is merged (proposal 2.5).

Related: the coming-soon video plan (separate doc) waits on the owner's photo and reference confirmation.

## Purpose

Model choice for this build is decided by a measured day-1 bake-off on this repository, not by vendor. This plan governs how `docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md` (five workspaces, four-day critical path) is executed.

It does not change the proposal's scope, architecture, interfaces (§2.6) or work items (Appendix A). It adds corrections, model selection, an integration design, agent rules and stop conditions. Where evidence is thin, this plan says so.

## Corrections to the proposal before day 1

Ten items in the proposal conflict with each other or rest on an unverified assumption. Each is resolved in the hour-1 commit or by an owner decision (§7 of this plan).

| # | Proposal location | Issue | Resolution |
| --- | --- | --- | --- |
| 1 | §3 Lane B header; content "days 4 to 6"; destinations "days 8 to 10" | Left over from the 14-day version | Delete; §4.4 governs |
| 2 | §4.2, §5 rule 4 ("three worktrees"); §6 ("four worktrees") | §7 defines five workspaces | Read as five workspaces, three e2e shards |
| 3 | §3 Lane B (OpenArt) vs §4.4 and §7 (ComfyUI) | Art pipeline named two ways | Resolved: ComfyUI |
| 4 | §2.6 item 3 vs §4.1 and §7 | `overlays.ts` written by Integration or by Lane B | Integration writes the stub in the hour-1 commit; Lane B owns it after |
| 5 | §2.6 items 4 and 5 | Lane C edits `contracts/src/index.ts`, which Lane D owns | Hour-1 commit includes `export * from './progress'` |
| 6 | §3 C7 | Assumes the Checkpoint E flag is in `390e0b4`; E was developed on `checkpoint-e-identity` | Verify ancestry before day 2. If absent, C7 and C8 leave scope and the beta ships guest-only |
| 7 | §3 A4 | What the client submits when the timer expires is undefined | Resolved: stamp at 3 of 5 beacons lit |
| 8 | §3 C2 | A stamp is written on any completed session, including 0 of 5 beacons | Resolved: display only, no penalty |
| 9 | §5 rule 6 | Conflicts with the standing rule that visual work states its references and waits for confirmation | Rule 13 of this plan |
| 10 | §4.3 | 20 productive hours per workspace-day is not measured; the only measured item is a 15-line change at 2.5 hours | Re-derive at end of day 1 (§5 of this plan) |

## Lane D source: the Hop Quest bank

The bank is 1,800 items (900 math, 900 reading, grades K to 8) in the `jabbalos/hopquest` repository. Only 346 of them fit the proposal's question shape (§2.6 item 5) as written. Reviewed at commit `1cc87d8` (Thursday, October 15, 2026), the last commit to touch the bank.

### Location

| What | Where |
| --- | --- |
| Source of truth (read-only for Lane D) | `github.com/jabbalos/hopquest`, folder `apps/hop-quest/bank/` |
| Files | `bank-math-gK.js` to `bank-math-g8.js` and `bank-reading-gK.js` to `bank-reading-g8.js` (18 files, about 1.7 MB) |
| Copy on the studio PC | `Documents\Hop-Quest\bank\` (the live Hop Quest install; the proposal's path) |
| Math authoring sources | `content/math-src/math-g<K-8>.p<1-4>.json`, compiled into the bank by `tools/compile-math.js` |
| Skill and TEKS map | `tools/skillmap.json` (grade, domain, skill, TEKS codes, item count) |
| Reference loader and grading rules | `apps/hop-quest/lib/bank.js` |
| Bank audit | `node tools/audit-bank.js` |

Lane D reads the bank and never writes to it: Hop Quest's own `AGENTS.md` makes its repository the source of truth, and its live site wins over any copy.

### Format

Each file is a script: `window.HQ_BANK.push({...})`. The JSON inside is `{ subject, grade, passages[], items[] }`, with kindergarten as grade `0`. `lib/bank.js` shows the parse: the text between `.push(` and the last `)`.

Item fields: `id`, `domain`, `skill`, `teks`, `difficulty`, `type`, `stem`, `choices`, `answer`, `distractors`, `rationale`, `strategy`, plus `figure` (math pictures) or `passageId` (reading).

**The files hold answers and explanations.** They stay server-side; nothing from them is bundled into the game client.

### Fit with the BidaZoo question shape

§2.6 item 5 allows four integer or four text choices. The bank splits as follows:

| Item kind | Math | Reading | Total |
| --- | --- | --- | --- |
| 4-choice, no picture or passage (fits as-is) | 156 | 190 | 346 |
| 4-choice with a passage (needs passage display) | 0 | 266 | 266 |
| 4-choice with a picture (needs figure rendering) | 199 | 0 | 199 |
| Other types: numeric, multi-select, sort, order | 545 | 444 | 989 |

Per type across both subjects: `mc` 1,060, `numeric` 231, `ms` 214, `sort` 162, `order` 133. Math pictures are drawn in code from `figure` objects (base-ten blocks, number lines and others), not image files. There are 78 reading passages.

D1 and D2 as estimated (6 and 4 hours) cover only the first row. The other rows are an owner decision (§7).

### Math scope for the 4-day build (approved Sunday, November 8, 2026)

Reading is out of the initial build. Import 196 math items: 156 that fit as written, plus 40 kindergarten and grade 1 items after a one-line contract change. The other 704 math items wait until after the beta.

| Math item kind | Grades | Items | 4-day build | Reason |
| --- | --- | --- | --- | --- |
| 4-choice, no picture | 2 to 8 (18 to 28 per grade) | 156 | Import | Fits §2.6 item 5 as written |
| 3-choice, no picture | K and 1 | 40 | Import | Needs `choices` to allow 3 or 4 entries; change made in the hour-1 contracts commit |
| Multiple choice with a picture | K to 8 | 273 | Defer | Pictures come from `figure` specs drawn by `site/js/figures.js` (602 lines, 38 kinds); porting to Phaser is new Lane A work |
| Typed answer (`numeric`) | K to 8 | 231 | Defer | Four tiles need wrong choices, which these items do not have; generated ones could be wrong |
| Multi-select, sort, order | K to 8 | 200 | Defer | No encounter UI for these types |

**Lane D work:** D1 drops from 6 to about 4 hours. The importer reads the nine `bank-math-g*.js` files. It converts `answer` (a choice index) to the server's answer key and keeps `grade`, `domain`, `skill` and `teks` as skill keys. It keeps `rationale` server-side for the summit card. D2 (reading) leaves this build.

**Pool depth:** one expedition asks 15 questions (five encounters of two, plus a boss of five). With 18 to 28 imported items per grade, a child sees repeats from the second run. The existing multiplication generator in `learning-core` has no fixed pool, so runs mix imported items with generated multiplication. The approved mix is 60% generated and 40% imported (§7).

**First post-beta item:** the 273 picture items, the largest deferred group and the closest to the existing tile UI.

## Model selection

No public evidence decides Claude vs Gemini for this repository. A bake-off on Lane A's first two items decides it on day 1, at no cost to the critical path.

### What is known

- **Public benchmark.** On SWE-bench Verified (vals.ai run of September 1, 2026, since archived as saturated), Claude Opus 5 scored 97.0%, Gemini 3.8 Flash 80.0% and Claude Sonnet 5 79.6% ([vals.ai](https://www.vals.ai/benchmarks/swebench-2025-09-24)).
- **Limits of that evidence.** The benchmark is Python-only, frontier models can reproduce some of its reference patches ([Morph](https://www.morphllm.com/swe-bench-pro)), and scores vary by harness. The run predates current releases.
- **Gemini Argon.** No public score was found, and the model name is unverified. Confirm it in Antigravity's `/config`.
- **This repository (owner-reported).** Claude agents delivered Checkpoints A to E, the validator, and `390e0b4`. Claude's W1 Basecamp (November 5) was rejected for not matching approved art. A Sonnet agent directed by ChatGPT left nine unmerged branches (October 15). No Gemini work exists on this repository yet.
- **Test tampering.** Coding agents from several vendors have been measured editing or special-casing tests ([ImpossibleBench](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1); [EvilGenie](https://aitopics.org/doc/arxivorg:6279CFD4)). This is controlled by the rules in §6, not by vendor choice.

On this project, Claude's demonstrated weakness is visual fidelity to approved art; its demonstrated strength is code delivered against tests. Neither is evidence about Gemini.

### Day-1 bake-off

- **Task:** A3 (session-client extraction) and A1 (encounter model with Vitest tests). Estimate: 5 agent-hours.
- **Setup:** two worktrees from the same hour-1 SHA, with the same brief and the same rules (§6).
- **Contestants:** each vendor's Lane A model: Claude Opus 5.5 in Claude Code, and the proposal's Lane A Gemini model in Antigravity.
- **Required (pass/fail):** typecheck clean, Vitest green, `play.spec.ts` green in the worktree, §2.6 signatures unchanged, no existing test modified.
- **Scored:** findings from a cross-vendor reviewer (invented APIs, client-trusted rewards, unused code, contract drift), then wall-clock hours, then owner interventions.
- **Decision:** among entries that pass every required check, fewest findings wins; ties go to fewer hours. The winner's branch becomes `lane/encounters` and the other is discarded. The winning vendor takes Lanes A to D (§4). The result is recorded in `docs/PROJECT-STATE.md`.
- **If Gemini wins,** Claude's role is the hour-1 contracts and cross-vendor review only.
- **If both fail a required check,** stop for an architecture review before any lane continues.

## Bake-off runbook

Each vendor's Lane A model runs one 5-agent-hour task from the same commit. Scripts and a cross-vendor reviewer score the results. Owner time is about 75 minutes. Estimated Claude cost is $17 to $37 at API list price, capped at $50.

### Models

Each vendor enters the model it would assign to Lane A (top tier). Review always crosses vendors.

| Role | Model | Where |
| --- | --- | --- |
| Contracts commit (before the contest) | Claude Opus 5.5, standard mode | Claude Code, main repo folder |
| Contract review (before the contest) | The Gemini model | Antigravity, read-only |
| Contestant | Claude Opus 5.5, standard mode | Claude Code, `BidaZoo-bake-claude` |
| Contestant | `Gemini 4 Argon (Medium), Antigravity CLI 1.5.1, Google AI Pro plan, AI credits off` | Antigravity, `BidaZoo-bake-gemini` |
| Review of Claude's diff | The Gemini model, fresh session | Antigravity |
| Review of Gemini's diff | Claude Opus 5.5, fresh session | Claude Code |

Opus 5.5 fast mode stays off; it doubles the per-token price.

### Owner checklist

Before the contest (about 45 minutes):

1. Unzip the bake-off scripts to `C:\Users\jonat\Documents\BidaZoo-bakeoff`. The zip includes the current proposal file.
2. Run `1-prepare-base.bat`. It checks `main` is `b61ad9c` and clean, creates `bakeoff/base` and commits the proposal on it.
3. Start Claude Code (Opus 5.5) in `C:\Users\jonat\Documents\BidaZoo` with the contracts brief below. About 1 agent-hour.
4. Have Gemini review `bakeoff/base` against proposal §2.6, read-only. Resolve any finding before step 5.
5. Run `2-create-worktrees.bat`. It creates both worktrees, ports, databases, briefs, Claude permissions and the branch-safety snapshot.
6. Optional dry run: in each worktree, `powershell -NoProfile -ExecutionPolicy Bypass -File .bake\check.ps1` (the base code should pass).
7. In Antigravity (opened in the gemini worktree), set Agent Mode to `accept-edits` and match the effort level used for Claude.
8. Record the start time, Claude usage and Gemini plan usage.

During the contest (5 to 8 hours wall clock, owner time near zero):

9. Start both within 5 minutes of each other.
10. Reply only at a STOP. Each message you send counts as an intervention.

After the contest (about 30 minutes):

11. Run `3-score.bat`. It checks every changed file, test and contract integrity, runs each entry's checks, compares branches and worktrees, and saves `score-<date>.txt`.
12. Run the two cross-vendor reviews.
13. Record end usage and any usage-window pause, then fill the score table.
14. Merge the winner into `lane/encounters`. Remove the other worktree and branch (commands in the scripts' `README.txt`).

### Scripts

Three scripts in `Documents\BidaZoo-bakeoff` run as the normal user and never push, merge or delete branches. Logs, snapshots and scores stay in that folder.

| Script | Does |
| --- | --- |
| `1-prepare-base.bat` | Verifies `main` at `b61ad9c` and clean; creates `bakeoff/base`; commits the current proposal (refuses an older revision) |
| `2-create-worktrees.bat` | Requires the contracts on `bakeoff/base`; returns the origin folder to `main`; picks free port blocks (live listeners and Caddyfile checked); starts a separate PostgreSQL on 127.0.0.1:54330 (the validator's 54329 is untouched); creates both worktrees with `BAKEOFF-BRIEF.md`, `.bake\env.ps1`, `.bake\check.ps1`, `npm ci`; writes Claude Code permissions; saves the branch-safety snapshot |
| `3-score.bat` | Per entry: commits and times, every changed file against the write list, test and contract integrity, `REPORT.md`/`STOP.md`, a full check run. Then branch safety and origin cleanliness. Saves the score file and stops the bake-off PostgreSQL |

`.bake\check.ps1` is the one command both contestants use for done: typecheck, the full Vitest suite against the entry's own test database, and `play.spec.ts` against its own e2e database and ports. It prints `ALL CHECKS PASSED` or the failing step.

### Contracts brief (step 2)

```
Model: Claude Opus 5.5. Folder: C:\Users\jonat\Documents\BidaZoo. Branch: bakeoff/base (already created
by 1-prepare-base from main at b61ad9c, with the current proposal as its first commit). Do not push.
Read docs/PROPOSAL-WORLD-EXPEDITION-FAST-TRACK.md sections 2.6 and 10. If section 2.6 item 6 is missing,
stop and ask.
Write the six interface files of section 2.6 with stub implementations, exactly as specified, including:
- the overlays.ts stub (item 3) and `export * from './progress'` in packages/contracts/src/index.ts (item 4);
- item 5 with 3 or 4 choices (integers or strings);
- packages/learning-core/src/encounter/encounter-model.ts (item 6), exported from
  packages/learning-core/src/index.ts.
Add games/zoo-sprint/src/contracts.check.ts: type-level assertions on every 2.6 signature, so any
signature change fails `npm run typecheck`. Existing tests must stay green. Change nothing else.
Allowed git: status, diff, log, show, add, commit. Never push, switch, reset, rebase, merge, delete or
rename branches, or create worktrees.
The same check failing 3 times in a row: stop, write STOP.md, wait. End with REPORT.md (committed).
```

### Contestant brief (BAKEOFF-BRIEF.md)

`2-create-worktrees.bat` writes `BAKEOFF-BRIEF.md` into each worktree from `BAKEOFF-BRIEF.template.md` in the scripts folder, with that entry's folder, branch, ports and databases filled in. Both contestants get identical rules (18 numbered rules: location, task, git, files, tests, stops, done). Start each agent with one line:

```
Read BAKEOFF-BRIEF.md and follow it exactly.
```

### Stop rules

- **Three consecutive failures of the same check:** the agent stops and writes `STOP.md`. The owner may grant one resume with a one-line hint, logged as an intervention. A second STOP fails the entry.
- **8 hours wall clock** (1.6 times the 5-hour estimate): stop and score what exists.
- **Cost cap:** stop when Claude usage passes $50 at API list price, or when the Gemini Pro plan usage window is exhausted (AI credits are off, so no credits are spent). A contestant halted by its plan's usage window is paused, not failed; its wall-clock limit stops while paused, and the pause is recorded.
- **Any write outside the file list:** the entry fails.
- **Both entries fail:** the build stops for an architecture review.

### Score table

Starting usage, Sunday, November 8, 2026, about 10:40 PM Central: Claude weekly 10% (Fable 10%), resets Saturday 4:00 PM. Gemini Pro current window 3% (resets 11:35 PM), weekly 8% (resets November 11 at 4:35 PM). Both worktrees passed `.bake\check.ps1` on the base before the start.

Run settings: both agents started about 10:42 PM. From about 10:50 PM both ran in auto mode (Claude Code auto mode with the worktree deny list; Antigravity Agent Mode `auto`). Command approvals before the switch were given equally in both windows and are not counted as interventions.

STOP events: both agents stopped under rule 12 on the same existing test, `tests/integration/character-expression.test.ts` ("the answer sent to the API still has exactly attemptId, questionId and response"), which scans `RunScene.ts` for the submit call that A3 moves into `session-client.ts`. Claude stopped about 11:05 PM and got the reply about 11:12 PM; Gemini stopped about 11:13 PM and got the reply about 11:14 PM. Both received the identical owner-approved narrow change (same checks pointed at `session-client.ts`, plus an assertion that RunScene no longer submits directly). One intervention each. `3-score.bat` will list this test as changed; it is allowed if it matches the approved change.

| Criterion | Type | Claude | Gemini |
| --- | --- | --- | --- |
| Typecheck clean (signature check included) | Required |  |  |
| Vitest green | Required |  |  |
| `play.spec.ts` green | Required |  |  |
| No existing test modified or deleted | Required |  |  |
| No writes outside the file list | Required |  |  |
| Reviewer findings (count) | Scored, first |  |  |
| Wall-clock hours | Scored, second |  |  |
| Owner interventions (count) | Scored, third |  |  |
| Cost (Claude dollars; Gemini credits) | Recorded |  |  |

### Estimated Claude cost

| Item | Model | Estimate at API list price |
| --- | --- | --- |
| Contracts commit | Opus 5.5, about 1 hour | $3 to $6 |
| Contestant | Opus 5.5, about 5 hours | $13 to $29 |
| Review of Gemini's diff | Opus 5.5, one diff | $1 to $2 |
| **Total** |  | **$17 to $37 (cap $50)** |

Basis: Opus 5.5 list price is $4 per million input tokens, $20 per million output tokens and $0.20 per million cache reads ([Developers Digest](https://www.developersdigest.tech/models/claude-opus-5-5)). The estimate assumes 150 to 300 agent turns over an 80,000 to 120,000-token cached context. On a subscription, usage counts against plan limits rather than dollars, so these figures are a proxy; actual usage is read from Claude Code's usage display. Gemini runs on the Google AI Pro plan with AI credits off, so its cost is plan usage only; the owner records any usage-window pause.

## Roles and models

Build lanes go to the bake-off winner. Review always goes to the other vendor. Integration is a script, not an agent.

| Workspace | Assigned to | Basis |
| --- | --- | --- |
| Hour-1 contracts | Claude Opus 5.5; owner checks against §2.6 | §2.6 states the signatures exactly; this is transcription plus stubs |
| Integration | A script: merge, typecheck, Vitest, sharded e2e, revert on failure, post the log. Written in about 2 hours by any lane | Mechanical steps need no judgment |
| Lane A, Encounters | Bake-off winner, top tier | Critical gameplay |
| Lane B, Expedition | Winning vendor, mid tier | Pattern work over existing Basecamp code |
| Lane C, Progression | Winning vendor: top tier for C1, C3, C7; mid tier for the rest | C1, C3 and C7 cover migrations, coin debit and identity |
| Lane D, Content | Winning vendor, mid tier | Importer and mapping against a fixture |
| Reviewer | Opposite vendor to the builder, fresh context, diff only | Removes self-grading. Runs on every merge touching contracts, Lane C or the session client, and daily for the rest |
| Full validator and deploy | Owner triggers; the script runs `validate-studio.bat` and the deploy script | Proposal §5 rule 4 |

**Before the bake-off ends,** Lanes B, C and D start on the workspaces assigned in the proposal's §7 (the plan of record). If the bake-off result differs, they switch at their next item boundary.

**Conditions for Claude Code workspaces:** the Studio PC stays on; each worktree has pre-approved command permissions, or the session stalls at prompts; Opus usage limits may throttle concurrent Opus sessions, with mid tier as the fallback.

## Calendar

The target is the proposal's four-day critical path. The forecast is re-derived from measured hours at the end of day 1. By the proposal's own §4.5, the plan takes 4 days at 20 productive hours per workspace-day and 7 days at 10.

1. **Day 0 (owner, about 1 hour):** the decisions in §7, the Hop Quest bank folder, five worktrees, pre-approved permissions per worktree.
2. **Day 1, hour 1:** contracts commit (corrections 4 and 5 included), Checkpoint E ancestry check, integration script started.
3. **Day 1, hours 1 to 6:** bake-off on A3 and A1; Lanes B, C and D run their day-1 items.
4. **End of day 1:** bake-off result and actual-vs-estimated hours per item recorded in `docs/PROJECT-STATE.md`; calendar re-derived; full validator run.
5. **Day 2:** proposal §4.4 items; owner's 10-minute phone playtest.
6. **Day 3:** whole-loop Playwright, performance pass, playtest fix list.
7. **Day 4:** fix list only; clean unsharded validation on the release candidate; deploy on PASS and owner go.

If the day-1 re-derivation moves the date past day 4, the proposal's §4.5 scope cuts apply in order: C8 and D2 first (about one day), then C3 (half a day).

## Agent rules added to proposal §5

These rules apply to every workspace, whatever the vendor, and are numbered to follow the proposal's rules 1 to 8.

9. No changes to existing tests, snapshots or the validator without owner approval. A test that seems wrong is reported, not edited.
10. Three consecutive failures of the same check: stop and report with the log.
11. An API, file or function not found by search: stop and ask. Never create a stand-in.
12. Every merge request states files changed, commands run with their output, and assumptions made.
13. Visual work lists its reference files and waits for the owner's one-line confirmation. Challenger designs need owner approval.
14. §2.6 contract files change only through the integration workspace.
15. Read-only search across the repository is allowed. Writes go only to the lane's file list in proposal §7.
16. Logs stay on the Studio PC.

## Owner decisions and actions

Three product decisions block day 1. The rest are scheduled actions.

Decided Sunday, November 8, 2026:

| Decision | Choice | Applies to |
| --- | --- | --- |
| Timer expiry | Display only. When the timer runs out nothing happens: no heart lost, no grade, no skip | A4 |
| Stamp rule | At least 3 of 5 beacons lit earns the passport stamp (performance-tied, like a star rating) | C2, B4 summit card |
| Art pipeline | ComfyUI | B7, rule 13 |
| Lane D import scope | 196 math items: 156 four-choice (grades 2 to 8) and 40 three-choice (K and 1). Reading and the other 704 math items deferred until after the beta | D1, D3, A9 |
| Question mix | 60% generated multiplication, 40% imported Hop Quest, fixed in session generation: 6 generated and 4 imported per block of 10 questions, repeated (a 15-question expedition is 9 generated and 6 imported) | Session selection (Lane D) |

Gemini contestant: Gemini 4 Argon (Medium) in Antigravity CLI 1.5.1 on the Google AI Pro plan with AI credits off, confirmed Sunday, November 8, 2026. No credit cap is needed; plan usage is the only cost.

Open:

- [ ] Pre-approved command permissions set for each worktree
- [ ] Day 2: 10-minute phone playtest and fix list
- [ ] Day 4: approve `docs/COPY.md`; go or no-go on deploy

The Hop Quest bank needs no hand-off: Lane D reads it from `jabbalos/hopquest` or `Documents\Hop-Quest\bank\`.

## Stop conditions and Claude's limits

The build stops for an owner decision when any condition below is met. The listed limits are known constraints of Claude on this project.

### Stop conditions

- Day-1 measured hours are less than half of the Appendix A rate: re-plan with the owner using proposal §4.5.
- Both bake-off entries fail a required check: architecture review before any lane continues.
- The full validator fails two days in a row: no new features until it passes.
- A lane breaks a §2.6 signature or modifies an existing test: its merge is reverted and the lane reports.

### What Claude cannot do here

- Run Studio validation or deploy from claude.ai. That work runs only in Claude Code on the Studio PC.
- Run unattended through permission prompts that were not pre-approved.
- Guarantee several concurrent Opus sessions under usage limits.
- Judge visual match to approved art reliably (W1, November 5). The owner is the gate for visuals.

## Sources

- [vals.ai, SWE-bench Verified (archived, September 1, 2026)](https://www.vals.ai/benchmarks/swebench-2025-09-24)
- [Morph, SWE-Bench Pro analysis](https://www.morphllm.com/swe-bench-pro)
- [ImpossibleBench](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1)
- [EvilGenie](https://aitopics.org/doc/arxivorg:6279CFD4)
- [Antigravity CLI codelab](https://codelabs.developers.google.com/antigravity-cli-hands-on?authuser=1)
