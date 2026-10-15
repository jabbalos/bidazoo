import Phaser from 'phaser';
import {
  PlatformError,
  type AnswerResult,
  type PlaySession,
  type PublicQuestion,
} from '@bidazoo/game-sdk';
import { Character } from '../characters';
import { expressionForRun } from '../character-expression';
import { castPresence, type CastId } from '../character-definitions';
import { characterName } from '../roster';
import { bakeEnvironment } from '../presentation/environment';
import { buildMedallion, clipBelow, maskRounded, spotlight } from '../presentation/hero-stage';
import { clampNumber, runLayout } from '../presentation/layout';
import { prefersReducedMotion } from '../presentation/motion';
import { coinIcon, grassLedge, parchmentPanel, pill, softShadow, starIcon, timberSign } from '../presentation/surfaces';
import { getContext } from '../context';
import { EXP, EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, makeAttemptId, publishSurface, text, type ButtonBadge, type ButtonStyle, type HitTarget } from '../ui';

type Phase = 'loading' | 'question' | 'submitting' | 'feedback' | 'error';

interface Feedback {
  result: AnswerResult;
  chosen: number;
}

/**
 * One run: question -> four big answers -> server-graded feedback -> next question -> results.
 *
 * This scene only PRESENTS. It never decides whether an answer is right, what is awarded, or
 * what is mastered: it sends the tapped number to the API and animates whatever comes back.
 */
export class RunScene extends Phaser.Scene {
  private phase: Phase = 'loading';
  private session: PlaySession | null = null;
  private question: PublicQuestion | null = null;
  private feedback: Feedback | null = null;
  private errorMessage = '';
  private retryAction: (() => void) | null = null;
  /** One idempotency key per question, so a retry (or double tap) is the same attempt. */
  private readonly attemptIds = new Map<string, string>();
  private advanceTimer: Phaser.Time.TimerEvent | null = null;

  private layer!: Phaser.GameObjects.Container;
  private character: Character | null = null;
  private heroFit: ReturnType<Character['placeInBox']> = null;
  /** Consecutive right answers shown so far; counted here from graded results, only to pick a picture. */
  private streak = 0;

  constructor() {
    super('RunScene');
  }

