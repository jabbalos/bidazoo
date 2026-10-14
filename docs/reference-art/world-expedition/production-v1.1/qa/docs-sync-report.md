# M4 docs sync report (prepare-only)

Date: October 13, 2026. Nothing was written to the worktree. Edited copies are in this folder under the same file names, with a unified diff `<name>.diff` for each. Script: `m4-release/docs-tools/sync_docs.py` (exact-string edits; every old string must occur exactly once, so re-running on the same staged sources is deterministic).

Sources read: staged `docs/visual/00-17` and `INGESTION-REPORT.md`; `renderer/template-rules-v2.md`, `renderer/README.md`, `renderer/palettes.json`, `renderer/font_fit_report.txt`, `renderer/out_final/{build_report.json,check_report.txt}`, `logo/README.md`, `library/library-manifest.json`, `library-tools/sil_config.py`, `composites/*`.

Files changed: 15, 08, 09, 01, 02, 03, 04, 05, 06, and (addendum, section 5) 16 and 17. Files read and left unchanged: 00, 07, 10, 11, 12, 13, 14, INGESTION-REPORT.

Sections 2 and 4 below were written before the addendum: where they say doc 16 or 17 is untouched or stale, section 5 supersedes them.

Geometry check: all 71 backticked box coordinates in doc 15 are identical before and after (the two "removed" lines in the diff that contain boxes are re-emitted with unchanged boxes). Headings are unchanged except two added subsections (`### Fixed-string fit in Nunito Sans (M4 findings)` in s4, `### Asset status words (library manifest, M4)` in s13).

## 1. Changes (old -> new)

### Doc 15 (character sheet template)

