# INVENTORY — production-v1.1 (generated after the last PNG write; hashes = bytes of the files in this folder)

SHA-256 of every file: `SHA256SUMS.txt` (verify with `sha256sum -c SHA256SUMS.txt` from this folder). Decoded-pixel hashes are listed for the nine top-level PNGs because storage layers may add metadata chunks (C2PA `caBX`) without changing pixels.

## Release PNGs (1448×1086 RGB)

| File | Role | bytes | sha256 (file) | sha256 (decoded pixels) |
| --- | --- | --- | --- | --- |
| `00_Master_Overview.png` | composite (M4 pass) | 2790401 | `686f530dcf473f0aaa74aef48400e72cc257803f238b0169d84510e271befbfd` | `28c8ed3ec52d23c62177161a110b229dfa197cd43c051eba5db86c3da7738ffe` |
| `01_Click_Character_Sheet.png` | canonical character sheet (renderer output) | 515236 | `05f9999a4f530404814f2a0b7da59d2cfa74ed9c3b75d586019348f1d4a71e55` | `b08874c84b65e6d3ce9fccb3523bc332369deac7c75ee4d12db7fccf7b7147f6` |
| `02_Dino_Character_Sheet.png` | canonical character sheet (renderer output) | 599319 | `7c6fd1ddb5767c2eecc9764b290e8c1f5692febc1bd85c86401d02d9c397e61d` | `ce21d81b2de2ca0852b04cba3062a9cb2f6fe8f6da0ce04ede17d4d58f02e9f2` |
| `03_Koala_Character_Sheet.png` | canonical character sheet (renderer output) | 519884 | `3c33ef095c717358c30069d344097f76017f0c38ecef735321db11cedf57856f` | `57c42e5f08b07eb5451df03135cf27338a3939ba5d7a8afdd66eaf2b5c028991` |
| `04_Tarsier_Character_Sheet.png` | canonical character sheet (renderer output) | 493394 | `3dd5dc3f02556e4b148041f2e19ded507f5a53d8dce2aac9a7351e0afc7a3da3` | `ee9ea66612eaa0060b57cc5e9c9a7c955515fed3884e04adbab0a9c56f28af1a` |
| `05_Eagle_Character_Sheet.png` | canonical character sheet (renderer output) | 654009 | `4f399741aec94ee530789385d9c93c6d5f832e7b868c8587bf135148b2359f98` | `412b2e30b997bb4fa7d71560f5719139524ce111ef096efdd455ff1a51dfc173` |
| `06_Bronco_Character_Sheet.png` | canonical character sheet (renderer output) | 595979 | `20db8fee1133d930acb35fb5b90af866177a97e282d566eb20a15003dba551c7` | `9e57b8a527a668f545c244f73cb1b6160030baf133362681b11cbf65867dfcf3` |
| `07_Expressions_Proportions_Palettes.png` | composite (M4 pass) | 1816131 | `00cc7359c123034e58b1408b4614a6061ab4387e55f338dc2dba8b4a35b41d84` | `715879f3a42901aa5cebb6d89c2977b329aeb46b1223ad0c3e30311caa806b85` |
| `08_UI_and_Phaser_Asset_Spec.png` | composite (M4 pass) | 2502167 | `3a203230505e948b05f95a2d69a936d4fa9ee6ca5e90a0eef66292944cf953bd` | `40c1ad81199e23a7738cc7c2c55b34ea95f356ebe7d65dc0ed6caecdf2202aea` |

## Frozen IDLE expression assets (must stay identical)

| Character | file | expected sha256 | on disk | match |
| --- | --- | --- | --- | --- |
| click | `expression-batch/click/click_idle.png` | `71432a630f4346e7bc7fd1298a8c6a6a788736c5ccaf05d3da7e489beb20e726` | `71432a630f4346e7bc7fd1298a8c6a6a788736c5ccaf05d3da7e489beb20e726` | YES |
| tarsier | `expression-batch/tarsier/tarsier_idle.png` | `dace8b6cc79e4be0c869807ecb6ae5158b8221094547545f7e958bcc544da2f0` | `dace8b6cc79e4be0c869807ecb6ae5158b8221094547545f7e958bcc544da2f0` | YES |
| dino | `expression-batch/dino/dino_idle.png` | `95aa9a23772dbf312408f4c4e0d4e0097dd512a46bd7c9bd2762b9817e217f76` | `95aa9a23772dbf312408f4c4e0d4e0097dd512a46bd7c9bd2762b9817e217f76` | YES |
| bronco | `expression-batch/bronco/bronco_idle.png` | `950796e5799ed3d02c4a330b45aa96fddcf7d70e5bc1c7f3725c883b57a777c0` | `950796e5799ed3d02c4a330b45aa96fddcf7d70e5bc1c7f3725c883b57a777c0` | YES |
| eagle | `expression-batch/eagle/eagle_idle.png` | `2a35baf058d0f3ad7b5f0f4918fbbc2ebc08b5e521e758ee7049a7f2d6a1a78a` | `2a35baf058d0f3ad7b5f0f4918fbbc2ebc08b5e521e758ee7049a7f2d6a1a78a` | YES |

