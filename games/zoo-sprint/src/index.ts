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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: hex(COLORS.jungle),
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    // A tap is one pointer. Mouse emulation is off so touches are not delivered twice.
    input: { activePointers: 1 },
    scene: [BootScene, MenuScene, RunScene, ResultsScene],
    callbacks: {
      preBoot: (g) => g.registry.set('ctx', context),
    },
  });

  return {
    destroy() {
      context.a11y.destroy();
      game.destroy(true);
    },
  };
}

export const zooSprint: BidaZooGame = { mount };
