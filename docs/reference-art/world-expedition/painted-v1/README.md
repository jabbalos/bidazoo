# Painted v1: Basecamp and cast masters (November 7, 2026)

Full-size masters of the painted World Expedition art the owner approved on Saturday, November 7, 2026.
The game ships smaller copies of these (see the runtime folders below). These PNGs are stored with Git LFS.

All art was generated on OpenArt (account of the owner), model **Nano Banana 2** (`nano-banana-2`),
image-to-image, using the production-v1 and production-v1.1 sheets and earlier approved painted art as
references. Credits used for the whole set: about 1,760.

## What is here

| Folder | Contents |
| --- | --- |
| `drafts/` | The three Basecamp drafts (A treehouse, **B plaza, picked**, C terraces), 3168x1344 |
| `basecamp/` | Draft B cleaned up: `basecamp-full.png` (6336x2688), `basecamp-far.png` (sky and distance), `basecamp-mid.png` (RGBA, buildings and path), `basecamp.json` (measured path, gate and lodge-door positions) |
| `cast/` | Full-body painted cast: `<id>_walk_side.png` (side view, faces right) and `<id>_idle_front.png` (front three-quarter), transparent RGBA, about 1,350-1,650 px wide |
| `expressions/<id>/` | Painted head-and-bust expressions, six states each (`idle`, `happy`, `thinking`, `cheer`, `discover`, `tryAgain`), transparent RGBA, about 800 px wide, one shared framing per character |
| `cast-lineup.jpg`, `all-expressions.jpg` | Review sheets |

Characters: `dino`, `koala`, `tarsier`, `eagle`, `bronco` (the five starters) and `click` (the host,
never a selectable starter).

## Where the game uses them

| Runtime folder | From |
| --- | --- |
| `games/zoo-sprint/assets/world-expedition/basecamp/` | `basecamp/` (far JPEG + mid WebP, 1600 px tall) |
| `games/zoo-sprint/assets/world-expedition/walk-painted/` | `cast/` (walk 700 px, front 900 px, WebP) |
| `games/zoo-sprint/assets/world-expedition/characters-painted/` | `expressions/` (512 px tall WebP) |

Each runtime folder has a `PROVENANCE.json` with the exact OpenArt `historyId`, size and SHA-256 per
file. To swap art: replace the master here, re-export the runtime file, then run
`node tests/scripts/refresh-painted-provenance.mjs`. How the game lays them out:
[docs/visual/20-basecamp-walk.md](../../../visual/20-basecamp-walk.md).

## OpenArt record

| Item | historyId |
| --- | --- |
| Basecamp drafts A / B / C | `y6zLCfaF0PVSDlvCaRwq` / `e14wnBeHmxNqpFWBepdY` / `ehMjwg2m0btiDw5NN41j` |
| Basecamp full (4K edit of B) / far / mid | `Ds9G8dslCXUxiQyLHEj5` / `bRPxzUAvJuC6WS2fr5U7` / `4x8bUVkzQRaWkKQDf5I9` |
| Dino walk / front | `EixlzJAnZIWsolop6dbc` / `coeV5zYenWJ4BXQGsoXb` |
| Koala walk / front | `dyWrt0SHkHqLo5gqKYVd` / `M6swWFiOXVNTYt6VD8o4` |
| Tarsier walk / front | `F7ymMQwXKtUKJrAgLR34` / `5X7fl4I3rGIWXyaCvjFI` |
| Eagle walk / front | `rPnKg12uJCnUd47k0NPF` / `BWZ3VMXK7ZRAwFmMgaiw` |
| Bronco walk / front | `2Po1m0DpfADVO2Uk8Lp0` / `0O0defSCNxRgHs2lMlsd` |
| Click walk / front | `3ZlkbpXe6rfjbLF8arv7` / `0M0xVZvyfrCnsAVCbwoQ` |
| Expressions (36) | per file in `games/zoo-sprint/assets/world-expedition/characters-painted/PROVENANCE.json` |

Dino's expressions were recolored once (purple-violet eyes per the Character Bible, olive pack to match
the painted Dino); his `happy` had its closed far eye patched back by hand after the edit.

## Making more art in this style

Use OpenArt image-to-image with the approved painted pictures as references (the matching OpenArt image
of any master above, or upload the PNG). Generate on plain white, cut out the background, and compare
against the character's sheet in `production-v1.1/`. `docs/CHARACTER-BIBLE.md` LOCKED rules always win
(for example the Eagle reads white-headed, Bronco's bandana is maroon, Dino has exactly one backpack and
purple-violet eyes).

## Known small differences from the production-v1.1 sheets

- Tarsier fur reads a little more yellow, and it walks upright rather than in a crouch.
- Click's front view has no hair tuft (his walk view does).
- Bronco's walk view lacks the dark band above the white socks.
- Eagle's "A" is a generic gold letter; the originality review the docs ask for is still open.
- Cultural review of the destinations is still required before final (docs/visual/12); the Basecamp is the
  hub, not a destination.
