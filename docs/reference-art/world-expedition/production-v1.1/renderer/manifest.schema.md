# Character manifest (schema_version 1)

Machine-readable form: `manifest.schema.json` (JSON Schema 2020-12). The renderer also validates the
required structure itself (`validate_manifest`) so it has no dependency beyond Pillow and numpy.
Example manifests: `manifests/*.json`; a fully populated synthetic one: `selftest/selftest.json`.

Paths are relative to `--assets-root` (default: the manifest's folder) or absolute. An optional
`sha256` on any asset is checked; a mismatch is a report warning.

## Top level

| Key | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `character` | `id`, `name` (title uses it exactly, upper-cased), `role` (header subtitle), `tagline` (optional metadata, never rendered), `kind` = `starter` or `host` (selects the LOCKED role-tag string and treatment) |
| `sheet` | `status_line` (goes to the report, never onto the art), `logo` = asset for the one fixed `LOGO_ASSET` |
| `cast` | `k` cast-relative factor, `k_status`, `s0` cast constant (px per source unit; default 0.184; identical in all six manifests) |
| `palette` | `slots`: exactly 6 in order PRIMARY, SECONDARY, ACCENT, GEAR, DETAIL, CHARACTER-SPECIFIC. Each `{label?, name?, hex?, status?}`. No name and no hex, or `status: OPEN` => empty-pattern slot labelled OPEN |
| `turnaround` | `front`, `threeQuarter`, `side`, `back` (cell labels FRONT, 3/4 VIEW, SIDE VIEW, BACK VIEW) |
| `hero` | action pose asset |
| `head` | head close-up asset |
| `expressions` | `head_scale` (one value for all six) + `idle`, `happy`, `thinking`, `cheer`, `discover`, `tryAgain` |
| `details` | exactly 4 assets, each with a `caption` |
| `silhouettes` | `derive` (default true: matted alpha of turnaround views and hero) and optional explicit `items` (`front, threeQuarter, side, back, action`) |
| `proportion` | `front_reference` (`"turnaround.front"` or an asset) and optional `comparison` `{tag (3 letters), k}` |

## Asset object

```json
{ "path": "x.png", "status": "PROVISIONAL", "plan_status": "MISSING / TO AUTHOR",
  "sha256": "...", "notes": "...", "transform": { } }
```

`status` is the state of the file the manifest points at (doc 16 vocabulary + `OPEN` from doc 15):

| status | Renderer |
| --- | --- |
| `READY WITH CROP/MATTING` | `path` is the matted asset: drawn on the common background |
| `OWNER-ACCEPTED MINOR` | library status (v2.3): the owner accepted a minor residual flaw; drawn exactly like `READY WITH CROP/MATTING` (no tag) |
| `PROVISIONAL` | drawn, plus a 10 px `PROVISIONAL` tag top-right (omitted, and logged, where the cell is narrower than the tag, e.g. 72 px silhouettes) |
| `NEEDS CONTROLLED EDIT` | not approved for the slot: **placeholder** (marker `NEEDS EDIT — / NOT APPROVED`); `path` is kept as `source_ref` in the report |
| `MISSING / TO AUTHOR` | placeholder `MISSING / TO AUTHOR` |
| `OPEN` | placeholder `OPEN — / TO AUTHOR` (details, palette) |

A drawable status with an unreadable/absent file is never skipped: the slot becomes a `FILE ERROR`
placeholder listed in the report. `plan_status` (optional, informational) carries the doc 16 matrix code
so the backlog can be generated from the report.

## Asset-specific source-to-render transforms

Cast units: 1 unit = 1/1000 of the cast reference height. `S0` = px per unit (0.184 puts a 1000-unit,
k = 1.0 figure at 184 px).

* **turnaround.\*** (and `proportion.front_reference`)
  `ref_height_src_px` = source px spanning the cast reference height of this character in this asset
  (so units per source px = 1000 / that), or give `units_per_source_px` directly.
  Optional `ground_y_src` = source y of the lowest ground contact (default: matted bbox bottom).
  Scale = `S0 x k x units_per_source_px`, identical rule for all four views.
  Baseline y = 400; each view is centered on its cell center by matted bbox; max height above baseline 184,
  max width 335. Exceeding either => `ART/TEMPLATE REVIEW REQUIRED`; the art is drawn at true scale, unclipped.
  The proportion guide uses the same transform at `R x k / 1000` with `R = 168`.
* **hero.** `mode: "fit"` (default; the pose's own scale = fit inside the 300x246 box minus `clearance_px`,
  default 24, 8 for intentional extents) or `mode: "fixed"` + `px_per_source_px` (then clearance overflow is flagged).
* **head.** `eye_line_src_y` (required), optional `head_width_src_px` (default matted bbox width) and
  `head_center_src_x`. Scale = 176 / head width; eye line lands on y = 610; crop-to-fill allowed.
* **expressions.\*.** `eye_line_src_y` (required) and `units_per_source_px` (default 1). Scale =
  `expressions.head_scale x units_per_source_px`; the eye line lands on y = 598, the matted bbox is centered
  in the 125 px cell. Flags: matted width > 109, crown above y = 520. The bottom bleeds (clipped at the cell).
* **details.\*** contain-fit of the matted bbox inside the 142x82 area minus 8 px inset.
* **silhouettes.** Matted alpha, flat navy, uniformly fit in 72x182 (action 108x182), bottom on y = 1006.

Matted bbox = pixels with alpha >= 8/255.

## Not drawn by design

Tagline, `sheet.status_line` and `plan_status` live in the manifest/report. Doc 15 s10 keeps the status
line off the artwork.