| Where | Old | New |
| --- | --- | --- |
| Header (after Branch) | none | Added "M4 docs sync" paragraph: docs-only, lists what was synced, states no coordinate/box/panel/expression-order/turnaround-order change |
| Owner decisions, logo bullet | "asset is `REQUIRED / TO AUTHOR`" | "asset status is `RECONSTRUCTED MASTER` (M4, section 8)... controlled reconstruction, not a raw crop" |
| s1 safe areas | "...vertical limits in section 6 still apply." | + "In expression cells only the core is held to the 8 px inset; limbs, props and effects may use the 137 px effect allowance" (needed so s1 no longer contradicts s6) |
| s2 slot table, slot 6 | `CHARACTER-SPECIFIC` | `CHARACTER-SPECIFIC` (role; the label is a short custom string, see rules) |
| s2 rules, slot 6 | "may carry a character-specific name... Bronco slot 6 is **BANDANA — MAROON**" | slot 6 carries a short custom label (default does not fit 88 px); Bronco = label BANDANA, name Maroon; final labels C GOLD, PACK BODY, BOOK, EYE RING, EYES, BANDANA |
| s2 rules, unused slots | "...label reads `OPEN`..." | + "As of M4 all six slots are defined on all six sheets, so no slot renders as `OPEN`" |
| s2 rules, hex | "No final production hex is locked by this document." | + "The M4 hex values are sampled from final approved art and remain PROVISIONAL" |
| s2 rules, Bronco red | "Red gear and star accents on Bronco remain separate from the maroon bandana." | + "Bronco ACCENT (slot 3) is the red star / gear, and slot 6 is the maroon bandana" |
| s4 font paragraph | "Font binaries are **not** embedded or committed in this step. Font files and license handling are set up explicitly before the first rendered sheet." | "Nunito Sans is **final**." static OFL 1.1 files for 400/600/700/800, no fallback family, missing/non-Nunito/variable/glyph-poor font = hard error |
| s4 new subsection | none | "Fixed-string fit in Nunito Sans (M4 findings)": table of the 7 strings that do not fit and the rule applied; list of what fits; caption-box note; "no template defects, no warnings, no placeholders" on the six final sheets |
| s6 scale mode, `k` | "`k` (1.00 is the cast reference height). The factors are **PROVISIONAL**..." | factors **authoritative** (owner, October 13, 2026): Eagle 1.000 (cast reference), Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57; turnaround and proportion guide only; expressions not cast-scale authority |
| s6 scale mode, `S0` | "tallest cast member fits... `S0` is PROVISIONAL" | `k` = 1.000 (Eagle) draws at 184 px; `S0` same for all sheets; renderer values recorded for audit (S0 = 0.184 px/unit, 1 unit = 1/1000 reference height, reference height = tallest matted turnaround view) |
| s6 overflow | "...or the cell geometry." | + "None of the six final sheets raises this flag at the turnaround." |
| s6 head close-up | "eye line at 40 percent (`y = 610`). Crop-to-fill is allowed here and in the hero." | core 88 percent; nominal eye line y 610 not enforced; art bottom-anchored on y 754; short heads leave empty space above (valid); bottom-edge crop allowed in head and hero |
| s6 expression cells | usable width 109, nominal 100, eye line 598, crown >= 8 px, "exceeds 109 px... flag. Do not shrink one cell." | five rule bullets from template-rules-v2: core/allowance (109 px core safe width, 137 px effect allowance), scale (nominal 100 px, density normalization), eye line and bottom anchor (full-bust y 598; head-only crops bottom-anchored at y 724), tolerance and uniform fit-down (1 px; factor per cell; flag remains for crown above y 520 and anything fit-down cannot remove; all 36 final cells factor 1.0000), short busts valid |
| s6 silhouettes | "Every silhouette is the matted alpha of approved art..." | + paragraph: canonical silhouettes derived deterministically from approved matted alpha (front, 3/4, side, back from turnaround cutouts; action from hero/action, Koala = reading hero); historical flat-sheet silhouettes QA-comparison only |
| s7 intro | "The exact normalized cast scale remains open until turnaround art is finalized." | normalized cast scale = the authoritative factors in s6; shown only as heights, no number printed |
| s7 `R` rule | "`R` is 168 px... `k`... PROVISIONAL." | `R` = 168 px kept; it is the Eagle (k = 1.000) height; `k` = authoritative cast factor; guide and turnaround use different absolute scales (168 vs 184 px for k = 1.000), only `k` is shared |
| s7 status label | "`PROVISIONAL SCALE` stays... until the owner approves final normalized proportions." | + factors are set, but retiring the label is a separate owner decision not yet made, so the label still renders |
| s8 logo status | "`LOGO_ASSET` = **REQUIRED / TO AUTHOR**." | "**RECONSTRUCTED MASTER (M4); owner approval of the master is pending.**" RGBA PNG 1467 x 633, reconstructed from the approved Dino-sheet header instance (production-v1 sheet 02), no redesign, background removed, clipped bottom foliage tapered, 3x upscale, no SVG, release-layout path, provenance in logo README |
| s8 logo bullets | "visual reference for authoring", "Until the asset exists...", "set up explicitly before the first final render" | "reconstruction, not a raw crop; becomes canonical on owner approval"; marker rule kept as "If the asset is missing..."; slot-fit finding (222 x 96 at (81, 36), about 66 percent of slot width, WORLD EXPEDITION cap height about 8 px, slot geometry unchanged) |
| s10 | none | + "M4 outcome: on the six final sheets no art slot is missing, open or provisional, and no palette slot is open. The only provisional items are the palette hex values." |
| s13 current art state | Bronco swatch "deferred" | no longer deferred: BANDANA slot 6, separate from red star / gear accent |
| s13 current art state | "Poppins remains in interim Sheet `08`... replaced during final typesetting." | kept as history: interim Sheet 08 carried Poppins stand-ins; M4 composite pass retypesets in Nunito Sans (candidate, promotion pending); Poppins not used on any canonical sheet |
| s13 current art state | "Eagle art is pending the controlled correction... will later be inserted" | Eagle art was corrected; `production-v1.1/05_Eagle_Character_Sheet.png` is the source of the Eagle library and expressions (beyond your list, factual sync) |
| s13 new subsection | none | "Asset status words (library manifest, M4)": canonical 90 (READY WITH CROP/MATTING 82, OWNER-ACCEPTED MINOR 8), supplemental 11 (READY 9, NEEDS CONTROLLED EDIT 1 `koala_hero_overview`, PROVISIONAL 1 `tarsier_head_panel_alt`), historical 28, superseded 9; OWNER-ACCEPTED MINOR renders like READY; expressions 32 READY + 4 OWNER-ACCEPTED MINOR |
| s13 OPEN items 1, 2, 3, 4, 7 | LOGO REQUIRED; `k` and `S0` PROVISIONAL; chrome hex; fonts before first render; overflow review | 1 RESOLVED (owner approval pending); 2 RESOLVED, `S0`/reference height recorded as renderer choices; 3 chrome and palette hex PROVISIONAL; 4 RESOLVED; 7 no final sheet raises the flag |

### Doc 08 (proportions and silhouettes)

