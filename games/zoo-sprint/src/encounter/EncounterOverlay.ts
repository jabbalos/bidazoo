import Phaser from 'phaser';
import type { PublicQuestion } from '@bidazoo/game-sdk';
import type { EncounterState } from '@bidazoo/learning-core';
import { Character } from '../characters';
import { castPresence, type CastId } from '../character-definitions';
import { getContext } from '../context';
import { clipBelow, spotlight } from '../presentation/hero-stage';
import { clampNumber, type Rect } from '../presentation/layout';
import { prefersReducedMotion } from '../presentation/motion';
import { parchmentPanel, pill, softShadow, starIcon } from '../presentation/surfaces';
import { characterName, type CharacterId } from '../roster';
import { EXP, EXP_CSS, mix } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type ButtonBadge, type ButtonStyle, type HitTarget } from '../ui';
import { challengerTextureKey, hasPaintedChallenger, type ChallengerDef, type ChallengerPose } from './challengers';
import { encounterLayout, type EncounterLayout } from './encounter-layout';
import { CHARGE_SEGMENTS, TIMER_DISPLAY_MS, type EncounterView, type GradedStep } from './encounter-flow';

type Phase = 'intro' | 'loading' | 'question' | 'submitting' | 'feedback' | 'error' | 'lastStand' | 'won' | 'lost';

/** How long each moment stays before the encounter moves on by itself (a tap skips it). */
const INTRO_MS = 1800;
const STRIKE_MS = 1100;
const SPECIAL_MS = 1700;
const MISS_MS = 2100;
const END_MS = 2000;

/** Hearts: a warm rose, deliberately not the rejected red failure styling; a lost heart is an empty canvas outline. */
const HEART = 0xf06a8a;
const HEART_DEEP = 0xb8435f;

/** The buddy's color for its special-move burst (from each starter's LOCKED identity colors). */
const BURST: Readonly<Record<CharacterId, number>> = {
  dino: 0xf08a3c, // orange dorsal spikes
  koala: 0xb7a6d9, // gray-lavender
  tarsier: 0xe0a936, // goggles brass
  eagle: 0x2f9a5a, // green letter jacket
  bronco: 0x8c2f39, // maroon bandana
};

/** QA hooks this overlay writes on the game's parent element (and removes again on close). */
const HOOKS = ['encounter', 'node', 'hearts', 'charge', 'strikes', 'asked', 'questions', 'special-moves', 'last-stand', 'challenger', 'challenger-art', 'buddy-art', 'question-id', 'last-correct'];

/**
 * The encounter overlay (item A2, with A4's charge, special move, timer and lose state and A5's
 * boss): challenger on the right, the buddy's painted bust on the left, hearts, the charge meter,
 * the timer bar (display only) and the answer tiles below. It implements {@link EncounterView}, so
 * the turn loop in encounter-flow.ts decides when it shows what; this class only draws.
 *
 * It never decides whether an answer is right: it shows the server's grade and the encounter
 * model's state derived from it.
 */