  create(): void {
    this.phase = 'loading';
    this.session = null;
    this.question = null;
    this.feedback = null;
    this.streak = 0;
    this.layer = this.add.container(0, 0);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
      this.advanceTimer?.remove();
      // Leave no expression behind for the next screen to inherit.
      getContext(this).parent.removeAttribute('data-expression');
    });
    this.render();
    void this.begin();
  }

  // ---------------------------------------------------------------------------
  // Talking to the platform
  // ---------------------------------------------------------------------------

  private async begin(): Promise<void> {
    const ctx = getContext(this);
    try {
      const started = await ctx.platform.startSession({ gameId: 'zoo-sprint', mode: 'multiplication' });
      ctx.activeSessionId = started.session.id;
      await this.show(started.session);
    } catch (err) {
      this.fail(err, () => void this.begin());
    }
  }

  /** Shows whatever the server says is current: results, the open question, or the next one. */
  private async show(session: PlaySession): Promise<void> {
    const ctx = getContext(this);
    this.session = session;
    if (session.status === 'completed') {
      ctx.activeSessionId = null;
      this.scene.start('ResultsScene', { session });
      return;
    }
    if (session.status !== 'active') {
      ctx.activeSessionId = null;
      this.scene.start('MenuScene');
      return;
    }
    if (session.currentQuestion) {
      this.question = session.currentQuestion;
    } else {
      this.phase = 'loading';
      this.render();
      try {
        const next = await ctx.platform.nextQuestion(session.id);
        this.session = next.session;
        this.question = next.question;
      } catch (err) {
        this.fail(err, () => void this.show(session));
        return;
      }
    }
    this.feedback = null;
    this.phase = 'question';
    this.render();
  }

  private onChoose(choice: number): void {
    if (this.phase !== 'question' || !this.session || !this.question) return; // double taps do nothing
    this.phase = 'submitting';
    this.render();
    void this.submit(choice);
  }

  private async submit(choice: number): Promise<void> {
    const ctx = getContext(this);
    const session = this.session as PlaySession;
    const question = this.question as PublicQuestion;
    let attemptId = this.attemptIds.get(question.id);
    if (!attemptId) {
      attemptId = makeAttemptId();
      this.attemptIds.set(question.id, attemptId);
    }
    try {
      const result = await ctx.platform.submitAnswer(session.id, { attemptId, questionId: question.id, response: choice });
      this.session = result.session;
      ctx.totals = result.totals;
      this.streak = result.correct ? this.streak + 1 : 0;
      this.feedback = { result, chosen: choice };
      this.phase = 'feedback';
      this.render();
      this.celebrate(result);
      const wait = result.correct ? 1300 : 2400;
      this.advanceTimer?.remove();
      this.advanceTimer = this.time.delayedCall(wait, () => void this.advance());
    } catch (err) {
      if (err instanceof PlatformError && (err.code === 'question_already_answered' || err.code === 'session_not_active')) {
        // The server already has an answer for this question (a retry that crossed with the
        // original, or another tab). Resync from the server rather than guess.
        try {
          await this.show(await ctx.platform.getSession(session.id));
        } catch (inner) {
          this.fail(inner, () => void this.resync());
        }
        return;
      }
      this.fail(err, () => {
        this.phase = 'submitting';
        this.render();
        void this.submit(choice); // same attemptId: safe to retry
      });
    }
  }

  private async resync(): Promise<void> {
    const ctx = getContext(this);
    try {
      const id = this.session?.id ?? ctx.activeSessionId;
      if (!id) return void this.begin();
      await this.show(await ctx.platform.getSession(id));
    } catch (err) {
      this.fail(err, () => void this.resync());
    }
  }

  /** Move on after the feedback: the next question, or the results. */
  private async advance(): Promise<void> {
    if (this.phase !== 'feedback' || !this.session) return;
    this.advanceTimer?.remove();
    this.advanceTimer = null;
    await this.show(this.session);
  }

  private fail(err: unknown, retry: () => void): void {
    this.phase = 'error';
    this.retryAction = retry;
    this.errorMessage =
      err instanceof PlatformError && err.isNetwork
        ? 'Can’t reach BidaZoo.'
        : 'Something went wrong.';
    this.render();
  }

  /**
   * The little hop or head shake that goes with a graded answer. The expression itself is derived
   * from the screen's state in render(), so the reaction keeps it (happy / tryAgain) instead of
   * snapping back to idle while the feedback is still showing.
   */
  private celebrate(result: AnswerResult): void {
    if (!this.character) return;
    const shown = expressionForRun('feedback', result, { streak: this.streak });
    if (result.correct) this.character.celebrate(shown, shown);
    else this.character.wobble(shown);
  }

  // ---------------------------------------------------------------------------
  // Drawing (rebuilt from state on every change and every resize)
  // ---------------------------------------------------------------------------

  private render(): void {
    const ctx = getContext(this);
    this.character = null;
    this.layer.removeAll(true);
    const { width: w, height: h } = this.scale;
    const L = runLayout(w, h);
    const split = L.frame.composition === 'split';
    const pad = L.frame.pad;
    const targets: HitTarget[] = [];

    const session = this.session;
    const answered = session?.answered ?? 0;
    const total = session?.total ?? 10;
    const open = this.phase === 'question' || this.phase === 'submitting' || this.phase === 'feedback';

    // --- the expedition scene: the trail the buddy is walking ---
    const pageKey = bakeEnvironment(this, 'run-page', 'trail', w, h);
    this.layer.add(this.add.image(0, 0, pageKey).setOrigin(0, 0));
    const veil = this.add.graphics();
    veil.fillStyle(0x0d2d4a, split ? 0.4 : 0.16);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);
    if (split) {
      const panel = L.scene;
      const radius = Math.min(30, panel.w * 0.07);
      const frame = this.add.graphics();
      softShadow(frame, panel, radius, 12, 0.3);
      frame.fillStyle(EXP.brassDeep, 1);
      frame.fillRoundedRect(panel.x - 4, panel.y - 4, panel.w + 8, panel.h + 8, radius + 3);
      frame.fillStyle(EXP.brass, 1);
      frame.fillRoundedRect(panel.x - 4, panel.y - 4, panel.w + 8, panel.h + 6, radius + 3);
      this.layer.add(frame);
      const inner = this.add.container(0, 0);
      const key = bakeEnvironment(this, 'run-scene', 'basecamp', Math.round(panel.w), Math.round(panel.h));
      inner.add(this.add.image(panel.x, panel.y, key).setOrigin(0, 0));
      const light = this.add.graphics();
      spotlight(light, panel.x + panel.w / 2, panel.y + panel.h * 0.4, Math.min(panel.w * 0.5, panel.h * 0.4));
      inner.add(light);
      this.layer.add(inner);
      maskRounded(this, inner, panel, radius);
    }

    // --- the buddy: placed deliberately, peeking over the question card (stack) or standing on a ledge (split) ---
    const hero = new Character(this, 0, 0, ctx.character, 100);
    const overlap = split ? Math.max(12, L.scene.h * 0.05) : 8;
    const fit = hero.placeInBox(L.buddyBox.x, L.buddyBox.y, L.buddyBox.w, L.buddyBox.h, {
      presence: castPresence(ctx.character as CastId),
      fillWidth: split ? 0.8 : 0.8,
      maxScale: 3.4,
      overlap,
    });
    // The expression follows the screen's state, so every rebuild (a resize, the next question)
    // shows the right one from its first frame. It reads what is already shown; it decides nothing.
    hero.setExpression(
      expressionForRun(this.phase, this.feedback ? this.feedback.result : null, { sequence: this.question?.sequence, streak: this.streak }),
    );
    if (this.phase === 'question' || this.phase === 'loading') hero.startIdleLoop(prefersReducedMotion());
    this.character = hero;
    this.heroFit = fit;
    this.layer.add(hero);
    clipBelow(this, hero, 0, w, split ? L.scene.y + L.scene.h - 2 : L.card.y + 12);
    if (split) {
      const ledgeH = L.scene.y + L.scene.h - (L.buddyBox.y + L.buddyBox.h);
      const ledge = this.add.graphics();
      grassLedge(ledge, { x: L.scene.x, y: L.scene.y + L.scene.h - ledgeH, w: L.scene.w, h: ledgeH });
      const clip = this.add.container(0, 0, [ledge]);
      maskRounded(this, clip, L.scene, Math.min(30, L.scene.w * 0.07));
      this.layer.add(clip);
    }

    // --- HUD pill: buddy avatar, XP, coins ---
    const hud = L.hud;
    const hg = this.add.graphics();
    softShadow(hg, hud, hud.h / 2, 8, 0.3);
    pill(hg, hud, EXP.navy, EXP.brass, 0.94);
    this.layer.add(hg);
    const av = hud.h - 8;
    this.layer.add(buildMedallion(this, { id: ctx.character, cx: hud.x + 4 + av / 2, cy: hud.y + hud.h / 2, d: av, selected: false }).container);
    const hudSize = clampNumber(Math.round(hud.h * 0.4), 14, 24);
    const icons = this.add.graphics();
    const statY = hud.y + hud.h / 2;
    const coinsText = text(this, `${ctx.totals.coins}`, EXP_CSS.white, { weight: 800, size: hudSize }).setOrigin(1, 0.5);
    const xpText = text(this, `${ctx.totals.xp} XP`, EXP_CSS.white, { weight: 800, size: hudSize }).setOrigin(1, 0.5);
    const hudRight = hud.x + hud.w - hud.h * 0.45;
    const ir = hudSize * 0.62;
    coinsText.setPosition(hudRight, statY);
    const coinX = hudRight - coinsText.width - ir - 6;
    coinIcon(icons, coinX, statY, ir);
    const gapBetween = hudSize * 0.9;
    xpText.setPosition(coinX - ir - gapBetween, statY);
    const starX = xpText.x - xpText.width - ir - 6;
    starIcon(icons, starX, statY, ir * 1.05);
    this.layer.add(icons);
    const heroName = text(this, characterName(ctx.character), '#ffd98a', { weight: 700, size: Math.max(12, hudSize * 0.8) })
      .setOrigin(0, 0.5)
      .setPosition(hud.x + av + 14, statY);
    heroName.setVisible(starX - ir - 8 > heroName.x + heroName.width);
    this.layer.add([xpText, coinsText, heroName]);

    // --- the route: one pin per question, the buddy's progress along the trail ---
    const route = L.route;
    const rg = this.add.graphics();
    const left = route.x + 16;
    const right = route.x + route.w - 16;
    const ry = route.y + route.h / 2;
    rg.lineStyle(Math.max(5, route.h * 0.22), 0x0d2d4a, 0.55);
    rg.lineBetween(left, ry, right, ry);
    rg.lineStyle(Math.max(3, route.h * 0.12), EXP.brass, 1);
    rg.lineBetween(left, ry, left + ((right - left) * answered) / total, ry);
    for (let i = 0; i <= total; i++) {
      const x = left + ((right - left) * i) / total;
      const done = i <= answered;
      const current = i === Math.min(answered + (open ? 1 : 0), total) && i > 0 && i <= total && !done;
      const r = i === total ? route.h * 0.42 : route.h * 0.26;
      rg.fillStyle(0x0d2d4a, 0.9);
      rg.fillCircle(x, ry, r + 2.5);
      rg.fillStyle(done ? EXP.brass : current ? EXP.orange : 0xe8f0f4, 1);
      rg.fillCircle(x, ry, r);
      if (i === total) starIcon(rg, x, ry, r * 0.95, done ? 0xffffff : EXP.brassDeep);
    }
    this.layer.add(rg);

    // --- the question card ---
    const card = L.card;
    const cg = this.add.graphics();
    parchmentPanel(cg, card);
    this.layer.add(cg);
    const prompt = this.question && this.phase !== 'loading' && this.phase !== 'error' ? this.question.prompt : '';
    const promptText = text(this, prompt === '' ? '…' : `${prompt} = ?`, EXP_CSS.navy, {
      weight: 800,
      size: clampNumber(Math.min(card.h * 0.52, card.w * 0.13), 28, 120),
    }).setOrigin(0.5);
    promptText.setPosition(card.x + card.w / 2, card.y + card.h * 0.5);
    this.layer.add(promptText);

    // --- the timber sign: which question this is ---
    if (open && this.question) {
      const sg = this.add.graphics();
      timberSign(sg, L.sign);
      this.layer.add(sg);
      const signText = text(this, `Question ${this.question.sequence} of ${total}`, '#fff1cf', {
        weight: 800,
        size: clampNumber(Math.round(L.sign.h * 0.34), 12, 20),
        wrapWidth: L.sign.w - 12,
      }).setOrigin(0.5);
      signText.setPosition(L.sign.x + L.sign.w / 2, L.sign.y + L.sign.h * 0.47);
      this.layer.add(signText);
    }

    // --- the feedback pill ---
    this.drawFeedback(L.feedback);

    // --- four glossy answer buttons (2x2) ---
    const choices = this.question && open ? this.question.choices : [];
    choices.forEach((choice, index) => {
      const r = L.answers[index];
      if (!r) return;
      let style: ButtonStyle = BUTTON_STYLES.answer;
      let badge: ButtonBadge = null;
      if (this.phase === 'feedback' && this.feedback) {
        const { result, chosen } = this.feedback;
        if (choice === result.correctAnswer) {
          style = BUTTON_STYLES.good;
          badge = 'check';
        } else if (choice === chosen) {
          style = BUTTON_STYLES.bad;
          badge = 'retry';
        } else style = BUTTON_STYLES.dim;
      }
      const button = new TapButton(this, `answer-${index}`, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, String(choice), style, () => this.onChoose(choice), 0.5);
      button.setBadge(badge);
      this.layer.add(button);
      targets.push(button.hitTarget());
    });

    // Tapping the question area during feedback skips the wait.
    if (this.phase === 'feedback') {
      const area = { x: 0, y: L.card.y, w, h: L.card.h + L.feedback.h + 6 };
      const skip = this.add.zone(area.x + area.w / 2, area.y + area.h / 2, area.w, area.h).setInteractive();
      skip.on('pointerup', () => void this.advance());
      this.layer.add(skip);
      targets.push({ id: 'continue', label: 'Continue', x: area.x, y: area.y, w: area.w, h: area.h });
    }

    if (this.phase === 'error') this.drawError(w, h, pad, targets);

    this.publish(targets, choices);
  }

  private drawFeedback(r: { x: number; y: number; w: number; h: number }): void {
    let label = '';
    let fill: number = EXP.navy;
    let edge: number = EXP.brass;
    let color: string = EXP_CSS.white;
    if (this.phase === 'feedback' && this.feedback) {
      const { result } = this.feedback;
      if (result.correct) {
        const rewards = result.rewards
          .filter((x) => x.reason === 'correct_answer')
          .map((x) => `+${x.amount} ${x.kind === 'xp' ? 'XP' : 'coins'}`)
          .join('   ');
        label = `${result.fluent ? 'Quick! ' : 'Correct! '}${rewards}`;
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
    if (label === '') return;
    const size = clampNumber(Math.min(r.h * 0.5, r.w * 0.052), 14, 28);
    const t = text(this, label, color, { weight: 800, size }).setOrigin(0.5);
    const pw = Math.min(r.w, t.width + size * 2.4);
    const g = this.add.graphics();
    softShadow(g, { x: r.x + (r.w - pw) / 2, y: r.y, w: pw, h: r.h }, r.h / 2, 6, 0.25);
    pill(g, { x: r.x + (r.w - pw) / 2, y: r.y, w: pw, h: r.h }, fill, edge);
    this.layer.add(g);
    t.setPosition(r.x + r.w / 2, r.y + r.h / 2 - 1);
    this.layer.add(t);
  }

  private drawError(w: number, h: number, pad: number, targets: HitTarget[]): void {
    const veil = this.add.graphics();
    veil.fillStyle(0x000000, 0.6);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);
    const message = text(this, this.errorMessage, EXP_CSS.white, { weight: 800, size: clampNumber(h * 0.04, 18, 32), wrapWidth: w - pad * 4 }).setOrigin(0.5);
    message.setPosition(w / 2, h * 0.4);
    this.layer.add(message);
    const btnH = clampNumber(h * 0.12, 60, 100);
    const btnW = Math.min(w - pad * 2, 420);
    const retry = new TapButton(this, 'retry', w / 2, h * 0.55, btnW, btnH, 'Try again', BUTTON_STYLES.primary, () => this.retryAction?.(), 0.4);
    this.layer.add(retry);
    targets.push(retry.hitTarget());
  }

  private buddyRect(): string {
    const r = this.character?.worldRect();
    return r ? JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }) : '';
  }

  private publish(targets: HitTarget[], choices: readonly number[]): void {
    const ctx = getContext(this);
    const session = this.session;
    const extra: Record<string, string> = {
      character: this.character?.id ?? ctx.character,
      // Which picture the starter is showing. Client-only page state, for tests and debugging.
      expression: this.character?.inspect().expression ?? 'idle',
      phase: this.phase,
      progress: `${session?.answered ?? 0}/${session?.total ?? 10}`,
      'question-id': this.question?.id ?? '',
      streak: String(this.streak),
      'buddy-rect': this.buddyRect(),
      'last-correct': this.feedback ? String(this.feedback.result.correct) : '',
    };
    publishSurface(ctx.parent, this.phase === 'error' ? 'run-error' : 'run', targets, extra);

    const status =
      this.phase === 'feedback' && this.feedback
        ? this.feedback.result.correct
          ? `Correct. Plus ${this.feedback.result.rewards.filter((r) => r.reason === 'correct_answer').map((r) => `${r.amount} ${r.kind}`).join(' and ')}.`
          : `Not quite. The answer is ${this.feedback.result.correctAnswer}.`
        : this.phase === 'error'
          ? this.errorMessage
          : this.question
            ? `Question ${this.question.sequence} of ${session?.total ?? 10}: ${this.question.prompt}`
            : 'Loading.';
    const actions =
      this.phase === 'question'
        ? choices.map((choice, index) => ({ id: `answer-${index}`, label: String(choice), onClick: () => this.onChoose(choice) }))
        : this.phase === 'feedback'
          ? [{ id: 'continue', label: 'Continue', onClick: () => void this.advance() }]
          : this.phase === 'error'
            ? [{ id: 'retry', label: 'Try again', onClick: () => this.retryAction?.() }]
            : [];
    ctx.a11y.set(status, actions);
  }
}
