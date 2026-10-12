import Phaser from 'phaser';
import type { PlaySession } from '@bidazoo/game-sdk';
import { Animal } from '../animals';
import { getContext } from '../context';
import { COLORS, CSS, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/** Shows what the server already committed for the finished run. Nothing here is computed locally. */
export class ResultsScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private session!: PlaySession;

  constructor() {
    super('ResultsScene');
  }

  init(data: { session: PlaySession }): void {
    this.session = data.session;
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this));
  }

  private render(): void {
    const ctx = getContext(this);
    this.layer.removeAll(true);
    const results = this.session.results;
    const { width: w, height: h } = this.scale;
    const colW = Math.min(w, 760);
    const pad = Math.max(12, Math.round(Math.min(w, h) * 0.035));
    const targets: HitTarget[] = [];

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.jungle, 1);
    bg.fillRect(0, 0, w, h);
    bg.fillStyle(COLORS.leaf, 1);
    bg.fillCircle(w / 2, h * 0.02, Math.min(w, h) * 0.55);
    this.layer.add(bg);

    const title = text(this, 'Run complete!', CSS.cream, { bold: true, size: clamp(h * 0.062, 28, 56) }).setOrigin(0.5);
    title.setPosition(w / 2, pad + h * 0.045);
    this.layer.add(title);

    const hero = new Animal(this, w / 2, title.y + h * 0.15, ctx.animal, clamp(h * 0.07, 28, 64));
    this.layer.add(hero);
    this.time.delayedCall(250, () => hero.active && hero.celebrate());

    const lineSize = clamp(h * 0.036, 16, 28);
    const lines: Array<{ value: string; color: string; bold?: boolean }> = [];
    if (results) {
      lines.push({ value: `${results.correct} of ${results.total} correct`, color: CSS.cream, bold: true });
      lines.push({ value: `+${results.xpEarned} XP   +${results.coinsEarned} coins`, color: CSS.sun, bold: true });
      if (results.bonus.xp > 0 || results.bonus.coins > 0) {
        lines.push({ value: `Finish bonus: +${results.bonus.xp} XP, +${results.bonus.coins} coins`, color: CSS.mist });
      }
      if (results.fluent > 0) lines.push({ value: `${results.fluent} quick answers`, color: CSS.mist });
      if (results.newlyMastered.length > 0) {
        lines.push({ value: `Mastered: ${results.newlyMastered.slice(0, 4).join(', ')}`, color: CSS.good, bold: true });
      }
      const misses = results.answers.filter((a) => !a.correct).map((a) => a.prompt);
      if (misses.length > 0) lines.push({ value: `Practice next: ${[...new Set(misses)].slice(0, 4).join(', ')}`, color: CSS.bad });
    } else {
      lines.push({ value: 'All done!', color: CSS.cream, bold: true });
    }
    lines.push({ value: `Total: ${ctx.totals.xp} XP · ${ctx.totals.coins} coins`, color: CSS.sun });

    let y = title.y + h * 0.26;
    for (const line of lines) {
      const t = text(this, line.value, line.color, { bold: line.bold, size: lineSize, wrapWidth: colW - pad * 2 }).setOrigin(0.5, 0);
      t.setPosition(w / 2, y);
      this.layer.add(t);
      y += t.height + lineSize * 0.5;
    }

    const btnH = clamp(h * 0.12, 60, 110);
    const btnW = Math.min(colW - pad * 2, 520);
    const again = new TapButton(this, 'play-again', w / 2, h - pad - btnH / 2, btnW, btnH, 'Play Again', BUTTON_STYLES.primary, () => this.playAgain(), 0.4);
    this.layer.add(again);
    targets.push(again.hitTarget());

    publishSurface(ctx.parent, 'results', targets, {
      correct: String(results?.correct ?? 0),
      'xp-earned': String(results?.xpEarned ?? 0),
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
