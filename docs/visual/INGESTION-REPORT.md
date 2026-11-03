# Visual Production Pack Ingestion Report

Status: PROPOSED for owner review. Ingested October 12, 2026. No artwork was modified, cropped,
converted, renamed, or turned into runtime assets. No runtime code, tests, atlases, or Phaser files
were touched. Nothing is committed.

All colors below were measured by sampling pixels from the supplied PNGs. Every measured or printed
hex value is **PROVISIONAL** until the owner approves a final palette. "Measured base" means the
median of hue-masked pixels in the middle lightness band of the turnaround views (highlights and
shadows excluded by method, not by hand), so treat it as a good estimate, not a spec.

## 0. Owner decisions applied (October 12, 2026)

The ingestion report was accepted and the owner ruled on the items below. Findings in sections 1 to
11 are the original ingestion record; where they say "conflict" or "owner decision", section 12 gives
the current status.

| # | Decision | Status |
| --- | --- | --- |
| 1 | Click is NEVER selectable. The sheet-08 Profile Selection card and chip with Click are a visual-concept error: NONCANONICAL. Click may appear on selection screens only as host, guide, narrator, helper, or a noninteractive or separately interactive guide element. Click is not redesigned. | RESOLVED |
| 2 | The Bible's "white head" governs. The brown crest sweeping the crown and nape is NOT canonical: CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER. A small rear brown accent may stay OPEN if the head still reads white. | RESOLVED |
| 3 | Bronco bandana is MAROON. Crimson is not authoritative. No exact hex locked. | RESOLVED |
| 4 | Canonical first seven destinations are the owner's list. Render 09 supplies visual ideas only (mood, composition, lighting, parallax, texture, material language, density). Great Wall and Andes may map directly. No silent merging. | RESOLVED |
| 5 | Hub is "BidaZoo World Expedition Basecamp". "Horizon Basecamp" rejected. Adventure Academy may exist inside as a lodge, learning facility, classroom or exploration building, or program area, never dominating hub branding. | RESOLVED |
| 6 | `tryAgain` is GENTLE DETERMINATION. Sheet-07 "Determined" is usable only if it reads encouraged, focused, resilient, ready to try again; never angry, ashamed, distressed, punished, or disappointed. Red X panel rejected; use the orange/amber miss language. | RESOLVED |
| 7 | Palette PARTIALLY LOCKED: semantic identities SPEC-LOCKED, no hex locked. | PARTIAL |
| 8 | Sheet-07 heights are a working reference. Relative silhouette rules SPEC-LOCKED. All numbers PROVISIONAL. | PARTIAL |
| 9 | Human look-alike review retained (Eagle "A", Bronco star, Bronco hat band, other mascot or team resemblance). Common symbols are not removed merely for being common. | RETAINED |
| 10 | Store approved individual render files `00` to `09` under `docs/reference-art/world-expedition/production-v1/` after branch verification and before the visual-spec checkpoint commit, with a README/manifest. No ZIP. No duplicate `10` or `11`. | PLANNED |
| 11 | Cultural review REQUIRED before production-final approval for all seven destinations. None is cleared. | REQUIRED |
| 12 | Two vocabularies: presentation states and motion animations. `run` and `jump` are not expression states. | RESOLVED |
| 13 | Eagle eyes are BLUE. The Bible does not lock eye color; the production rendering governs. Yellow in `characters.ts` is transitional, not canonical. (Added before the first commit.) | RESOLVED |
| 14 | Color visual-authority order: (A) dedicated sheets 01–06, (B) sheet 07, (C) overview 00, (D) legacy brand board, (E) transitional code. No hex locked; hex PROVISIONAL until corrected, final art is approved. | RESOLVED |
| 15 | The `00` vs `09` destination mismatch is RESOLVED: the canonical seven govern identity and naming; nonmatching package environments are mood/composition/material/lighting reference only. | RESOLVED (confirmed) |

## 1. Package inventory

Source: `BidaZoo_World_Expedition_Visual_Production_Pack.zip` (14 entries, 13 files). Original
filenames preserved. Image sheets are 1448 by 1086 px RGB except file 11.

