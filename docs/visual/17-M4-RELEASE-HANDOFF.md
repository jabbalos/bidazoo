# 17 — M4 Release Handoff (BidaZoo World Expedition visual production)

Authoritative continuation handoff for the next Agent B chat. Product name: **BidaZoo World Expedition**.
Written at the M1–M3 boundary, 2026-10-13. Repository/docs outrank old chat history if they conflict.

## 1. Source of truth

| Item | Value |
| --- | --- |
| Repository | BidaZoo (main clone `C:\Users\jonat\Documents\BidaZoo`) |
| Worktree | `C:\Users\jonat\Documents\BidaZoo-World-Expedition` (gitdir `C:/Users/jonat/Documents/BidaZoo/.git/worktrees/BidaZoo-World-Expedition`) |
| Branch | `feature/world-expedition-visuals` (per workstream record; verify) |
| HEAD / upstream | **NOT RECORDED by the authoring session** (it has no shell or git access). The next Agent B must run Step-1 preflight and record the real values below before relying on this document. |
| Git status | Not run by the authoring session. Known from the file system and workstream record: see "Known uncommitted work" below. |

Verify first: `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref @{u}`, `git status --short`, `git diff --cached --name-only`.

Rules: `production-v1/` is **immutable**. `production-v1.1/` is the correction/release-candidate integration area and may hold intentional uncommitted work. Do not reset, clean, stash, restore or overwrite it.

### Known uncommitted work (verify with git status)

- `.gitattributes` — modified, intentionally uncommitted (LFS rules for `production-v1/*.png` and `production-v1.1/*.png`). Do not commit unless part of an approved release change.
- `docs/reference-art/world-expedition/production-v1.1/` — intentionally uncommitted (see section 9).
- `docs/visual/16-character-art-production-plan.md` — edited in this workstream: cast-factor values only (7 lines, 11 values). Isolated change; do not mix with the M4 docs sync.
- `docs/visual/17-M4-RELEASE-HANDOFF.md` — this file (new).
- `docs/reference-art/world-expedition/production-v1.1/_m4-handoff-staging/` — temporary handoff staging (new, not to be committed as-is; see section 10).

## 2. M1 — Expressions — CLOSED

36 / 36 canonical states exist (IDLE, HAPPY, THINKING, CHEER, DISCOVER, TRY AGAIN × Click, Dino, Koala, Tarsier, Eagle, Bronco).
PASS 32 · OWNER-ACCEPTED MINOR 4 · REJECT 0 · MISSING 0.

Owner-accepted minors: Eagle THINKING (small pale shoulder notch, lower-left); Eagle TRY AGAIN (same notch); Koala CHEER (width accepted under renderer fit/tolerance policy); Bronco CHEER (ragged left hat tip, fist partly cropped at bottom).

Expression art is FROZEN. No further expression polishing. Tarsier TRY AGAIN is accepted. Eagle edge/brow polishing is finished. The five frozen IDLE assets were hash-identical at last verification (sha256, from `idle-review-3`):

| IDLE | sha256 |
| --- | --- |
| click | `71432a630f4346e7bc7fd1298a8c6a6a788736c5ccaf05d3da7e489beb20e726` |
| tarsier | `dace8b6cc79e4be0c869807ecb6ae5158b8221094547545f7e958bcc544da2f0` |
| dino | `95aa9a23772dbf312408f4c4e0d4e0097dd512a46bd7c9bd2762b9817e217f76` |
| bronco | `950796e5799ed3d02c4a330b45aa96fddcf7d70e5bc1c7f3725c883b57a777c0` |
| eagle | `2a35baf058d0f3ad7b5f0f4918fbbc2ebc08b5e521e758ee7049a7f2d6a1a78a` |

Koala IDLE = Calm cell; Koala THINKING = Analytical (canonical). Dino IDLE is a head-only crop (accepted). Bronco CHEER may obscure the hat star/band.

## 3. M2 — Canonical asset library — CLOSED

Library totals: PASS 70 · OWNER-ACCEPTED MINOR 8 · PROVISIONAL 20 · NEEDS CONTROLLED EDIT 1 · REJECT 0.

OWNER-ACCEPTED MINOR: Koala 3/4 turnaround, Koala glasses, Koala head, Bronco head, Bronco hero, Dino head, Tarsier hero, Eagle hero. The Koala SIDE turnaround reject was repaired and now PASSES.

`koala_hero_overview` (NEEDS CONTROLLED EDIT) is DEFERRED / SUPPLEMENTAL, not used by any canonical slot. Canonical Koala hero is `koala_hero_reading`. It does not block M2 or M4.

Provisional silhouette state: the 18 library silhouettes are historical flat-sheet artwork (Click 3, Dino 5, Eagle 5, Koala 5, Tarsier 1 unverified-ID `silhouette_34_or_back_UNVERIFIED`), plus `tarsier_head_panel_alt` (alternate head, PROVISIONAL, clipped ears). They are not final canonical silhouette authority. M4 derives canonical silhouettes from approved matted alpha.

