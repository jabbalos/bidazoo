import Phaser from 'phaser';
import type { BidaZooGame, MountOptions, MountedGame } from '@bidazoo/game-sdk';
import { A11yMirror } from './a11y';
import type { GameContext } from './context';
import { loadCharacter } from './roster';
import { COLORS, hex } from './theme';
// The outfitter registers itself at the lodge door (Lane C, C3).
import './basecamp/outfitter';
import { BasecampScene } from './scenes/BasecampScene';
import { BootScene } from './scenes/BootScene';
import { ExpeditionScene } from './scenes/ExpeditionScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultsScene } from './scenes/ResultsScene';
import { RunScene } from './scenes/RunScene';
import { SummitScene } from './scenes/SummitScene';

/**
 * Build-time switch, set by apps/play/vite.config.ts ONLY for `--mode character-lab`. In every
 * normal build it is the constant `false`, so the lab below (and the scene it imports) is removed
 * from the bundle entirely. Outside Vite (unit tests) it is simply undefined.
 */
declare const __BIDAZOO_CHARACTER_LAB__: boolean | undefined;
const CHARACTER_LAB = typeof __BIDAZOO_CHARACTER_LAB__ !== 'undefined' && __BIDAZOO_CHARACTER_LAB__;

function createGame(
  parent: HTMLElement,
  context: GameContext,
  scene: Phaser.Types.Scenes.SceneType[],
  imageLoadType: 'HTMLImageElement' | 'XHR' = 'HTMLImageElement',
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: hex(COLORS.jungle),
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    // A tap is one pointer. Mouse emulation is off so touches are not delivered twice.
    input: { activePointers: 1 },
    // Production character art loads as ordinary same-origin images. Phaser's default (XHR) turns
    // each PNG into a blob: URL, which the client CSP (img-src 'self' data:) refuses.
    loader: { imageLoadType },
    scene,
    callbacks: {
      preBoot: (g) => g.registry.set('ctx', context),
    },
  });
}

/**
 * Keeps the game fitted to its element and its frame loop alive. Seen rarely (headless Chromium, right
 * at a turn of the device, no error anywhere): the window turned back but the canvas kept the old
 * size, so the page showed a sideways game at the wrong size (owner bug 4, November 10, 2026). The
 * cause is in Phaser 3.90's Scale Manager: `updateScale()` ends with `getParentBounds()`, which stores
 * the element's size as "seen" and drops the answer, so a second size change that lands while the
 * first is being applied (a turn, then the browser's own relayout) is never applied: `parentSize`
 * says landscape, the canvas stays portrait, and nothing is dirty any more.
 *  - After every window resize (150 ms and 600 ms later) and twice a second while the page is visible:
 *    if the canvas is not the size of its element, the Scale Manager is asked to refresh (the same
 *    thing a window resize asks of it). The periodic check waits for two misses in a row.
 *  - On the browser's own animation frames: if three frames in a row go by without Phaser's frame
 *    counter moving, Phaser is no longer asking for frames (one dropped frame request would otherwise
 *    stop the game for good: no resize, no input, no animation), so its loop is stopped and started
 *    again. Counting on animation frames, not on the clock, means a slow machine whose frames take
 *    over a second is never mistaken for a stopped one.
 * A hidden page is left alone (browsers pause frames there on purpose). Counts are published on the
 * game element (`data-scale-refreshes`, `data-loop-restarts`) for tests and debugging.
 */
