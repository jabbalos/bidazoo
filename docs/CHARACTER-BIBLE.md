# Character Bible

Status: identity constraints LOCKED, October 12, 2026. Final production artwork may evolve, but
every constraint marked **LOCKED** changes only by explicit written approval from the project
owner. Anything marked **OPEN** is not decided; do not treat it as decided. Anything marked
**GUIDANCE** is a recommended implementation approach, not a character identity rule.

This document describes who the characters are and how they must feel. It does not describe
learning logic. The server-authoritative rules in [ARCHITECTURE.md](ARCHITECTURE.md) and
[SECURITY.md](SECURITY.md) are unaffected by anything here. Current project status is in
[PROJECT-STATE.md](PROJECT-STATE.md).

## 1. Audience and tone (LOCKED)

- Target visual audience: children roughly ages 6 to 12.
- Visual tone: a polished animated adventure/game platform. Not preschool clip-art.
- Differentiated silhouettes, props, posture, and personality: a child should be able to tell the
  characters apart at a glance, including at small sizes.

This sets the art direction only. Product age bands and standards coverage remain open in
[PRODUCT.md](PRODUCT.md).

## 2. System rules (LOCKED)

1. **Exactly five selectable starters** (Dino, Koala, Tarsier, Eagle, Bronco), unless explicitly
   changed later.
2. **Academic equivalence.** All starters are academically equivalent. Character selection must not
   affect question difficulty, grading, mastery, XP, coins, or academic progression.
3. **No merging or blending** of characters.
4. **No new starters** without explicit approval.
5. **Click is not selectable.** Click is the platform host (section 3).
6. **Originality.** Every design is original (section 6).
7. **Separation.** Character implementation stays separate from the server-authoritative learning
   architecture (section 7).

## 3. Click: platform host (LOCKED identity)

- Orange/tan kangaroo.
- Platform host, guide, and mascot.
- **Not** a selectable starter.
- Click must never replace the learner's chosen starter/avatar. Click guides the child through the
  experience alongside the learner's character.

OPEN: Click's exact placement on screen, how often Click appears, dialogue style, interaction
pattern, voice or sound, and how Click relates to any existing Clickaroo or Hop Quest mascot
artwork (no existing artwork is reused until that is decided).

## 4. Selectable starters

### 4.1 Dino (LOCKED)
- Teal explorer dinosaur with orange dorsal spikes.
- **Exactly one** explorer backpack. No second bag, no chest pack, no duplicate backpack.
- Personality: adventurous and curious.

### 4.2 Koala (LOCKED)
- Gray-lavender scholar.
- Academic, book-oriented visual language. Glasses are acceptable.
- **No backpack.**

### 4.3 Tarsier (LOCKED)
- Small, agile silhouette with large, expressive eyes.
- Personality: scout, discovery.
- Goggles are part of the visual concept.

### 4.4 Eagle (LOCKED)
- White-headed, brown-winged eagle.
- Green varsity-style letter jacket with a prominent letter "A".
- May subtly evoke school spirit.
- Must remain an original design and must not reproduce an existing school logo or mascot design
  (section 6).

### 4.5 Bronco (LOCKED)
- Athletic horse/bronco with a maroon bandana.
- Personality: energetic, sports and adventure.

OPEN for every character: names shown to children, exact proportions, full palettes beyond the
colors named above, facial style, voice or sound, animation sets, and unlockable or alternate
outfits (none are decided).

## 5. Differentiation summary (derived from the locked traits)

| Character | Identity anchors | Must not have |
| --- | --- | --- |
| Click (host) | Orange/tan kangaroo; guide; never selectable | Replacing the learner's starter |
| Dino | Teal body, orange dorsal spikes, exactly one backpack | A second bag, chest pack, or duplicate backpack |
| Koala | Gray-lavender, academic/book-oriented, glasses allowed | A backpack |
| Tarsier | Small agile silhouette, large expressive eyes, goggles | (nothing further locked) |
| Eagle | White head, brown wings, green varsity-style letter jacket, prominent "A" | A real school's logo or mascot design |
| Bronco | Athletic horse, maroon bandana | (nothing further locked) |