## Expressions (36): status

PASS 32; OWNER-ACCEPTED MINOR 4: Eagle THINKING, Eagle TRY AGAIN, Koala CHEER, Bronco CHEER. Koala THINKING canonical file = `koala_thinking_analytical.png`. Source of status: `renderer/expression_status.json`.

## Asset library

Canonical 90 (READY WITH CROP/MATTING 82, OWNER-ACCEPTED MINOR 8) · supplemental 11 · historical silhouettes 28 (QA comparison only) · superseded 9 (audit only).

| Character | canonical | supplemental | OWNER-ACCEPTED MINOR (canonical) |
| --- | --- | --- | --- |
| click | 15 | 0 | — |
| dino | 15 | 3 | head |
| koala | 15 | 2 | detail_glasses, head, turnaround_34 |
| tarsier | 15 | 3 | hero |
| eagle | 15 | 2 | hero |
| bronco | 15 | 1 | head, hero |

### Supplemental / unverified assets (never referenced by a canonical slot)

| Character | file | status |
| --- | --- | --- |
| dino | `dino_detail_backpack_back.png` | READY WITH CROP/MATTING |
| dino | `dino_detail_backpack_side.png` | READY WITH CROP/MATTING |
| dino | `dino_detail_zipper_pull.png` | READY WITH CROP/MATTING |
| koala | `koala_head_panel.png` | READY WITH CROP/MATTING |
| koala | `koala_hero_overview.png` | NEEDS CONTROLLED EDIT |
| tarsier | `tarsier_detail_backpack_back.png` | READY WITH CROP/MATTING |
| tarsier | `tarsier_detail_goggles_side.png` | READY WITH CROP/MATTING |
| tarsier | `tarsier_head_panel_alt.png` | PROVISIONAL |
| eagle | `eagle_detail_cuff.png` | READY WITH CROP/MATTING |
| eagle | `eagle_detail_custom_buttons.png` | READY WITH CROP/MATTING |
| bronco | `bronco_turnaround_34back_SUPPLEMENTAL.png` | READY WITH CROP/MATTING |

## Tree

| Folder | files | PNG | bytes |
| --- | --- | --- | --- |
| `(root files)` | 11 | 9 | 10497379 |
| `asset-library` | 283 | 276 | 51922403 |
| `composite-tools` | 7 | 0 | 57259 |
| `expression-batch` | 67 | 36 | 2055310 |
| `library-qa` | 8 | 7 | 1937183 |
| `library-tools` | 12 | 0 | 108201 |
| `logo` | 12 | 6 | 5043986 |
| `qa` | 15 | 1 | 1332923 |
| `renderer` | 51 | 7 | 3755501 |

## Provenance notes
* Sheets 01–06: `renderer/build_all.py` (README "Reproducibility"); inputs are the files in `asset-library/`, `expression-batch/`, `logo/`, `renderer/palettes.json`, `renderer/fonts/`. Build report and determinism proof: `qa/`.
* Composites 00/07/08: `composite-tools/` (inputs were the interim v1.1 composites, not in the repository). Docs changes: `qa/docs-sync-report.md`.
* Library: M2 approved library with M4 changes (Koala glasses frames recoloured to near-black; 30 canonical silhouettes derived from approved matted alpha; roles added): `library-tools/`, `library-qa/`.
* Logo: reconstruction from `production-v1/02_Dino_Character_Sheet.png` (see `logo/README.md`); OWNER-APPROVED for production-v1.1.
* Independent release QA: `qa/RELEASE-QA-independent-review.md` (its five must-fix items were resolved before this inventory; the owner decisions of October 13, 2026 are recorded in README/docs).
* Absolute `/mnt/...` strings inside provenance notes and tool default arguments refer to the preparation workspace; the build and all manifests resolve relative to this folder.
* `production-v1/` is not modified by this release.
