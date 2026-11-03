/**
 * The presentation-only character contract for BidaZoo World Expedition (Checkpoint F2).
 *
 *   roster.ts (starter ids, labels, saved choice)
 *      -> character-definitions.ts (this file: who exists on screen, how big, which states)
 *      -> character-assets.ts (which curated source art backs each state)
 *
 * Pure data. No Phaser, no network, no storage, no server, and no scene imports this yet: F2
 * only establishes and tests the contract. The code-drawn art in characters.ts keeps running
 * unchanged.
 *
 * PRESENTATION ONLY. A character definition describes how someone looks on screen and nothing
 * else. It never carries, and must never gain, anything about difficulty, question selection,
 * mastery, grading, XP, coins, progression, correctness, or attempt scoring. Choosing a starter
 * changes none of those (docs/CHARACTER-BIBLE.md sections 2 and 7).
 *
 * Starter authority stays in roster.ts: the five selectable starters are DERIVED from `STARTERS`
 * here, never re-listed, so the two files cannot drift apart. Click is the platform host and
 * guide. Click is NOT a selectable starter: it is registered here (it has art and a scale factor)
 * but it is never part of `STARTERS`, `STARTER_DEFINITIONS`, or any selection screen. Anything
 * that builds the starter menu must use `STARTERS` or `STARTER_DEFINITIONS`, never
 * `CHARACTER_DEFINITIONS`.
 */
import { STARTERS, type CharacterId } from './roster';

const STATES = ['idle', 'happy', 'thinking', 'cheer', 'discover', 'tryAgain'] as const;

/**
 * The six canonical presentation states, in canonical order. This is the stable runtime
 * vocabulary: source filenames may differ from it (see character-assets.ts), these names do not.
 * `tryAgain` is encouraging and resilient, never shaming (docs/visual/07-expression-state-system.md).
 */
export type ExpressionState = (typeof STATES)[number];

export const EXPRESSION_STATES: readonly ExpressionState[] = Object.freeze([...STATES]);

/** Everyone who can appear on screen: the five starters plus the host. */
export type CastId = CharacterId | 'click';

export type CharacterRole = 'starter' | 'host-guide';

/**
 * Owner-approved, art-relative scale factors (production-v1.1). They are presentation references
 * from the character sheets, NOT a rule that every character should look the same height, and
 * they are not applied by any scene yet.
 */
export const CAST_SCALE_FACTORS: Readonly<Record<CastId, number>> = Object.freeze({
  eagle: 1.0,
  click: 0.92,
  bronco: 0.92,
  dino: 0.85,
  koala: 0.76,
  tarsier: 0.57,
});

/**
 * How strongly the approved cast-relative scale shows up when characters are drawn BIG (hero stage,
 * medallions, the gameplay buddy, the results podium). The factors above are turnaround and
 * proportion references: applied 1:1 to a hero (Tarsier = 0.57) they would shrink one starter to a
 * speck, which is the exact failure this presentation pass fixes. So scenes use
 * `castPresence(id) = factor ^ PRESENCE_EXPONENT`: it keeps the ORDER and the relationships
 * (Eagle largest, then Click and Bronco, Dino, Koala, Tarsier smallest) while never dropping a
 * starter below ~0.8 of the largest. 0 would ignore the factors; 1 would apply them literally.
 * OWNER DECISION: tune or retire this constant (see docs/visual/18-world-expedition-visual-recovery.md).
 */
export const PRESENCE_EXPONENT = 0.4;

export function castPresence(id: CastId): number {
  return CAST_SCALE_FACTORS[id] ** PRESENCE_EXPONENT;
}

interface DefinitionBase {
  /** The child-facing name. */
  readonly displayName: string;
  /** Cast-relative art scale (see CAST_SCALE_FACTORS). */
  readonly scaleFactor: number;
  /** Always exactly the six canonical states. */
  readonly expressions: readonly ExpressionState[];
}

/** One of the five selectable starters. */
export interface StarterDefinition extends DefinitionBase {
  readonly id: CharacterId;
  readonly selectable: true;
  readonly role: 'starter';
}

/** Click: host and guide, never selectable. */
export interface HostDefinition extends DefinitionBase {
  readonly id: 'click';
  readonly selectable: false;
  readonly role: 'host-guide';
}

export type CharacterDefinition = StarterDefinition | HostDefinition;

/** The five selectable starters, in roster order. Derived from `STARTERS`, never re-listed. */
export const STARTER_DEFINITIONS: readonly StarterDefinition[] = Object.freeze(
  STARTERS.map(
    (starter): StarterDefinition =>
      Object.freeze({
        id: starter.id,
        displayName: starter.name,
        selectable: true,
        role: 'starter',
        scaleFactor: CAST_SCALE_FACTORS[starter.id],
        expressions: EXPRESSION_STATES,
      }),
  ),
);

/** Click, the platform host and guide. NOT selectable. */
export const HOST_DEFINITION: HostDefinition = Object.freeze({
  id: 'click',
  displayName: 'Click',
  selectable: false,
  role: 'host-guide',
  scaleFactor: CAST_SCALE_FACTORS.click,
  expressions: EXPRESSION_STATES,
});

/** Everyone, starters first and the host last. Not for building the starter menu. */
export const CHARACTER_DEFINITIONS: readonly CharacterDefinition[] = Object.freeze([
  ...STARTER_DEFINITIONS,
  HOST_DEFINITION,
]);

export function isCastId(value: unknown): value is CastId {
  return CHARACTER_DEFINITIONS.some((definition) => definition.id === value);
}

export function getCharacterDefinition(id: CastId): CharacterDefinition {
  const definition = CHARACTER_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`No character definition for "${id}".`);
  return definition;
}
