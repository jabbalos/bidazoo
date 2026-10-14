# BidaZoo World Expedition — production-v1.1 (visual release)

**Status: M4 production-v1.1 release content. The owner accepted the six-sheet contact sheet and approved the logo master for this release (October 13, 2026).**
`production-v1/` is immutable and untouched; this folder is its corrected successor. This README is self-contained: no chat history is needed.

Product name: **BidaZoo World Expedition**. Cast: **Click** is the orange/tan kangaroo **HOST & GUIDE — NOT SELECTABLE**. Exactly five selectable starters: **Dino, Koala, Tarsier, Eagle, Bronco**.

## What is here

| Path | What |
| --- | --- |
| `01_Click_Character_Sheet.png` … `06_Bronco_Character_Sheet.png` | The six canonical 1448×1086 character sheets (doc 15 template), produced by the deterministic renderer from the real approved assets. **Not hand-edited.** |
| `00_Master_Overview.png`, `07_Expressions_Proportions_Palettes.png`, `08_UI_and_Phaser_Asset_Spec.png` | Composite guides after the single M4 integration pass (new logo, Nunito Sans text fixes, final expressions/palettes/silhouettes/proportions). Eagle white-head corrections frozen. |
| `asset-library/<char>/` | Approved reusable assets per character: 4 turnarounds, hero, head, 5 silhouettes, 4 details = **15 canonical**, plus supplemental assets, `_historical-silhouettes/` and `_superseded/`; `manifest.json` per character; `asset-library/library-manifest.json` combined. |
| `expression-batch/<char>/` | The 36 canonical expression states (6 per character) + matte reports. |
| `logo/` | `LOGO_ASSET`: one reusable transparent master + provenance, validation images, scripts. |
| `renderer/` | Deterministic renderer, `build_all.py`, manifests (inputs and `final-manifests/`), schema, `palettes.json`, Nunito Sans fonts (OFL), rules `template-rules-v2.md`, fit report. |
| `qa/` | Build report, determinism proof, consistency check, per-sheet reports, contact sheet, docs-sync report, release QA. |
| `composite-tools/`, `library-tools/`, `library-qa/` | Provenance scripts/evidence for the composites and the library. See "Reproducibility". |
| `INVENTORY.md`, `SHA256SUMS.txt` | Every file with size and SHA-256 (generated after the last PNG write). |
| `EAGLE-EDIT-SOURCES.md` | Provenance of the approved Eagle corrections (frozen). |

Documentation: `docs/visual/15-character-sheet-template.md` (canonical template), `16-character-art-production-plan.md` (plan and status), `17-M4-RELEASE-HANDOFF.md` (historical handoff), docs 01–06/08/09 synced.

