# Deterministic character-sheet renderer (Lane 3)

## Release build (production-v1.1) - how to reproduce the six sheets

Run from `production-v1.1/renderer/` (the assets root is the release folder itself, so every manifest path is release-relative):
```
python3 build_all.py --out /tmp/wx-build --assets-root .. --library-root ../asset-library --expressions-root ../expression-batch --logo logo/BidaZoo_World_Expedition_logo_master.png
```
Strict mode: any placeholder / provisional ART slot / stub logo / report warning / template defect / OPEN palette slot / non-identical repeat render / font violation FAILS the build. `--dev --stub-logo` is a development-only mode (never used for release). Needs Python 3, Pillow, numpy, jsonschema (for schema validation).
The release sheets `../01_...06_Character_Sheet.png` are the renderer outputs `<char>_sheet_v2.png` of exactly this command; `../qa/` holds the build report, determinism proof and consistency check of that run.
Other options: `--palettes palettes.json`, `--resample-palettes`, `--work-dir`.
Steps: make_real_manifests -> derive_core_boxes -> make_v2_manifests (takes palettes.json, the LOGO_ASSET path, library root) -> run_all (render #1) -> run_all (render #2, separate folder, compared byte for byte) -> check_consistency -> manifest schema validation -> gates -> `build_report.json`, `SHA256SUMS.txt`, `PIXELSUMS.txt`.
Environment note: the shared outputs mount stamps C2PA chunks into every PNG about a minute after it is written (bytes and sha256 change, pixels do not). build_all therefore renders in a private temp dir from a snapshot of the inputs and computes all hashes on the pure renderer bytes; `PIXELSUMS.txt` (sha256 of decoded pixels) stays valid after stamping.
Two full builds on identical inputs give identical outputs (every file, `SHA256SUMS.txt` compared).

**Typography (M4-6).** Nunito Sans (SIL OFL 1.1) static TTFs 400/600/700/800 are in `fonts/` with `OFL.txt` and `FONT-SOURCE.txt` (provenance, sha256). `render_sheet.py` has no fallback family: a missing, non-Nunito, variable or glyph-poor font file is a hard error (`FONT ERROR`). Fit of every fixed string: `font_fit_report.txt/json` (`tools/font_fit_report.py`).
**Palettes (M4-D).** `palettes.json` (six complete slots per character, none OPEN, hex sampled from final art with provenance; every hex PROVISIONAL by docs 09/15) via `tools/make_palettes.py` + `tools/palette_sampler.py`; proof images in `palette_proof/` (`palettes_proof.png`, `masks_<char>.png` show which pixels were sampled).
**Expression status.** `expression_status.json` (doc 17 s2: all 36 READY except Eagle THINKING / TRY AGAIN, Koala CHEER, Bronco CHEER = OWNER-ACCEPTED MINOR) replaces the old plan-matrix / QA-flag mapping.
Stub logo: `tools/make_stub_logo.py` (DEV ONLY; build_all refuses it outside `--dev`). Earlier M3 working notes (placeholders, DejaVu fallback, `manifests_real/`, `out_v2_dev/`) are kept for history in `HISTORY-M3.md`; they are superseded by this file wherever they differ.


## Reference
* Rules in force: `template-rules-v2.md` (expression core/allowance/fit-down rules, cast factors), `manifest.schema.md` / `manifest.schema.json` (manifest format), `docs/visual/15-character-sheet-template.md` (locked geometry).
* Inputs: `manifests/<char>.json` are the per-character base manifests (layout, captions, cast factor); the build regenerates the asset-resolved manifests; the ones used for the release sheets are archived in `final-manifests/` (+ `core_boxes.json`).
* Validate manifests: `python3 -I tools/validate_manifests.py` (needs `jsonschema`).
* Per-sheet reports (`../qa/sheet-reports/<char>.report.json`): placements, scales, assets with sha256, fonts, warnings (none), template defects (none).
