# BidaZoo World Expedition — Production Visual Reference Package v1

Ten approved production-source images for the BidaZoo World Expedition visual track. Stored for
reference only. They are not runtime assets and must not be loaded by the game.

## Identity of this set

- **Package:** BidaZoo World Expedition Production Visual Reference Package v1
  (originally delivered as `BidaZoo_World_Expedition_Visual_Production_Pack.zip`; the ZIP is not stored).
- **Ingested:** October 12, 2026.
- **Checkpoint relationship:** these files are the source for the findings in the visual
  specification committed at checkpoint `e1a017e` (`docs/visual/`, especially
  `docs/visual/INGESTION-REPORT.md`). This folder is added after that checkpoint.
- **Files are byte-for-byte as delivered.** Original filenames, no cropping, conversion,
  optimization, or renaming.

## Authority level

Per `docs/visual/00-master-direction.md`:

1. `docs/CHARACTER-BIBLE.md` — canonical, outranks everything here for LOCKED rules.
2. **These production renders (00 to 09)** — approved production reference.
3. `docs/reference-art/bidazoo-character-roster-reference.png` — legacy approved visual reference.
4. `docs/visual/` specification.
5. Transitional code-drawn art.

Color authority when these renders disagree: dedicated sheets 01–06, then 07, then 00, then the legacy
brand board, then code art.

## Not duplicated here (use the existing repo copies)

- `10_CHARACTER-BIBLE.md` — byte-identical to `docs/CHARACTER-BIBLE.md`.
- `11_Original_Character_Brand_Board.png` — pixel-identical to
  `docs/reference-art/bidazoo-character-roster-reference.png`.

## Known corrections still required

These renders are approved as reference, with these items NONCANONICAL or pending correction:

- **Eagle head** (`05`, `00`): must clearly read white-headed. The brown crest sweeping the crown
  and nape is not canonical. CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER.
- **Bronco bandana** (`06`, `07`): must read maroon, not crimson or red.
- **Sheet 08, selectable Click:** Click shown among selectable profiles or chips is NONCANONICAL.
  Click is never selectable; host and guide only.
- **Sheet 08, red-X miss feedback:** NONCANONICAL. Miss feedback uses the orange/amber language; the
  try-again tone is gentle determination.
- **Destinations and hub (`09`, `00`):** the canonical seven BidaZoo World Expedition destinations
  govern identity and naming. Nonmatching environments (and the "Horizon Basecamp" name) are mood,
  material, composition, and lighting reference only.

## Provisional and pending items

- Exact production hex values are **PROVISIONAL**. Semantic color identities are locked; hex is not.
- Exact normalized proportions and head-unit numbers are **PROVISIONAL** (sheet 07 heights are a
  working reference only).
- Cultural and context review is **required** for all seven destinations before production-final
  approval. None is cleared.
- Human originality / look-alike review is **required** where documented (Eagle varsity "A", Bronco
  star, Bronco hat band, any element resembling existing mascot or team branding).
- Sheet typos noted in the report (for example "CELERRATE" on 07) are left as delivered.

## SHA-256 inventory

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `00_Master_Overview.png` | 2988837 | `bad3b90965d4900566d8e4792bc3c5d0ab4d84f6f9b8a13325b2dff41a74d6cd` |
| `01_Click_Character_Sheet.png` | 2770345 | `44a8f98b628a7d9403066a3d73f076d3b0a1ee9471a79f50e633aad57c70b086` |
| `02_Dino_Character_Sheet.png` | 2597056 | `993ae547844d004b8dc14f73e9e9ce4cfa2b7a55e5391f02f4ee311ec71d5413` |
| `03_Koala_Character_Sheet.png` | 2619828 | `9c5bce0f8d62a96695b4c9517e46a6ca8e827df14ec2f02affad9b96f0657cf2` |
| `04_Tarsier_Character_Sheet.png` | 2803310 | `bf6fc5f031599e781ee09a8a1f15a97d154a66933d3f0cb811a1418db9bce67d` |
| `05_Eagle_Character_Sheet.png` | 2801514 | `10109c6c5c34dfd3963a5ba9c4ab4bea91f313aeaa822bda40713e2ca7de57e0` |
| `06_Bronco_Character_Sheet.png` | 2856058 | `e12de25af229c63306a1363b9d14a3d6172d2ed83b34fd188d3db0a5c3fdbdee` |
| `07_Expressions_Proportions_Palettes.png` | 2606038 | `b21e7748d21f930a6209f7c9fbe684205d2a5c06a3ce915de7a26547350a912a` |
| `08_UI_and_Phaser_Asset_Spec.png` | 2755744 | `2754622ecd23859f5202cc507014e0b0b6f51d921ef0087de793c8a57bf24dcf` |
| `09_World_and_Environment_Guide.png` | 3229338 | `37769452b3990e9e03dce11819c42af0906621b3958d91ddf409e05f8c9c817c` |

Total: 10 files, 28,028,068 bytes (26.7 MiB).

Verify (from this folder): `sha256sum -c` against the values above, or on Windows
`Get-FileHash -Algorithm SHA256 *.png`.

These PNGs are tracked with Git LFS.
