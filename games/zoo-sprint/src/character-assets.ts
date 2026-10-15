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
 * Characters that have curated runtime art: the whole cast (F4). F3 integrated Dino only; F4 adds
 * Koala, Tarsier, Eagle, Bronco and Click, so every one of the 36 production expressions has a
 * runtime file. Having art does NOT make a character selectable: Click has art and is still the
 * host and guide only (see character-definitions.ts and roster.ts). Every number here is copied
 * from the M4 manifest (renderer/final-manifests/{id}.json) and verified by
 * tests/integration/character-runtime-assets.test.ts against each character's PROVENANCE.json.
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
  koala: Object.freeze({
    headScale: 0.63,
    expressions: Object.freeze({
      idle: runtimeExpression('koala_idle.png', 160, 152, 85, [3, 2, 157, 131]),
      happy: runtimeExpression('koala_happy.png', 152, 153, 82, [1, 3, 150, 125]),
      thinking: runtimeExpression('koala_thinking.png', 157, 155, 87, [1, 3, 154, 133]),
      cheer: runtimeExpression('koala_cheer.png', 225, 155, 85, [39, 4, 186, 153]),
      discover: runtimeExpression('koala_discover.png', 155, 155, 84, [3, 2, 152, 129]),
      tryAgain: runtimeExpression('koala_tryAgain.png', 195, 154, 75, [3, 4, 176, 152]),
    }),
  }),
  tarsier: Object.freeze({
    headScale: 0.5228,
    expressions: Object.freeze({
      idle: runtimeExpression('tarsier_idle.png', 283, 159, 97, [3, 2, 280, 149]),
      happy: runtimeExpression('tarsier_happy.png', 167, 158, 65, [1, 2, 156, 100]),
      thinking: runtimeExpression('tarsier_thinking.png', 168, 156, 72, [2, 2, 166, 110]),
      cheer: runtimeExpression('tarsier_cheer.png', 158, 159, 65, [5, 2, 156, 100]),
      discover: runtimeExpression('tarsier_discover.png', 175, 161, 75, [1, 2, 173, 115]),
      tryAgain: runtimeExpression('tarsier_tryAgain.png', 294, 194, 98, [3, 3, 277, 163]),
    }),
  }),
  eagle: Object.freeze({
    headScale: 0.6535,
    expressions: Object.freeze({
      idle: runtimeExpression('eagle_idle.png', 163, 141, 68, [12, 2, 161, 104]),
      happy: runtimeExpression('eagle_happy.png', 163, 168, 62, [3, 3, 159, 163]),
      thinking: runtimeExpression('eagle_thinking.png', 163, 168, 68, [3, 7, 155, 164]),
      cheer: runtimeExpression('eagle_cheer.png', 193, 168, 65, [3, 4, 158, 163]),
      discover: runtimeExpression('eagle_discover.png', 185, 168, 72, [11, 3, 152, 110]),
      tryAgain: runtimeExpression('eagle_tryAgain.png', 163, 168, 66, [3, 3, 157, 164]),
    }),
  }),
  bronco: Object.freeze({
    headScale: 0.606,
    expressions: Object.freeze({
      idle: runtimeExpression('bronco_idle.png', 176, 144, 68, [2, 0, 173, 105]),
      happy: runtimeExpression('bronco_happy.png', 162, 153, 64, [7, 3, 157, 98]),
      thinking: runtimeExpression('bronco_thinking.png', 195, 151, 74, [3, 8, 179, 149]),
      cheer: runtimeExpression('bronco_cheer.png', 172, 147, 77, [4, 5, 167, 144]),
      discover: runtimeExpression('bronco_discover.png', 168, 154, 70, [5, 4, 165, 106]),
      tryAgain: runtimeExpression('bronco_tryAgain.png', 168, 151, 72, [0, 3, 167, 110]),
    }),
  }),
  click: Object.freeze({
    headScale: 0.5923,
    expressions: Object.freeze({
      idle: runtimeExpression('click_idle.png', 190, 149, 93, [3, 0, 187, 144]),
      happy: runtimeExpression('click_happy.png', 155, 150, 76, [4, 8, 148, 113]),
      thinking: runtimeExpression('click_thinking.png', 165, 164, 81, [3, 5, 143, 123]),
      cheer: runtimeExpression('click_cheer.png', 198, 157, 67, [17, 8, 176, 99]),
      discover: runtimeExpression('click_discover.png', 141, 160, 88, [2, 1, 138, 136]),
      tryAgain: runtimeExpression('click_tryAgain.png', 162, 154, 77, [3, 2, 141, 118]),
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

// ---------------------------------------------------------------------------
// Hero fit (visual recovery pass): size a character to the SPACE it is given.
// ---------------------------------------------------------------------------

/** The space a character may occupy, in pixels. */
export interface HeroBox {
  readonly width: number;
  readonly height: number;
}

export interface HeroFitOptions {
  /** Largest display pixels per source pixel. The art is small (about 130 to 290 px wide), so this bounds softness. */
  readonly maxScale?: number;
  /** The widest head core may use this fraction of the box width (default 0.78). */
  readonly fillWidth?: number;
  /** The art that is ALWAYS drawn (above the earliest flat crop) may use this fraction of the box height (default 1). */
  readonly fillHeight?: number;
  /** Multiplier applied after fitting: castPresence(id) for hero scenes, 1 to ignore the cast scale. */
  readonly presence?: number;
  /** How far (px) the art continues below the box bottom, so the foreground element that hides the flat crop overlaps it. */
  readonly overlap?: number;
  /**
   * Normalized mode (Character Select): every character is scaled so its visible bust is this many
   * pixels tall above the box bottom, so all five starters feel equally present regardless of how
   * wide their head core is. Width is then only a guard (`fillWidth`, e.g. 0.98) so wide heads such
   * as Tarsier's ears never clip. When set, `presence` is ignored.
   */
  readonly visibleHeight?: number;
}

export interface HeroFit {
  /** Display pixels per source pixel. One value for all six expressions, so no expression resizes the head. */
  readonly scale: number;
  /** The bust size that makes computeExpressionPlacement() produce this scale. */
  readonly size: number;
  /** Where the eye-line anchor sits inside the box (pixels from the box top-left). */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Top of the highest art in any expression, in box pixels (may be negative if the art overflows upward). */
  readonly topY: number;
  /**
   * The row (box pixels) where the EARLIEST flat crop of any expression ends. Everything above it is
   * drawn in all six expressions; whatever sits in front of the art must cover this row and below.
   */
  readonly cutY: number;
  /** Upscale factor over the source PNG (same as `scale`; named for the report). */
  readonly upscale: number;
}

const DEFAULT_MAX_SCALE = 2.6;

/**
 * Fits a character into `box`. The production expressions are head-and-bust crops whose bottom edge
 * is a hard, flat cut (see the M4 manifests: cropKind), so the rule is:
 *  - every expression is drawn at ONE scale and anchored on the same eye line and head-core column
 *    (the F3 placement rule, unchanged), so the head never changes size or position;
 *  - the scale is the largest that keeps the widest head core inside `fillWidth` of the box and the
 *    always-drawn art (top of the tallest crop down to the EARLIEST crop edge) inside the box height;
 *  - the art ends `overlap` pixels below the box, under a foreground element (plaque, ledge, card)
 *    that the scene draws on top, so no flat crop is ever visible.
 * Returns undefined for a character without runtime art.
 */
export function computeHeroFit(id: CastId, box: HeroBox, options: HeroFitOptions = {}): HeroFit | undefined {
  const art = RUNTIME_ART[id];
  if (!art || box.width <= 0 || box.height <= 0) return undefined;
  const fillWidth = options.fillWidth ?? 0.78;
  const fillHeight = options.fillHeight ?? 1;
  const presence = options.presence ?? 1;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const overlap = options.overlap ?? 6;

  let maxCoreWidth = 0;
  let maxEyeAbove = 0; // source px from the eye line up to the highest top edge
  let minBelowEye = Number.POSITIVE_INFINITY; // source px from the eye line down to the earliest crop edge
  for (const expression of Object.values(art.expressions)) {
    const [x0, , x1] = expression.coreBox;
    maxCoreWidth = Math.max(maxCoreWidth, x1 - x0);
    maxEyeAbove = Math.max(maxEyeAbove, expression.eyeLineY);
    minBelowEye = Math.min(minBelowEye, expression.height - expression.eyeLineY);
  }

  const byWidth = (fillWidth * box.width) / maxCoreWidth;
  const byHeight = (fillHeight * (box.height + overlap)) / (maxEyeAbove + minBelowEye);
  const normalized = options.visibleHeight !== undefined ? ((options.visibleHeight + overlap) / (maxEyeAbove + minBelowEye)) : undefined;
  const scale =
    normalized !== undefined
      ? Math.min(maxScale, normalized, byWidth, byHeight)
      : Math.min(maxScale, Math.min(byWidth, byHeight) * presence);
  const anchorY = box.height + overlap - minBelowEye * scale;
  return Object.freeze({
    scale,
    size: (scale * HEAD_UNITS) / (art.headScale * HEAD_FILL),
    anchorX: box.width / 2,
    anchorY,
    topY: anchorY - maxEyeAbove * scale,
    cutY: box.height + overlap,
    upscale: scale,
  });
}
