/**
 * Painted Basecamp backdrop: the manifest (`assets/world-expedition/basecamp/basecamp.json`) and how
 * its pictures are laid out for a viewport. Pure: no Phaser, no DOM, numbers in, numbers out.
 *
 * The manifest describes the painting in FRACTIONS of the front picture, so final art drops in by
 * replacing files and re-measuring a handful of numbers:
 *   layers      back to front; each scaled so its height fills the view; `parallax` 1 moves with
 *               the world, below 1 scrolls slower (a far layer is scaled up if it is too narrow)
 *   groundY     where feet stand (fraction of the image height)
 *   gateX       center of the painted gate opening; gateTopY its lintel (fractions)
 *   lodgeDoorX  where Click stands; signpostX (optional) the painted signpost
 *   walkMinX/walkMaxX the walkable span; walkerHeight (optional) walker height / view height
 *
 * PRESENTATION ONLY: none of this touches questions, grading, XP, coins or progression.
 */
export interface BackdropLayer {
  file: string;
  parallax: number;
}

export interface BackdropManifest {
  layers: BackdropLayer[];
  groundY: number;
  gateX: number;
  gateTopY: number;
  lodgeDoorX: number;
  signpostX: number | null;
  walkMinX: number;
  walkMaxX: number;
  walkerHeight: number;
}

export const DEFAULT_WALKER_HEIGHT = 0.3;

const frac = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Validates a raw manifest against the files that actually exist. Returns null (so the game falls
 * back to the code-drawn Basecamp) for anything missing, out of range or inconsistent.
 */
export function parseBackdropManifest(raw: unknown, availableFiles: readonly string[]): BackdropManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m['layers']) || m['layers'].length === 0) return null;
  const layers: BackdropLayer[] = [];
  for (const l of m['layers'] as unknown[]) {
    if (!l || typeof l !== 'object') return null;
    const { file, parallax } = l as Record<string, unknown>;
    if (typeof file !== 'string' || !availableFiles.includes(file)) return null;
    const p = parallax === undefined ? 1 : parallax;
    if (!frac(p)) return null;
    layers.push({ file, parallax: p });
  }
  for (const k of ['groundY', 'gateX', 'gateTopY', 'lodgeDoorX', 'walkMinX', 'walkMaxX'] as const) if (!frac(m[k])) return null;
  const n = (k: string): number => m[k] as number;
  const signpostX = m['signpostX'] === undefined || m['signpostX'] === null ? null : m['signpostX'];
  if (signpostX !== null && !frac(signpostX)) return null;
  const walkerHeight = m['walkerHeight'] === undefined ? DEFAULT_WALKER_HEIGHT : m['walkerHeight'];
  if (typeof walkerHeight !== 'number' || !(walkerHeight >= 0.1 && walkerHeight <= 0.6)) return null;
  const manifest: BackdropManifest = {
    layers,
    groundY: n('groundY'),
    gateX: n('gateX'),
    gateTopY: n('gateTopY'),
    lodgeDoorX: n('lodgeDoorX'),
    signpostX,
    walkMinX: n('walkMinX'),
    walkMaxX: n('walkMaxX'),
    walkerHeight,
  };
  if (manifest.walkMinX >= manifest.walkMaxX) return null;
  if (manifest.gateX <= manifest.walkMinX || manifest.gateX > manifest.walkMaxX) return null;
  if (manifest.gateTopY >= manifest.groundY) return null;
  return manifest;
}

export interface PlacedLayer {
  /** Top-left in world px (x is always 0: the layer scrolls with its parallax). */
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  parallax: number;
}

export interface BackdropLayout {
  /** World width: the front layer's scaled width. */
  worldW: number;
  layers: PlacedLayer[];
  /** The front layer: fractions of the manifest map onto it. */
  front: PlacedLayer;
}

/**
 * Lays the layers out for a view. Each picture fills the view height, bottom-aligned (on a very
 * wide window it is scaled up to cover the width and loses some sky). A slower layer must cover
 * `viewW + (worldW - viewW) * parallax`; if it is narrower it is scaled up, still bottom-aligned.
 */
export function layoutBackdrop(viewW: number, viewH: number, sizes: ReadonlyArray<{ width: number; height: number }>, parallax: readonly number[]): BackdropLayout {
  const place = (size: { width: number; height: number }, needW: number, p: number): PlacedLayer => {
    const scale = Math.max(viewH / size.height, needW / size.width);
    const w = size.width * scale;
    const h = size.height * scale;
    return { x: 0, y: viewH - h, scale, w, h, parallax: p };
  };
  const last = sizes.length - 1;
  const front = place(sizes[last]!, viewW, 1);
  const worldW = Math.round(front.w);
  const layers = sizes.map((s, i) => (i === last ? front : place(s, viewW + Math.max(0, worldW - viewW) * (parallax[i] ?? 1), parallax[i] ?? 1)));
  return { worldW, layers, front };
}

/** Manifest fraction to world px on the front layer. */
export function backdropX(layout: BackdropLayout, fx: number): number {
  return Math.round(layout.front.x + fx * layout.front.w);
}
export function backdropY(layout: BackdropLayout, fy: number): number {
  return Math.round(layout.front.y + fy * layout.front.h);
}

// ---------------------------------------------------------------------------
// The painted Basecamp behind the other screens (painted-backdrop.ts draws it)
// ---------------------------------------------------------------------------

/** Which screen the painting sits behind. */
export type PaintedView = 'select' | 'stage' | 'run' | 'runPanel' | 'results';

export interface PaintedCrop {
  /** Point of the front picture (fractions) kept as central as the picture's edges allow. */
  focusX: number;
  focusY: number;
  /** 1 covers the box; above 1 shows a closer detail of the painting. */
  zoom: number;
  /** The softened (out-of-focus) copy instead of the sharp layers. */
  soft: boolean;
  /** A color wash over the crop (warmth for Results); none when absent. */
  tint?: { color: number; alpha: number };
}

/**
 * The crop each screen uses, as fractions of the painted Basecamp front picture (3771 x 1600; the
 * lodge with the compass is at about x 0.3, the lantern canopy and tables 0.55, the map pavilion
 * 0.78, the paw-banner gate 0.92; the path runs along y 0.84 to 0.96). Re-aim a screen by editing a
 * number here; a crop that runs past an edge of the painting is pushed back inside it.
 */
export const PAINTED_VIEWS: Readonly<Record<PaintedView, PaintedCrop>> = Object.freeze({
  // the whole plaza, out of focus, behind the menu
  select: { focusX: 0.42, focusY: 0.55, zoom: 1, soft: true },
  // the hero card: the lodge porch, sharp, so the buddy stands in Basecamp
  stage: { focusX: 0.34, focusY: 0.6, zoom: 1, soft: false },
  // the question screen (portrait, full screen): the quiet lantern canopy and tables
  run: { focusX: 0.55, focusY: 0.62, zoom: 1, soft: false },
  // the question screen's scene panel (landscape): the observatory and the canopy
  runPanel: { focusX: 0.6, focusY: 0.62, zoom: 1, soft: false },
  // Results: home through the paw-banner gate, in warm late light
  results: { focusX: 0.86, focusY: 0.6, zoom: 1, soft: false, tint: { color: 0xff9a3c, alpha: 0.16 } },
});

export function paintedCrop(view: PaintedView): PaintedCrop {
  return PAINTED_VIEWS[view];
}
