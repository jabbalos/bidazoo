import type { CharacterId } from '../roster';
import type { SessionClient } from '../session-client';
import { EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, text } from '../ui';

/** A challenger id from Lane A's challenger definitions. */
export type ChallengerId = string;

export interface EncounterOutcome {
  won: boolean;
  correct: number;
  asked: number;
  bestStreak: number;
  heartsLeft: number;
}

const HEARTS = 3;

/**
 * Runs one encounter over the current play session (proposal 2.6 item 1; Lane A owns it, Lane B
 * calls it). Each question comes from and is graded by the server through `opts.session`.
 *
 * Hour-1 stub: a plain overlay with the prompt and one answer tile per choice, `questions` times,
 * resolving with the counts. Won means every answer was correct; the encounter model, challenger
 * and buddy art arrive with Lane A.
 */
export async function startEncounter(
  scene: Phaser.Scene,
  opts: { session: SessionClient; questions: number; kind: 'node' | 'boss'; challenger: ChallengerId; buddy: CharacterId },
): Promise<EncounterOutcome> {
  const { width, height } = scene.scale;
  const overlay = scene.add.container(0, 0).setDepth(1000);
  overlay.add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setInteractive());
  let correct = 0;
  let asked = 0;
  let streak = 0;
  let bestStreak = 0;
  try {
    while (asked < opts.questions) {
      const question = await opts.session.nextQuestion();
      const choice = await new Promise<number | string>((resolve) => {
        const prompt = text(scene, question.prompt, EXP_CSS.white, { weight: 800, size: 36, align: 'center' });
        prompt.setOrigin(0.5).setPosition(width / 2, height * 0.3);
        overlay.add(prompt);
        const w = Math.min(160, (width - 40) / question.choices.length - 12);
        question.choices.forEach((value: number | string, index: number) => {
          const x = width / 2 + (index - (question.choices.length - 1) / 2) * (w + 12);
          overlay.add(new TapButton(scene, `answer-${index}`, x, height * 0.6, w, 72, String(value), BUTTON_STYLES.answer, () => resolve(value), 0.5));
        });
      });
      if (typeof choice !== 'number') throw new Error('Text questions are not supported by the encounter stub.');
      const result = await opts.session.submitAnswer(choice);
      asked += 1;
      if (result.correct) {
        correct += 1;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
      } else streak = 0;
      overlay.removeBetween(1, undefined, true);
    }
  } finally {
    overlay.destroy(true);
  }
  return { won: correct === asked, correct, asked, bestStreak, heartsLeft: Math.max(0, HEARTS - (asked - correct)) };
}
