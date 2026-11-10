import Phaser from 'phaser';
import { inputDirection, type Direction } from './explore-model';

/**
 * Walking input shared by BasecampScene and ExpeditionScene: arrow keys and A/D, or holding the left
 * or right half of the screen. Extracted from BasecampScene (same behavior). PRESENTATION ONLY.
 */
export class WalkInput {
  private keys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = { left: [], right: [] };
  private heldX: number | null = null;
  /** While false the buddy does not walk (an overlay or an encounter is open). */
  enabled = true;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    this.keys = {
      left: [kb?.addKey('LEFT'), kb?.addKey('A')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
      right: [kb?.addKey('RIGHT'), kb?.addKey('D')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
    };
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.heldX = p.x));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.heldX !== null && p.isDown) this.heldX = p.x;
    });
    const release = (): void => this.release();
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    scene.input.on('gameout', release);
  }

  release(): void {
    this.heldX = null;
  }

  direction(viewW: number): Direction {
    if (!this.enabled) return 0;
    return inputDirection({ left: this.keys.left.some((k) => k.isDown), right: this.keys.right.some((k) => k.isDown) }, this.heldX, viewW);
  }
}

/**
 * A few dust puffs behind a footfall. Where there is a fixed UI camera, `uiCam` ignores them so they
 * draw once; a scene that scrolls a container instead passes that container as `parent`.
 */
export function spawnDust(
  scene: Phaser.Scene,
  unit: number,
  x: number,
  y: number,
  facing: 1 | -1,
  where: { uiCam?: Phaser.Cameras.Scene2D.Camera; parent?: Phaser.GameObjects.Container } = {},
): void {
  for (let i = 0; i < 3; i++) {
    const puff = scene.add.circle(x - facing * unit * (0.02 + i * 0.012), y - unit * 0.004, unit * (0.012 + Math.random() * 0.008), 0xf1dfbb, 0.55).setDepth(11);
    where.uiCam?.ignore(puff);
    where.parent?.add(puff);
    scene.tweens.add({
      targets: puff,
      x: puff.x - facing * unit * 0.05,
      y: puff.y - unit * (0.02 + Math.random() * 0.02),
      scale: 1.8,
      alpha: 0,
      duration: 380 + i * 60,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}