| File | Content | Authority tier |
| --- | --- | --- |
| `00_Master_Overview.png` | Cast lineup, HUD sample, palette strip, silhouettes, six-biome strip | Production render |
| `01_Click_Character_Sheet.png` | Click turnaround, expressions, accessories, palette, proportions | Production render |
| `02_Dino_Character_Sheet.png` | Dino sheet | Production render |
| `03_Koala_Character_Sheet.png` | Koala sheet | Production render |
| `04_Tarsier_Character_Sheet.png` | Tarsier sheet | Production render |
| `05_Eagle_Character_Sheet.png` | Eagle sheet | Production render |
| `06_Bronco_Character_Sheet.png` | Bronco sheet | Production render |
| `07_Expressions_Proportions_Palettes.png` | Height lineup, silhouettes, per-character palettes, 6 by 6 expression matrix, shared rules | Production render |
| `08_UI_and_Phaser_Asset_Spec.png` | UI components and Phaser asset/export spec | Production render |
| `09_World_and_Environment_Guide.png` | Hub, seven worlds, patterns, DO and DON'T | Production render |
| `10_CHARACTER-BIBLE.md` | Convenience copy of the Bible | Reference copy |
| `11_Original_Character_Brand_Board.png` | 1672 by 941 RGBA legacy board | Legacy approved reference |
| `README.txt` | Pack contents and the project title rule | Informational |

Integrity findings:

- `10_CHARACTER-BIBLE.md` is **byte-identical** to the repo's `docs/CHARACTER-BIBLE.md`. The repo
  copy remains canonical.
- `11_Original_Character_Brand_Board.png` is **pixel-identical** to
  `docs/reference-art/bidazoo-character-roster-reference.png` already in the repo (zero pixel
  difference). Nothing new is learned from it, and it already lives in the repo.
- The pack is not in the repo yet. Where it should live (for example
  `docs/reference-art/world-expedition-pack/`) is an owner decision.

## 2. Cross-cast production style (all sheets)

- **Rendering:** soft, high-quality 3D-animated look. Smooth volumes, soft shading, rim light,
  fur and feather texture. **No hard ink outline.** This differs from the transitional code art,
  which uses a thick dark outline.
- **Eyes:** large, glossy, with several catchlights. Warm and friendly across the cast.
- **Gear language:** leather straps, brass buckles, paw-print patches, compass motif.
- **Shared rules printed on 07:** kid-friendly proportions, rounded forms, clear silhouettes,
  consistent rendering, expressive faces, adventure-ready details, positive and inclusive.

## 3. Character findings

### 3.1 Click (`01_Click_Character_Sheet.png`)

- **Poses:** front, 3/4, side, back, head close-up, action pose (pointing, mid-stride).
- **Expressions shown:** Happy, Encouraging (wink and thumbs up), Surprised, Thinking, Celebrate,
  Concerned.
- **Clothing and accessories:** dark leather harness with yellow buckles; a back explorer pack with
  a paw-print patch; a round chest emblem with a yellow "C" on a blue field.
- **Silhouette anchors:** tall upright ears with pink inner ear; upright lean; long thick tail; big
  dark feet.
- **Proportions:** sheet label "~3.5 heads (Chibi/Stylized)"; the printed ruler numbers are garbled.
  By eye on the front view about 2.9 heads. On 07 the height is 100 (1.00x).
- **Eyes, brows, mouth:** large round brown eyes with strong highlights; small orange brow tufts;
  wide open smile with tongue and small teeth.
- **Hands:** small mitten-style paws with short fingers.
- **Colors:** fur orange (measured base about `#F1812F`; sheet swatch `#FD6606`; 07 prints
  `#F6A54A`), tan belly and muzzle, cream, pink ears, brown nose, brown strap, yellow buckle,
  blue emblem (measured about `#0546B7`).
