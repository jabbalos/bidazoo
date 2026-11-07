import Phaser from 'phaser';
import { EXPRESSION_STATES, type CastId, type ExpressionState } from './character-definitions';
import { expressionTextureKey, hasRuntimeArt } from './character-assets';

/**
 * Loads the curated production art (Checkpoint F3) into Phaser. This is the only file that turns
 * the contract into network requests. It knows nothing about questions, grading, XP, coins, or
 * the server: it only gets pictures onto the screen.
 *
 * Each URL below is a literal `new URL('<file>', import.meta.url)`, which Vite resolves at build
 * time. That has three effects: only the files named here are emitted into the build (nothing from
 * docs/reference-art can reach the browser), each one gets a content hash in its file name (safe
 * long-term caching), and nothing is inlined (each PNG is far above Vite's 4 kB data-URI limit).
 *
 * Images are fetched as ordinary same-origin images (`loader.imageLoadType: 'HTMLImageElement'`
 * in index.ts). Phaser's default XHR path would turn each PNG into a `blob:` URL, which the
 * client Content-Security-Policy (`img-src 'self' data:`) correctly refuses.
 */
/**
 * Browser URLs for every cast member's six expressions (F4: the whole cast, 36 files). Written out
 * as literals on purpose: Vite only sees, hashes and emits a file when its `new URL(...)` argument
 * is a string literal, so there is deliberately no loop or template here.
 */
const ART_URLS: Readonly<Record<CastId, Readonly<Record<ExpressionState, string>>>> = {
  dino: {
    idle: new URL('../assets/world-expedition/characters/dino/dino_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/dino/dino_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/dino/dino_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/dino/dino_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/dino/dino_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/dino/dino_tryAgain.png', import.meta.url).href,
  },
  koala: {
    idle: new URL('../assets/world-expedition/characters/koala/koala_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/koala/koala_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/koala/koala_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/koala/koala_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/koala/koala_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/koala/koala_tryAgain.png', import.meta.url).href,
  },
  tarsier: {
    idle: new URL('../assets/world-expedition/characters/tarsier/tarsier_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/tarsier/tarsier_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/tarsier/tarsier_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/tarsier/tarsier_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/tarsier/tarsier_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/tarsier/tarsier_tryAgain.png', import.meta.url).href,
  },
  eagle: {
    idle: new URL('../assets/world-expedition/characters/eagle/eagle_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/eagle/eagle_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/eagle/eagle_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/eagle/eagle_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/eagle/eagle_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/eagle/eagle_tryAgain.png', import.meta.url).href,
  },
  bronco: {
    idle: new URL('../assets/world-expedition/characters/bronco/bronco_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/bronco/bronco_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/bronco/bronco_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/bronco/bronco_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/bronco/bronco_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/bronco/bronco_tryAgain.png', import.meta.url).href,
  },
  click: {
    idle: new URL('../assets/world-expedition/characters/click/click_idle.png', import.meta.url).href,
    happy: new URL('../assets/world-expedition/characters/click/click_happy.png', import.meta.url).href,
    thinking: new URL('../assets/world-expedition/characters/click/click_thinking.png', import.meta.url).href,
    cheer: new URL('../assets/world-expedition/characters/click/click_cheer.png', import.meta.url).href,
    discover: new URL('../assets/world-expedition/characters/click/click_discover.png', import.meta.url).href,
    tryAgain: new URL('../assets/world-expedition/characters/click/click_tryAgain.png', import.meta.url).href,
  },
};

/**
 * PAINTED expressions (drop-in folder, November 2026): `assets/world-expedition/characters-painted/<id>/
 * <id>_<state>.webp|png`, head-and-bust pictures in the painted Basecamp style with a flat bottom edge
 * and the same framing for all six states of one character (see that folder's PROVENANCE.json). A
 * character switches to them only when ALL SIX of its files exist and loaded; otherwise it keeps the
 * approved production expressions above (which are never edited and still load, as the fallback).
 * `import.meta.glob` emits exactly the files present, content-hashed, never inlined.
 */
const PAINTED_EXPRESSION_FILES = import.meta.glob<string>('../assets/world-expedition/characters-painted/*/*.{png,webp}', { eager: true, query: '?url', import: 'default' });

/** `<id>_<state>` -> URL, for files whose folder matches their name and whose state is canonical. */
const paintedExpressionUrls = new Map<string, string>();
for (const [path, url] of Object.entries(PAINTED_EXPRESSION_FILES)) {
  const m = /\/characters-painted\/([a-z]+)\/([a-z]+)_([A-Za-z]+)\.(png|webp)$/.exec(path);
  if (m && m[1] === m[2] && (EXPRESSION_STATES as readonly string[]).includes(m[3]!)) paintedExpressionUrls.set(`${m[1]}_${m[3]}`, url);
}

export function paintedExpressionKey(id: CastId, state: ExpressionState): string {
  return `bz-we-painted-${id}-${state}`;
}

/** The characters whose six painted expression files are all in this build. */
export function paintedExpressionCast(): CastId[] {
  return (Object.keys(ART_URLS) as CastId[]).filter((id) => EXPRESSION_STATES.every((state) => paintedExpressionUrls.has(`${id}_${state}`)));
}

/** The URL of one painted expression, or undefined when the file is not in this build. */
export function paintedExpressionUrl(id: CastId, state: ExpressionState): string | undefined {
  return paintedExpressionUrls.get(`${id}_${state}`);
}