export class EncounterOverlay implements EncounterView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly timerBar: Phaser.GameObjects.Graphics;
  private readonly reducedMotion = prefersReducedMotion();
  private readonly taunt: string;
  private phase: Phase = 'intro';
  /** The boss is lost and its remaining questions are being answered (owner decision, November 9, 2026). */
  private standing = false;
  private state: EncounterState;
  private question: PublicQuestion | null = null;
  private step: GradedStep | null = null;
  private errorMessage = '';
  private layout: EncounterLayout | null = null;
  private buddy: Character | null = null;
  private challenger: Phaser.GameObjects.Container | null = null;
  private timerStart: number | null = null;
  private timerFrozenAt: number | null = null;
  /** The pending "go on" of the current moment: a tile tap, Continue, Try again, or the moment's own timer. */
  private onChoice: ((value: number | string) => void) | null = null;
  private onContinue: (() => void) | null = null;
  private wait: Phaser.Time.TimerEvent | null = null;
  private readonly previousScene: string | null;
  private readonly previousTargets: string | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: { kind: 'node' | 'boss'; questions: number; buddy: CharacterId; challenger: ChallengerDef; initial: EncounterState },
  ) {
    this.state = opts.initial;
    this.taunt = opts.challenger.taunts[Math.floor(Math.random() * opts.challenger.taunts.length)] ?? '';
    const parent = getContext(scene).parent;
    this.previousScene = parent.getAttribute('data-scene');
    this.previousTargets = parent.getAttribute('data-hit-targets');
    this.root = scene.add.container(0, 0).setDepth(1000);
    this.layer = scene.add.container(0, 0);
    this.timerBar = scene.add.graphics();
    this.root.add([this.layer, this.timerBar]);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.drawTimer, this);
    this.render();
  }

  /** The opening: the challenger and its taunt line, for a moment (tap to skip). */
  intro(): Promise<void> {
    this.phase = 'intro';
    this.render();
    return this.hold(INTRO_MS);
  }

  // ---------------------------------------------------------------------------
  // EncounterView
  // ---------------------------------------------------------------------------

  loading(state: EncounterState): void {
    this.state = state;
    this.phase = 'loading';
    this.question = null;
    this.step = null;
    this.render();
  }

  ask(question: PublicQuestion, state: EncounterState): Promise<number | string> {
    this.state = state;
    this.question = question;
    this.step = null;
    this.phase = 'question';
    this.timerStart = this.scene.time.now;
    this.timerFrozenAt = null;
    this.render();
    return new Promise((resolve) => {
      this.onChoice = (value) => {
        this.onChoice = null;
        resolve(value);
      };
    });
  }

  submitting(state: EncounterState): void {
    this.state = state;
    this.phase = 'submitting';
    this.timerFrozenAt ??= this.scene.time.now;
    this.render();
  }

  graded(step: GradedStep): Promise<void> {
    this.step = step;
    this.state = step.after;
    this.phase = 'feedback';
    getContext(this.scene).totals = step.result.totals; // a copy of the server's totals, as RunScene keeps it
    this.render();
    this.react(step);
    return this.hold(step.result.correct ? (step.specialMove ? SPECIAL_MS : STRIKE_MS) : MISS_MS);
  }

  failed(error: unknown, state: EncounterState): Promise<void> {
    this.state = state;
    this.phase = 'error';
    const network = (error as { isNetwork?: unknown } | null)?.isNetwork === true;
    this.errorMessage = network ? 'Can’t reach BidaZoo.' : 'Something went wrong.';
    this.render();
    return new Promise((resolve) => {
      this.onContinue = () => {
        this.onContinue = null;
        resolve();
      };
    });
  }

  lastStand(state: EncounterState): Promise<void> {
    this.state = state;
    this.standing = true;
    this.phase = 'lastStand';
    this.step = null;
    this.question = null;
    this.render();
    return this.hold(INTRO_MS);
  }

  ended(state: EncounterState): Promise<void> {
    this.state = state;
    this.phase = state.phase === 'won' ? 'won' : 'lost';
    this.step = null;
    this.render();
    if (this.phase === 'won') {
      this.buddy?.celebrate('cheer', 'cheer');
      this.challengerReact('hit');
    } else this.challengerReact('cheer');
    return this.hold(END_MS);
  }

  /** Removes the overlay and its page hooks, and gives the page back to the scene underneath. */
  close(): void {
    this.wait?.remove();
    this.wait = null;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.drawTimer, this);
    this.root.destroy(true);
    const parent = getContext(this.scene).parent;
    for (const hook of HOOKS) parent.removeAttribute(`data-${hook}`);
    parent.setAttribute('data-encounter', 'closed');
    parent.setAttribute('data-encounter-result', this.state.phase === 'won' ? 'won' : 'lost');
    if (this.previousScene !== null) parent.setAttribute('data-scene', this.previousScene);
    if (this.previousTargets !== null) parent.setAttribute('data-hit-targets', this.previousTargets);
  }

  // ---------------------------------------------------------------------------
  // Moments and reactions
  // ---------------------------------------------------------------------------

  /** Waits `ms`, or until the child taps Continue. */
  private hold(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const go = (): void => {
        if (!this.onContinue) return;
        this.onContinue = null;
        this.wait?.remove();
        this.wait = null;
        resolve();
      };
      this.onContinue = go;
      this.wait?.remove();
      this.wait = this.scene.time.delayedCall(ms, go);
      this.publish(this.lastTargets);
    });
  }

  private react(step: GradedStep): void {
    const buddy = this.buddy;
    if (step.result.correct) {
      const show = step.specialMove ? 'discover' : step.after.streak >= CHARGE_SEGMENTS ? 'cheer' : 'happy';
      if (buddy) {
        if (this.reducedMotion) buddy.setExpression(show);
        else buddy.celebrate(show, show);
      }
      this.challengerReact('hit');
      if (step.specialMove) this.specialBurst();
    } else {
      if (buddy) {
        if (this.reducedMotion) buddy.setExpression('tryAgain');
        else buddy.wobble('tryAgain');
      }
    }
  }

  /** The challenger flinches on a strike and does a little hop when it wins. Friendly either way. */
  private challengerReact(pose: ChallengerPose): void {
    const c = this.challenger;
    if (!c || this.reducedMotion) return;
    if (pose === 'hit') {
      this.scene.tweens.add({ targets: c, x: c.x + 14, angle: 6, duration: 110, yoyo: true, repeat: this.step?.specialMove ? 2 : 0, ease: 'Quad.easeOut' });
    } else {
      this.scene.tweens.add({ targets: c, y: c.y - 16, duration: 180, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
    }
  }

  /** The special move: rings and streaks in the buddy's own color from the buddy toward the challenger. */
  private specialBurst(): void {
    const L = this.layout;
    if (!L) return;
    const color = BURST[this.opts.buddy];
    const cx = L.buddyBox.x + L.buddyBox.w / 2;
    const cy = L.buddyBox.y + L.buddyBox.h * 0.55;
    const g = this.scene.add.graphics();
    this.layer.add(g);
    const reach = L.challengerBox.x + L.challengerBox.w * 0.5 - cx;
    const draw = (t: number): void => {
      if (!g.scene) return; // replaced by a redraw (a resize) mid-animation
      g.clear();
      for (let i = 0; i < 3; i++) {
        const k = clampNumber(t * 1.4 - i * 0.18, 0, 1);
        if (k <= 0 || k >= 1) continue;
        g.lineStyle(Math.max(3, L.stage.h * 0.02) * (1 - k), color, 1 - k);
        g.strokeCircle(cx + reach * k, cy, L.stage.h * (0.08 + 0.18 * k));
      }
      g.lineStyle(Math.max(4, L.stage.h * 0.025), mix(color, 0xffffff, 0.35), Math.max(0, 1 - t));
      g.lineBetween(cx, cy, cx + reach * clampNumber(t * 1.6, 0, 1), cy);
    };
    if (this.reducedMotion) {
      draw(0.35);
      return;
    }
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: 900, onUpdate: (tw) => draw(tw.getValue() ?? 1), onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------------------
  // Drawing (rebuilt from state on every change and every resize)
  // ---------------------------------------------------------------------------

  private lastTargets: HitTarget[] = [];

  private render(): void {
    const { width: w, height: h } = this.scene.scale;
    const choices = this.question ? (this.question.choices as ReadonlyArray<number | string>) : [];
    const L = encounterLayout(w, h, { count: choices.length === 3 ? 3 : 4, kind: this.question?.kind }, this.opts.kind);
    this.layout = L;
    // stop the reactions of the pictures that are about to be replaced
    this.scene.tweens.killTweensOf(this.layer.list);
    this.layer.removeAll(true);
    this.buddy = null;
    this.challenger = null;
    const targets: HitTarget[] = [];
    const state = this.state;

    // a veil over the scene underneath; it also takes every tap that is not ours
    const veil = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x140c04, 0.62).setInteractive();
    this.layer.add(veil);

    this.drawStage(L);
    this.drawChallenger(L);
    this.drawBuddy(L);
    this.drawStatus(L, state);
    this.drawMeter(L, state);

    // the question card
    const cg = this.scene.add.graphics();
    parchmentPanel(cg, L.card);
    this.layer.add(cg);
    const showQuestion = this.question && (this.phase === 'question' || this.phase === 'submitting' || this.phase === 'feedback');
    const prompt = showQuestion && this.question ? `${this.question.prompt}${this.question.kind === 'text' ? '' : ' = ?'}` : '…';
    const promptText = text(this.scene, prompt, EXP_CSS.navy, {
      weight: 800,
      size: clampNumber(Math.min(L.card.h * 0.48, L.card.w * 0.11), 22, 96),
      wrapWidth: L.card.w - 24,
    }).setOrigin(0.5);
    promptText.setPosition(L.card.x + L.card.w / 2, L.card.y + L.card.h / 2);
    this.layer.add(promptText);

    this.drawFeedback(L.feedback);

    // the answer tiles
    if (showQuestion) {
      choices.forEach((choice, index) => {
        const r = L.tiles[index];
        if (!r) return;
        let style: ButtonStyle = BUTTON_STYLES.answerTimber;
        let badge: ButtonBadge = null;
        if (this.phase === 'feedback' && this.step) {
          const { result, chosen } = this.step;
          if (choice === result.correctAnswer) {
            style = BUTTON_STYLES.good;
            badge = 'check';
          } else if (choice === chosen) {
            style = BUTTON_STYLES.bad;
            badge = 'retry';
          } else style = BUTTON_STYLES.dim;
        } else if (this.phase === 'submitting') style = BUTTON_STYLES.dim;
        const button = new TapButton(this.scene, `answer-${index}`, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, String(choice), style, () => this.onChoice?.(choice), 0.5);
        button.setBadge(badge);
        button.setEnabled(this.phase === 'question');
        this.layer.add(button);
        targets.push(button.hitTarget());
      });
    }

    // banners over the face-off: the taunt, the special move, the end
    this.drawBanner(L);

    // a tap anywhere moves a timed moment on
    if (this.phase === 'intro' || this.phase === 'lastStand' || this.phase === 'feedback' || this.phase === 'won' || this.phase === 'lost') {
      const area = this.phase === 'feedback' ? { x: 0, y: L.card.y, w, h: L.card.h + L.feedback.h + 6 } : { x: 0, y: 0, w, h };
      const skip = this.scene.add.zone(area.x + area.w / 2, area.y + area.h / 2, area.w, area.h).setInteractive();
      skip.on('pointerup', () => this.onContinue?.());
      this.layer.add(skip);
      targets.push({ id: 'continue', label: 'Continue', ...area });
    }

    if (this.phase === 'error') this.drawError(w, h, targets);

    this.drawTimer();
    this.lastTargets = targets;
    this.publish(targets);
  }

  /** The face-off backdrop: a Great Wall dawn ridge, code-drawn, inside a brass frame, with a stone ledge to stand on. */
  private drawStage(L: EncounterLayout): void {
    const s = L.stage;
    const g = this.scene.add.graphics();
    const radius = Math.min(26, s.w * 0.06);
    softShadow(g, s, radius, 10, 0.3);
    g.fillStyle(EXP.brassDeep, 1);
    g.fillRoundedRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8, radius + 3);
    g.fillStyle(EXP.brass, 1);
    g.fillRoundedRect(s.x - 4, s.y - 4, s.w + 8, s.h + 6, radius + 3);
    // sky: dawn to mist (docs/visual/12, Great Wall)
    // (a gradient fills only plain rectangles, so the rounded top band is solid dawn and the gradient starts below it)
    const ground = L.buddyBox.y + L.buddyBox.h;
    g.fillStyle(0xf3d9a8, 1);
    g.fillRoundedRect(s.x, s.y, s.w, s.h, radius);
    g.fillGradientStyle(0xf3d9a8, 0xf3d9a8, 0xdfe9e4, 0xdfe9e4, 1, 1, 1, 1);
    g.fillRect(s.x, s.y + radius, s.w, ground - s.y - radius);
    // far misty peaks
    g.fillStyle(mix(0x5c7c6b, 0xdfe9e4, 0.55), 1);
    g.fillPoints(
      [
        { x: s.x, y: ground - s.h * 0.28 },
        { x: s.x + s.w * 0.18, y: ground - s.h * 0.5 },
        { x: s.x + s.w * 0.38, y: ground - s.h * 0.3 },
        { x: s.x + s.w * 0.6, y: ground - s.h * 0.56 },
        { x: s.x + s.w * 0.82, y: ground - s.h * 0.34 },
        { x: s.x + s.w, y: ground - s.h * 0.46 },
        { x: s.x + s.w, y: ground },
        { x: s.x, y: ground },
      ],
      true,
    );
    // the ridge wall with its watch-path, a generic stone wall (no specific section)
    const wallTop = ground - s.h * 0.2;
    g.fillStyle(0x5c7c6b, 1);
    g.fillRect(s.x, wallTop + s.h * 0.06, s.w, ground - wallTop);
    g.fillStyle(0xb9a98a, 1);
    g.fillRect(s.x, wallTop, s.w, s.h * 0.07);
    const merlon = Math.max(10, s.w * 0.035);
    g.fillStyle(0xa39376, 1);
    for (let x = s.x + merlon * 0.5; x < s.x + s.w - merlon; x += merlon * 2) g.fillRect(x, wallTop - merlon * 0.6, merlon, merlon * 0.6);
    // the beacon tower on the far side: lit when the encounter is won
    const tx = s.x + s.w * 0.5;
    g.fillStyle(0xa39376, 1);
    g.fillRect(tx - merlon, wallTop - merlon * 2.6, merlon * 2, merlon * 2.6);
    if (this.phase === 'won') {
      spotlight(g, tx, wallTop - merlon * 3.2, merlon * 2.4, 1);
      g.fillStyle(0xd9822b, 1);
      g.fillTriangle(tx - merlon * 0.6, wallTop - merlon * 2.6, tx + merlon * 0.6, wallTop - merlon * 2.6, tx, wallTop - merlon * 4);
    }
    // the stone ledge they stand on
    g.fillStyle(0x8f8069, 1);
    g.fillRect(s.x, ground, s.w, Math.max(0, s.y + s.h - ground - radius));
    g.fillRoundedRect(s.x, s.y + s.h - radius * 2, s.w, radius * 2, { tl: 0, tr: 0, bl: radius, br: radius });
    g.fillStyle(0xb9a98a, 1);
    g.fillRect(s.x, ground, s.w, Math.max(4, (s.y + s.h - ground) * 0.18));
    // soft light behind each of them, so both read against the scene
    spotlight(g, L.buddyBox.x + L.buddyBox.w / 2, L.buddyBox.y + L.buddyBox.h * 0.55, Math.min(L.buddyBox.w, L.buddyBox.h) * 0.5, 0.8);
    spotlight(g, L.challengerBox.x + L.challengerBox.w / 2, ground - L.challengerBox.h * 0.35, Math.min(L.challengerBox.w, L.challengerBox.h) * 0.45, 0.7);
    this.layer.add(g);
  }

  private drawBuddy(L: EncounterLayout): void {
    const box = L.buddyBox;
    const hero = new Character(this.scene, 0, 0, this.opts.buddy, 100);
    hero.placeInBox(box.x, box.y + box.h * 0.06, box.w, box.h * 0.94, {
      presence: castPresence(this.opts.buddy as CastId),
      fillWidth: 0.9,
      maxScale: 3.4,
      overlap: 6,
    });
    hero.setExpression(this.buddyExpression());
    if (this.phase === 'question' || this.phase === 'intro' || this.phase === 'loading') hero.startIdleLoop(this.reducedMotion);
    this.layer.add(hero);
    clipBelow(this.scene, hero, L.stage.x, L.stage.w, box.y + box.h);
    this.buddy = hero;
  }

  /** The buddy's picture for the current moment (it reads the state; it decides nothing). */
  private buddyExpression(): 'idle' | 'thinking' | 'happy' | 'cheer' | 'discover' | 'tryAgain' {
    switch (this.phase) {
      case 'question':
      case 'submitting':
      case 'loading':
        return 'thinking';
      case 'feedback':
        if (!this.step) return 'idle';
        if (!this.step.result.correct) return 'tryAgain';
        return this.step.specialMove ? 'discover' : this.step.after.streak >= CHARGE_SEGMENTS ? 'cheer' : 'happy';
      case 'won':
        return 'cheer';
      case 'lost':
        return 'tryAgain';
      default:
        return 'idle';
    }
  }

  private drawChallenger(L: EncounterLayout): void {
    const box = L.challengerBox;
    const ground = L.buddyBox.y + L.buddyBox.h;
    // the code-drawn pictures reach about half their height to each side (the boss's tail), so the width caps the height
    const tall = Math.min(box.h * (this.opts.kind === 'boss' ? 0.92 : 0.74), box.w * (this.opts.kind === 'boss' ? 0.9 : 0.86));
    const c = this.scene.add.container(box.x + box.w * 0.47, ground + tall * 0.02);
    const id = this.opts.challenger.id;
    if (hasPaintedChallenger(this.scene, id)) {
      const img = this.scene.add.image(0, 0, challengerTextureKey(id)).setOrigin(0.5, 1);
      img.setScale(tall / img.height);
      c.add(img);
    } else {
      const g = this.scene.add.graphics();
      const pose: ChallengerPose =
        this.phase === 'feedback' && this.step?.result.correct ? 'hit' : this.phase === 'won' ? 'hit' : this.phase === 'lost' ? 'cheer' : 'idle';
      this.opts.challenger.draw(g, tall, pose);
      c.add(g);
    }
    this.layer.add(c);
    this.challenger = c;
  }

  private drawStatus(L: EncounterLayout, state: EncounterState): void {
    const g = this.scene.add.graphics();
    softShadow(g, L.bar, L.bar.h / 2, 6, 0.3);
    pill(g, L.bar, EXP.timberDeep, EXP.brass, 0.95);
    // hearts
    const hr = Math.min(L.hearts.h * 0.42, L.hearts.w / 7);
    for (let i = 0; i < 3; i++) {
      const cx = L.hearts.x + hr * 1.3 + i * hr * 2.4;
      heart(g, cx, L.hearts.y + L.hearts.h / 2, hr, i < state.hearts);
    }
    // the challenger's strike pips: one per strike it takes to win
    const n = state.questions;
    const pr = Math.min(L.pips.h * 0.36, L.pips.w / (n * 2.6));
    for (let i = 0; i < n; i++) {
      const cx = L.pips.x + L.pips.w - pr * 1.3 - (n - 1 - i) * pr * 2.5;
      const cy = L.pips.y + L.pips.h / 2;
      g.fillStyle(0x3a210c, 0.9);
      g.fillCircle(cx, cy, pr + 2);
      if (i < Math.min(state.strikes, n)) starIcon(g, cx, cy, pr * 1.05, EXP.brass);
      else {
        g.fillStyle(EXP.canvasShade, 0.35);
        g.fillCircle(cx, cy, pr);
      }
    }
    this.layer.add(g);
    // the challenger's name between them (PENDING copy)
    const middle = L.pips.x - (L.hearts.x + L.hearts.w);
    if (middle > 70) {
      const name = text(this.scene, this.opts.challenger.name, '#ffd98a', { weight: 800, size: clampNumber(L.bar.h * 0.34, 12, 20) }).setOrigin(0.5);
      name.setPosition(L.hearts.x + L.hearts.w + middle / 2, L.bar.y + L.bar.h / 2);
      if (name.width <= middle - 8) this.layer.add(name);
      else name.destroy();
    }
  }

  /** The charge meter: three segments, one per correct answer in a row; full = the special move is ready. */
  private drawMeter(L: EncounterLayout, state: EncounterState): void {
    const m = L.meter;
    const g = this.scene.add.graphics();
    const ready = state.charge >= CHARGE_SEGMENTS && state.specialMovesLeft > 0 && state.phase === 'question';
    softShadow(g, m, m.h / 2, 4, 0.3);
    pill(g, m, 0x2a1a0b, ready ? EXP.lanternGlow : EXP.brass, 0.95);
    const gap = 3;
    const inner = { x: m.x + 4, y: m.y + 4, w: m.w - 8 - m.h, h: m.h - 8 };
    const segW = (inner.w - gap * (CHARGE_SEGMENTS - 1)) / CHARGE_SEGMENTS;
    for (let i = 0; i < CHARGE_SEGMENTS; i++) {
      const on = i < Math.min(state.charge, CHARGE_SEGMENTS);
      g.fillStyle(on ? (ready ? EXP.lantern : EXP.teal) : 0x4a3a28, 1);
      g.fillRoundedRect(inner.x + i * (segW + gap), inner.y, segW, inner.h, Math.min(inner.h / 2, 8));
      if (on) {
        g.fillStyle(0xffffff, 0.3);
        g.fillRoundedRect(inner.x + i * (segW + gap) + 2, inner.y + 1, segW - 4, inner.h * 0.35, Math.min(inner.h / 4, 4));
      }
    }
    // the special moves left, as small stars at the end of the meter
    const sx = m.x + m.w - m.h / 2 - 2;
    starIcon(g, sx, m.y + m.h / 2, m.h * 0.36, state.specialMovesLeft > 0 ? (ready ? EXP.lanternGlow : EXP.brass) : 0x6b5a44);
    this.layer.add(g);
    if (ready && !this.reducedMotion) this.scene.tweens.add({ targets: g, alpha: 0.75, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The timer bar: display only. When it runs out it simply shows empty; nothing else happens. */
  private drawTimer(): void {
    const L = this.layout;
    const g = this.timerBar;
    if (!L || !g.active) return;
    g.clear();
    const t = L.timer;
    g.fillStyle(0x140c04, 0.7);
    g.fillRoundedRect(t.x, t.y, t.w, t.h, t.h / 2);
    if (this.timerStart === null || this.phase === 'intro') return;
    const now = this.timerFrozenAt ?? this.scene.time.now;
    const left = clampNumber(1 - (now - this.timerStart) / TIMER_DISPLAY_MS, 0, 1);
    if (left <= 0) return;
    g.fillStyle(mix(EXP.amber, EXP.teal, left), 1);
    g.fillRoundedRect(t.x + 1, t.y + 1, Math.max(t.h, (t.w - 2) * left), t.h - 2, (t.h - 2) / 2);
  }

  private drawFeedback(r: Rect): void {
    let label = '';
    let fill: number = EXP.timberDeep;
    let edge: number = EXP.brass;
    let color: string = EXP_CSS.white;
    if (this.phase === 'feedback' && this.step) {
      const { result, specialMove, lastStand } = this.step;
      if (result.correct) {
        label = lastStand ? 'Correct!' : specialMove ? 'Special move! Double strike!' : result.fluent ? 'Quick strike!' : 'Strike!';
        fill = EXP.green;
        edge = EXP.greenDeep;
      } else {
        label = `Not quite. The answer is ${result.correctAnswer}`;
        fill = EXP.amber;
        edge = EXP.amberDeep;
        color = '#4a2504';
      }
    } else if (this.phase === 'submitting') label = 'Checking…';
    else if (this.phase === 'loading') label = 'Getting your question…';
    else if (this.phase === 'question' && this.standing) {
      label = 'Last stand';
      fill = EXP.amber;
      edge = EXP.amberDeep;
      color = '#4a2504';
    } else if (this.phase === 'question' && this.state.charge >= CHARGE_SEGMENTS && this.state.specialMovesLeft > 0) {
      label = 'Special move ready!';
      fill = EXP.lantern;
      edge = EXP.amberDeep;
      color = '#4a2504';
    }
    if (label === '') return;
    const size = clampNumber(Math.min(r.h * 0.5, r.w * 0.052), 14, 26);
    const t = text(this.scene, label, color, { weight: 800, size }).setOrigin(0.5);
    const pw = Math.min(r.w, t.width + size * 2.4);
    const g = this.scene.add.graphics();
    pill(g, { x: r.x + (r.w - pw) / 2, y: r.y, w: pw, h: r.h }, fill, edge);
    this.layer.add(g);
    t.setPosition(r.x + r.w / 2, r.y + r.h / 2 - 1);
    this.layer.add(t);
  }

  private bannerText(): string {
    const boss = this.opts.kind === 'boss';
    switch (this.phase) {
      case 'intro':
        return this.taunt;
      case 'lastStand':
        return 'Last stand! Answer the rest of the questions.';
      case 'won':
        return boss ? 'You beat the summit challenger!' : 'Beacon lit!';
      case 'lost':
        return boss ? 'Good climb! Keep going.' : 'Nice try! The path goes on.';
      default:
        return this.phase === 'feedback' && this.step?.specialMove ? `${characterName(this.opts.buddy)}’s special move!` : '';
    }
  }

  private drawBanner(L: EncounterLayout): void {
    const label = this.bannerText();
    if (label === '') return;
    const b = L.banner;
    const size = clampNumber(Math.min(b.h * 0.36, b.w * 0.06), 15, 34);
    const t = text(this.scene, label, EXP_CSS.navy, { weight: 800, size, wrapWidth: b.w - size * 2, align: 'center' }).setOrigin(0.5);
    const bw = Math.min(b.w, t.width + size * 2.2);
    const bh = Math.max(b.h * 0.7, t.height + size * 1.1);
    const box = { x: b.x + (b.w - bw) / 2, y: b.y + (b.h - bh) / 2, w: bw, h: bh };
    const g = this.scene.add.graphics();
    parchmentPanel(g, box, { radius: Math.min(18, bh * 0.3) });
    this.layer.add(g);
    t.setPosition(box.x + box.w / 2, box.y + box.h / 2);
    this.layer.add(t);
    if (!this.reducedMotion && this.phase !== 'feedback') {
      const both = [g, t];
      for (const o of both) o.setScale(0.9);
      this.scene.tweens.add({ targets: both, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  private drawError(w: number, h: number, targets: HitTarget[]): void {
    const veil = this.scene.add.graphics();
    veil.fillStyle(0x000000, 0.6);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);
    const message = text(this.scene, this.errorMessage, EXP_CSS.white, { weight: 800, size: clampNumber(h * 0.04, 18, 32), wrapWidth: w - 48 }).setOrigin(0.5);
    message.setPosition(w / 2, h * 0.4);
    this.layer.add(message);
    const btnH = clampNumber(h * 0.12, 60, 100);
    const btnW = Math.min(w - 32, 420);
    const retry = new TapButton(this.scene, 'retry', w / 2, h * 0.55, btnW, btnH, 'Try again', BUTTON_STYLES.primary, () => this.onContinue?.(), 0.4);
    this.layer.add(retry);
    targets.push(retry.hitTarget());
  }

  // ---------------------------------------------------------------------------
  // Page hooks and the accessibility mirror
  // ---------------------------------------------------------------------------

  private publish(targets: HitTarget[]): void {
    const ctx = getContext(this.scene);
    const s = this.state;
    publishSurface(ctx.parent, 'encounter', targets, {
      encounter: this.phase,
      node: this.opts.kind,
      hearts: String(s.hearts),
      charge: String(s.charge),
      strikes: String(s.strikes),
      asked: String(s.asked),
      questions: String(s.questions),
      'special-moves': String(s.specialMovesLeft),
      'last-stand': this.standing ? 'true' : 'false',
      challenger: this.opts.challenger.id,
      'challenger-art': hasPaintedChallenger(this.scene, this.opts.challenger.id) ? 'painted' : 'drawn',
      'buddy-art': this.buddy?.artKind ?? '',
      'question-id': this.question?.id ?? '',
      'last-correct': this.step ? String(this.step.result.correct) : '',
    });

    const choices = this.question ? (this.question.choices as ReadonlyArray<number | string>) : [];
    const hearts = `Hearts ${s.hearts} of 3. Strikes ${s.strikes} of ${s.questions}. Charge ${s.charge} of ${CHARGE_SEGMENTS}.`;
    let status: string;
    switch (this.phase) {
      case 'intro':
        status = `${this.opts.challenger.name}: ${this.taunt}`;
        break;
      case 'feedback':
        status = this.step?.result.correct
          ? `${this.step.lastStand ? 'Correct!' : this.step.specialMove ? 'Special move! Double strike!' : 'Strike!'} ${hearts}`
          : `Not quite. The answer is ${this.step?.result.correctAnswer}. ${hearts}`;
        break;
      case 'question':
        status = `${this.question?.prompt ?? ''}. ${hearts}`;
        break;
      case 'error':
        status = this.errorMessage;
        break;
      case 'lastStand':
      case 'won':
      case 'lost':
        status = this.bannerText();
        break;
      default:
        status = 'Loading.';
    }
    const actions =
      this.phase === 'question'
        ? choices.map((choice, index) => ({ id: `answer-${index}`, label: String(choice), onClick: () => this.onChoice?.(choice) }))
        : this.phase === 'error'
          ? [{ id: 'retry', label: 'Try again', onClick: () => this.onContinue?.() }]
          : this.onContinue
            ? [{ id: 'continue', label: 'Continue', onClick: () => this.onContinue?.() }]
            : [];
    ctx.a11y.set(status, actions);
  }
}

/** A heart: full in warm rose, or an empty canvas outline once it is lost. */
function heart(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, full: boolean): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x: cx + (x / 17) * r, y: cy + (y / 17) * r });
  }
  if (full) {
    g.fillStyle(HEART_DEEP, 1);
    g.fillPoints(pts.map((p) => ({ x: p.x, y: p.y + r * 0.12 })), true);
    g.fillStyle(HEART, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(cx - r * 0.4, cy - r * 0.3, r * 0.2);
  } else {
    g.fillStyle(0x000000, 0.25);
    g.fillPoints(pts, true);
    g.lineStyle(Math.max(2, r * 0.14), EXP.canvasShade, 0.9);
    g.strokePoints(pts, true);
  }
}
