/**
 * Encounter model (proposal 2.6 item 6): the rules of one encounter, as a pure state machine.
 * No Phaser, no DOM, no clock. Used by the encounter overlay (client) and by the server, which
 * replays its own stored answers through `replayExpedition` at session completion.
 *
 * Rules (proposal section 3, Lane A, item A1):
 * - An encounter starts with 3 hearts and asks `questions` questions; the strikes needed to win
 *   equal `questions`.
 * - A correct answer is a strike. A wrong answer costs a heart.
 * - Three correct answers in a row fill the charge meter. While the meter is full and a special
 *   move is left, the next correct answer counts as a double strike and spends the meter.
 *   A wrong answer empties the meter.
 * - Hearts at 0 ends the encounter at once: lost. Otherwise it ends after `questions` answers:
 *   won when the strikes reached `questions`, lost when they did not. An encounter never ends
 *   early on a win, so every encounter consumes the same number of questions on the client and
 *   in the server's replay.
 * - The question timer is display only (owner decision, section 10): it is not an input here,
 *   so when it runs out nothing happens (no heart lost, no grade, no skip).
 */

export type EncounterKind = 'node' | 'boss';
export type EncounterPhase = 'question' | 'won' | 'lost';

export interface EncounterState {
  kind: EncounterKind;
  phase: EncounterPhase;
  questions: number;
  asked: number;
  correct: number;
  hearts: number;
  strikes: number;
  charge: number;
  specialMovesLeft: number;
  streak: number;
  bestStreak: number;
}

/** Hearts at the start of every encounter. */
export const ENCOUNTER_HEARTS = 3;
/** Correct answers in a row that fill the charge meter. */
export const CHARGE_FULL = 3;
/** Strikes a correct answer is worth while the special move fires. */
export const SPECIAL_MOVE_STRIKES = 2;

/** One destination run (proposal 2.1): five node encounters of two questions, then the boss of five. */
export const EXPEDITION_NODES = 5;
export const NODE_QUESTIONS = 2;
export const NODE_SPECIAL_MOVES = 1;
export const BOSS_QUESTIONS = 5;
export const BOSS_SPECIAL_MOVES = 2;

export function createEncounter(opts: { questions: number; kind: 'node' | 'boss'; specialMoves: number }): EncounterState {
  if (!Number.isInteger(opts.questions) || opts.questions < 1) {
    throw new RangeError(`An encounter needs a whole number of questions, at least 1 (got ${opts.questions}).`);
  }
  if (!Number.isInteger(opts.specialMoves) || opts.specialMoves < 0) {
    throw new RangeError(`specialMoves must be a whole number, 0 or more (got ${opts.specialMoves}).`);
  }
  return {
    kind: opts.kind,
    phase: 'question',
    questions: opts.questions,
    asked: 0,
    correct: 0,
    hearts: ENCOUNTER_HEARTS,
    strikes: 0,
    charge: 0,
    specialMovesLeft: opts.specialMoves,
    streak: 0,
    bestStreak: 0,
  };
}

/** True when the next correct answer is a special move (double strike). */
export function specialMoveReady(state: EncounterState): boolean {
  return state.phase === 'question' && state.charge >= CHARGE_FULL && state.specialMovesLeft > 0;
}

/**
 * Applies one graded answer. Returns a new state; the input is never changed. An answer after the
 * encounter has ended is ignored (the same state is returned).
 */
export function applyAnswer(state: EncounterState, answer: { correct: boolean }): EncounterState {
  if (state.phase !== 'question') return state;
  const next: EncounterState = { ...state, asked: state.asked + 1 };

  if (answer.correct) {
    next.correct += 1;
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
    if (specialMoveReady(state)) {
      next.strikes += SPECIAL_MOVE_STRIKES;
      next.specialMovesLeft -= 1;
      next.charge = 0;
    } else {
      next.strikes += 1;
      next.charge = Math.min(CHARGE_FULL, next.charge + 1);
    }
  } else {
    next.hearts -= 1;
    next.streak = 0;
    next.charge = 0;
  }

  if (next.hearts <= 0) next.phase = 'lost';
  else if (next.asked >= next.questions) next.phase = next.strikes >= next.questions ? 'won' : 'lost';
  return next;
}

/**
 * Replays one destination run from its graded answers, in order: five node encounters of two
 * questions (one special move each), then the boss of five (two special moves). The charge meter
 * carries from one encounter into the next. An encounter that the answers do not finish is neither
 * lit nor won; answers after the boss has ended are ignored.
 */
export function replayExpedition(answers: { correct: boolean }[]): { beaconsLit: number; bossWon: boolean } {
  const plan: { kind: EncounterKind; questions: number; specialMoves: number }[] = [
    ...Array.from({ length: EXPEDITION_NODES }, () => ({ kind: 'node' as const, questions: NODE_QUESTIONS, specialMoves: NODE_SPECIAL_MOVES })),
    { kind: 'boss', questions: BOSS_QUESTIONS, specialMoves: BOSS_SPECIAL_MOVES },
  ];
  let beaconsLit = 0;
  let bossWon = false;
  let carriedCharge = 0;
  let next = 0;

  for (const step of plan) {
    let state: EncounterState = { ...createEncounter(step), charge: carriedCharge };
    while (state.phase === 'question' && next < answers.length) {
      state = applyAnswer(state, { correct: (answers[next] as { correct: boolean }).correct });
      next += 1;
    }
    if (state.phase === 'question') break; // the run stopped inside this encounter
    if (step.kind === 'node' && state.phase === 'won') beaconsLit += 1;
    if (step.kind === 'boss') bossWon = state.phase === 'won';
    carriedCharge = state.charge;
  }
  return { beaconsLit, bossWon };
}