- **LOCKED rules satisfied:** orange/tan kangaroo; host and guide (the sheet states "Not a starter
  character. Appears as host, guide and narrator"); no invented birthplace shown.
- **Carried traits established:** harness, pack, "C" emblem, pointing guide pose.
- **Conflicts:** `08` shows Click as a card in Profile Selection and as a chip beside the starters
  (see section 12). Click's fur color differs between its sheet swatch, the 07 print, and the render.
- **Ambiguities:** proportion ruler is unreadable.

### 3.2 Dino (`02_Dino_Character_Sheet.png`)

- **Poses:** front, 3/4, side, back, head close-up, action pose (mid-hop).
- **Expressions shown:** Excited, Curious, Happy, Thinking, Surprised, Try-Again.
- **Clothing and accessories:** exactly one backpack, green with orange trim, a paw badge, buckles,
  and a leaf-shaped zipper pull; brown leather shoulder straps and a horizontal chest strap with a
  buckle (visually part of the same pack).
- **Silhouette anchors:** round head with a long snout; orange crest spikes on the head, back, and
  tail; stubby legs; tail.
- **Proportions:** label "~4 heads"; by eye about 2.7. On 07 the height is 90 (0.90x).
- **Eyes, brows, mouth:** large round eyes with a purple iris; soft brow ridge; wide toothy grin.
- **Hands:** rounded three-finger hands; paw pads visible in the action pose.
- **Colors:** teal body (measured about `#03BCB2`; swatch `#04A898`; 07 prints `#23D3C3`), light
  teal, dark teal, cream belly, spikes (measured about `#F74A04`; swatch `#FD5F22`; 07 prints
  `#FF7B2E`), reddish speckles. Backpack main green (swatch `#0A5147`), orange trim, brown strap,
  gold buckle, green zipper pull.
- **Texture:** subtle bumpy scale and speckle detail.
- **LOCKED rules satisfied:** teal; exactly one backpack in every view; no second bag, chest pack, or
  duplicate backpack.
- **Carried traits established:** purple eyes, toothy grin.
- **Open traits clarified:** the backpack is green with orange trim. The legacy board and the
  transitional code show a brown pack.
- **Ambiguities:** the spikes read red-orange in the render, so "orange" needs owner confirmation.
  The horizontal chest strap should be kept visibly attached to the one pack.

### 3.3 Koala (`03_Koala_Character_Sheet.png`)

- **Poses:** overview, front, 3/4, side, back, seated reading action pose, head close-up.
- **Expressions shown:** Calm (Neutral), Focused (Thinking), Happy (Cheerful), Analytical
  (Thinking), Surprised (Excited), Kind (Encouraging).
- **Clothing and accessories:** brown fedora with a dark band; thick black round glasses; dark brown
  jacket over a cream vest; a brown leather book with a compass emblem. **No backpack in any view,
  including the back view.**
- **Silhouette anchors:** very large round fuzzy ears; wide hat brim; chunky seated body.
- **Proportions:** label "~4 heads"; by eye about 2.5 with the hat. On 07 the height is 80 (0.80x).
- **Eyes, brows, mouth:** brown eyes behind glasses with big highlights; small brows; small closed
  smile; large dark oval nose.
- **Hands:** lavender paws.
- **Colors:** fur gray-lavender (swatches `#8C85A8` and `#C2B1E5`; measured base about `#9D86B8`;
  07 prints `#D9D9ED` and `#8B7DE6`), peach-pink inner ears, dark jacket (`#332826`), taupe
  (`#BAA38F`), cream (`#F1DAB7`), glasses dark brown-black.
- **LOCKED rules satisfied:** gray-lavender; academic and book-oriented; glasses; no backpack.
- **Carried traits established:** fedora, jacket, notebook (the legacy board's hat and jacket read
  black; the production sheet reads dark brown).
- **Open traits clarified:** compass emblem on the book.
- **Ambiguities:** fur color differs across sheet 03, sheet 07, and the code (see palette).

### 3.4 Tarsier (`04_Tarsier_Character_Sheet.png`)

- **Poses:** front, 3/4, side, back, head close-up, action pose (on a branch with binoculars).
- **Expressions shown:** Curious, Observant (binoculars), Happy, Thinking, Surprised, Playful.
- **Clothing and accessories:** yellow hooded jacket with dark harness straps; aviator-style goggles
  with cyan lenses and a brown strap on the hood; a small explorer backpack (green with orange trim
  and a paw badge); binoculars in some poses.
- **Silhouette anchors:** gigantic round eyes; large ears with pink inner ear; hood; long striped
  tail with a curl; crouched pose.
- **Proportions:** label "1 head = body height (approx.)"; by eye the head is about 55 percent of
  total height (about 1.8 heads). On 07 the height is 60 (0.60x), the smallest.
- **Eyes, brows, mouth:** the largest eyes in the cast: dark pupils with a thin amber ring and
  multiple catchlights; thick lower lashes; tiny mouth.
- **Hands:** long thin fingers with pads.
- **Colors:** fur brown-orange (measured about `#A5561D`), hood yellow (measured about `#FDC503`;
  07 prints `#FFCF5C`), goggle cyan (measured about `#06BFE6`), brown strap.
- **LOCKED rules satisfied:** small, agile silhouette; large expressive eyes; scout and discovery;
  goggles.
- **Carried traits established:** hood and yellow jacket.
- **Ambiguities:** the Tarsier carries a backpack. No rule forbids it (only Dino and Koala are
  constrained). It should not be mistaken for Dino's single locked pack.

### 3.5 Eagle (`05_Eagle_Character_Sheet.png`)

- **Poses:** front, 3/4, side, back, heroic flying action pose, head close-up.
- **Expressions shown:** Bold, Focused, Happy, Determined, Surprised, Celebrate.
- **Clothing and accessories:** green varsity-style jacket, open at the front, with a gold-striped
  collar and cuffs, paw-print buttons, a gold block "A" patch on the left chest, a small crest patch
  on the right chest, and a gold mountain emblem on the back.
- **Silhouette anchors:** broad layered wings; spiky brown crest; hooked beak; orange talons.
- **Proportions:** label "3.5 heads"; wingspan about 2.5 times body width; by eye about 2.9 heads.
  On 07 the height is 110 (1.10x), the tallest.
- **Eyes, brows, mouth:** bright blue iris with a black pupil and an amber rim; heavy dark angled
  brows; yellow-orange hooked beak, open in Happy and Celebrate.
- **Wings:** layered brown feathers with light edges.
- **Colors:** white face and breast (`#FFFFFF`), wings (`#A56B3D`, `#7A4A2B`, `#4E3626` printed),
  beak yellow, feet orange, jacket green (printed `#0F6B3A` on 05; `#167F5B` on 07; swatch
  `#0F5B3A`; measured base about `#114A2C`), dark green, cream `#F4E7C6`, gold (`#FFC531` on 05;
  `#F2C94C` on 07).
- **LOCKED rules satisfied:** brown wings; green varsity-style jacket; prominent "A".
- **Carried traits established:** blue eyes, heavy brows, gold trim, paw buttons.
- **Conflicts and ambiguities:** see section 12. The head close-up shows a sweeping **brown crest**
  across the crown and nape with a white face, cheeks, and throat. Whether that satisfies "white-headed"
  is an owner ruling. The "A" is a gold block letter; the Bible's originality rule needs the
  recommended human look-alike review, and this report does not claim clearance. The label
  "Academy A Patch" appears; the in-world Academy is not the product name.

### 3.6 Bronco (`06_Bronco_Character_Sheet.png`)

- **Poses:** front, 3/4, side, back, 3/4 back, head close-up, galloping action pose.
- **Expressions shown:** Energetic, Determined, Happy, Resilient, Surprised, Celebrate (raised hoof).
- **Clothing and accessories:** bandana at the neck; brown cowboy hat with a blue band and a gold
  star; a saddle-style pack and harness with a red star plate.
- **Silhouette anchors:** cowboy hat; long wavy dark mane; tall ears; full tail; white feathered
  socks over dark hooves.
- **Proportions:** label "~3.5 heads"; by eye about 2.6. On 07 the height is 100 (1.00x).
- **Eyes, brows, mouth:** large dark-brown eyes with highlights; expressive dark brows; wide open
  smile with teeth.
- **Colors:** coat orange (swatch `#DA6B2D`; measured base about `#DE7138`; 07 prints `#C66A3A`),
  white muzzle and socks, mane dark (`#321409`), hat brown (about `#6A3115`), gold band and star,
  bandana: sheet swatch labeled **"Maroon"** measures about `#9F0A26`; the rendered bandana base
  measures about `#A30620` with lit areas near `#D21D2C`; the 07 palette lists no maroon and prints
  an accent `#E63946` and gear `#B91C1C`.
- **LOCKED rules satisfied:** athletic horse; energetic, sports and adventure personality.
- **Conflicts and ambiguities:** the bandana (below). The blue hat band with a gold star is a
  combination worth the human look-alike review.

## 4. Expression and state mapping (`07` matrix versus the state list)

07 shows six columns for every character: IDLE (Neutral), HAPPY (Joyful), THINKING (Curious),
CELEBRATE (Excited; the header prints "CELERRATE"), SURPRISED (Wow), TRY AGAIN (Determined).

| State | Status in docs | Visual support in the pack | Verdict |
| --- | --- | --- | --- |
| `idle` | Implemented | 07 IDLE (Neutral), all six | Clearly supported |
| `happy` | Implemented | 07 HAPPY (Joyful), all six; every sheet has a Happy | Clearly supported |
| `tryAgain` | Implemented (gentle "hmm") | 07 TRY AGAIN (Determined): fists, furrowed brows, smirks. Dino sheet shows a wink and raised fist. Click's "Concerned" is softer and closer to the implemented tone, but it is not in 07. | Supported **as Determined**, which differs from the implemented gentle tone. Owner decision. |
| `ready` | Proposed | No clear visual | Not forced |
| `thinking` | Proposed | 07 THINKING (Curious), all six; Click, Dino, Tarsier sheets show Thinking | Clearly supported |
| `discover` | Proposed | Partial: SURPRISED (Wow); Tarsier Observant (binoculars); Dino Curious | Not forced |
| `cheer` | Proposed | 07 CELEBRATE (Excited), all six; Click, Eagle, Bronco sheets show Celebrate | Clearly supported |
| `proud` | Proposed | No clear visual | Not forced |
| `wave` (Click) | Proposed | None shown | Not supported |
| `point` (Click) | Proposed | Click's action pose points ("Let's explore!") | Supported for Click |

Extra expressions in the pack, not in the state list: Surprised (all six), and character-specific
ones (Click Encouraging and Concerned; Koala Focused, Analytical, Kind; Tarsier Observant and
Playful; Eagle Bold and Determined; Bronco Energetic, Determined, Resilient). The per-sheet sets and
the 07 matrix are not identical lists.

Observations: the Eagle's 07 TRY AGAIN reads stern, with a furrowed glare. The Dino's TRY AGAIN in
the 07 matrix is a calm smile, not clearly determined. Neither is forced into a state.

## 5. Palette recommendations (all PROVISIONAL, owner approval needed)

07 states its swatches are the "core colors for each character, to maintain consistency across all
media." Printed hex text and the swatch pixels beside it agree closely for most entries (difference
under about 45 in summed RGB) but not for all: Eagle "Secondary" (about 64) and Eagle "Detail"
(about 108) are off. Printed text on generated art is not reliable.

