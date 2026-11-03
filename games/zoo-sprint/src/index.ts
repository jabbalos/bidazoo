import Phaser from 'phaser';
import type { BidaZooGame, MountOptions, MountedGame } from '@bidazoo/game-sdk';
import { A11yMirror } from './a11y';
import type { GameContext } from './context';
import { loadCharacter } from './roster';
import { COLORS, hex } from './theme';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultsScene } from './scenes/ResultsScene';
import { RunScene } from './scenes/RunScene';

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
 * Zoo Sprint: ten multiplication questions per run, drawn with Phaser.
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

  const game = createGame(parent, context, [BootScene, MenuScene, RunScene, ResultsScene]);

  return {
    destroy() {
      context.a11y.destroy();
      game.destroy(true);
    },
  };
}

export const zooSprint: BidaZooGame = { mount };
