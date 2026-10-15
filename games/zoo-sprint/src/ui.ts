import Phaser from 'phaser';
import { drawCheck, drawRetry } from './presentation/icons';
import { glossy } from './presentation/surfaces';
import { COLORS, CSS, EXP, EXP_CSS, FONT, clamp } from './theme';

export interface ButtonStyle {
  fill: number;
  shade: number;
  text: string;
  /** When set, the button is drawn glossy: `top` is the lighter upper half. */
  top?: number;
  /** An outline around the label, for white text on a saturated button. */
  textStroke?: string;
}

/**
 * `card`, `primary`, `good`, `bad` and `dim` keep their names. The World Expedition look is glossy:
 * orange primary, blue answers, green correct, amber (never red) for a miss, all with label colors
 * that keep at least 3:1 contrast for large bold text.
 */
export const BUTTON_STYLES = {
  card: { fill: COLORS.card, shade: COLORS.cardShade, text: CSS.ink } as ButtonStyle,
  primary: { fill: EXP.orange, top: EXP.orangeTop, shade: EXP.orangeDeep, text: EXP_CSS.white, textStroke: '#7a3004' } as ButtonStyle,
  answer: { fill: EXP.blue, top: EXP.blueTop, shade: EXP.blueDeep, text: EXP_CSS.white, textStroke: '#0f3a73' } as ButtonStyle,
  good: { fill: EXP.green, top: EXP.greenTop, shade: EXP.greenDeep, text: EXP_CSS.white, textStroke: '#0c4a28' } as ButtonStyle,
  bad: { fill: EXP.amber, top: EXP.amberTop, shade: EXP.amberDeep, text: '#4a2504' } as ButtonStyle,
  dim: { fill: EXP.dim, top: 0xe6e0cb, shade: EXP.dimDeep, text: EXP_CSS.muted } as ButtonStyle,
};

/** A small badge on an answer button: a check for the right answer, a circular arrow for "try again". */
export type ButtonBadge = 'check' | 'retry' | null;

/**
 * A tappable rectangle in canvas CSS pixels: x/y are the TOP-LEFT corner (not the center).
 * `visible: false` marks a target that is scrolled out of view (its rectangle is still the real
 * one, so tests can check its size); omitted means "always on screen".
 */
export interface HitTarget {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible?: boolean;
}

/**
 * A large, tappable button: pointer-up inside the button triggers it (no hover needed).
 * The label shrinks to fit so long text never overflows a small phone.
 */
export class TapButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private badge: ButtonBadge = null;
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
        fontStyle: '800',
        color: style.text,
        align: 'center',
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      .setOrigin(0.5);
    const size = clamp(Math.min(btnH * fontScale, (btnW * 0.86) / Math.max(2.2, text.length * 0.62)), 14, 96);
    this.label.setFontSize(Math.round(size));
    this.applyLabelStroke(size);
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
    this.applyLabelStroke(Number.parseFloat(String(this.label.style.fontSize)) || 20);
    this.draw(false);
    return this;
  }

  /** Shows (or clears) the corner badge. */
  setBadge(badge: ButtonBadge): this {
    this.badge = badge;
    this.draw(false);
    return this;
  }

  private applyLabelStroke(size: number): void {
    if (this.style.textStroke) this.label.setStroke(this.style.textStroke, Math.max(3, Math.round(size * 0.14)));
    else this.label.setStroke('#000000', 0);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }

  private draw(pressed: boolean): void {
    const w = this.btnW;
    const h = this.btnH;
    const glossyLook = this.style.top !== undefined;
    const radius = glossyLook ? Math.min(h * 0.3, 34) : Math.min(h * 0.22, 26);
    const lift = pressed ? 0 : Math.max(glossyLook ? 4 : 3, h * (glossyLook ? 0.075 : 0.05));
    this.bg.clear();
    if (glossyLook) {
      glossy(this.bg, { x: -w / 2, y: -h / 2, w, h }, radius, { top: this.style.top as number, fill: this.style.fill, deep: this.style.shade }, lift);
    } else {
      this.bg.fillStyle(this.style.shade, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2 + lift, w, h - lift, radius);
      this.bg.fillStyle(this.style.fill, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h - lift, radius);
    }
    this.label.y = -lift * 0.5 - (glossyLook ? h * 0.02 : 0);
    if (this.badge) {
      const r = Math.min(h * 0.2, 22);
      const bx = w / 2 - r * 1.15;
      const by = -h / 2 + r * 1.15;
      this.bg.fillStyle(0xffffff, 1);
      this.bg.fillCircle(bx, by, r);
      this.bg.lineStyle(2.5, this.badge === 'check' ? EXP.greenDeep : EXP.amberDeep, 1);
      this.bg.strokeCircle(bx, by, r);
      if (this.badge === 'check') drawCheck(this.bg, bx, by, r * 1.5, EXP.green);
      else drawRetry(this.bg, bx, by, r * 1.6, EXP.amber);
    }
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
  options: {
    bold?: boolean;
    /** Nunito Sans weight: 600 body, 700 bold, 800 display. Overrides `bold`. */
    weight?: 600 | 700 | 800;
    size?: number;
    align?: 'left' | 'center' | 'right';
    wrapWidth?: number;
    /** An outline for display text over busy art. */
    stroke?: string;
    strokeWidth?: number;
  } = {},
): Phaser.GameObjects.Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontStyle: options.weight ? String(options.weight) : options.bold ? '700' : '600',
    color,
    fontSize: `${Math.round(options.size ?? 18)}px`,
    align: options.align ?? 'center',
    wordWrap: options.wrapWidth ? { width: options.wrapWidth } : undefined,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  };
  if (options.stroke) {
    style.stroke = options.stroke;
    style.strokeThickness = options.strokeWidth ?? Math.max(3, Math.round((options.size ?? 18) * 0.12));
  }
  return scene.add.text(0, 0, value, style);
}
