# 00 Master Visual Direction: BidaZoo World Expedition

Status: PROPOSED for review (Phase 1, docs only). Written October 12, 2026.
Base commit: `856d012d3139735d7f13ffeebabb723222fba2e1`. Branch: `feature/world-expedition-visuals`.

**Owner decisions applied October 12, 2026** (see [INGESTION-REPORT.md](INGESTION-REPORT.md)
section 0): Click is never selectable; the Eagle must read white-headed; the Bronco bandana is
maroon; the canonical first-seven destinations are the owner's list; the hub is **BidaZoo World
Expedition Basecamp** ("Horizon Basecamp" is rejected); gentle determination governs `tryAgain`;
the red X error panel is rejected; semantic color identities are locked but no hex is; the sheet-07
heights are a working reference only; cultural review is required for all seven destinations;
presentation states and motion states are two separate vocabularies. Nothing is committed yet.

This package defines how BidaZoo World Expedition should look. It changes no runtime code, tests,
or assets. Nothing here is implemented yet.

## 1. Name rule

The project and product track is always **BidaZoo World Expedition**.

The central hub is named **BidaZoo World Expedition Basecamp**. "Horizon Basecamp" is rejected.

"Adventure Academy" may exist only as a named facility inside that hub (a lodge, learning facility,
classroom or exploration building, or named program area), and it must not dominate the hub's
branding (see
[11](11-environment-style.md) and [12](12-destination-worlds.md)). It is never the project or
product title.

## 2. Authority and precedence

When sources disagree, use this order:

1. The canonical repo `docs/CHARACTER-BIBLE.md` **LOCKED** rules. (`10_CHARACTER-BIBLE.md` in the
   pack is a convenience copy; it is byte-identical today. The repo copy governs if they differ.)
2. The approved production render package: `00_Master_Overview.png`, `01` to `06` character
   sheets, `07_Expressions_Proportions_Palettes.png`, `08_UI_and_Phaser_Asset_Spec.png`, and
   `09_World_and_Environment_Guide.png`.
3. `11_Original_Character_Brand_Board.png`, the **legacy approved visual reference**. It is
   pixel-identical to `docs/reference-art/bidazoo-character-roster-reference.png` in the repo.
4. The approved `docs/visual` specification (this package, once approved).
5. Transitional code art (`characters.ts`), which is fallback implementation art and not a higher
   visual authority than the approved renderings.
6. Implementation judgment.

If a production rendering conflicts with a LOCKED rule, or two production renderings conflict with
each other, stop and report it. Do not average, merge, or invent a compromise.

**Color authority within the renders (RESOLVED, October 12, 2026):** when production renders
disagree about a character's color treatment, use: (A) that character's dedicated sheet 01 to 06,
(B) sheet 07, (C) master overview 00, (D) legacy brand board 11, (E) transitional code art. Hex stays
PROVISIONAL (see [09](09-palette.md)). The LOCKED Bible rules still outrank all of these.

The Bible defines required and prohibited identity traits. It does not mean a visual trait is
discarded just because the Bible is silent about it. Established reference traits are retained
unless they conflict with a locked rule.

The castle and fantasy-city environment visible in the old reference art is **not authoritative**.

## 3. Status legend used in every document

| Tag | Meaning |
| --- | --- |
| **LOCKED** | From the Character Bible. Changes only by written approval from the project owner. |
| **CARRIED** | An established trait seen in the reference art or current code that does not conflict with a LOCKED rule. Kept by default; changing it needs review, not necessarily a Bible change. |
| **SPEC-LOCKED** | Locked by the owner within this visual spec (October 12, 2026). Not a Bible rule; changes by owner approval. |
| **RESOLVED** | An owner decision that settled a conflict. Recorded with its date. |
| **PROPOSED** | New in this package. Not approved. Dimensions, budgets, hex values, and states are all PROPOSED until review. |
| **OPEN** | Undecided. Do not treat as decided. |

Nothing in this package is marked LOCKED unless the Bible already locks it. SPEC-LOCKED items are
only the ones the owner named on October 12, 2026 (semantic color identities and relative silhouette
rules).

## 4. Vision

