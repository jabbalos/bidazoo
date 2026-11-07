import Phaser from 'phaser';
import { parseBackdropManifest, type BackdropManifest } from './presentation/backdrop-model';
import { hasWalkArt, walkArtUrl, walkTextureKey, WALK_ART_LOAD_TIMEOUT_MS } from './walk-art';

/**
 * Painted art for the walkable Basecamp: the backdrop pictures and, when present, a painted
 * whole-body walking picture per buddy. Both are DROP-IN folders:
 *
 *   assets/world-expedition/basecamp/      basecamp.json + the layer pictures it names
 *   assets/world-expedition/walk-painted/  <id>_walk_side.webp|png (faces right), and optionally
 *                                          <id>_idle_front.webp|png (a standing pose, used by Click)
 *
 * Vite's `import.meta.glob` emits (content-hashed, never inlined above 4 kB) exactly the files that
 * exist in those folders and nothing else, so replacing a file is the whole swap, and a missing
 * folder simply means "use the code-drawn Basecamp / the canonical walking picture". The client
 * bundle scan requires every shipped picture to be listed in that folder's PROVENANCE.json.
 *
 * Presentation only: no picture here has any effect on questions, grading, XP, coins or mastery.
 */
const BACKDROP_MANIFEST = import.meta.glob<unknown>('../assets/world-expedition/basecamp/basecamp.json', { eager: true, import: 'default' });
const BACKDROP_FILES = import.meta.glob<string>('../assets/world-expedition/basecamp/*.{jpg,jpeg,webp,png}', { eager: true, query: '?url', import: 'default' });
const PAINTED_WALK = import.meta.glob<string>('../assets/world-expedition/walk-painted/*_{walk_side,idle_front}.{png,webp}', { eager: true, query: '?url', import: 'default' });

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const backdropUrls = new Map(Object.entries(BACKDROP_FILES).map(([p, url]) => [baseName(p), url]));
/** Keyed `<id>_walk_side` / `<id>_idle_front` (the extension does not matter). */
const paintedWalkUrls = new Map(Object.entries(PAINTED_WALK).map(([p, url]) => [baseName(p).replace(/\.(png|webp)$/, ''), url]));

export type PaintedPose = 'walk_side' | 'idle_front';

let manifestCache: BackdropManifest | null | undefined;
/** The validated backdrop manifest, or null when there is none (or it does not match the files). */
export function backdropManifest(): BackdropManifest | null {
  if (manifestCache === undefined) {
    const raw = Object.values(BACKDROP_MANIFEST)[0];
    manifestCache = raw === undefined ? null : parseBackdropManifest(raw, [...backdropUrls.keys()]);
  }
  return manifestCache;
}

export function backdropTextureKey(file: string): string {
  return `basecamp-bg-${file}`;
}

/** True when every layer the manifest names is loaded. */
export function hasPaintedBackdrop(scene: Phaser.Scene): boolean {
  const m = backdropManifest();
  return !!m && m.layers.every((l) => scene.textures.exists(backdropTextureKey(l.file)));
}

export function paintedWalkKey(id: string, pose: PaintedPose = 'walk_side'): string {
  return `walk-painted-${id}-${pose}`;
}

export function hasPaintedWalk(scene: Phaser.Scene, id: string, pose: PaintedPose = 'walk_side'): boolean {
  return scene.textures.exists(paintedWalkKey(id, pose));
}

export interface WalkPicture {
  key: string;
  painted: boolean;
  /** The opaque part of the picture in source px (feet = y + h); the full frame for canonical art. */
  box: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
}

const boxCache = new Map<string, WalkPicture['box']>();
/** The bounding box of the non-transparent pixels, so painted art with padding still stands on the ground. */
export function opaqueBox(scene: Phaser.Scene, key: string): WalkPicture['box'] {
  const cached = boxCache.get(key);
  if (cached) return cached;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const full = { x: 0, y: 0, w: src.width, h: src.height };
  let box = full;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(src, 0, 0);
      const data = g.getImageData(0, 0, src.width, src.height).data;
      let x0 = src.width;
      let y0 = src.height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
          if (data[(y * src.width + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
          }
        }
      }
      if (x1 >= x0 && y1 >= y0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  } catch {
    box = full;
  }
  boxCache.set(key, box);
  return box;
}

/**
 * The picture a walker uses: the painted one when it loaded (the standing `idle_front` pose when
 * asked for and present, else the painted side view), else the canonical side view, else none.
 */
export function walkPicture(scene: Phaser.Scene, id: Parameters<typeof walkTextureKey>[0], pose: PaintedPose = 'walk_side'): WalkPicture | null {
  const paintedPose = pose === 'idle_front' && hasPaintedWalk(scene, id, 'idle_front') ? 'idle_front' : 'walk_side';
  if (hasPaintedWalk(scene, id, paintedPose)) {
    const key = paintedWalkKey(id, paintedPose);
    const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    return { key, painted: true, box: opaqueBox(scene, key), width: src.width, height: src.height };
  }
  if (hasWalkArt(scene, id)) {
    const key = walkTextureKey(id);
    const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    return { key, painted: false, box: { x: 0, y: 0, w: src.width, h: src.height }, width: src.width, height: src.height };
  }
  return null;
}

/**
 * Loads what the Basecamp needs and is not cached yet: the canonical walking pictures, the painted
 * ones that exist, and the backdrop layers. Resolves on completion (failed files included) or after
 * the timeout, and never rejects; `onLate` runs if the loader finishes after the timeout, so the
 * scene can switch to painted art that arrived late on a slow network.
 */
export function loadBasecampArt(scene: Phaser.Scene, ids: ReadonlyArray<Parameters<typeof walkTextureKey>[0]>, onLate: () => void): Promise<void> {
  const loader = scene.load;
  let queued = 0;
  for (const id of ids) {
    if (!hasWalkArt(scene, id)) {
      loader.image(walkTextureKey(id), walkArtUrl(id));
      queued++;
    }
    for (const pose of ['walk_side', 'idle_front'] as const) {
      const painted = paintedWalkUrls.get(`${id}_${pose}`);
      if (painted && !hasPaintedWalk(scene, id, pose)) {
        loader.image(paintedWalkKey(id, pose), painted);
        queued++;
      }
    }
  }
  const m = backdropManifest();
  for (const l of m?.layers ?? []) {
    const key = backdropTextureKey(l.file);
    if (!scene.textures.exists(key)) {
      loader.image(key, backdropUrls.get(l.file)!);
      queued++;
    }
  }
  if (queued === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      resolve();
    }, WALK_ART_LOAD_TIMEOUT_MS);
    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      clearTimeout(timer);
      if (done) onLate();
      else {
        done = true;
        resolve();
      }
    });
    loader.start();
  });
}
