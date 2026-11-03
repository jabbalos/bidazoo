import Phaser from 'phaser';
import { loadProductionCharacterArt, loadedProductionTextureCount } from '../character-art';
import { getContext } from '../context';
import { bakeEnvironment } from '../presentation/environment';
import { EXP, EXP_CSS, FONT } from '../theme';
import { publishSurface } from '../ui';

/** The faces the page supplies (apps/play/src/styles.css). The wait is bounded: a slow font must never stop play. */
const FONT_FACES = ['600 16px "Nunito Sans"', '700 16px "Nunito Sans"', '800 16px "Nunito Sans"'];
const FONT_WAIT_MS = 2500;

async function ensureFonts(): Promise<void> {
  try {
    const fonts = (globalThis as { document?: { fonts?: { load(face: string): Promise<unknown> } } }).document?.fonts;
    if (!fonts) return;
    await Promise.race([Promise.all(FONT_FACES.map((face) => fonts.load(face))), new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
  } catch {
    // keep the system font stack
  }
}

/**
 * Branded splash. While it shows, the game asks the platform who this browser is (creating a
 * guest on first visit) and then moves to the menu. If the server cannot be reached it says so
 * and offers a retry instead of showing a broken menu.
 */
export class BootScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Image;
  private disc!: Phaser.GameObjects.Graphics;
  private paw!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  create(): void {
    const ctx = getContext(this);
    this.backdrop = this.add.image(0, 0, bakeEnvironment(this, 'boot', 'basecamp', this.scale.width, this.scale.height)).setOrigin(0, 0);
    this.disc = this.add.graphics();
    this.paw = this.add.graphics();
    const res = Math.min(2, window.devicePixelRatio || 1);
    this.title = this.add
      .text(0, 0, 'BidaZoo', { fontFamily: FONT, fontStyle: '800', color: '#ffffff', stroke: EXP_CSS.navy, strokeThickness: 8, resolution: res })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(0, 0, 'Getting ready…', { fontFamily: FONT, fontStyle: '700', color: '#ffffff', stroke: EXP_CSS.navy, strokeThickness: 4, resolution: res, align: 'center' })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));

    // Lets automated tests (and humans debugging) know Phaser rendered the first scene.
    ctx.parent.setAttribute('data-phaser-ready', 'true');
    publishSurface(ctx.parent, 'boot', []);
    ctx.a11y.set('BidaZoo is loading.', []);

    void this.connect();
  }

  private async connect(): Promise<void> {
    const ctx = getContext(this);
    // Production character art loads while the splash shows, in parallel with the guest check.
    // It can never fail the boot: if it is late or broken, characters use their code-drawn art.
    const art = loadProductionCharacterArt(this).catch(() => undefined);
    try {
      const guest = await ctx.platform.ensureGuest();
      await art;
      await ensureFonts();
      // Lets automated tests see how many production textures are ready ("0" means fallback art).
      ctx.parent.setAttribute('data-production-art', String(loadedProductionTextureCount(this)));
      ctx.totals = guest.totals;
      ctx.activeSessionId = guest.activeSessionId;
      this.scene.start('MenuScene');
    } catch {
      this.subtitle.setText('Can’t reach BidaZoo. Tap to try again.');
      publishSurface(ctx.parent, 'boot-error', []);
      ctx.a11y.set('Cannot reach BidaZoo.', [{ id: 'retry', label: 'Try again', onClick: () => this.retry() }]);
      this.input.once('pointerup', () => this.retry());
    }
  }

  private retry(): void {
    this.subtitle.setText('Getting ready…');
    void this.connect();
  }

  private layout(): void {
    const { width, height } = this.scale;
    const unit = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;

    this.backdrop.setTexture(bakeEnvironment(this, 'boot', 'basecamp', width, height));
    this.disc.clear();
    this.disc.fillStyle(EXP.brass, 1);
    this.disc.fillCircle(cx, cy, unit * 0.4);
    this.disc.fillStyle(EXP.navy, 0.9);
    this.disc.fillCircle(cx, cy, unit * 0.36);

    this.drawPaw(cx, cy - unit * 0.04, unit * 0.2);
    this.title.setFontSize(Math.round(unit * 0.11)).setPosition(cx, cy + unit * 0.22);
    this.subtitle
      .setFontSize(Math.round(unit * 0.045))
      .setWordWrapWidth(unit * 0.9)
      .setPosition(cx, cy + unit * 0.31);
  }

  /** One large pad plus four toes. `size` is the pad's width. */
  private drawPaw(x: number, y: number, size: number): void {
    const g = this.paw;
    g.clear();
    g.fillStyle(EXP.orangeTop, 1);
    g.fillEllipse(x, y + size * 0.25, size, size * 0.8);
    const toe = size * 0.22;
    g.fillCircle(x - size * 0.5, y - size * 0.1, toe);
    g.fillCircle(x - size * 0.18, y - size * 0.38, toe);
    g.fillCircle(x + size * 0.18, y - size * 0.38, toe);
    g.fillCircle(x + size * 0.5, y - size * 0.1, toe);
  }
}