/** True only when ALL six painted expressions of `id` are loaded (never half painted). */
export function hasPaintedExpressions(scene: Phaser.Scene, id: CastId): boolean {
  return EXPRESSION_STATES.every((state) => scene.textures.exists(paintedExpressionKey(id, state)));
}

/** How many painted expression textures are loaded right now (for the page hook and tests). */
export function loadedPaintedTextureCount(scene: Phaser.Scene): number {
  let count = 0;
  for (const id of Object.keys(ART_URLS) as CastId[]) for (const state of EXPRESSION_STATES) if (scene.textures.exists(paintedExpressionKey(id, state))) count += 1;
  return count;
}

/** The characters this build ships production art for. */
export function productionArtCast(): CastId[] {
  return (Object.keys(ART_URLS) as CastId[]).filter(hasRuntimeArt);
}

/** True only when ALL six expressions of `id` are loaded, so a character is never drawn half in production art. */
export function hasProductionArt(scene: Phaser.Scene, id: CastId): boolean {
  if (!ART_URLS[id] || !hasRuntimeArt(id)) return false;
  return EXPRESSION_STATES.every((state) => scene.textures.exists(expressionTextureKey(id, state)));
}

/** How many production textures are loaded right now (for the page hook and tests). */
export function loadedProductionTextureCount(scene: Phaser.Scene): number {
  let count = 0;
  for (const id of productionArtCast()) {
    for (const state of EXPRESSION_STATES) if (scene.textures.exists(expressionTextureKey(id, state))) count += 1;
  }
  return count;
}

/** The URL the loader will request for one expression (tests and the lab read it). */
export function productionArtUrl(id: CastId, state: ExpressionState): string | undefined {
  return ART_URLS[id]?.[state];
}

/** Longest the splash waits for art. After that the game carries on with the code-drawn fallback. */
export const ART_LOAD_TIMEOUT_MS = 6000;

/**
 * Queues and runs every missing production expression. Resolves when the loader is done, failed
 * files included, and never rejects: a missing picture must never stop a child from playing.
 * Textures already in the cache are not requested again.
 */
/**
 * Visible bounds: a polygon (fractions of the source PNG, 0..1) that is HIDDEN when the texture is
 * prepared. The approved PNGs on disk are never edited and nothing is redrawn: this only keeps a few
 * stray backpack pixels, which sit just above the lower edge of one crop, from peeking out above a
 * card or ledge. Dino's tryAgain crop shows the top corner of his backpack at the lower left.
 * These polygons belong to the approved production PNGs only: painted expressions use their own
 * texture keys (paintedExpressionKey) and are never masked.
 */
const HIDDEN_REGIONS: ReadonlyArray<{ id: CastId; state: ExpressionState; polygon: ReadonlyArray<readonly [number, number]> }> = [
  { id: 'dino', state: 'tryAgain', polygon: [[0, 0.6], [0.215, 0.6], [0.235, 0.66], [0.27, 0.69], [0.3, 0.7], [0.3, 1], [0, 1]] },
];

const boundedKeys = new WeakMap<Phaser.Textures.TextureManager, Set<string>>();

/** Applies HIDDEN_REGIONS once per texture; safe to call again. Never throws: unmasked art is still correct art. */
export function applyVisibleBounds(scene: Phaser.Scene): void {
  for (const { id, state, polygon } of HIDDEN_REGIONS) {
    try {
      const key = expressionTextureKey(id, state);
      if (!scene.textures.exists(key)) continue;
      const done = boundedKeys.get(scene.textures) ?? new Set<string>();
      boundedKeys.set(scene.textures, done);
      if (done.has(key)) continue;
      const texture = scene.textures.get(key);
      const source = texture.getSourceImage() as CanvasImageSource & { width: number; height: number };
      const { width, height } = source;
      const canvas = scene.textures.createCanvas(`${key}:bounded`, width, height);
      if (!canvas) continue;
      const g = canvas.getContext();
      g.drawImage(source, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      polygon.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * width, y * height) : g.lineTo(x * width, y * height)));
      g.closePath();
      g.fill();
      canvas.refresh();
      scene.textures.remove(key);
      if (scene.textures.renameTexture(`${key}:bounded`, key)) done.add(key);
    } catch {
      // keep the original texture
    }
  }
}

export function loadProductionCharacterArt(scene: Phaser.Scene): Promise<void> {
  const loader = scene.load;
  let queued = 0;
  for (const id of productionArtCast()) {
    for (const state of EXPRESSION_STATES) {
      const key = expressionTextureKey(id, state);
      const url = ART_URLS[id]?.[state];
      if (url && !scene.textures.exists(key)) {
        loader.image(key, url);
        queued += 1;
      }
    }
  }
  for (const id of paintedExpressionCast()) {
    for (const state of EXPRESSION_STATES) {
      const key = paintedExpressionKey(id, state);
      if (!scene.textures.exists(key)) {
        loader.image(key, paintedExpressionUrls.get(`${id}_${state}`)!);
        queued += 1;
      }
    }
  }
  if (queued === 0) {
    applyVisibleBounds(scene);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loader.off(Phaser.Loader.Events.COMPLETE, finish);
      applyVisibleBounds(scene);
      resolve();
    };
    const timer = setTimeout(finish, ART_LOAD_TIMEOUT_MS);
    loader.once(Phaser.Loader.Events.COMPLETE, finish);
    if (!loader.isLoading()) loader.start();
  });
}
