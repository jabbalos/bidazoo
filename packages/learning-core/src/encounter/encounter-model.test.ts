import { describe, expect, it } from 'vitest';
import * as model from './encounter-model';
import {
  BOSS_QUESTIONS,
  BOSS_SPECIAL_MOVES,
  CHARGE_FULL,
  ENCOUNTER_HEARTS,
  NODE_QUESTIONS,
  NODE_SPECIAL_MOVES,
  applyAnswer,
  createEncounter,
  replayExpedition,
  specialMoveReady,
  type EncounterState,
} from './encounter-model';
import * as learningCore from '../index';

const T = { correct: true } as const;
const F = { correct: false } as const;

function play(state: EncounterState, answers: readonly { correct: boolean }[]): EncounterState {
  return answers.reduce((s, a) => applyAnswer(s, a), state);
}

function node(charge = 0): EncounterState {
  return { ...createEncounter({ questions: NODE_QUESTIONS, kind: 'node', specialMoves: NODE_SPECIAL_MOVES }), charge };
}

function boss(charge = 0): EncounterState {
  return { ...createEncounter({ questions: BOSS_QUESTIONS, kind: 'boss', specialMoves: BOSS_SPECIAL_MOVES }), charge };
}

/** Parses "TTF..." into answers; spaces are only for reading. */
function seq(text: string): { correct: boolean }[] {
  return [...text.replace(/\s/g, '')].map((c) => {
    if (c !== 'T' && c !== 'F') throw new Error(`bad answer ${c}`);
    return { correct: c === 'T' };
  });
}

/** EncounterState is flat, so a shallow freeze makes it fully read-only. */
function freeze<T>(value: T): T {
  return Object.freeze(value);
}

describe('createEncounter', () => {
  it('starts in the question phase with full hearts and empty meters', () => {
    expect(createEncounter({ questions: 2, kind: 'node', specialMoves: 1 })).toEqual({
      kind: 'node',
      phase: 'question',
      questions: 2,
      asked: 0,
      correct: 0,
      hearts: ENCOUNTER_HEARTS,
      strikes: 0,
      charge: 0,
      specialMovesLeft: 1,
      streak: 0,
      bestStreak: 0,
    });
    expect(ENCOUNTER_HEARTS).toBe(3);
    expect(CHARGE_FULL).toBe(3);
  });

  it('keeps the kind and the special-move allowance it was given', () => {
    const b = createEncounter({ questions: 5, kind: 'boss', specialMoves: 2 });
    expect(b.kind).toBe('boss');
    expect(b.questions).toBe(5);
    expect(b.specialMovesLeft).toBe(2);
  });

  it('rejects impossible encounters', () => {
    expect(() => createEncounter({ questions: 0, kind: 'node', specialMoves: 1 })).toThrow(RangeError);
    expect(() => createEncounter({ questions: 1.5, kind: 'node', specialMoves: 1 })).toThrow(RangeError);
    expect(() => createEncounter({ questions: 2, kind: 'node', specialMoves: -1 })).toThrow(RangeError);
    expect(() => createEncounter({ questions: 2, kind: 'node', specialMoves: Number.NaN })).toThrow(RangeError);
  });

  it('is exported from the learning-core entry point', () => {
    expect(learningCore.createEncounter).toBe(createEncounter);
    expect(learningCore.applyAnswer).toBe(applyAnswer);
    expect(learningCore.replayExpedition).toBe(replayExpedition);
  });
});

describe('applyAnswer: single transitions', () => {
  it('a correct answer is a strike, adds to the charge meter and the streak', () => {
    const s = applyAnswer(boss(), T);
    expect(s).toMatchObject({ phase: 'question', asked: 1, correct: 1, strikes: 1, charge: 1, streak: 1, bestStreak: 1, hearts: 3 });
  });

  it('a wrong answer costs a heart and empties the charge meter and the streak, not the best streak', () => {
    const s = play(boss(), seq('TT F'));
    expect(s).toMatchObject({ phase: 'question', asked: 3, correct: 2, strikes: 2, hearts: 2, charge: 0, streak: 0, bestStreak: 2 });
  });

  it('never changes the state it was given', () => {
    const start = freeze(boss(CHARGE_FULL));
    const snapshot = { ...start };
    applyAnswer(start, T);
    applyAnswer(start, F);
    expect(start).toEqual(snapshot);
  });

  it('ignores answers once the encounter has ended', () => {
    const won = play(node(), seq('TT'));
    expect(won.phase).toBe('won');
    expect(applyAnswer(won, F)).toBe(won);
    const lost = play(boss(), seq('FFF'));
    expect(lost.phase).toBe('lost');
    expect(applyAnswer(lost, T)).toBe(lost);
  });

  it('depends only on whether the answer was correct (the timer is not an input)', () => {
    // A late answer still counts; a timer running out is not an answer and changes nothing.
    const timed = applyAnswer(boss(), { correct: true, responseMs: 99_000, timedOut: true } as { correct: boolean });
    expect(timed).toEqual(applyAnswer(boss(), T));
    const keys = Object.keys(createEncounter({ questions: 2, kind: 'node', specialMoves: 1 }));
    expect(keys.filter((k) => /time|timer|clock|ms$/i.test(k))).toEqual([]);
    expect(Object.keys(model).filter((k) => /time|timer|clock|tick|expire/i.test(k))).toEqual([]);
  });
});