| Where | Old | New |
| --- | --- | --- |
| Status line | "...(October 12, 2026). Exact proportions are OPEN..." | + "cast scale factors finalized October 13, 2026 (M4 docs sync)" |
| Owner decision | "All exact head-unit and relative-height numbers... PROVISIONAL. ...turnaround sheets will determine the final normalized scale." | Oct 12 decision kept as history, limited to section 3 head-unit numbers; new "Owner decision applied (October 13, 2026): CAST FACTORS FINAL" |
| s2 heading and table | "Working-reference scale (PROVISIONAL...)": 1.10 / 1.00 / 1.00 / 0.90 / 0.80 / 0.60 | "Cast scale factors (AUTHORITATIVE)": Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57; old cm readings kept as a historical column |
| s2 text | "These numbers are a working reference only." | removed; added rule text (relative to Eagle, not cm; turnaround and proportion guide only; expression rule: core safe width 109 px, effect allowance 137 px, 1 px tolerance, uniform fit-down, short busts bottom-anchored) |
| s4 | none | + paragraph: canonical silhouettes derived from approved matted alpha (Koala action slot = reading hero); historical flat-sheet silhouettes QA-comparison only |

### Doc 09, docs 01-06

| File | Old | New |
| --- | --- | --- |
| 09 s6 | none | + M4 status note: six slots per sheet defined; every hex PROVISIONAL; table unchanged; Bronco slot 6 maroon BANDANA, red star / gear separate |
| 01 (2 places) | "exact numbers are PROVISIONAL"; "on 07 Click is 1.00" | "cast factor 0.92"; "cast factor 0.92 (08), equal to Bronco... Eagle is 1.000. Sheet 07 v1 printed 1.00 (historical)" |
| 02 (2 places) | "0.90 on the 07 lineup"; "0.90 on 07" | "cast factor 0.85 (sheet 07 v1 printed 0.90)". "Third smallest" is still true (Tarsier 0.57, Koala 0.76, Dino 0.85) |
| 03 | "0.80 on 07" | "cast factor 0.76 (sheet 07 v1 printed 0.80)" |
| 04 (2 places) | "0.60 on 07, the smallest"; "exact numbers PROVISIONAL" | "cast factor 0.57, the smallest (sheet 07 v1 printed 0.60)"; "cast factor 0.57" |
| 05 | "1.10 on 07, the tallest" | "cast factor 1.000, the cast reference and the tallest (sheet 07 v1 printed 1.10)" |
| 06 | "1.00 on 07, equal to Click" | "cast factor 0.92, equal to Click (sheet 07 v1 printed 1.00)" |

## 2. Checked and deliberately not changed

- Doc 16: untouched, as instructed. Its factors (s5 H line 194-195 and the per-character checklist `k about` lines 332, 345, 359, 374, 387, 401) all match 1.000 / 0.92 / 0.92 / 0.85 / 0.76 / 0.57; no conflicting factor found anywhere in it.
- `R` = 168 in doc 15 s7 was **kept** (and reworded), not replaced. It is locked geometry (baseline y 1006 to tick y 838) and is what the renderer draws (`PROP_R = 168`, `out_final` reports `R_px: 168`). Replacing the number would change the proportion-guide geometry. What changed is its meaning: the Eagle (k = 1.000) height, with `k` authoritative. If you intended R to become 184, that is a geometry decision, not a docs sync.
- `PROVISIONAL SCALE` label and its fixed string: kept (s1, s4, s7). Doc 15 says only the owner retires it. The factors are final, the label is not retired.
- Logo status: written as "RECONSTRUCTED MASTER, owner approval pending", not "AUTHORED/APPROVED". The logo README says approval is pending and doc 15 says no historical crop becomes canonical automatically. Change the wording once you approve the master.
- `MISSING / TO AUTHOR` / `OPEN` / `REQUIRED / TO AUTHOR` marker rules in s5, s10, s11: kept. They remain the correct rules for any future missing slot; they are just not used on the six final sheets.
- Poppins prohibitions ("No Poppins", "Poppins is not used for final production sheets") kept; the only Poppins history sentence is in s13 "Current art state".
- Palette hex values are not copied into the docs (they live in `palettes.json`, all PROVISIONAL).
- "Adventure Academy" hits (docs 00, 11, 12, 14, INGESTION-REPORT) are the locked naming rule (facility inside the hub only, never the product title). Correct as written.
- Doc 10 (platform system font stack, self-hosted fonts OPEN) is about the game UI, not the character sheets. Unchanged.
- Doc 07 s8 and INGESTION-REPORT are dated records of the original sheet 07 and are left as history. Sheet-07 labels CELEBRATE / SURPRISED stay historical.
- Click = HOST & GUIDE, NOT SELECTABLE and exactly five selectable starters: verified consistent in 00, 01, 10, 14, 15 s8 and 16; no edit needed.

