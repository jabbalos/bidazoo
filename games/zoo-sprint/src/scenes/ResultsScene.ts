import Phaser from 'phaser';
import type { PlaySession } from '@bidazoo/game-sdk';
import { Character } from '../characters';
import { expressionForResults } from '../character-expression';
import { getContext } from '../context';
import { COLORS, CSS, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

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

    // The starter rests at idle, then celebrates what the server already decided: a finished run is a
    // cheer, and a run that mastered something new is a discovery. Reads the results; changes nothing.
    const hero = new Character(this, w / 2, title.y + h * 0.15, ctx.character, clamp(h * 0.21, 84, 190));
    this.hero = hero;
    if (this.celebrating) hero.setExpression(expressionForResults(results));
    this.layer.add(hero);

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
      character: hero.id, // the starter actually drawn on this screen
      expression: hero.inspect().expression, // client-only page state, for tests and debugging
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