describe('applyAnswer: charge and special moves', () => {
  it('three correct in a row fill the meter; the next correct answer is a double strike and spends it', () => {
    let s = play(boss(), seq('TTT'));
    expect(s).toMatchObject({ strikes: 3, charge: CHARGE_FULL, specialMovesLeft: 2 });
    expect(specialMoveReady(s)).toBe(true);
    s = applyAnswer(s, T);
    expect(s).toMatchObject({ strikes: 5, charge: 0, specialMovesLeft: 1, correct: 4, streak: 4 });
    expect(specialMoveReady(s)).toBe(false);
  });

  it('a wrong answer on a full meter empties it without using the special move', () => {
    const s = play(boss(), seq('TTT F'));
    expect(s).toMatchObject({ charge: 0, specialMovesLeft: 2, strikes: 3, hearts: 2 });
  });

  it('the boss allows two special moves, then the meter fills but no longer fires', () => {
    const s = play(createEncounter({ questions: 12, kind: 'boss', specialMoves: 2 }), seq('TTTT TTTT TTTT'));
    // strikes: 1 2 3 [5] 6 7 8 [10] 11 12 13 14
    expect(s).toMatchObject({ phase: 'won', strikes: 14, specialMovesLeft: 0, charge: CHARGE_FULL, correct: 12, bestStreak: 12 });
    expect(specialMoveReady(s)).toBe(false);
  });

  it('with no special moves the meter stays full and every strike is single', () => {
    const s = play(createEncounter({ questions: 5, kind: 'node', specialMoves: 0 }), seq('TTTTT'));
    expect(s).toMatchObject({ strikes: 5, charge: CHARGE_FULL, specialMovesLeft: 0 });
  });

  it('a charge carried into a node turns one miss into a win', () => {
    expect(play(node(CHARGE_FULL), seq('TF'))).toMatchObject({ phase: 'won', strikes: 2, hearts: 2 });
    expect(play(node(CHARGE_FULL), seq('FT'))).toMatchObject({ phase: 'lost', strikes: 1, hearts: 2 });
    expect(play(node(), seq('TF'))).toMatchObject({ phase: 'lost', strikes: 1 });
  });
});

describe('applyAnswer: ending', () => {
  it('a node of two is won with two correct and lost with any miss', () => {
    expect(play(node(), seq('TT')).phase).toBe('won');
    expect(play(node(), seq('TF')).phase).toBe('lost');
    expect(play(node(), seq('FT')).phase).toBe('lost');
    expect(play(node(), seq('FF'))).toMatchObject({ phase: 'lost', hearts: 1 });
  });

  it('stays in the question phase until the last question, even once enough strikes are in', () => {
    const s = play(boss(CHARGE_FULL), seq('TTTT'));
    expect(s.strikes).toBe(5); // 2 + 1 + 1 + 1
    expect(s.phase).toBe('question');
    expect(applyAnswer(s, F).phase).toBe('won');
  });

  it('hearts at 0 ends the encounter at once, lost, before the last question', () => {
    const s = play(boss(), seq('F T F F'));
    expect(s).toMatchObject({ phase: 'lost', hearts: 0, asked: 4, correct: 1 });
  });

  it('the boss is won by five strikes in five answers, or by special moves covering misses', () => {
    expect(play(boss(), seq('TTTTT')).phase).toBe('won');
    // 1 2 3 [5] then a miss: the special move made up for it.
    expect(play(boss(), seq('TTTT F'))).toMatchObject({ strikes: 5, phase: 'won', hearts: 2 });
    // 1 2 3, miss (meter empties), 4: one strike short.
    expect(play(boss(), seq('TTT F T'))).toMatchObject({ strikes: 4, phase: 'lost', hearts: 2 });
  });
});

