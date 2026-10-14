/**
 * The runtime asset-mapping boundary for BidaZoo World Expedition characters (Checkpoint F2).
 *
 * It answers one question: for this character in this logical state, which CURATED source file
 * backs it, and what is its stable texture key? Nothing more. In F2 it is a typed, tested table.
 *
 * F3 adds the curated RUNTIME table below (Dino only): file names, anchors and the placement rule.
 * Browser URLs still live in character-art.ts, never here.
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

// ---------------------------------------------------------------------------
// Runtime art (Checkpoint F3): the curated copies the game can actually draw.
// ---------------------------------------------------------------------------

/**
 * Where curated RUNTIME art lives, relative to the repository root (provenance and tests only: the
 * browser never sees this path). Each character has a folder here with its PNGs and a
 * PROVENANCE.json that traces every file back to the canonical M4 source above. The game never
 * points at the M4 library itself.
 */
export const RUNTIME_ART_ROOT = 'games/zoo-sprint/assets/world-expedition/characters';

/**
 * Everything the renderer needs to place ONE runtime expression. The numbers are copied from the
 * M4 manifest (renderer/final-manifests/{id}.json) and are verified against it by tests.
 */
export interface RuntimeExpression {
  /** File name inside `${RUNTIME_ART_ROOT}/{id}/`. */
  readonly file: string;
  /** Pixel size of the PNG. */
  readonly width: number;
  readonly height: number;
  /** Row of the eyes, in source pixels from the top of the PNG (the vertical anchor). */
  readonly eyeLineY: number;
  /** Head core [x0, y0, x1, y1] in source pixels (head, hat/spikes and backpack top; not fists or effects). */
  readonly coreBox: readonly [number, number, number, number];
}

export interface RuntimeCharacterArt {
  /** M4 `head_scale`: head units per source pixel. One value per character, so no expression resizes the head. */
  readonly headScale: number;
  readonly expressions: Readonly<Record<ExpressionState, RuntimeExpression>>;
}

function runtimeExpression(
  file: string,
  width: number,
  height: number,
  eyeLineY: number,
  coreBox: readonly [number, number, number, number],
): RuntimeExpression {
  return Object.freeze({ file, width, height, eyeLineY, coreBox: Object.freeze([...coreBox]) as RuntimeExpression['coreBox'] });
}

/**
 * Characters that have curated runtime art. F3 integrates Dino only; every other character keeps
 * its code-drawn art until a later checkpoint adds it here.
 */
export const RUNTIME_ART: Readonly<Partial<Record<CastId, RuntimeCharacterArt>>> = Object.freeze({
  dino: Object.freeze({
    headScale: 0.7843,
    expressions: Object.freeze({
      idle: runtimeExpression('dino_idle.png', 133, 106, 56, [0, 0, 126, 87]),
      happy: runtimeExpression('dino_happy.png', 146, 165, 52, [6, 2, 132, 80]),
      thinking: runtimeExpression('dino_thinking.png', 153, 164, 64, [4, 3, 133, 98]),
      cheer: runtimeExpression('dino_cheer.png', 183, 163, 56, [32, 3, 154, 85]),
      discover: runtimeExpression('dino_discover.png', 166, 164, 67, [4, 3, 135, 102]),
      tryAgain: runtimeExpression('dino_tryAgain.png', 176, 161, 68, [22, 3, 158, 104]),
    }),
  }),
});

/** True when this character has all six curated runtime expressions. */
export function hasRuntimeArt(id: CastId): boolean {
  return RUNTIME_ART[id] !== undefined;
}

export function getRuntimeExpression(id: CastId, state: ExpressionState): RuntimeExpression | undefined {
  return RUNTIME_ART[id]?.expressions[state];
}

/** The head core spans this many "head units" when `headScale` is applied (M4: median core width = 100). */
export const HEAD_UNITS = 100;

/** How wide the head core is drawn, as a fraction of the bust box. Matches the code-drawn head (196 / 320). */
export const HEAD_FILL = 0.62;

/** Where the eye line sits, as a fraction of the bust box, measured from its center (negative = above). */
export const EYE_LINE_Y_FRACTION = -0.11;

/** Where one expression goes inside a bust box of `size` pixels centered on the character. */
export interface ExpressionPlacement {
  /** Display pixels per source pixel (identical for every expression of a character). */
  readonly scale: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** Phaser origin (0..1) that puts the head-core center and the eye line on the anchor point. */
  readonly originX: number;
  readonly originY: number;
  /** The anchor point, relative to the bust center. */
  readonly x: number;
  readonly y: number;
}

/**
 * The reproducible placement rule (M4 `vertical_anchor: "eye_line"`):
 *  - ONE scale per character (headScale x HEAD_FILL x size), so no expression changes head size;
 *  - horizontally the head-core center sits on the anchor, so the head does not slide sideways
 *    when an arm or a mark makes one PNG wider than another;
 *  - vertically the eye line sits on the anchor, so the eyes do not jump when the crop changes.
 * Returns undefined for a character without runtime art.
 */
export function computeExpressionPlacement(id: CastId, state: ExpressionState, size: number): ExpressionPlacement | undefined {
  const art = RUNTIME_ART[id];
  const expression = art?.expressions[state];
  if (!art || !expression) return undefined;
  const scale = (art.headScale * size * HEAD_FILL) / HEAD_UNITS;
  const [x0, , x1] = expression.coreBox;
  return Object.freeze({
    scale,
    displayWidth: expression.width * scale,
    displayHeight: expression.height * scale,
    originX: (x0 + x1) / 2 / expression.width,
    originY: expression.eyeLineY / expression.height,
    x: 0,
    y: EYE_LINE_Y_FRACTION * size,
  });
}
