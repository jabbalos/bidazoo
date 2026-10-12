import Phaser from 'phaser';
import { COLORS, CSS, FONT, clamp } from './theme';

export interface ButtonStyle {
  fill: number;
  shade: number;
  text: string;
}

export const BUTTON_STYLES = {
  card: { fill: COLORS.card, shade: COLORS.cardShade, text: CSS.ink } as ButtonStyle,
  primary: { fill: COLORS.sun, shade: COLORS.sunDeep, text: CSS.ink } as ButtonStyle,
  good: { fill: COLORS.good, shade: COLORS.goodDeep, text: CSS.ink } as ButtonStyle,
  bad: { fill: COLORS.bad, shade: COLORS.badDeep, text: CSS.ink } as ButtonStyle,
  dim: { fill: 0xc9c3a6, shade: 0xa9a284, text: '#5b5a4a' } as ButtonStyle,
};

/** A tappable rectangle in canvas CSS pixels: x/y are the TOP-LEFT corner (not the center). */
export interface HitTarget {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A large, tappable button: pointer-up inside the button triggers it (no hover needed).
 * The label shrinks to fit so long text never overflows a small phone.
 */
export class TapButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  readonly id: string;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    private readonly btnW: number,
    private readonly btnH: number,
    text: string,
    private style: ButtonStyle,
    private readonly onTap: () => void,
    fontScale = 0.42,
  ) {
    super(scene, x, y);
    this.id = id;
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, -btnH * 0.03, text, {
        fontFamily: FONT,
        fontStyle: 'bold',
        color: style.text,
        align: 'center',
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      .setOrigin(0.5);
    const size = clamp(Math.min(btnH * fontScale, (btnW * 0.86) / Math.max(2.2, text.length * 0.62)), 14, 96);
    this.label.setFontSize(Math.round(size));
    this.add([this.bg, this.label]);
    this.setSize(btnW, btnH);
    this.draw(false);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.enabled && this.draw(true));
    this.on('pointerout', () => this.draw(false));
    this.on('pointerup', () => {
      this.draw(false);
      if (this.enabled) this.onTap();
    });
    scene.add.existing(this);
  }

  get text(): string {
    return this.label.text;
  }

  setStyle(style: ButtonStyle): this {
    this.style = style;
    this.label.setColor(style.text);
    this.draw(false);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }

  private draw(pressed: boolean): void {
    const w = this.btnW;
    const h = this.btnH;
    const radius = Math.min(h * 0.22, 26);
    const lift = pressed ? 0 : Math.max(3, h * 0.05);
    this.bg.clear();
    this.bg.fillStyle(this.style.shade, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + lift, w, h - lift, radius);
    this.bg.fillStyle(this.style.fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h - lift, radius);
    this.label.y = -lift * 0.5;
  }

  hitTarget(): HitTarget {
    return { id: this.id, label: this.text, x: this.x - this.btnW / 2, y: this.y - this.btnH / 2, w: this.btnW, h: this.btnH };
  }
}

/** Page-level hooks: which scene is showing, and where the tap targets are (for tests and debugging). */
export function publishSurface(parent: HTMLElement, scene: string, targets: HitTarget[], extra: Record<string, string> = {}): void {
  parent.setAttribute('data-scene', scene);
  parent.setAttribute(
    'data-hit-targets',
    JSON.stringify(
      targets.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) })),
    ),
  );
  for (const [key, value] of Object.entries(extra)) parent.setAttribute(`data-${key}`, value);
}

export function makeAttemptId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function text(
  scene: Phaser.Scene,
  value: string,
  color: string,
  options: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; wrapWidth?: number } = {},
): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, value, {
    fontFamily: FONT,
    fontStyle: options.bold ? 'bold' : 'normal',
    color,
    fontSize: `${Math.round(options.size ?? 18)}px`,
    align: options.align ?? 'center',
    wordWrap: options.wrapWidth ? { width: options.wrapWidth } : undefined,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
}
