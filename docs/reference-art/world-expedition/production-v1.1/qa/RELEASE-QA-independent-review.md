# RELEASE QA - BidaZoo World Expedition production-v1.1 (release candidate)

Reviewer: independent QA, read-only on the release tree. Date: October 13, 2026.
P = `release-candidate/docs/reference-art/world-expedition/production-v1.1/`. Evidence crops: `qa-report/crops/`. Script: `qa-report/check_manifests.py`.
Housekeeping disclosure: running the documented rebuild and `validate_manifests.py` made Python write two `__pycache__` folders inside P (`renderer/`, `renderer/tools/`); I deleted them right away (nothing else in P was touched; build output went to `/tmp/wx-build`).

## Verdict summary
**NOT READY to tag as-is: 5 MUST FIX items, all housekeeping/wording/LFS, none is an art or pixel defect.** The art, renderer reproducibility, manifests, frozen IDLE assets, template geometry and typography all pass. One identity item (Eagle "white A") needs an owner decision.

## MUST FIX before release
1. **Git LFS rule is too narrow.** Worktree `.gitattributes` has `.../production-v1.1/*.png filter=lfs...`. In gitattributes `*` does not cross `/`, so only the 9 top-level PNGs (10.5 MB) match; the other **333 PNGs (64.7 MB: asset-library 276, expression-batch 36, library-qa 7, logo 6, qa 1, renderer 7; see table at the end)** would be committed as plain blobs. Needs `.../production-v1.1/**/*.png` (same for `production-v1`, whose rule has the same shape).
2. **README file table lists files that are not in P:** `INVENTORY.md`, `SHA256SUMS.txt`, `EAGLE-EDIT-SOURCES.md` (and "release QA" in `qa/` until this report is copied in). Docs 16 (s12 items 15/16, l.265) and 17 (l.3, l.118, l.150) also point to them. Either ship them or fix the README/docs. (SHA list must be generated after the final PNG write, and see NOTE N1 about caBX.)
3. **README line 29 claims an "original white A" on the Eagle. The A on every Eagle render is a gold/yellow block letter** (sheet 05 turnaround, hero, "Academy A patch" detail, composites 00/07/08). Doc 05 says the same ("The A is gold"). The locked brief wording says white. Owner must decide: correct README+brief to "gold" (cheap) or re-author the art. Also, the human look-alike review required by doc 05 is still not cleared for a green-and-gold block "A".
4. **Stale "candidate / promotion pending" statements about composites 00/07/08** (they are final and in P): doc 08 l.48-49, doc 15 l.665-666, doc 16 l.90 and l.456 (step 13 "PREPARED ... PENDING"), doc 17 l.148 (I). Doc 16 l.457-461 (steps 14-18) are legitimately owner/operator-pending but step 15/16 contradict README item 2 until the files exist.
5. **Doc 05 still says the Eagle correction is open:** "CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER" (l.67) and "On 07, TRY AGAIN reads stern" (l.74) with no note that production-v1.1 fixed both. Docs sync changed only the scale line of doc 05.

