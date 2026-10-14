/**
 * The runtime asset-mapping boundary for BidaZoo World Expedition characters (Checkpoint F2).
 *
 * It answers one question: for this character in this logical state, which CURATED source file
 * backs it, and what is its stable texture key? Nothing more. In F2 it is a typed, tested table.
 *
 * What it deliberately does NOT do (those are later checkpoints and open decisions):
 *   - It loads nothing and copies nothing. There is no runtime URL here, on purpose: where
 *     runtime derivatives live (and whether they use Git LFS) is a storage decision F2 does not make.
 *   - It does not touch Phaser, the loader, or the Content-Security-Policy.
 *   - It does not expose the production-v1.1 folder. Only the 36 expression files listed below
 *     (6 cast members x 6 states) can ever cross this boundary. Library assets, turnarounds,
 *     silhouettes, logos, sheets, QA output, superseded and historical files are not reachable.
 *
 * The logical vocabulary (character-definitions.ts: idle, happy, thinking, cheer, discover,
 * tryAgain) is stable. Source filenames are not renamed to match it: for example Koala's logical
 * `thinking` is backed by `koala_thinking_analytical.png`, the canonical Koala file.
 *
 * Presentation only. No field here relates to difficulty, mastery, grading, XP, coins,
 * progression, correctness, or scoring.
 */
import type { CastId, ExpressionState } from './character-definitions';

/**
 * The canonical M4 source library, relative to the repository root. Provenance only: nothing
 * fetches from this path at runtime, and production-v1 (immutable) is never referenced.
 */
export const M4_SOURCE_ROOT = 'docs/reference-art/world-expedition/production-v1.1';

/**
 * The curated source file for every (character, state), relative to M4_SOURCE_ROOT. The type
 * makes the table exhaustive: a missing character or state is a compile error.
 */
export const EXPRESSION_SOURCE_FILES: Readonly<Record<CastId, Readonly<Record<ExpressionState, string>>>> =
  Object.freeze({
    dino: Object.freeze({
      idle: 'expression-batch/dino/dino_idle.png',
      happy: 'expression-batch/dino/dino_happy.png',
      thinking: 'expression-batch/dino/dino_thinking.png',
      cheer: 'expression-batch/dino/dino_cheer.png',
      discover: 'expression-batch/dino/dino_discover.png',
      tryAgain: 'expression-batch/dino/dino_tryAgain.png',
    }),
    koala: Object.freeze({
      idle: 'expression-batch/koala/koala_idle.png',
      happy: 'expression-batch/koala/koala_happy.png',
      // The canonical Koala THINKING asset is the "analytical" one.
      thinking: 'expression-batch/koala/koala_thinking_analytical.png',
      cheer: 'expression-batch/koala/koala_cheer.png',
      discover: 'expression-batch/koala/koala_discover.png',
      tryAgain: 'expression-batch/koala/koala_tryAgain.png',
    }),
    tarsier: Object.freeze({
      idle: 'expression-batch/tarsier/tarsier_idle.png',
      happy: 'expression-batch/tarsier/tarsier_happy.png',
      thinking: 'expression-batch/tarsier/tarsier_thinking.png',
      cheer: 'expression-batch/tarsier/tarsier_cheer.png',
      discover: 'expression-batch/tarsier/tarsier_discover.png',
      tryAgain: 'expression-batch/tarsier/tarsier_tryAgain.png',
    }),
    eagle: Object.freeze({
      idle: 'expression-batch/eagle/eagle_idle.png',
      happy: 'expression-batch/eagle/eagle_happy.png',
      thinking: 'expression-batch/eagle/eagle_thinking.png',
      cheer: 'expression-batch/eagle/eagle_cheer.png',
      discover: 'expression-batch/eagle/eagle_discover.png',
      tryAgain: 'expression-batch/eagle/eagle_tryAgain.png',
    }),
    bronco: Object.freeze({
      idle: 'expression-batch/bronco/bronco_idle.png',
      happy: 'expression-batch/bronco/bronco_happy.png',
      thinking: 'expression-batch/bronco/bronco_thinking.png',
      cheer: 'expression-batch/bronco/bronco_cheer.png',
      discover: 'expression-batch/bronco/bronco_discover.png',
      tryAgain: 'expression-batch/bronco/bronco_tryAgain.png',
    }),
    click: Object.freeze({
      idle: 'expression-batch/click/click_idle.png',
      happy: 'expression-batch/click/click_happy.png',
      thinking: 'expression-batch/click/click_thinking.png',
      cheer: 'expression-batch/click/click_cheer.png',
      discover: 'expression-batch/click/click_discover.png',
      tryAgain: 'expression-batch/click/click_tryAgain.png',
    }),
  });

/**
 * The texture key a production expression will use once it is loaded: `bz-we-character-{id}-{state}`.
 * The `bz-we-` prefix (World Expedition) can never collide with the code-drawn fallback keys
 * `bz-character-{id}-{mood}` in characters.ts.
 */
export type ExpressionTextureKey = `bz-we-character-${CastId}-${ExpressionState}`;

export function expressionTextureKey(id: CastId, state: ExpressionState): ExpressionTextureKey {
  return `bz-we-character-${id}-${state}`;
}

/** Everything the contract knows about one (character, state). There is deliberately no runtime URL. */
export interface ExpressionAssetRef {
  readonly id: CastId;
  readonly state: ExpressionState;
  readonly textureKey: ExpressionTextureKey;
  /** Repository-relative path of the canonical M4 source file (provenance; never fetched). */
  readonly sourcePath: string;
}

export function getExpressionAssetRef(id: CastId, state: ExpressionState): ExpressionAssetRef {
  return Object.freeze({
    id,
    state,
    textureKey: expressionTextureKey(id, state),
    sourcePath: `${M4_SOURCE_ROOT}/${EXPRESSION_SOURCE_FILES[id][state]}`,
  });
}