Recommendation: do not adopt any set yet. Review these meaningful differences first.

| Item | Code (`characters.ts`) | Sheet swatch | 07 printed | Rendered base | Flag |
| --- | --- | --- | --- | --- | --- |
| Click fur orange | none | `#FD6606` (01) | `#F6A54A` | `#F1812F` | Swatch is more saturated than the art |
| Click emblem blue | none | `#0054F8` | `#0D3B66` (Detail) | `#0546B7` | Three different blues |
| Dino teal | `#2FC4B2` | `#04A898` (02) | `#23D3C3` | `#03BCB2` | Lightness spread |
| Dino spikes | `#FF8A2B` | `#FD5F22` | `#FF7B2E` | `#F74A04` | Render reads red-orange; LOCKED says orange |
| Dino backpack | brown `#8A5A2B` | green `#0A5147` + orange trim | Gear `#8B5E2B` (brown) | green | Production is green; code and legacy are brown |
| Koala fur | `#AAA0CC` | `#8C85A8` / `#C2B1E5` (03) | `#D9D9ED` / `#8B7DE6` | `#9D86B8` | 07 is paler and more violet |
| Koala hat and jacket | none | `#332826` / `#3A3534` | Gear `#2E2E2E` | dark brown | Legacy read black |
| Tarsier hood | `#F2C230` | `#FDC744` (04) | `#FFCF5C` | `#FDC503` | Close |
| Tarsier fur | `#B98650` | `#6E3A17`...`#EECEAB` | Gear `#8C5A2B` | `#A5561D` | Render is more orange |
| Eagle jacket green | `#1F7D49` | `#0F5B3A` (05) | `#167F5B` | `#114A2C` | 05 and 07 differ |
| Eagle "A" and trim | cream `#F6ECC4` | gold `#FFC531` (05) | Gear `#F2C94C` | gold | Code uses cream; production is gold |
| Eagle wings | `#7B4A25` | `#7A4A2B` (print) | `#7B4A2C` | `#7C3C21` | Consistent |
| Bronco coat | `#B9672A` | `#DA6B2D` (06) | `#C66A3A` | `#DE7138` | Code is browner |
| Bronco bandana | `#8E1B30` | `#9F0A26` (06, "Maroon") | none (Accent `#E63946`, Gear `#B91C1C`) | `#A30620` base, lit `#D21D2C` | See conflicts |