## NOTE (not blockers)
- **N1 caBX / hashes.** All 342 PNGs in P carry a C2PA `caBX` chunk (storage-layer stamp, different per file). Every sha256 in manifests, the frozen IDLE hashes and the expected sheet hashes are of the *stamped* bytes (132/132 match on disk; the pristine renderer hashes in `qa/determinism.txt` differ from the committed sheet bytes). If the files are re-stamped or copied through another path, those sha256 values break; only `qa/PIXELSUMS.txt` (six sheets) is stamp-proof. Recommend pixel hashes (or strip caBX) for the 101 library + 36 expression assets before generating SHA256SUMS.
- **N2** `renderer/tools/validate_manifests.py` crashes (`selftest/selftest.json` not shipped; `selftest/` is also referenced by `run_all.py` and the renderer README) and its glob (`manifests*`) never reaches `final-manifests/`. Direct jsonschema validation of final-manifests passes (below).
- **N3** `renderer/README.md` is ~85% M3 history (DejaVu fallback l.78, selftest, `manifests_real/`, "Eagle TRY AGAIN scowls" l.96); line 19 flags it as superseded. `renderer/manifests/*.json` reference missing `idle-review-3/` and `try-again-review/` paths (dead, dev-only; also `tools/make_example_manifests.py`, `make_stub_logo.py`).
- **N4** Sheet reports/build_report say `computed_sheet_status: "LAYOUT PROOF - NOT FINAL: 6 provisional slot(s)"` (palette hex = PROVISIONAL by rule); wording may confuse a reader of a "final" build.
- **N5** 139 `*_4bg.png` review previews = 46.4 MB (62% of all PNG weight). Review-only; manifests (`preview_4bg`) and `verify_library.py` reference them, so dropping them needs a manifest pass. Also `library-qa/` (1.9 MB, labels drawn in DejaVu via hardcoded system path), `renderer/palette_proof/`, `logo/logo_*` proof images and `composite-tools/` (not runnable: needs the interim composites, absent) are provenance, not product.
- **N6** Scripts default to `--assets-root /mnt/user-data/outputs`; the README Reproducibility command overrides every root, so it works. `expression-batch/eagle/*_report.json` hold absolute `/mnt/user-data/outputs/...` strings (inert metadata). `qa/docs-sync-report.md` is written as "prepare-only ... edited copies are in this folder" (not true of the shipped location).
- **N7 IDLE framing.** Dino, Tarsier, Eagle IDLE are head-only and bottom-anchored (eye line ~677-700 vs 598), cut by the cell bottom, so IDLE looks ~90 px lower than the other five states and than Click/Koala/Bronco IDLE. Documented owner-visible rule (template-rules-v2 s6, doc 15 s6), check_consistency passes; still the most visible inconsistency on the sheets. Owner may want to see it once.
- **N8 Overlaps / cosmetics at 1:1.** Silhouettes fill the full 72 px (or 108 px) cell width, 0-1 px margin, so they sit on the cell outline on every sheet (doc-consistent, not clipped). Expression art spills into gutters (documented 137 px allowance): Dino THINKING/CHEER/TRY AGAIN, Koala CHEER/TRY AGAIN, Eagle; Dino TRY AGAIN backpack crosses its left border, is cut flat at its left edge and touches the neighbor panel's border (does not enter it). Koala front turnaround has a small tan matte "drip" under the left ear; Eagle "Wing-feather treatment" detail is a thin sliver with stray specks; Bronco "Star treatment" detail is an unmatted rectangle; Koala "Signature glasses" detail has ragged edges; Koala/Tarsier head close-ups are short busts in the lower half (INFO by rule).
- **N9 Eagle expression of face.** Front turnaround, head close-up, proportion guide read stern/scowling (CARRIED "fierce brows"); doc 05 "Must not: look angry or aggressive in any state". Owner call; the six expression states themselves are friendly.
- **N10 Composites.** 07 palette panel lists 5 slots per character (omits C GOLD, PACK BODY, BOOK, EYE RING, EYES; Bronco shows BANDANA but not GEAR) while the sheets have 6; taglines differ (00/07 "REAL PLACES. REAL DISCOVERIES. BRIGHTER MINDS." vs 08 "CURIOUS MINDS. BRIGHTER WORLDS."); 07 has the known cream patch around the logo; 08 panels 15/16 show faintly lighter rectangular patches behind retyped lines; panel 8 caption "280x380 px (9-slice)" is tiny and soft. 07 lineup heights measured ~Click 0.94, Dino 0.86, Koala 0.76, Tarsier 0.57, Bronco 0.94 (+/-2%).
- **N11 Look-alike (not cleared):** green+gold block A (Eagle jacket), gold star on blue hat band and red star saddle (Bronco). Docs 05/06 already require human review; nothing in P claims clearance.
- **N13 Stale plan metadata.** `final-manifests/eagle.json` carries `plan_status: "NEEDS CONTROLLED EDIT"` on 11 slots (4 turnarounds, hero, head, 5 other; the plan matrix before the Eagle correction) next to the real `status: READY WITH CROP/MATTING`. Not rendered, but a reader/Phaser tool that keys on it would think the Eagle is unapproved; refresh or drop `plan_status`.
- **N12** Doc 15 says the logo draws 222x96 at (81,36); sheet reports show bbox 79,36,226x96 (soft edge). Doc 06/09 keep code hex `#8E1B30` for the bandana; sheet uses sampled `#6F1228` (README discloses).