## Locked decisions this release implements
* **Cast scale factors (owner-approved, authoritative; turnaround and proportion guide only):** Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57. The sheet's `PROVISIONAL SCALE` label is kept as doc 15 wording until the owner retires it.
* **Expressions:** IDLE, HAPPY, THINKING, CHEER, DISCOVER, TRY AGAIN × 6 characters = **36 / 36**: 32 PASS + 4 OWNER-ACCEPTED MINOR (Eagle THINKING, Eagle TRY AGAIN, Koala CHEER, Bronco CHEER). TRY AGAIN is encouraging/resilient everywhere. Koala THINKING = `koala_thinking_analytical.png`. Expression scale uses per-character core head scale, core safe width 109 px, effect allowance 137 px, 1 px tolerance, uniform fit-down (all 36 factors 1.0000) — see `renderer/template-rules-v2.md`.
* **Typography:** Nunito Sans only (static OFL TTFs in `renderer/fonts/`). The renderer has no fallback font; a missing/incorrect font is a hard error. No Poppins stand-in remains in production material.
* **Identity:** Dino teal + orange dorsal spikes + exactly one backpack; Koala gray-lavender scholar, no backpack, glasses frames near-black (#0B0604 sampled); Tarsier smallest, huge eyes, goggles; Eagle clearly white-headed, blue eyes, brown wings, green varsity jacket, original varsity A (gold letter on the green jacket); Bronco maroon bandana (#6F1228; red star/gear accents stay red #B41C2E).
* **Palettes:** six slots per sheet defined from the final art (`renderer/palettes.json`, sampled with provenance). Every hex is **PROVISIONAL** by the docs' own rule (docs 09/15).
* **Silhouettes:** the 30 canonical silhouettes are derived deterministically from the approved matted alpha (front, 3/4, side, back, action; Koala action slot = reading hero), navy `#1E3A5F`. The 28 older flat-sheet silhouettes are QA-comparison only (`_historical-silhouettes/`).

## Status vocabulary
`READY WITH CROP/MATTING` approved as is · `OWNER-ACCEPTED MINOR` approved with a recorded cosmetic limitation (renders like READY; the status stays in metadata) · `PROVISIONAL` not approved for release use · `NEEDS CONTROLLED EDIT` known defect, deferred. Role: `canonical` (feeds the sheets) vs `supplemental` (extra, never referenced by a canonical slot).

Library totals: **90 canonical** (82 READY, 8 OWNER-ACCEPTED MINOR), **11 supplemental** (Koala hero_overview [NEEDS CONTROLLED EDIT, not used] and head_panel; Tarsier head_panel_alt [PROVISIONAL], goggles_side, backpack_back; Dino backpack side/back/zipper pull; Eagle cuff, custom buttons; Bronco turnaround 34-back), 28 historical silhouettes, 9 superseded files.

## Known accepted limitations (not release blockers)
* Logo master is a **reconstruction** of the approved lockup from the Dino-sheet instance (3× upscale, background removed; no redesign, wording unchanged, no SVG). **OWNER-APPROVED for production-v1.1**; no SVG/auto-trace (a future professionally redrawn vector master may supersede it). It draws at 222×96 px (≈66% of the 312 px slot width) because the slot is height-limited.
* Residual matte softness on a few approved sources, inherited by some silhouettes (jagged white-fur edges Koala/Bronco, flat cut between Eagle's feet, straight ground cut under Koala reading).
* Template text that cannot fit its box in Nunito Sans is handled by renderer rules (doc 15 §4 "fit findings"): short slot-6 labels (`BANDANA` + name `Maroon`), `PROVISIONAL` tag omitted in the 72 px silhouette cell, `MISSING / TO AUTHOR` unused on every final sheet.
* Composite 07 has a soft cream patch at the right edge of the logo area (the old sign was larger than the new logo). Composite 00's generic 13-swatch palette panel was left as is.
* Dino dorsal spikes sample red-orange (~17°), as doc 09 already noted; Bronco maroon samples darker than doc 09's code value `#8E1B30`.

## Reproducibility
* **Sheets:** `cd renderer` then
  `python3 build_all.py --out /tmp/wx-build --assets-root .. --library-root ../asset-library --expressions-root ../expression-batch --logo logo/BidaZoo_World_Expedition_logo_master.png`
  Two independent renders are compared byte for byte; pixels (`qa/PIXELSUMS.txt`) match the committed sheets. File bytes of committed PNGs may differ from a fresh render only by metadata chunks (C2PA `caBX`) added by the storage layer; pixels do not.
* **Composites 00/07/08:** `composite-tools/` rebuilds them from the *interim* v1.1 composites (Eagle-final), which are not part of the repository — the committed PNGs are the artifacts; scripts are provenance.
* **Library:** `library-tools/` (Koala glasses recolour, silhouette derivation, manifests, verification) from the M2 approved library; M2/M1 matte tooling is not shipped.
* Frozen IDLE expression assets (Click, Tarsier, Dino, Bronco, Eagle) are hash-identical to their approved versions; see `INVENTORY.md`.

## Brand / IP
**PRE-COMMERCIAL BRAND/IP REVIEW REQUIRED** — not legal clearance and not an M4 release blocker: the characters, the green-and-gold Eagle varsity A and the logo must be reviewed before broad commercial merchandising or licensing.

## Not in scope
Phaser integration, identity/backend work, trading cards. Next step: Phaser asset pipeline from `asset-library/` + `expression-batch/` and doc 08.