describe('applyAnswer: exhaustive over every answer sequence', () => {
  /** Checks every invariant of the rules for one start state and one complete answer sequence. */
  function check(start: EncounterState, answers: { correct: boolean }[]): void {
    let s = start;
    let wrong = 0;
    for (const a of answers) {
      const before = s;
      s = applyAnswer(s, a);
      if (before.phase !== 'question') {
        expect(s).toBe(before);
        continue;
      }
      if (!a.correct) wrong += 1;
      expect(s.asked).toBe(before.asked + 1);
      expect(s.hearts).toBe(ENCOUNTER_HEARTS - wrong);
      expect(s.asked).toBe(s.correct + wrong);
      const gained = s.strikes - before.strikes;
      if (a.correct) {
        const fired = specialMoveReady(before);
        expect(gained).toBe(fired ? 2 : 1);
        expect(s.specialMovesLeft).toBe(before.specialMovesLeft - (fired ? 1 : 0));
        expect(s.charge).toBe(fired ? 0 : Math.min(CHARGE_FULL, before.charge + 1));
        expect(s.streak).toBe(before.streak + 1);
      } else {
        expect(gained).toBe(0);
        expect(s.charge).toBe(0);
        expect(s.streak).toBe(0);
        expect(s.specialMovesLeft).toBe(before.specialMovesLeft);
      }
      expect(s.bestStreak).toBe(Math.max(before.bestStreak, s.streak));
      expect(s.charge).toBeGreaterThanOrEqual(0);
      expect(s.charge).toBeLessThanOrEqual(CHARGE_FULL);
      if (s.hearts === 0) expect(s.phase).toBe('lost');
      else if (s.asked === s.questions) expect(s.phase).toBe(s.strikes >= s.questions ? 'won' : 'lost');
      else expect(s.phase).toBe('question');
    }
    // Every complete sequence ends the encounter.
    expect(s.phase).not.toBe('question');
  }

  function allSequences(length: number): { correct: boolean }[][] {
    return Array.from({ length: 2 ** length }, (_, n) => Array.from({ length }, (_, i) => ({ correct: ((n >> i) & 1) === 1 })));
  }

  for (const charge of [0, 1, 2, CHARGE_FULL]) {
    it(`node of ${NODE_QUESTIONS}, starting charge ${charge}`, () => {
      for (const answers of allSequences(NODE_QUESTIONS)) check(node(charge), answers);
    });
    it(`boss of ${BOSS_QUESTIONS}, starting charge ${charge}`, () => {
      for (const answers of allSequences(BOSS_QUESTIONS)) check(boss(charge), answers);
    });
  }

  it('from an empty meter, a node is won exactly when both answers are correct', () => {
    for (const answers of allSequences(NODE_QUESTIONS)) {
      const misses = answers.filter((a) => !a.correct).length;
      expect(play(node(), answers).phase).toBe(misses === 0 ? 'won' : 'lost');
    }
  });
});

describe('replayExpedition (five nodes of two, then the boss of five; hand-worked)', () => {
  it('no answers: nothing lit, boss not won', () => {
    expect(replayExpedition([])).toEqual({ beaconsLit: 0, bossWon: false });
  });

  it('all fifteen correct: five beacons and the boss', () => {
    // n1 TT ch2 | n2 T ch3, T double | n3 TT ch2 | n4 T ch3, T double | n5 TT ch2 | boss T ch3, T double, T T T
    expect(replayExpedition(seq('TT TT TT TT TT TTTTT'))).toEqual({ beaconsLit: 5, bossWon: true });
  });

  it('all wrong: nothing lit; the boss is lost on its third miss', () => {
    expect(replayExpedition(seq('FF FF FF FF FF FFF'))).toEqual({ beaconsLit: 0, bossWon: false });
  });

  it('misses in nodes 2 and 4 leave them dark; the boss special move covers its one miss', () => {
    // n1 TT won ch2 | n2 T ch3, F lost ch0 | n3 TT won ch2 | n4 F, T lost ch1 | n5 T ch2, T ch3 won
    // boss (charge 3 carried): F ch0 h2 | T 1 | T 2 | T 3 ch3 | T double 5 -> won
    expect(replayExpedition(seq('TT TF TT FT TT FTTTT'))).toEqual({ beaconsLit: 3, bossWon: true });
  });

  it('the charge carries across encounters: a carried special move wins a node with a miss', () => {
    // n1 F, T lost ch1 | n2 T ch2, T ch3 won | n3 T double (2), F -> won ch0 | n4 TT won ch2
    // n5 T ch3, T double won ch0 | boss T T T(ch3) F(ch0) T -> 4 strikes of 5, lost
    expect(replayExpedition(seq('FT TT TF TT TT TTTFT'))).toEqual({ beaconsLit: 4, bossWon: false });
  });

  it('without the carried charge, the same node-3 answers would leave it dark', () => {
    // n1 F, F lost ch0 | n2 TT ch2 won | n3 T ch3, F lost ch0 | ...
    expect(replayExpedition(seq('FF TT TF'))).toEqual({ beaconsLit: 1, bossWon: false });
  });

  it('the boss lost on hearts ignores the answers after it', () => {
    expect(replayExpedition(seq('TT TT TT TT TT FFF TT'))).toEqual({ beaconsLit: 5, bossWon: false });
  });

  it('a run that stops inside an encounter counts only the finished ones', () => {
    expect(replayExpedition(seq('TTT'))).toEqual({ beaconsLit: 1, bossWon: false });
    expect(replayExpedition(seq('TT TT TT TT TT TTTT'))).toEqual({ beaconsLit: 5, bossWon: false });
  });

  it('answers past the end of the run are ignored', () => {
    expect(replayExpedition(seq('TT TT TT TT TT TTTTT FFFFF'))).toEqual({ beaconsLit: 5, bossWon: true });
  });

  it('does not change the answers it was given', () => {
    const answers = Object.freeze(seq('TT TF TT FT TT FTTTT').map((a) => Object.freeze(a)));
    expect(() => replayExpedition(answers as { correct: boolean }[])).not.toThrow();
  });
});