## Checklist table
| # | Item | Verdict | Evidence |
|---|---|---|---|
| **IDENTITY** | | | |
| 1 | Click orange/tan kangaroo, role tag HOST & GUIDE - NOT SELECTABLE | PASS | Sheet 01 (outlined cream tag, only sheet with it); orange fur, tan belly #FDDCA5. |
| 2 | Exactly five SELECTABLE STARTER tags on the others | PASS | Sheets 02-06 each carry the navy tag; 5 of 5. |
| 3 | Dino teal, orange dorsal spikes, exactly one backpack | PASS (note) | Teal #03BDB2; turnaround front/3-4/side/back, hero, head, expressions and silhouettes show one pack (the "Backpack (front)" detail tile is a detail, not a second pack). Spikes sample red-orange (#F54A05), as README discloses. |
| 4 | Koala gray-lavender scholar, no backpack, near-black frames everywhere | PASS | Fur #9B85B9; no pack in four views; frames dark in turnaround, hero, head, expressions, detail (asset dark pixels mean RGB ~(21,13,16); palette DETAIL #0B0604). |
| 5 | Tarsier smallest, huge eyes, goggles | PASS | Turnaround height 104 px vs Eagle 184 (0.57); huge eyes and goggles in all views and states. |
| 6 | Eagle white head, blue eyes, brown wings, green varsity jacket, yellow beak | PASS | All views/hero/expressions; eye #058AC4. |
| 7 | Eagle "original white A" | **FAIL (vs brief/README)** | A is a gold/yellow block letter in sheets and composites; doc 05 says gold. See MUST FIX 3. |
| 8 | Bronco maroon bandana, red star/gear separate | PASS | BANDANA #6F1228 slot 6; ACCENT #B41C2E (star/gear) slot 3; maroon bandana visible in all views and expressions. |
| 9 | Nothing resembling copied logos/team marks | NOTE | No obvious copied mark found; human look-alike review still required and not cleared (N11). |
| **EXPRESSIONS** | | | |
| 10 | Six states, order IDLE HAPPY THINKING CHEER DISCOVER TRY AGAIN on each sheet | PASS | Label pills on 01-06 in that order; 36/36 cells with art; reports placeholders=[]. |
| 11 | TRY AGAIN encouraging, not punitive | PASS | Wink/thumbs-up (Click, Dino, Koala), smile (Tarsier, Eagle, Bronco); no scold. 08 panel 13 "Try again!" friendly. |
| 12 | No halo, no damaging clipping, no neighbour contamination | PASS (notes N7, N8) | 5x crops show no light fringe; art stays inside gutters (max spill 12 px, never inside a neighbour cell); bottom cut is the documented bust crop. |
| 13 | 4 owner-accepted minors only minor at canonical size | PASS | Eagle THINKING (small green fragment/pale shoulder at left), Eagle TRY AGAIN (pale lower-left shoulder notch), Koala CHEER (fists overlap borders, flat sleeves), Bronco CHEER (dark hoof blob at chin). All visible only when zoomed. |
| **TEMPLATE** | | | |
| 14 | 01-06 (and 00/07/08) are 1448x1086 RGB | PASS | PIL: all nine are (1448,1086) RGB. |
| 15 | Panel geometry identical on the six sheets | PASS | 210 long border segments identical on all six; the 191 that vary are silhouette/expression art crossing outlines; renderer constants PANELS/TURN_X/EXPR_X/SIL_X are shared; logo region (270x110 px) byte-identical on all six. |
| 16 | Turnaround order front/3-4/side/back | PASS | All six. |
| 17 | Role tag correct | PASS | See 1-2. |
| 18 | Cast-relative scale: Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57 | PASS | Measured front turnaround (px above baseline y400): Eagle 182, Click 169 (0.93), Bronco 169 (0.93), Dino 156 (0.86), Koala 136-139 (0.75-0.76), Tarsier 104 (0.57). Sheet reports k = exact factors. Proportion guide measured vs Eagle: 0.922 / 0.922 / 0.850 / 0.749 / 0.569. |
| 19 | Silhouettes navy, recognisable, not clipped | PASS (N8) | Pixel match #1E3A5F in all 30; bbox inside cells (0-1 px margin, 14-15 px above cell bottom). |
| 20 | Palette: six slots with hex text matching swatch | PASS | 36/36 swatch pixels equal manifest hex; OCR read 32/36 exact, 4 misreads of 8 px digits (Click #0153D9, #FA664F; Koala #FAAB97; Tarsier #E07A05) confirmed correct by eye at 3x. |
| 21 | Logo present and clean on 01-06 and 00/07/08 | PASS (N10) | Logo crop identical on six sheets, clean edges; present on 00/07/08 (07 has the disclosed cream patch). |
| 22 | No placeholder text (MISSING / TO AUTHOR / NEEDS EDIT / OPEN) | PASS (N13) | Reports placeholders=[] on all six; no such text visible on any sheet or composite; `status` fields in final-manifests are READY/OWNER-ACCEPTED/PROVISIONAL(palette) only. |
| **TYPOGRAPHY** | | | |
| 23 | Sheets Nunito Sans only | PASS | render_sheet.py loads 4 static Nunito Sans TTFs, verifies name/weight/static/glyphs, no fallback; fonts/ has OFL + provenance (sha in build_report). |
| 24 | No Poppins/DejaVu in P except history | PASS with N5 | grep -ril: hits are README/qa docs-sync/renderer README (history), build_all/render_sheet (audit strings), composite-tools/build08.py (comment), library-tools/qa_tool.py + silhouette_comparison.py (DejaVu labels on QA images only). Docs: 15/16/17 mention Poppins/DejaVu only as history/prohibition. No font file for either. |
| 25 | Composite text edits Nunito-like, not garbled | PASS (N10) | 08 panels 8/12/13/15/16, 07 palette/matrix labels, 00 banner zoomed at 2-5x: legible, Nunito-like; a few soft/tiny captions only. |
| **RENDERER / MANIFESTS** | | | |
| 26 | final-manifests resolve | PASS | 6 character manifests: 22 PNG refs each, 0 missing, 0 absolute paths, no cross-character refs; core_boxes.json fine. |
| 27 | Manifest sha256 = file bytes | PASS | `check_manifests.py`: 132/132 equal to on-disk bytes (stamped; see N1). |
| 28 | Schema validation | PASS | jsonschema Draft 2020-12: all 6 final-manifests and 6 input manifests valid. Shipped tool `validate_manifests.py` itself errors (N2). |
| 29 | Library: 90 canonical / 11 supplemental, statuses per README | PASS | Recount from manifests: canonical 90 (82 READY, 8 OWNER-ACCEPTED MINOR), supplemental 11 (9 READY, 1 NEEDS CONTROLLED EDIT, 1 PROVISIONAL), historical 28, superseded 9 (files on disk match); 101 asset sha256 all match; `verify_library.txt` FAILS: 0. |
| 30 | No canonical slot references supplemental/historical; koala_hero_overview unused | PASS | All 15 canonical_slots per character resolve to role=canonical; final-manifests reference only canonical + expression + logo; `hero_overview` appears in no manifest slot. |
| 31 | Frozen IDLE assets | PASS | click 71432a63..., tarsier dace8b6c..., dino 95aa9a23..., bronco 950796e5..., eagle 2a35baf0...: file sha256 equal (bytes identical). All 36 expression PNGs also pixel-identical to /outputs/expression-batch. |
| 32 | Documented rebuild reproduces committed 01-06 | PASS | Ran README command with `--out /tmp/wx-build`: BUILD PASS (final mode); decoded RGB arrays of the six sheets equal committed PNGs; PIXELSUMS identical to `qa/PIXELSUMS.txt`; rebuilt file hashes equal `qa/determinism.txt`. |
| **DOCS** | | | |
| 33 | Doc 15 vs old staged copy: no panel coordinates changed | PASS | All 82 coordinate tokens of the old doc present with identical counts; the only new numeric tokens are dates, font weights, logo placement. Edits are wording/status. |
| 34 | Stale statements (1.10/0.90/0.80/0.60 as authoritative) | PASS | Occurrences only as "sheet 07 v1 printed ..." history (docs 02/03/04/05, 08 table). |
| 35 | "Poppins as current"; "Adventure Academy" | PASS | Poppins only as history/prohibition; "Adventure Academy" appears nowhere (sheet label is "Academy A patch"). |
| 36 | "Pending" Eagle corrections / candidate promotion | **FAIL** | MUST FIX 4 and 5. |
| 37 | README/INVENTORY statements that are false | **FAIL** | (a) INVENTORY.md, SHA256SUMS.txt, EAGLE-EDIT-SOURCES.md listed but absent; (b) "original white A" (art is gold); (c) qa/ "release QA" absent until this report is added; (d) "Release candidate closed ... ready for Phaser" is fine only after items 1-5. All other README facts checked true: 15 canonical/char, 36 expressions, totals 90/11/28/9, 82/8, Koala hero_overview not used, Nunito only, palette hex PROVISIONAL, silhouettes navy, no-fallback fonts, build reproducibility, five frozen IDLE hashes. |
| **SOURCE CONTROL / HYGIENE** | | | |
| 38 | Files that should not ship | NOTE | No caches/temp/debug names left (after my cleanup). See N5/N3/N6: `_4bg` previews (139, 46 MB), `renderer/manifests/` dead inputs, selftest/make_example/stub tools, palette_proof, library-qa, composite-tools, logo proof images. |
| 39 | LFS coverage | **FAIL** | See MUST FIX 1. |

### PNG count and size by subfolder (all need LFS)
| Subfolder | PNGs | MB |
|---|---|---|
| (top level 00-08) | 9 | 10.49 |
| asset-library/click | 36 | 5.68 |
| asset-library/dino | 46 | 5.72 |
| asset-library/koala | 54 | 10.04 |
| asset-library/tarsier | 46 | 9.83 |
| asset-library/eagle | 46 | 10.45 |
| asset-library/bronco | 48 | 9.77 |
| expression-batch | 36 | 2.03 |
| library-qa | 7 | 1.93 |
| logo | 6 | 5.02 |
| qa | 1 | 1.11 |
| renderer (palette_proof) | 7 | 3.17 |
| **Total** | **342** | **75.22** |

Only the top-level 9 PNGs (10.49 MB) are matched by the current rule; 333 PNGs / 64.73 MB are not. The 139 `_4bg` previews alone are 46.44 MB.