Nothing in `characters.ts` is overwritten. The legacy board's earlier samples are superseded by
these cleaner sheets.

## 6. Proportion recommendations

The printed head counts (about 3.5 to 4) do not match the drawn proportions. By eye on the front
turnarounds (coarse, plus or minus 0.3 head) the characters are closer to: Click 2.9, Dino 2.7,
Koala 2.5 (with hat), Tarsier 1.8, Eagle 2.9, Bronco 2.6. The earlier docs used 3.4, 2.6, 2.4, 2.0,
3.0, 3.4, which were also approximate and were not preserved.

Recommendation: make **07's relative height lineup the canonical cross-cast scale** (Click 100,
Dino 90, Koala 80, Tarsier 60, Eagle 110, Bronco 100) and treat head counts as descriptive, not
as a spec. The earlier rule that Click appears smaller than a starter is withdrawn: on 07 Click is
equal to Bronco and taller than Dino, Koala, and Tarsier.

## 7. UI findings (`08`, guidance only)

- **Look:** parchment and carved-stone or wood panels with vine and leaf framing; glossy beveled
  buttons in green, blue, orange, and purple; wooden sign tabs (EXPLORE, LEARN, PLAY, GROW); brass
  compass and paw-print emblems. This is more textured and glossy than the earlier docs proposed.
