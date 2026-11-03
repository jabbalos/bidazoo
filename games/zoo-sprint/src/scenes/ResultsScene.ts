import Phaser from 'phaser';
import type { PlaySession } from '@bidazoo/game-sdk';
import { Character } from '../characters';
import { expressionForResults } from '../character-expression';
import { getContext } from '../context';
import { bakeEnvironment } from '../presentation/environment';
import { clipBelow, maskRounded, spotlight } from '../presentation/hero-stage';
import { clampNumber, resultsLayout } from '../presentation/layout';
import { prefersReducedMotion } from '../presentation/motion';
import { grassLedge, parchmentPanel, ribbon, softShadow } from '../presentation/surfaces';
import { EXP, EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/** Deterministic confetti colors: the game palette, so the burst belongs to the same world. */
const CONFETTI = [EXP.orange, EXP.amber, 0xffffff, 0x3fbf7f, 0x38b6c8];

/** Soft sun rays and scattered confetti around (cx, cy). Static, cheap, and the same on every run. */
function celebrationBurst(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, area: { x: number; y: number; w: number; h: number }): void {
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / rays / 2;
    g.fillStyle(0xffffff, 0.14);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * r * 2, cy + Math.sin(a0) * r * 2);
    g.lineTo(cx + Math.cos(a1) * r * 2, cy + Math.sin(a1) * r * 2);
    g.closePath();
    g.fillPath();
  }
  const pieces = 26;
  for (let i = 0; i < pieces; i++) {
    // A fixed low-discrepancy spread: no randomness, so screenshots and tests are repeatable.
    const t = (i * 0.618033988) % 1;
    const u = (i * 0.754877666) % 1;
    const x = area.x + area.w * (0.06 + 0.88 * t);
    const y = area.y + area.h * (0.04 + 0.5 * u);
    const size = Math.max(5, Math.min(area.w, area.h) * (0.018 + 0.012 * ((i * 7) % 3)));
    g.fillStyle(CONFETTI[i % CONFETTI.length]!, 0.95);
    if (i % 3 === 0) g.fillCircle(x, y, size * 0.55);
    else g.fillRoundedRect(x - size / 2, y - size / 4, size, size / 2, 2);
  }
}