BidaZoo World Expedition is a global adventure-learning universe. A child picks one of five
starters and travels from a central expedition hub to recognizable world places, guided by Click.

Direction in one line: **a polished animated expedition, not a fairy-tale kingdom.**

## 5. Visual pillars (PROPOSED)

1. **Global exploration.** Maps, routes, field gear, and destination doors are everywhere.
2. **Recognizable-place inspiration.** Each destination evokes a real place or wonder through
   original shapes, never a literal or theme-park copy.
3. **Discovery.** Every scene hints at something to find: a path, a glint, a lit window.
4. **Original BidaZoo interpretation.** Warm, handcrafted, readable at phone size.
5. **Subtle heritage.** Woven geometry, bamboo and rattan, lantern forms, tropical materials, and
   community gathering spaces recur across the hub. The Philippine destination is the strongest
   explicit expression. The platform is not exclusively Filipino-themed.

## 6. Audience and tone (LOCKED in the Bible, section 1)

Children roughly ages 6 to 12. A polished animated adventure/game platform. Not preschool
clip-art. Characters are told apart at a glance, including at small sizes.

## 7. Hard boundaries

- For this visual-production phase, art is presentation only. Starter choice and destination art
  must not alter question difficulty, grading, timing, mastery, XP, coins, or academic progression.
- Future World Expedition architecture may use destinations for navigation, curriculum grouping,
  game selection, story progression, unlocks, or expedition routing. Those product decisions are
  **OPEN**. This guide does not lock them in or out.
- No change to account identity UI, `apps/play/src/account/*`, `account.html`, guardian/device/legacy
  routes, auth cookies, database schema, identity contracts, SMTP, deployment, or
  `C:\BidaZoo-beta\app`.
- No copied school, team, or trademarked characters or marks.
- Exactly five selectable starters: Dino, Koala, Tarsier, Eagle, Bronco. Click is host only.

## 8. Package map

| File | Topic |
| --- | --- |
| [01-click.md](01-click.md) | Click production sheet |
| [02-dino.md](02-dino.md) | Dino production sheet |
| [03-koala.md](03-koala.md) | Koala production sheet |
| [04-tarsier.md](04-tarsier.md) | Tarsier production sheet |
| [05-eagle.md](05-eagle.md) | Eagle production sheet |
| [06-bronco.md](06-bronco.md) | Bronco production sheet |
| [07-expression-state-system.md](07-expression-state-system.md) | Expressions and states |
| [08-proportions-silhouettes.md](08-proportions-silhouettes.md) | Proportions and silhouettes |
| [09-palette.md](09-palette.md) | Exact palette proposal |
| [10-ui-component-style.md](10-ui-component-style.md) | UI component style |
| [11-environment-style.md](11-environment-style.md) | World and hub style |
| [12-destination-worlds.md](12-destination-worlds.md) | Hub and seven destinations |
| [13-phaser-asset-spec.md](13-phaser-asset-spec.md) | Phaser asset and export proposal |
| [14-do-dont-anti-drift.md](14-do-dont-anti-drift.md) | DO / DON'T guide |
| [INGESTION-REPORT.md](INGESTION-REPORT.md) | Production pack inventory, findings, conflicts, owner decisions |
| `docs/reference-art/world-expedition/production-v1/` | PLANNED storage for the approved render files (after branch verification) |

## 9. Phase gates

1. **Phase 1 (this package):** docs only, then review. Phase 1b: ingestion of the approved
   production pack (October 12, 2026); see [INGESTION-REPORT.md](INGESTION-REPORT.md).
2. **Phase 2 (not authorized):** final character and environment art production.
3. **Phase 3 (not authorized):** loader and scene integration under
   `games/zoo-sprint/assets/world-expedition/`, presentation only, behind the existing fallback.

## 10. Where the art lives today

Code-drawn transitional busts in `games/zoo-sprint/src/characters.ts` (320 px textures, moods
`idle`, `happy`, `tryAgain`). Palette in `theme.ts`. This package describes what replaces them;
it does not alter them.

## 11. Change control

Record any change to a LOCKED item in `CHARACTER-BIBLE.md` and `CHANGELOG.md` with its date.
Changes to PROPOSED items in this package are ordinary review edits.
