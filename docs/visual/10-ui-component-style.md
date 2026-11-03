# 10 UI Component Style Guide

Status: PROPOSED. This is presentation only. It does not change the hit-target geometry,
`data-*` attributes, or accessibility mirror that the current tests rely on.

## 1. Visual language: the expedition field kit

UI reads as a field journal and map table: parchment cards, brass accents, route lines, stamp-style
badges, and rounded timber or canvas panels. Not glossy app chrome, not a storybook.

## 2. Current code to preserve

- `TapButton` in `ui.ts`: rounded rectangle with a lower shade layer; label shrinks to fit.
- `BUTTON_STYLES`: `card`, `primary` (sun), `good`, `bad` (orange), `dim`.
- `HitTarget` and `publishSurface`: tap-target rectangles in canvas CSS pixels, read by tests.

Any restyle keeps the same rectangles, ids, and labels.

## 3. Components (PROPOSED)

| Component | Style |
| --- | --- |
| Primary button | Sun yellow with brass edge, pressed state drops the shade layer |
| Answer button (card) | Parchment card, ink text, soft inner border, optional woven trim line |
| Correct feedback | Green fill, check icon, no sound dependency |
| Try-again feedback | Orange/amber fill, circular-arrow icon, never red, never an X (RESOLVED: the red X panel on sheet 08 is rejected). Tone is gentle determination. |
| Disabled | Dim canvas gray with reduced contrast but readable text |
| Selection card (starter) | Parchment panel, brass border when selected, character portrait inside |
| Progress | Route line with map pins; the current pin is brass, completed pins are green |
| Status chips | Small stamp shapes (rounded, slight rotation of 0 to 2 degrees) |
| Panels | Timber or canvas frames with a subtle woven corner motif |
| Map / hub nav | Pins and door tags, large tap areas |

## 4. Typography

The platform uses a system font stack today. Self-hosted fonts would need to be added under the
`font-src 'self'` policy and are OPEN. Until then, size and weight carry hierarchy: bold labels,
regular body.

## 5. Sizing and touch (from the Bible and architecture docs)

- Minimum 44 CSS px tap targets.
- No horizontal overflow.
- No unnecessary scrolling during question and answer play.
- The smallest phone viewport (360 by 640) is a design target.

## 6. Heritage touches (PROPOSED, subtle)

A thin woven-geometry border (diamond or zigzag repeat) on select panels; a bamboo-segment divider;
a lantern shape as a loading or hint icon. Use sparingly. They should never crowd the answer area.

## 7. Motion

Button press is immediate. Reactions follow the baselines in [07](07-expression-state-system.md).
Reduced-motion users get static states.

## 8. Not allowed

Glitter or sparkle overlays, ornate gilded frames, and castle-turret shapes.

Red failure styling and the red X "Not quite!" panel from sheet 08 are **REJECTED** (owner,
October 12, 2026). The miss language stays the established orange/amber. Glossy beveled buttons
remain OPEN (not adopted, not prohibited).

## 9. Ingestion findings (production sheet 08)

Source: `08_UI_and_Phaser_Asset_Spec.png`. Guidance only; nothing is implemented. Detail in
[INGESTION-REPORT.md](INGESTION-REPORT.md) sections 7 and 8.

- **Look:** parchment and carved stone or wood panels with vine framing; glossy beveled buttons in
  green, blue, orange, and purple; wooden sign tabs (EXPLORE, LEARN, PLAY, GROW); brass compass and
  paw-print emblems. This is more textured and glossy than the first draft's flat field-journal idea.
- **Components shown:** HUD bar (avatar, XP bar, quest counter, currency, add button), level-map
  progress nodes (default, current, locked, goal), question card, four answer buttons, character
  portrait chips, tabs, profile selection cards, modal with stars, reward badge, CTA button states,
  success and error panels, and a common icon set.
- **Sizes shown:** nodes 64 by 64 (goal 80 by 80); answer buttons 320 by 120; buttons 320 by 96;
  portrait chips 96 by 96; portrait cards 280 by 380; 9-slice margins 32 px.
- **NONCANONICAL (RESOLVED):** the Profile Selection cards and portrait chips that include **Click**
  as a selectable option are a visual-concept error. Click is never selectable. On a selection screen
  Click may appear only as host, guide, narrator, helper, or a noninteractive (or separately
  interactive) guide element. The selectable set is exactly Dino, Koala, Tarsier, Eagle, Bronco.
- **REJECTED:** the red "Not quite!" panel with an X. Use the orange/amber miss feedback. The
  try-again tone is gentle determination (see [07](07-expression-state-system.md)).
- **Not used:** the guardian PIN card and the storage and compliance notes concern identity and
  security, which this track does not touch.
- **Unchanged contract:** hit-target ids, rectangles, and `data-*` attributes stay as they are.