## 6. Originality and brand safety (LOCKED)

- No design may reproduce an existing school logo, mascot, team mark, or trademarked character.
- The Eagle's letter "A" and varsity-jacket styling, and the Bronco's maroon bandana, must be
  original in letterform, proportions, and styling, and must not be copied from any real school,
  team, or brand. A human review of final artwork for look-alikes is recommended.
- Do not copy artwork from Hop Quest, Fact Crew, or any other product (see
  [REFERENCE-REVIEW.md](REFERENCE-REVIEW.md)).

## 7. Architecture boundary

For Checkpoint C and until a separate architecture change is approved:

- Character selection remains **presentation-only**, as it is today (the chosen animal lives in
  `localStorage`; no API request or response carries it).
- Do not add server-side character persistence, API fields, schema fields, or learning-engine
  branches as part of Checkpoint C.
- The learning layer (`learning-core`, `apps/api`, `database`, `contracts`) does not branch on a
  character.

This is a scope boundary, not a permanent prohibition. BidaZoo may later need a cosmetic avatar
preference that persists across games or devices. That would require its own explicitly approved
architecture change, and it would have to keep the academic-equivalence rule in section 2.

## 8. Implementation guidance (GUIDANCE, not locked identity)

### 8.1 Character ids

The current recommended ids are `click`, `dino`, `koala`, `tarsier`, `eagle`, and `bronco`. This is
an implementation convention, not a brand constraint, and it may change. `click` is never part of
the selectable list.

### 8.2 Mobile selection experience

The selection screen must be a deliberate mobile experience. Required:

- Minimum practical touch targets (the project currently uses at least 44 CSS px; see
  [ARCHITECTURE.md](ARCHITECTURE.md) section 10).
- No accidental horizontal overflow.
- No unnecessary scrolling during question/answer gameplay.

It is **not** required that all five character cards be visible at once on the smallest phone
(360x640). Selection may use paging, a carousel, a grid, or another intentional pattern if needed.
OPEN: which pattern.

### 8.3 Future asset compatibility

The intent is that character art can change format without rewriting the learning systems. Assets
should sit behind a presentation-only layer keyed by character id and state (for example idle,
happy, try-again), so changing how a character is drawn never touches the API, database, or
learning-core. Formats the project intends to be able to support:

- **Static portraits** (selection screen, results, profile).
- **Spritesheets / texture atlases** (in-run animation; Phaser-native).
- **Animated WebP or an equivalent lightweight reaction format** (short loops, with a static
  fallback).
- **Future 3D / GLB assets** (not planned for the near term; must stay behind the same layer).

These are possibilities, not requirements. Not every character needs every format, and the final
set per character is OPEN.

### 8.4 Current code

Checkpoint C (October 12, 2026) replaced the Panda, Monkey, and Lion placeholders in
`games/zoo-sprint` with the five locked starters (Dino, Koala, Tarsier, Eagle, Bronco), drawn in
code as **transitional art** that honors the anchors above. Ids are `dino`, `koala`, `tarsier`,
`eagle`, `bronco` (a code convention, not a brand contract); Dino is the default. Click is **not**
implemented: not selectable, not in the registry, no host behavior or dialogue. The art is
generated once per character and mood into a cached texture, so portraits, spritesheets, or WebP
can replace it later without touching scenes. The selection is still presentation-only
(`localStorage`); old `panda`/`monkey`/`lion` values fall back to Dino with no migration.

**Update (October 15, 2026).** The paragraph above describes `main`. On the runtime branch
`feature/world-expedition-runtime-integration` (Checkpoints F1 to F6, closed; `f3b5483`) the
production art is complete and integrated: all six cast members, including Click, have six
production expressions (idle, happy, thinking, cheer, discover, tryAgain). The five starters remain
the only selectable characters. Click is the host/guide and is **not selectable**: it has no starter
storage value and appears in no gameplay API payload. Expressions are presentation-only. This
reaches `main` at release-candidate integration. No LOCKED constraint above has changed.

## 9. Change control

Changes to LOCKED items need explicit written approval from the project owner. Record each change
here with its date and in [CHANGELOG.md](CHANGELOG.md).
