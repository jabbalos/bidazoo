import Phaser from 'phaser';
import {
  PlatformError,
  type AnswerResult,
  type PlaySession,
  type PublicQuestion,
} from '@bidazoo/game-sdk';
import { Character } from '../characters';
import { expressionForAnswer, expressionForRun } from '../character-expression';
import { getContext } from '../context';
import { COLORS, CSS, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, makeAttemptId, publishSurface, text, type HitTarget } from '../ui';

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

  constructor() {
    super('RunScene');
  }

  create(): void {
    this.phase = 'loading';
    this.session = null;
    this.question = null;
    this.feedback = null;
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
    const shown = expressionForAnswer(result);
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
    const colW = Math.min(w, 760);
    const colX = (w - colW) / 2;
    const pad = Math.max(12, Math.round(Math.min(w, h) * 0.035));
    const targets: HitTarget[] = [];

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.jungle, 1);
    bg.fillRect(0, 0, w, h);
    this.layer.add(bg);

    const session = this.session;
    const answered = session?.answered ?? 0;
    const total = session?.total ?? 10;

    // --- HUD: XP | progress | coins ---
    const hudH = clamp(h * 0.075, 38, 64);
    const hudY = pad + hudH / 2;
    const hudSize = clamp(hudH * 0.5, 15, 28);
    const xp = text(this, `XP ${ctx.totals.xp}`, CSS.sun, { bold: true, size: hudSize }).setOrigin(0, 0.5).setPosition(colX + pad, hudY);
    const progress = text(this, `${Math.min(answered + (this.phase === 'question' || this.phase === 'submitting' ? 1 : 0), total)} / ${total}`, CSS.cream, {
      bold: true,
      size: hudSize,
    }).setOrigin(0.5).setPosition(w / 2, hudY);
    const coins = text(this, `Coins ${ctx.totals.coins}`, CSS.sun, { bold: true, size: hudSize }).setOrigin(1, 0.5).setPosition(colX + colW - pad, hudY);
    this.layer.add([xp, progress, coins]);

    // --- Track with the animal advancing one stop per answered question ---
    const trackH = h * 0.16;
    const trackY = pad + hudH + trackH / 2;
    const trackLeft = colX + pad + 22;
    const trackRight = colX + colW - pad - 22;
    const line = this.add.graphics();
    line.lineStyle(Math.max(6, trackH * 0.07), COLORS.leaf, 1);
    line.lineBetween(trackLeft, trackY + trackH * 0.18, trackRight, trackY + trackH * 0.18);
    for (let i = 0; i <= total; i++) {
      const x = trackLeft + ((trackRight - trackLeft) * i) / total;
      line.fillStyle(i <= answered ? COLORS.sun : COLORS.leafLight, 1);
      line.fillCircle(x, trackY + trackH * 0.18, i === total ? 9 : 6);
    }
    this.layer.add(line);
    // The starter stands on the track line, one stop further along per answered question.
    const bust = clamp(trackH * 0.82, 56, 104);
    const lineY = trackY + trackH * 0.18;
    const characterX = trackLeft + ((trackRight - trackLeft) * answered) / total;
    this.character = new Character(this, characterX, lineY - bust * 0.45, ctx.character, bust);
    // The expression follows the screen's state, so every rebuild (a resize, the next question)
    // shows the right one from its first frame. It reads what is already shown; it decides nothing.
    this.character.setExpression(expressionForRun(this.phase, this.feedback ? this.feedback.result : null));
    this.layer.add(this.character);

    // --- Question ---
    const qH = h * 0.17;
    const qY = pad + hudH + trackH + qH / 2;
    const prompt = this.question && this.phase !== 'loading' && this.phase !== 'error' ? this.question.prompt : '';
    const promptText = text(this, prompt === '' ? '…' : `${prompt} = ?`, CSS.cream, {
      bold: true,
      size: clamp(Math.min(qH * 0.62, colW * 0.15), 28, 120),
    }).setOrigin(0.5).setPosition(w / 2, qY);
    this.layer.add(promptText);

    // --- Feedback line ---
    const fbH = h * 0.075;
    const fbY = pad + hudH + trackH + qH + fbH / 2;
    const fb = this.feedbackLine(fbH, colW - pad * 2).setOrigin(0.5);
    fb.setPosition(w / 2, fbY);
    this.layer.add(fb);

    // --- Four answer buttons (2x2) ---
    const areaTop = pad + hudH + trackH + qH + fbH;
    const areaH = h - areaTop - pad;
    const gap = pad;
    const btnW = (colW - pad * 2 - gap) / 2;
    const btnH = Math.max(56, (areaH - gap) / 2);
    const choices = this.question && (this.phase === 'question' || this.phase === 'submitting' || this.phase === 'feedback') ? this.question.choices : [];
    choices.forEach((choice, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cx = colX + pad + btnW / 2 + col * (btnW + gap);
      const cy = areaTop + btnH / 2 + row * (btnH + gap);
      let style = BUTTON_STYLES.card;
      if (this.phase === 'submitting') style = BUTTON_STYLES.card;
      if (this.phase === 'feedback' && this.feedback) {
        const { result, chosen } = this.feedback;
        if (choice === result.correctAnswer) style = BUTTON_STYLES.good;
        else if (choice === chosen) style = BUTTON_STYLES.bad;
        else style = BUTTON_STYLES.dim;
      }
      const button = new TapButton(this, `answer-${index}`, cx, cy, btnW, btnH, String(choice), style, () => this.onChoose(choice), 0.5);
      this.layer.add(button);
      targets.push(button.hitTarget());
    });

    // Tapping anywhere during feedback skips the wait.
    if (this.phase === 'feedback') {
      const skip = this.add.zone(w / 2, qY, w, qH + fbH).setInteractive();
      skip.on('pointerup', () => void this.advance());
      this.layer.add(skip);
      targets.push({ id: 'continue', label: 'Continue', x: 0, y: qY - (qH + fbH) / 2, w, h: qH + fbH });
    }

    if (this.phase === 'error') this.drawError(w, h, pad, targets);

    this.publish(targets, choices);
  }

  private feedbackLine(height: number, maxWidth: number): Phaser.GameObjects.Text {
    const size = clamp(Math.min(height * 0.5, maxWidth * 0.052), 15, 30);
    if (this.phase === 'feedback' && this.feedback) {
      const { result } = this.feedback;
      if (result.correct) {
        const rewards = result.rewards
          .filter((r) => r.reason === 'correct_answer')
          .map((r) => `+${r.amount} ${r.kind === 'xp' ? 'XP' : 'coins'}`)
          .join('   ');
        return text(this, `${result.fluent ? 'Quick! ' : 'Correct! '}${rewards}`, CSS.good, { bold: true, size });
      }
      return text(this, `Not quite. The answer is ${result.correctAnswer}`, CSS.bad, { bold: true, size });
    }
    if (this.phase === 'submitting') return text(this, 'Checking…', CSS.mist, { size });
    if (this.phase === 'loading') return text(this, 'Getting your question…', CSS.mist, { size });
    return text(this, '', CSS.mist, { size });
  }

  private drawError(w: number, h: number, pad: number, targets: HitTarget[]): void {
    const veil = this.add.graphics();
    veil.fillStyle(0x000000, 0.6);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);
    const message = text(this, this.errorMessage, CSS.cream, { bold: true, size: clamp(h * 0.04, 18, 32), wrapWidth: w - pad * 4 }).setOrigin(0.5);
    message.setPosition(w / 2, h * 0.4);
    this.layer.add(message);
    const btnH = clamp(h * 0.12, 60, 100);
    const btnW = Math.min(w - pad * 2, 420);
    const retry = new TapButton(this, 'retry', w / 2, h * 0.55, btnW, btnH, 'Try again', BUTTON_STYLES.primary, () => this.retryAction?.(), 0.4);
    this.layer.add(retry);
    targets.push(retry.hitTarget());
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