## 4. M3 — Deterministic renderer — CLOSED

Renderer failures 2 → 0. All six sheets render deterministically; repeat renders are byte-identical. No locked template defect found.

Fixes and policies:
- Bronco CHEER overflow was a stale hand-set core-box override (sized for an old 251 px asset), not oversized art.
- Stale manifest file hashes were regenerated. The renderer now ignores an override box outside its asset.
- 1 px numerical width tolerance.
- A small expression width overflow may use a uniform proportional fit-down of the whole asset. Never squash X independently; never crop critical features to satisfy a box.
- Short busts are valid; vertical empty space in a portrait is fine; judge placement by head/face scale and eye line. Expression cells are not cast-scale authority.
- All 36 current expressions render with fit factor 1.0. Fit-down was tested separately on scratch data.
- Pipeline order after any asset change: `make_real_manifests` → `derive_core_boxes` → `make_v2_manifests` → `run_all` → `check_consistency`.

Authoritative cast factors (turnaround/proportion presentation only): Eagle 1.000 · Click 0.92 · Bronco 0.92 · Dino 0.85 · Koala 0.76 · Tarsier 0.57. Doc 16 already carries these values; docs 08 and 15 do not (see section 11-J).

## 5. Locked character identity

- **Click** — orange/tan kangaroo, HOST & GUIDE, NOT SELECTABLE.
- Selectable starters exactly: Dino, Koala, Tarsier, Eagle, Bronco. Character selection never alters academic difficulty, grading, mastery, XP, coins or learning progression.
- **Dino** — teal, orange dorsal spikes, exactly one explorer backpack.
- **Koala** — gray-lavender scholar, book/academic identity, no backpack. Canonical glasses frames for M4: dark charcoal / near-black.
- **Tarsier** — smallest cast member, huge eyes, goggles, scout/discovery.
- **Eagle** — clearly WHITE-HEADED, blue eyes, brown wings, green varsity jacket, prominent original white A, yellow beak, orange/yellow feet.
- **Bronco** — athletic horse/bronco, cowboy hat may remain, MAROON bandana; red star/gear accents stay separate from the bandana.

## 6. Canonical character-sheet template

Authority: `docs/visual/15-character-sheet-template.md`. Canvas 1448 × 1086. Architecture is CLOSED unless real production output proves a structural defect. Expressions exactly IDLE, HAPPY, THINKING, CHEER, DISCOVER, TRY AGAIN. Final typography: Nunito Sans. No Poppins in final production output.

## 7. M4 owner decisions already made

- **A. OWNER-ACCEPTED MINOR** renders exactly like READY (no provisional/warning badge); metadata keeps `OWNER-ACCEPTED MINOR` for audit. (Renderer already maps it this way; confirm.)
- **B. Koala glasses**: canonical frames dark charcoal / near-black. Correct only the glasses detail asset; preserve geometry, lens shape, highlights; use approved Koala art as color authority; do not broadly recolor other Koala assets.
- **C. Silhouettes**: do not promote historical flat-sheet silhouettes. Derive deterministically from approved matted alpha (standing = approved turnarounds; action = approved hero/action asset where appropriate). Preserve ears, tails, wings, hats, crests, backpacks. Historical silhouettes are for comparison/QA only.
- **D. LOGO_ASSET** is missing. M4 may create ONE reusable clean transparent master by controlled reconstruction of the existing approved BidaZoo World Expedition logo. Not a redesign: no change to product wording, brand identity or mark/text relationship. Prefer SVG master + transparent PNG; a clean transparent raster master is acceptable.
- **E. `koala_hero_overview`** is deferred/supplemental; use `koala_hero_reading`.

## 8. Do not reopen

- `docs/reference-art/world-expedition/production-v1/` — IMMUTABLE.
- Frozen M1 expressions and the five frozen IDLE assets.
- Frozen composite/reference art (00, 05, 07, 08) except the single final M4 composite pass.
- Do not restart: expression design, Eagle eyebrow polishing, Tarsier TRY AGAIN semantic exploration, character identity redesign, template architecture.

## 9. Current `production-v1.1` inventory (file system, listed 2026-10-13)

Path: `docs/reference-art/world-expedition/production-v1.1/`

| File | Bytes | Role |
| --- | --- | --- |
| `00_Master_Overview.png` | 2,869,653 | Master overview composite (Eagle white head swapped in; frozen until final pass) |
| `05_Eagle_Character_Sheet.png` | 2,667,313 | Corrected Eagle sheet (approved, frozen; source of Eagle library/expressions) |
| `06_Bronco_Character_Sheet.png` | 2,782,156 | Bronco sheet with maroon bandana (source of Bronco library/expressions) |
| `07_Expressions_Proportions_Palettes.png` | 2,501,827 | Expressions/proportions/palettes composite (frozen until final pass) |
| `08_UI_and_Phaser_Asset_Spec.png` | 2,544,293 | UI/Phaser spec composite (frozen until final pass) |
| `EAGLE-EDIT-SOURCES.md` | 3,091 | Eagle edit sources and instance boxes |
| `README.md` | 4,128 | v1.1 status README. **STALE**: still says "Eagle corrections pending" and carries INTERIM hashes. Rewrite at M4; do not rely on its hashes. |

