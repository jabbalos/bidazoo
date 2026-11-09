/**
 * Encounter model (proposal 2.6 item 6): the rules of one encounter, as a pure state machine.
 *
 * Interface only. Every function body below is a stub; Lane A (item A1) implements the rules and
 * their tests. No Phaser, no DOM, no clock.
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

export function createEncounter(opts: { questions: number; kind: 'node' | 'boss'; specialMoves: number }): EncounterState {
  // STUB: Lane A item A1 implements this.
  return {
    kind: opts.kind,
    phase: 'question',
    questions: opts.questions,
    asked: 0,
    correct: 0,
    hearts: 0,
    strikes: 0,
    charge: 0,
    specialMovesLeft: opts.specialMoves,
    streak: 0,
    bestStreak: 0,
  };
}

export function applyAnswer(state: EncounterState, _answer: { correct: boolean }): EncounterState {
  // STUB: Lane A item A1 implements this.
  return state;
}

export function replayExpedition(_answers: { correct: boolean }[]): { beaconsLit: number; bossWon: boolean } {
  // STUB: Lane A item A1 implements this.
  return { beaconsLit: 0, bossWon: false };
}
