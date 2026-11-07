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
