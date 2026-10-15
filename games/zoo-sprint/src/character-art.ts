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
  if (queued === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loader.off(Phaser.Loader.Events.COMPLETE, finish);
      resolve();
    };
    const timer = setTimeout(finish, ART_LOAD_TIMEOUT_MS);
    loader.once(Phaser.Loader.Events.COMPLETE, finish);
    if (!loader.isLoading()) loader.start();
  });
}
