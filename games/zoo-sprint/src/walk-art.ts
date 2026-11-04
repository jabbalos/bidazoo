import Phaser from 'phaser';
import type { CastId } from './character-definitions';

/**
 * Full-body side-view art for the walkable Basecamp (Checkpoint W1).
 *
 * The expression art (character-art.ts) is head-and-shoulders crops made for cards and the question
 * screens. A character that walks through a world needs a whole body, so this file is the second,
 * equally narrow boundary onto the curated library: exactly one canonical side-view turnaround per
 * cast member, copied byte-for-byte into `assets/world-expedition/walk/` (see its PROVENANCE.json).
 * Nothing else from the library is reachable, for the same reasons as before: Vite only emits files
 * named by a string-literal `new URL(...)`, each gets a content hash, nothing is inlined, and the
 * images load as same-origin `<img>` elements so the client CSP stays as strict as it is.
 *
 * Presentation only: which picture walks has no effect on questions, grading, mastery, XP or coins.
 */
const WALK_URLS: Readonly<Record<CastId, string>> = {
  dino: new URL('../assets/world-expedition/walk/dino_walk_side.png', import.meta.url).href,
  koala: new URL('../assets/world-expedition/walk/koala_walk_side.png', import.meta.url).href,
  tarsier: new URL('../assets/world-expedition/walk/tarsier_walk_side.png', import.meta.url).href,
  eagle: new URL('../assets/world-expedition/walk/eagle_walk_side.png', import.meta.url).href,
  bronco: new URL('../assets/world-expedition/walk/bronco_walk_side.png', import.meta.url).href,
  click: new URL('../assets/world-expedition/walk/click_walk_side.png', import.meta.url).href,
};

/** Stable texture key for a cast member's walking picture. */
export function walkTextureKey(id: CastId): string {
  return `walk-${id}`;
}

/** The URL the loader will request (tests read it). */
export function walkArtUrl(id: CastId): string {
  return WALK_URLS[id];
}

/** True when the walking picture for `id` is in the texture cache. */
export function hasWalkArt(scene: Phaser.Scene, id: CastId): boolean {
  return scene.textures.exists(walkTextureKey(id));
}

/**
 * Loads the walking pictures that are not cached yet. Resolves when the loader finishes, failed
 * files included, and never rejects: a missing picture must never stop a child from playing (the
 * scene then draws the buddy with its expression art instead).
 */
export const WALK_ART_LOAD_TIMEOUT_MS = 6000;

export function loadWalkArt(scene: Phaser.Scene, ids: readonly CastId[]): Promise<void> {
  const missing = ids.filter((id) => !hasWalkArt(scene, id));
  if (missing.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const loader = scene.load;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loader.off(Phaser.Loader.Events.COMPLETE, finish);
      resolve();
    };
    const timer = setTimeout(finish, WALK_ART_LOAD_TIMEOUT_MS);
    for (const id of missing) loader.image(walkTextureKey(id), WALK_URLS[id]);
    loader.on(Phaser.Loader.Events.COMPLETE, finish);
    loader.start();
  });
}