/** Shows what the server already committed for the finished run. Nothing here is computed locally. */
export class ResultsScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private session!: PlaySession;
  private hero: Character | null = null;
  /** True once the celebration has started, so a resize keeps it instead of resetting to idle. */
  private celebrating = false;

  constructor() {
    super('ResultsScene');
  }

  init(data: { session: PlaySession }): void {
    this.session = data.session;
  }

  create(): void {
    this.celebrating = false;
    this.hero = null;
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
      // Leave no expression behind for the next screen to inherit.
      getContext(this).parent.removeAttribute('data-expression');
    });
    // Scheduled once (not per render), so a resize can never double the celebration.
    this.time.delayedCall(250, () => this.celebrate());
  }

  /** The celebration: a finished run cheers, and a run that mastered something new discovers. */
  private celebrate(): void {
    const ctx = getContext(this);
    const celebration = expressionForResults(this.session.results);
    this.celebrating = true;
    if (!this.hero?.active) return;
    this.hero.celebrate(celebration, celebration);
    ctx.parent.setAttribute('data-expression', celebration);
  }

  private render(): void {
    const ctx = getContext(this);
    this.layer.removeAll(true);
    const results = this.session.results;
    const { width: w, height: h } = this.scale;
    const L = resultsLayout(w, h);
    const split = L.frame.composition === 'split';
    const targets: HitTarget[] = [];

    // --- summit scene ---
    const pageKey = bakeEnvironment(this, 'results-page', 'summit', w, h);
    this.layer.add(this.add.image(0, 0, pageKey).setOrigin(0, 0));
    const veil = this.add.graphics();
    veil.fillStyle(0x0d2d4a, split ? 0.4 : 0.1);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);
    if (split) {
      const radius = Math.min(30, L.scene.w * 0.07);
      const frame = this.add.graphics();
      softShadow(frame, L.scene, radius, 12, 0.3);
      frame.fillStyle(EXP.brassDeep, 1);
      frame.fillRoundedRect(L.scene.x - 4, L.scene.y - 4, L.scene.w + 8, L.scene.h + 8, radius + 3);
      frame.fillStyle(EXP.brass, 1);
      frame.fillRoundedRect(L.scene.x - 4, L.scene.y - 4, L.scene.w + 8, L.scene.h + 6, radius + 3);
      this.layer.add(frame);
      const inner = this.add.container(0, 0);
      const key = bakeEnvironment(this, 'results-scene', 'summit', Math.round(L.scene.w), Math.round(L.scene.h));
      inner.add(this.add.image(L.scene.x, L.scene.y, key).setOrigin(0, 0));
      const light = this.add.graphics();
      spotlight(light, L.scene.x + L.scene.w / 2, L.scene.y + L.scene.h * 0.4, Math.min(L.scene.w * 0.5, L.scene.h * 0.4));
      inner.add(light);
      this.layer.add(inner);
      maskRounded(this, inner, L.scene, radius);
    }

    // --- a still celebration burst behind the buddy: soft sun rays and confetti, in the palette ---
    const burst = this.add.graphics();
    celebrationBurst(burst, L.scene.x + L.scene.w / 2, L.scene.y + L.scene.h * (split ? 0.42 : 0.4), Math.min(L.scene.w * 0.62, L.scene.h * 0.55), L.scene);
    const burstLayer = this.add.container(0, 0, [burst]);
    if (split) maskRounded(this, burstLayer, L.scene, Math.min(30, L.scene.w * 0.07));
    this.layer.add(burstLayer);

    // --- the buddy on the summit ledge. It rests at idle, then celebrates what the server already
    // decided: a finished run is a cheer, a run that mastered something new is a discovery. ---
    const hero = new Character(this, 0, 0, ctx.character, 100);
    hero.placeInBox(L.buddyBox.x, L.buddyBox.y, L.buddyBox.w, L.buddyBox.h, {
      visibleHeight: L.buddyBox.h * (split ? 0.8 : 0.82),
      fillWidth: split ? 0.94 : 0.9,
      maxScale: 3.6,
      overlap: Math.max(10, (L.scene.y + L.scene.h - (L.buddyBox.y + L.buddyBox.h)) * 0.6),
    });
    this.hero = hero;
    if (this.celebrating) hero.setExpression(expressionForResults(results));
    else hero.startIdleLoop(prefersReducedMotion());
    this.layer.add(hero);
    clipBelow(this, hero, 0, w, L.scene.y + L.scene.h - 2);
    const ledgeH = L.scene.y + L.scene.h - (L.buddyBox.y + L.buddyBox.h);
    const ledge = this.add.graphics();
    grassLedge(ledge, { x: L.scene.x, y: L.scene.y + L.scene.h - ledgeH, w: L.scene.w, h: ledgeH });
    const clip = this.add.container(0, 0, [ledge]);
    if (split) maskRounded(this, clip, L.scene, Math.min(30, L.scene.w * 0.07));
    this.layer.add(clip);

    // --- banner ---
    const bg = this.add.graphics();
    ribbon(bg, L.banner, EXP.orange, EXP.orangeDeep);
    this.layer.add(bg);
    const title = text(this, 'Run complete!', EXP_CSS.white, {
      weight: 800,
      size: L.bannerSize,
      stroke: '#7a3004',
      strokeWidth: Math.max(4, Math.round(L.bannerSize * 0.14)),
    }).setOrigin(0.5);
    title.setPosition(L.banner.x + L.banner.w / 2, L.banner.y + L.banner.h * 0.5);
    this.layer.add(title);

    // --- summary panel ---
    const panel = L.panel;
    const pg = this.add.graphics();
    parchmentPanel(pg, panel);
    this.layer.add(pg);
    const lines: Array<{ value: string; color: string; weight?: 600 | 700 | 800; scale?: number }> = [];
    if (results) {
      lines.push({ value: `${results.correct} of ${results.total} correct`, color: EXP_CSS.navy, weight: 800, scale: 1.35 });
      lines.push({ value: `+${results.xpEarned} XP    +${results.coinsEarned} coins`, color: EXP_CSS.orangeDeep, weight: 800, scale: 1.1 });
      if (results.bonus.xp > 0 || results.bonus.coins > 0) {
        lines.push({ value: `Bonus: +${results.bonus.xp} XP, +${results.bonus.coins} coins`, color: EXP_CSS.muted, weight: 700 });
      }
      if (results.fluent > 0) lines.push({ value: `${results.fluent} quick answers`, color: EXP_CSS.muted, weight: 700 });
      if (results.newlyMastered.length > 0) {
        lines.push({ value: `Mastered: ${results.newlyMastered.slice(0, 4).join(', ')}`, color: EXP_CSS.greenDeep, weight: 800 });
      }
      const misses = results.answers.filter((a) => !a.correct).map((a) => a.prompt);
      if (misses.length > 0) lines.push({ value: `Practice next: ${[...new Set(misses)].slice(0, 4).join(', ')}`, color: EXP_CSS.amberDeep, weight: 700 });
    } else {
      lines.push({ value: 'All done!', color: EXP_CSS.navy, weight: 800, scale: 1.3 });
    }
    lines.push({ value: `Total: ${ctx.totals.xp} XP · ${ctx.totals.coins} coins`, color: EXP_CSS.navy, weight: 800 });

    const weightSum = lines.reduce((sum, l) => sum + (l.scale ?? 1), 0);
    const innerH = panel.h - 36;
    const baseSize = clampNumber(Math.floor(innerH / (weightSum * 1.55)), 13, 28);
    const innerW = panel.w - 44;
    const made = lines.map((l) => text(this, l.value, l.color, { weight: l.weight ?? 700, size: baseSize * (l.scale ?? 1), wrapWidth: innerW }).setOrigin(0.5, 0));
    const totalH = made.reduce((sum, t) => sum + t.height, 0);
    const gapY = Math.max(4, (innerH - totalH) / Math.max(1, made.length));
    let y = panel.y + 18 + Math.max(0, (innerH - totalH - gapY * (made.length - 1)) / 2);
    for (const t of made) {
      t.setPosition(panel.x + panel.w / 2, y);
      this.layer.add(t);
      y += t.height + Math.min(gapY, baseSize * 0.7);
    }

    // --- Play Again ---
    const again = new TapButton(
      this,
      'play-again',
      L.cta.x + L.cta.w / 2,
      L.cta.y + L.cta.h / 2,
      L.cta.w,
      L.cta.h,
      'Play Again',
      BUTTON_STYLES.primary,
      () => this.playAgain(),
      0.42,
    );
    this.layer.add(again);
    targets.push(again.hitTarget());

    const r = hero.worldRect();
    publishSurface(ctx.parent, 'results', targets, {
      character: hero.id, // the starter actually drawn on this screen
      expression: hero.inspect().expression, // client-only page state, for tests and debugging
      correct: String(results?.correct ?? 0),
      'xp-earned': String(results?.xpEarned ?? 0),
      'buddy-rect': r ? JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }) : '',
    });
    ctx.a11y.set(
      results
        ? `Run complete. ${results.correct} of ${results.total} correct. Plus ${results.xpEarned} XP and ${results.coinsEarned} coins. ${results.newlyMastered.length > 0 ? `Mastered ${results.newlyMastered.join(', ')}.` : ''}`
        : 'Run complete.',
      [{ id: 'play-again', label: 'Play Again', onClick: () => this.playAgain() }],
    );
  }

  private playAgain(): void {
    this.scene.start('RunScene');
  }
}