function keepFittedAndAlive(game: Phaser.Game, parent: HTMLElement): () => void {
  let alive = true;
  let lastFrame = -1;
  let frameStill = 0;
  let restarts = 0;
  const onFrame = (): void => {
    if (!alive) return;
    window.requestAnimationFrame(onFrame);
    const frame = game.loop.frame;
    if (frame !== lastFrame || document.visibilityState !== 'visible') {
      lastFrame = frame;
      frameStill = 0;
      return;
    }
    frameStill += 1;
    if (frameStill < 3) return;
    frameStill = 0;
    restarts += 1;
    game.loop.sleep();
    game.loop.wake();
    parent.setAttribute('data-loop-restarts', String(restarts));
  };
  window.requestAnimationFrame(onFrame);

  let sizeOff = 0;
  let refreshes = 0;
  const fits = (): boolean => {
    const canvas = game.canvas;
    const want = parent.getBoundingClientRect();
    return !canvas || (Math.abs(canvas.width - Math.floor(want.width)) <= 1 && Math.abs(canvas.height - Math.floor(want.height)) <= 1);
  };
  const refit = (why: 'resize' | 'watchdog'): void => {
    refreshes += 1;
    // what the Scale Manager believed just before it is asked again (for the bug report upstream)
    const scale = game.scale as Phaser.Scale.ScaleManager & { parentSize: { width: number; height: number }; dirty: boolean };
    const want = parent.getBoundingClientRect();
    parent.setAttribute(
      'data-scale-refresh-last',
      JSON.stringify({
        why,
        element: `${Math.round(want.width)}x${Math.round(want.height)}`,
        canvas: game.canvas ? `${game.canvas.width}x${game.canvas.height}` : '',
        parentSize: `${scale.parentSize.width}x${scale.parentSize.height}`,
        game: `${scale.width}x${scale.height}`,
        dirty: scale.dirty,
        frame: game.loop.frame,
      }),
    );
    game.scale.refresh();
    parent.setAttribute('data-scale-refreshes', String(refreshes));
  };
  const id = window.setInterval(() => {
    if (document.visibilityState !== 'visible') {
      sizeOff = 0;
      return;
    }
    sizeOff = fits() ? 0 : sizeOff + 1;
    if (sizeOff >= 2) {
      sizeOff = 0;
      refit('watchdog');
    }
  }, 500);
  const after: number[] = [];
  const onResize = (): void => {
    for (const t of after.splice(0)) window.clearTimeout(t);
    for (const ms of [150, 600]) {
      after.push(
        window.setTimeout(() => {
          if (alive && document.visibilityState === 'visible' && !fits()) refit('resize');
        }, ms),
      );
    }
  };
  window.addEventListener('resize', onResize);
  return () => {
    alive = false;
    window.clearInterval(id);
    window.removeEventListener('resize', onResize);
    for (const t of after.splice(0)) window.clearTimeout(t);
  };
}

/**
 * Zoo Sprint: ten multiplication questions per run, drawn with Phaser. Since Checkpoint W1 the buddy
 * walks through Expedition Basecamp and enters the gate to start that run.
 *
 * Trust model reminder: this game only presents state. It never decides answers, rewards, XP,
 * coins, mastery, or inventory; the server does, and the game animates the result.
 */
function mount({ parent, platform }: MountOptions): MountedGame {
  const context: GameContext = {
    platform,
    parent,
    a11y: new A11yMirror(parent),
    character: loadCharacter(),
    totals: { xp: 0, coins: 0 },
    activeSessionId: null,
  };

  if (CHARACTER_LAB && new URLSearchParams(window.location.search).has('character-lab')) {
    // Developer lab (see scenes/CharacterLabScene.ts). `loader=xhr` selects Phaser's default image
    // loader, which exists only so a test can prove the CSP guard catches it.
    const imageLoadType = new URLSearchParams(window.location.search).get('loader') === 'xhr' ? 'XHR' : 'HTMLImageElement';
    let lab: Phaser.Game | null = null;
    let destroyed = false;
    void import('./scenes/CharacterLabScene').then(({ CharacterLabScene }) => {
      if (!destroyed) lab = createGame(parent, context, [CharacterLabScene], imageLoadType);
    });
    return {
      destroy() {
        destroyed = true;
        context.a11y.destroy();
        lab?.destroy(true);
      },
    };
  }

  const game = createGame(parent, context, [BootScene, MenuScene, BasecampScene, RunScene, ResultsScene, ExpeditionScene, SummitScene]);
  const stopWatchdog = keepFittedAndAlive(game, parent);
  // debugging and test hook: the running game, for inspection only (nothing reads it in the game)
  (parent as HTMLElement & { __phaser?: Phaser.Game }).__phaser = game;

  return {
    destroy() {
      stopWatchdog();
      context.a11y.destroy();
      game.destroy(true);
    },
  };
}

export const zooSprint: BidaZooGame = { mount };
