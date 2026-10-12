import Phaser from 'phaser';

const COLORS = {
  jungle: 0x0f3d2e,
  leaf: 0x1f6f4a,
  sun: 0xffc83d,
  cream: '#fff7e0',
  mist: '#b8e0c8',
} as const;

/**
 * Branded boot screen. Everything is drawn with Phaser primitives so the
 * checkpoint needs no asset pipeline. It re-lays itself out on every resize,
 * so it fits 360x640 phones through desktop without scrolling.
 */
export class BootScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private paw!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  create(): void {
    this.backdrop = this.add.graphics();
    this.paw = this.add.graphics();

    this.title = this.add
      .text(0, 0, 'BidaZoo', {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        fontStyle: 'bold',
        color: COLORS.cream,
      })
      .setOrigin(0.5);

    this.subtitle = this.add
      .text(0, 0, 'Foundation build', {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: COLORS.mist,
      })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    // Lets automated tests (and humans debugging) know Phaser rendered the first scene.
    this.game.canvas.parentElement?.setAttribute('data-phaser-ready', 'true');
  }

  private layout(): void {
    const { width, height } = this.scale;
    const unit = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;

    this.backdrop.clear();
    this.backdrop.fillStyle(COLORS.leaf, 1);
    this.backdrop.fillCircle(cx, cy, unit * 0.42);
    this.backdrop.fillStyle(COLORS.jungle, 1);
    this.backdrop.fillCircle(cx, cy, unit * 0.36);

    this.drawPaw(cx, cy - unit * 0.04, unit * 0.2);

    this.title.setFontSize(Math.round(unit * 0.11)).setPosition(cx, cy + unit * 0.22);
    this.subtitle.setFontSize(Math.round(unit * 0.045)).setPosition(cx, cy + unit * 0.31);
  }

  /** One large pad plus four toes. `size` is the pad's width. */
  private drawPaw(x: number, y: number, size: number): void {
    const g = this.paw;
    g.clear();
    g.fillStyle(COLORS.sun, 1);
    g.fillEllipse(x, y + size * 0.25, size, size * 0.8);
    const toe = size * 0.22;
    g.fillCircle(x - size * 0.5, y - size * 0.1, toe);
    g.fillCircle(x - size * 0.18, y - size * 0.38, toe);
    g.fillCircle(x + size * 0.18, y - size * 0.38, toe);
    g.fillCircle(x + size * 0.5, y - size * 0.1, toe);
  }
}
