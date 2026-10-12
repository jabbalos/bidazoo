import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

/**
 * Checkpoint A: prove that Phaser boots. No gameplay.
 *
 * Trust model reminder: this client only presents state. It never decides answers,
 * rewards, XP, coins, or inventory; those come from the server.
 */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0f3d2e',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [BootScene],
});