## 3. Owner-visible rule changes recorded in doc 15 (please confirm)

These come from `template-rules-v2.md` (owner decisions of October 13, 2026, policies A-D, v2.1, v2.2) and now sit in locked-doc text:

1. Head close-up: eye line y 610 is no longer enforced; art is bottom-anchored on y 754.
2. Head-only expression crops (Dino, Tarsier, Eagle IDLE): bottom-anchored at y 724; the y 598 eye-line lock applies only to full-bust cells.
3. "Do not shrink one cell" is replaced by uniform per-asset fit-down (factor recorded; all 36 are 1.0000 today).
4. Effects/limbs may use the 137 px allowance (s1 inset sentence adjusted accordingly); only the core is held to 109 px / 8 px inset.

## 4. Residual conflicts and stale text found in docs/visual (not changed)

Doc 16 (do-not-touch):
- L76 "Poppins remains in interim Sheet `08`"; L421 "final typesetting replaces Poppins" (step 13).
- L195 "Scale ... All PROVISIONAL" now conflicts with authoritative factors.
- s10 (L304-311) "`LOGO_ASSET` status: **MISSING / TO AUTHOR**... Until it exists, renders show the layout-proof marker"; step 8 (L416).
- s4.4 "Exactly 12 MISSING / TO AUTHOR expression assets" (L129-141), L232 Eagle IDLE/THINKING MISSING, and steps 4-7, 10 (L412-418): M1 is closed with 36 of 36 states.
- L54-59 PROVISIONAL status vocabulary vs library words (READY WITH CROP/MATTING, OWNER-ACCEPTED MINOR).

Doc 17 (handoff, written at the M1-M3 boundary): s7 D "LOGO_ASSET is missing", s11 J/C/D open items, s12 "DejaVu used", "S0/reference height is a renderer choice" and "18 library silhouettes" (manifest now shows 28 historical). Retire or update after the sync is promoted.

Doc 15 (outside the eight requested points, so left):
- s5 L249-250 "Known cases to resolve in the art phase: Eagle (scowls) and Click (review required)" is stale after M1 (Eagle TRY AGAIN is OWNER-ACCEPTED MINOR).
- s13 OPEN items 5 (per-character manifests) and 6 (matting approach) are effectively done by M2-M4.
- s13 L579-585 "production-v1.1 is a CORRECTION CANDIDATE - NOT FINAL"; status owned by the lead.
- Internal geometry inconsistencies, unchanged because they are locked boxes: s3 caption box `0,86,142,20` vs s4 two lines at 13 px (26 px; renderer draws both, logs a text adjustment); s1 silhouette cell 72 x 196 vs s6 fit box 72 x 182; the 168 vs 184 two-scale note (now stated in s7).
- s12/s2 do not define a text for a provisional silhouette in a 72 px cell (tag omitted, warning logged); no final slot needs it.

Outside docs/visual text, same topic:
- Renderer cast manifests still carry `k_status: "PROVISIONAL"` (`out_final/manifests/*.json`), and each sheet's `computed_sheet_status` reads "LAYOUT PROOF - NOT FINAL: 6 provisional slot(s)" because the six palette hex values are provisional. This is consistent with doc 15 s10 and s2 but will look odd next to "authoritative" factors.
- Composite 07 candidate subtitle reads "Cast-relative scale, Eagle = 1.000. Factors are PROVISIONAL." (`composites/build07.py`). It now disagrees with doc 08 and doc 15 s6; change the composite text or reconcile with the `PROVISIONAL SCALE` decision above.

## 5. Addendum: docs 16 and 17 (coordinator request)

Doc 15 re-check on the final copy: all 71 box coordinates identical to the staged original. Doc 16: the 8 lines that carry cast-factor values have identical values (only checkbox marks changed on the `H Scale reference` lines).