Tracked/untracked state per file: not verified by the authoring session (no git); the folder is understood to be wholly uncommitted. There is no v1.1 manifest in the worktree. The renderer, asset library and expression assets are preserved only in `_m4-handoff-staging/` (section 10), which is uncommitted. `production-v1.1/*.png` is covered by an LFS rule in the uncommitted `.gitattributes`. No final release hashes have been generated.

## 10. Persisted continuation artifacts and old-session locations

SOURCE OF TRUTH (repo): `docs/visual/*.md` (esp. 07, 15, 16, 17), `production-v1/`, `production-v1.1/` (above), `docs/CHARACTER-BIBLE.md`.

PERSISTED HANDOFF STAGING (in the worktree, TEMPORARY): `docs/reference-art/world-expedition/production-v1.1/_m4-handoff-staging/`

The important M1–M3 continuation artifacts were persisted there before the old session ended: `expressions/` (36 final canonical states + per-state reports with core_box), `library/` (99 assets + 6 manifests), `renderer/` (code, checker, rules doc, manifests, latest six sheets), `qa/` (check/determinism reports, final expression matrix, QA summary, library status summary, tools), plus `INVENTORY.md` and `SHA256SUMS.txt`. Read `INVENTORY.md` first (it also documents the path mapping needed to re-render: `library/` ↔ `asset-library/`, `expressions/` ↔ `expression-batch/`).

- This directory is TEMPORARY handoff material. It is not part of the production-v1.1 release unless promoted.
- The fresh M4 lead must consume it, promote only the final required assets to their proper canonical locations, and remove the temporary staging directory before the final M4 release commit. Do not stage or commit it as-is.
- Nothing in the staging directory is release-approved merely because it was preserved. Statuses (PASS, OWNER-ACCEPTED MINOR, PROVISIONAL) are as recorded in sections 2–3.
- Files were copied byte-for-byte; verify with `SHA256SUMS.txt`. Frozen IDLE hashes are in section 2.
- Old cloud-session paths (`/mnt/user-data/outputs/...`) no longer exist after the session ends and must not be relied on.

## 11. Exact M4 remaining work

A. Correct/freeze Koala glasses detail (dark charcoal frames).
B. Derive canonical silhouettes from approved alpha assets.
C. Produce/QA reusable LOGO_ASSET.
D. Complete palette semantics/swatches (six slots per sheet; open swatches remain on all six).
E. Wire final approved assets into manifests.
F. Render all six canonical character sheets.
G. Deterministic repeat-render verification.
H. Final six-sheet QA.
I. ONE final composite update pass for 00 / 07 / 08.
J. Docs-only synchronization for 08 / 15 / 16 as applicable (08 factor table and 07 printed readings; 15 section 6 "k = 1.00 reference" wording, section 7 R = 168, line about PROVISIONAL factors).
K. Finalize README / release manifest.
L. Generate final SHA-256 hashes.
M. Verify Git LFS rules / pointers.
N. Produce release-candidate report.
O. STOP for owner approval before the final release commit/push unless specifically authorized.

NO PHASER INTEGRATION DURING M4.

## 12. M4 final QA gate

Six sheets must verify: correct identity; correct role tag; exactly five selectable starters; Click remains HOST & GUIDE / NOT SELECTABLE; correct cast-relative turnaround scale; all six canonical expressions; no missing placeholders; correct four detail cells; correct six palette slots; canonical reusable logo; Nunito Sans; no Poppins leftovers; no visible halo/fringe at intended display size; no clipped critical features; no unintended provisional badges on approved art; OWNER-ACCEPTED MINOR renders normally; repeat renders byte-identical.

Known renderer open items: Nunito Sans was not installed in the session (DejaVu used in dev renders) — install/provide the font; template fixed strings `MISSING / TO AUTHOR` and `CHARACTER-SPECIFIC` did not fit their boxes (logged as `template_defects`); `S0`/reference height is a renderer choice (not defined in the docs).

## 13. Release-candidate report format

Next Agent B returns: M1 CLOSED; M2 CLOSED (deferred supplemental items listed separately); M3 CLOSED, determinism verified; M4: logo, silhouette, palette, manifest status; six canonical sheets; QA result; composites 00/07/08 status; docs status; README status; SHA-256 status; LFS status. OWNER EXCEPTIONS: genuine blockers only. PROPOSED COMMIT: exact files.
