/**
 * The child-facing role line and exactly THREE short personality traits per selectable starter,
 * shown on the "Choose Your Buddy" name plate as icon + word.
 *
 * Pure data, no Phaser. Presentation only: a trait never changes difficulty, rewards, mastery,
 * XP, coins or progression (docs/CHARACTER-BIBLE.md sections 2 and 7: every buddy is academically
 * equivalent). Click is not here: Click is the host, not a selectable buddy.
 *
 * Sources (nothing is invented without a note):
 *  - role words are the sheet-08 labels: Explorer, Scholar, Scout, Leader, Resilient;
 *  - Dino: "adventurous and curious" (Bible 4.1);  Koala: Focused, Analytical, Kind (Koala sheet expression names);
 *  - Tarsier: "scout, discovery" (Bible 4.3), Observant, Playful (Tarsier sheet) and "agile" (Bible 4.3);
 *  - Eagle: Bold, Determined (Eagle sheet), school spirit (Bible 4.4);
 *  - Bronco: "energetic, sports and adventure" (Bible 4.5).
 * COPY IS PROPOSED: the words are the owner's to edit here; nothing else depends on them.
 */
import type { CharacterId } from '../roster';

export type GlyphName =
  | 'compass'
  | 'magnifier'
  | 'sun'
  | 'book'
  | 'bulb'
  | 'heart'
  | 'eye'
  | 'smile'
  | 'bolt'
  | 'flag'
  | 'shield'
  | 'star'
  | 'ball';

export interface Trait {
  readonly glyph: GlyphName;
  readonly word: string;
}

export interface BuddyProfile {
  readonly role: string;
  readonly traits: readonly [Trait, Trait, Trait];
}

export const BUDDY_PROFILES: Readonly<Record<CharacterId, BuddyProfile>> = Object.freeze({
  dino: {
    role: 'Explorer',
    traits: [
      { glyph: 'compass', word: 'Adventurous' },
      { glyph: 'magnifier', word: 'Curious' },
      { glyph: 'sun', word: 'Cheerful' },
    ],
  },
  koala: {
    role: 'Scholar',
    traits: [
      { glyph: 'book', word: 'Focused' },
      { glyph: 'bulb', word: 'Analytical' },
      { glyph: 'heart', word: 'Kind' },
    ],
  },
  tarsier: {
    role: 'Scout',
    traits: [
      { glyph: 'eye', word: 'Observant' },
      { glyph: 'smile', word: 'Playful' },
      { glyph: 'bolt', word: 'Agile' },
    ],
  },
  eagle: {
    role: 'Leader',
    traits: [
      { glyph: 'flag', word: 'Bold' },
      { glyph: 'shield', word: 'Determined' },
      { glyph: 'star', word: 'Spirited' },
    ],
  },
  bronco: {
    role: 'Resilient',
    traits: [
      { glyph: 'bolt', word: 'Energetic' },
      { glyph: 'ball', word: 'Sporty' },
      { glyph: 'compass', word: 'Adventurous' },
    ],
  },
});

/** The line Click speaks on the select screen. */
export const GUIDE_LINE = 'Pick a buddy to start your adventure!';