- **Components shown:** HUD bar (profile avatar, XP bar, quest counter, currency, add button),
  level-map progress with node states, question card, four answer buttons, character portrait chips,
  tabs, profile selection cards, a guardian PIN card, a modal with three stars, a reward badge, CTA
  button states, success and error panels, and a common icon set.
- **Success and error:** a green "Correct! You got it right!" panel and a **red** "Not quite! Try
  again!" panel with a white X. The earlier docs and the current code use orange and no X.
- **Out of scope here:** the guardian PIN card and the storage and compliance notes concern identity
  and security. Nothing was extracted from them.
- **Inconsistency:** portrait chips are 96 by 96, but Bronco's is listed as 80 by 86.

## 8. Phaser asset and export guidance extracted from `08` (not implemented)

| Item | Value shown |
| --- | --- |
| Full character art | PNG with transparency, max 1024 by 1024 each |
| Poses | idle, happy, point, celebrate (3 to 5 per character) |
| Portrait card | 512 by 768 px, shown at 280 by 380 |
| Avatar and icon sizes | 256, 128, 96, 64, 48, 32 px |
| Buttons | 320 by 96, 9-slice, 32 px margins |
| Nodes and icons | 64 by 64 (1x and 2x); goal node 80 by 80 |
| Answer buttons | 320 by 120, 9-slice |
| Spritesheet frames | 256 by 256 (or 512 by 512), PNG, 4 to 8 frames per animation |
| Atlases | characters.atlas, ui.atlas, icons.atlas, fx.atlas; power-of-two frames; JSON atlas |
| Safe area | about 90 percent width by 85 percent height; 16:9 and 9:19; 40 px padding |

## 9. Environment findings (`09` versus docs 11 and 12)