**Doc 16 (status refresh only, structure kept):** status line and an "M4 status sync" paragraph (unmarked codes/counts = plan-time baseline); s1 `production-v1.1` note (promotion by operator); s2 added OWNER-ACCEPTED MINOR / HISTORICAL / roles; s3 Bronco swatch done, Poppins -> Nunito Sans final, README superseded; s4.3 Koala THINKING = Analytical (`koala_thinking_analytical`); s4.4 retitled as plan-time baseline with 36/36 closed (32 PASS + 4 OWNER-ACCEPTED MINOR: Eagle THINKING, Eagle TRY AGAIN, Koala CHEER, Bronco CHEER); s5 note (90 canonical + 11 supplemental, no canonical CE/MS/PR left; `koala_hero_overview` deferred); s5.3 G/H: "working" and "All PROVISIONAL" replaced by owner-approved and authoritative, with `PROVISIONAL SCALE` label and palette hex staying PROVISIONAL; s6 Eagle edit complete; s7 BANDANA label/name and GEAR decided; s10 LOGO_ASSET = reconstructed master, owner approval pending; s11 all checklist boxes checked with a note that the codes are baseline (G hex and H label still PROVISIONAL); s12 new "M4 status" column (steps 1-7, 9-12 DONE; 8 produced, owner approval pending; 13 prepared; 14 pending owner; 15-16 pending lead; 17-18 pending operator; 19 not started); s14 items 1, 3, 4, 5, 6 resolved, item 2 has no recorded confirmation.

**Doc 17 (historical record):** top banner as requested; M2 totals labeled "at M2 close" plus the current manifest numbers (90 canonical, 11 supplemental, 28 historical, 9 superseded; 30 canonical silhouettes derived); s4 factor sentence; s7 D logo status; s9 README row; s10 staging bullets replaced ("`_m4-handoff-staging/` is removed from the release commit; it never ships"); s11 items A-O marked DONE / PREPARED / PENDING OWNER / PENDING OPERATOR; s12 renderer open items marked resolved. HEAD, upstream and Git status were left "NOT RECORDED"; no git state was added.

Judgment calls to check: (1) s11 checkboxes in doc 16 are all checked on the basis of the library and renderer manifests (0 placeholders on the six sheets); (2) doc 17 item K (README/release manifest) is described as lead-owned and not assessed, because I did not see those files; (3) doc 16 s14 item 2 (Eagle DISCOVER mapping) is left unconfirmed.

## 6. Addendum 2: release-QA wording fixes

- **Composites final (1):** doc 08 s2 rule text ("candidate, promotion pending" -> "the final sheet 07 composite in `production-v1.1` (single M4 composite pass)"); doc 15 s13 ("`production-v1.1/` is a CORRECTION CANDIDATE - NOT FINAL, uncommitted" -> "was a correction candidate and is now the release folder for the M4 release (intended content of the M4 release commit; Git is operator-run, nothing here records a commit or push)", composites 00/07/08 final from the single M4 pass, owner visual approval of sheets and logo master pending; "Accepted candidate corrections" -> "Accepted corrections"; Poppins history line "candidate... promotion pending" -> "final composite in `production-v1.1`"); doc 16 s1 (same release-folder wording), s3 Poppins line, s12 step 13 (PREPARED -> DONE, final composites from the single M4 pass); doc 17 s1 rules line (M4 status sentence, no git state), "Known uncommitted work" heading now "at handoff", s11 item I (DONE; owner visual approval pending).
- **Doc 05 (2):** "CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER" -> "...: DONE in `production-v1.1`" (white head applied; corrected sheet is the Eagle library source); "On 07, TRY AGAIN reads stern." + "**DONE in `production-v1.1`:** TRY AGAIN was re-authored as encouraging (OWNER-ACCEPTED MINOR)". Rest of doc 05 untouched apart from the earlier scale line.
- **Eagle letter (3):** "prominent original white A" (doc 17 s5) and "original prominent A" (doc 15 s13 Eagle bullet, doc 16 s6 required appearance) -> "original varsity A (gold letter on the green jacket)". A grep of docs 01-17 found no other "white A". Added to doc 05 Originality bullet: "NOTE: green-and-gold varsity A look-alike review not cleared; owner decision." (the existing "does not claim clearance" sentence is kept).
- Left as is: doc 05 L12 `Prominent letter "A" that is original` (LOCKED Bible wording, quoted), doc 05 L47 and the owner-decision paragraph ("prominent A"), doc 14 L15 (`original "A"`), and INGESTION-REPORT (dated record).
- Residual: doc 05 L21 still lists "Green jacket with a cream \"A\" patch" among the established traits, while L62-63 say the render's A is gold (code draws it cream) and the palette sample is #FCBF15. Not changed (outside the three requested fixes); worth a one-line owner call.
- Doc 15 coordinate re-check on the final copy: all 71 boxes identical to the staged original.