Agreement: grounded, place-inspired worlds; no castles (09 has an explicit DON'T panel); paths,
rope bridges, observatories, and expedition basecamps; patterns and materials (wood, canvas, brass,
rope, stone); the project name BidaZoo World Expedition.

Differences are listed in section 12. The hub is named "Horizon Basecamp" on 09 and has a briefing
center, research lab, observatory tower, gear workshop, air dock, and world map plaza. It has no
Adventure Academy.

09's seven worlds, as shown: Cloud Terrace Ruins (Andean regions), Rose Canyon Passage
(Southwestern desert, natural arch), Great Wall Highlands (East Asian highlands), Jungle Step Pyramid
(Mesoamerican jungle), Reflection Garden Palace (East Asian garden, cherry blossoms), Reef Coast
Harbor (tropical island), Savanna Skylands (African savanna).

## 10. Authority outcome

Where production renders and the earlier docs differ, the docs are updated to record what the
renders show, without silently adopting anything that needs an owner ruling. The Bible is unchanged.

## 11. Docs updated

`00` through `14` carry an "Ingestion findings" note or corrections where this report applies, and
(October 12, 2026) the owner decisions in section 0. This file is new.

## 12. Conflict register (status after owner decisions, October 12, 2026)

### Resolved

| # | Conflict | Resolution |
| --- | --- | --- |
| 1 | Click shown as selectable on `08` | RESOLVED. NONCANONICAL. Click is host/guide only. |
| 2 | Eagle brown crest versus white head (LOCKED) | RESOLVED. White head governs. CORRECTION REQUIRED IN FUTURE PRODUCTION RENDER. |
| 3 | Bronco bandana crimson versus maroon (LOCKED) | RESOLVED. Maroon governs. No hex locked. |
| 4 | Destination set (owner seven versus `09`) | RESOLVED. Owner seven govern; `09` is visual ideas only. |
| 5 | Hub name (Horizon Basecamp versus BidaZoo World Expedition Basecamp) | RESOLVED. The latter. Adventure Academy optional, non-dominant. |
| 6 | `tryAgain` tone and the red X panel (`08`) | RESOLVED. Gentle determination; orange/amber; red X rejected. |
| 7 | Dino green backpack | RESOLVED. Acceptable. One-backpack rule unchanged. |
| 8 | Click scale versus the earlier "smaller than a starter" doc | RESOLVED as a working reference only: Click and Bronco among the taller; numbers PROVISIONAL. |
| 9 | Run/jump missing from the state list | RESOLVED. Separate motion vocabulary. |
| 10 | `00` versus `09` environment strips | RESOLVED (owner, October 12, 2026): canonical seven govern; nonmatching environments are reference only. |
| 12 | Eagle eye color | RESOLVED: BLUE. Code yellow is transitional. |
| 13 | Which render leads when colors disagree | RESOLVED: order 01–06, 07, 00, legacy board, code. Hex still PROVISIONAL. |
| 11 | Style: no hard outline (renders) versus outline (code) | Not a conflict: code art is fallback. Target look follows the renders. |

### Still open

| # | Open item | Notes |
| --- | --- | --- |
| A | Render-vs-render color values (order of authority is now settled): Click fur orange and emblem blue (01 vs 07), Dino teal and spike hue (02 vs 07), Koala fur (03 vs 07), Eagle green and gold plus navy detail (05 vs 07), Bronco coat, Tarsier fur | Apply the authority order to propose provisional values; hex stays PROVISIONAL until corrected, final art is approved. Semantic identity is locked; hex is not. |
| C | Eagle head and Bronco bandana corrected renders; sheet-08 Click profile card | Future production renders. Not generated now. |
| D | Human look-alike review | Eagle "A", Bronco star, Bronco hat band, other mascot or team resemblance. Not done. |
| E | Cultural and context review, all seven destinations | REQUIRED. None cleared. |
| F | Click host placement on selection screens | Exact placement, and whether the guide element is interactive. |
| G | Per-character presentation-state inventory | Not every character needs every state. |
| H | Motion vocabulary details | Frame counts, extra motion states beyond idle-loop, run, jump, land. |
| I | Printed head counts versus drawn proportions; final normalized scale | Determined by corrected production turnarounds. |
| J | Atlas grouping, portrait shape (512 by 768 card versus the 320 px bust), tool choice | OPEN, Phase 3. |
| K | Whether glossy UI buttons are adopted | OPEN. |
| L | Sheet typos and inconsistencies | "CELERRATE" on 07, garbled Click ruler, Bronco chip size, `08` lists `point` for all characters. Cosmetic; note for corrected renders. |
| M | Git size of the stored render files | About 26.7 MiB for `00` to `09`. Owner chose to store them; confirm no size objection. |

## 13. Remaining decisions that block locking the visual specification

Nothing from decisions 1 to 12 is blocking by itself. To lock the spec I still need:

1. **Final palette hex values**, proposed by applying the color authority order to open item A, and approved only with the corrected, final production art.
2. **Corrected production renders** for the Eagle head and the Bronco bandana (and an updated 08
   without selectable Click). These are the evidence that the corrections landed.
3. **Normalized scale** from the corrected turnaround sheets (open item I).
4. **Per-character presentation-state inventory** (open item G).
5. **Atlas and portrait format** (open item J), needed for the asset spec but not the look.

Gating production-final approval, but not the spec lock: the look-alike review (D) and the cultural
review (E).

## 14. Proposed canonical runtime filenames (PROPOSED, not generated)

Follows the convention printed on 08. Lowercase, underscores, four-digit frame numbers. Two
vocabularies (RESOLVED): presentation state tokens `idle`, `happy`, `tryagain` (code id `tryAgain`),
`thinking`, `cheer`, `discover`, `ready`, `proud`, `point`, `wave`; and a separate motion namespace
(PROPOSED) with `idle-loop`, `run`, `jump`, `land`.

```
games/zoo-sprint/assets/world-expedition/
  characters/character_{id}_{state}_{0001}.png     presentation, e.g. character_click_idle_0001.png
  characters/motion_{id}_{motion}_{0001}.png       motion, e.g. motion_koala_run_0001.png
  portraits/portrait_{id}_512x768.png              portrait card source
  portraits/avatar_{id}_{256|128|96|64|48|32}.png
  ui/ui_button_primary.png   ui_button_secondary.png   ui_button_answer_{green|blue|orange|purple}.png
  ui/ui_card_question.png    ui_panel_modal.png        ui_panel_correct.png   ui_panel_notquite.png
  ui/ui_hud_xp_bar.png       ui_icon_{star|coin|quest|settings|sound|music|info|home|hint|skip|reward|life|gem|locked}.png
  ui/node_{complete|current|locked|goal}.png
  fx/fx_confetti_0001.png
  worlds/bg_{world-slug}_01.png                    layered variants _far, _mid, _near if approved
  atlases/characters.atlas  ui.atlas  icons.atlas  fx.atlas   (JSON plus PNG)
```

`{id}` is one of click, dino, koala, tarsier, eagle, bronco. Click files are for the host and guide,
never a selectable profile. `{world-slug}` follows the owner set only (RESOLVED):

`great-wall-mountain`, `petra-rose-canyon`, `andes-cloud-terraces`, `maya-jungle-observatory`,
`taj-garden`, `nile-discovery-route`, `philippine-highlands-lantern-harbor`.

Hub: `basecamp` (BidaZoo World Expedition Basecamp). The 09-set slugs are dropped.

Texture keys: `bz-we-{kind}-{id}-{state}` for presentation and `bz-we-motion-{id}-{motion}` for motion.

## 15. Production reference storage plan (owner decision 10; NOT yet executed)

Executes only after the operator confirms the worktree, branch `feature/world-expedition-visuals`,
and lineage including `856d012d3139735d7f13ffeebabb723222fba2e1`, and before the visual-spec
checkpoint commit. Target: `docs/reference-art/world-expedition/production-v1/`, original filenames.

| File | Store? |
| --- | --- |
| `00_Master_Overview.png` to `09_World_and_Environment_Guide.png` (10 PNGs, about 26.7 MiB) | Yes |
| `README.md` (manifest: package version, ingestion date, authority level, known conflicts and corrections, Bible relationship, SHA-256 list) | Yes, new |
| `10_CHARACTER-BIBLE.md` | No. Byte-identical to `docs/CHARACTER-BIBLE.md`; use that. |
| `11_Original_Character_Brand_Board.png` | No. Pixel-identical to `docs/reference-art/bidazoo-character-roster-reference.png`; use that. |
| The ZIP and the pack `README.txt` | No |

Known corrections to note in the manifest: Eagle head crest (`05`, `00`), Bronco bandana crimson
(`06`, `07`), Click in Profile Selection (`08`), red X panel (`08`), "Horizon Basecamp" and the
09 destination set (`09`).
