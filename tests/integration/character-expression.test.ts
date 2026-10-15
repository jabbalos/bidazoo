import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as expressionModule from '../../games/zoo-sprint/src/character-expression';
import {
  STABLE_EXPRESSION,
  expressionForAnswer,
  expressionForPhase,
  expressionForResults,
  expressionForRun,
  type RunPhaseName,
} from '../../games/zoo-sprint/src/character-expression';
import { EXPRESSION_STATES, HOST_DEFINITION, STARTER_DEFINITIONS } from '../../games/zoo-sprint/src/character-definitions';
import { STARTERS, isCharacterId } from '../../games/zoo-sprint/src/roster';

/** The repository root (this file lives in tests/integration). */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const PHASES: readonly RunPhaseName[] = ['loading', 'question', 'submitting', 'feedback', 'error'];

/**
 * Source text with every line ending turned into LF. A Windows checkout may hold CRLF, and the
 * structural patterns below (which match across lines) must behave the same on Linux and Windows.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Source code with comments removed, so prose in a comment never trips a code check. */
function stripComments(text: string): string {
  return normalizeLineEndings(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** A source file's code (LF-normalized, comments removed). Every scan in this file reads through here. */
function codeOfPath(relative: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, relative), 'utf8'));
}

function sceneCode(file: string): string {
  return codeOfPath(`games/zoo-sprint/src/scenes/${file}`);
}

function typeScriptFilesUnder(relative: string): string[] {
  const root = join(REPO_ROOT, relative);
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const full = join(directory, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|sql)$/.test(name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

describe('character expressions: the gameplay mapping (pure)', () => {
  it('IDLE is the stable default: every step with no graded answer and no pending answer rests at idle', () => {
    expect(STABLE_EXPRESSION).toBe('idle');
    for (const phase of ['loading', 'question', 'error'] as const) {
      expect(expressionForPhase(phase), phase).toBe('idle');
    }
    // Feedback with nothing graded to show also rests.
    expect(expressionForRun('feedback', null)).toBe('idle');
  });

  it('a correct answer is HAPPY', () => {
    expect(expressionForAnswer({ correct: true })).toBe('happy');
    expect(expressionForRun('feedback', { correct: true })).toBe('happy');
  });

  it('an incorrect answer is TRY_AGAIN (encouraging, never a different "bad" state)', () => {
    expect(expressionForAnswer({ correct: false })).toBe('tryAgain');
    expect(expressionForRun('feedback', { correct: false })).toBe('tryAgain');
  });

  it('submitting an answer is THINKING, with or without an earlier answer in hand', () => {
    expect(expressionForPhase('submitting')).toBe('thinking');
    expect(expressionForRun('submitting', null)).toBe('thinking');
    expect(expressionForRun('submitting', { correct: true })).toBe('thinking');
    expect(expressionForRun('submitting', { correct: false })).toBe('thinking');
  });

  it('a finished run is CHEER, including the "All done!" case with no results block', () => {
    expect(expressionForResults({ newlyMastered: [] })).toBe('cheer');
    expect(expressionForResults(undefined)).toBe('cheer');
    expect(expressionForResults(null)).toBe('cheer');
  });

  it('a newly mastered fact is DISCOVER, and it takes precedence over the plain cheer', () => {
    expect(expressionForResults({ newlyMastered: ['7 × 8'] })).toBe('discover');
    expect(expressionForResults({ newlyMastered: ['1', '2', '3', '4', '5', '6', '7'] })).toBe('discover');
    expect(expressionForResults({ newlyMastered: [] })).not.toBe('discover');
  });

  it('temporary expressions return cleanly: a graded answer shows only while the feedback shows', () => {
    // The next question, an error, and loading all return to idle even if an answer is still held.
    for (const phase of PHASES.filter((p) => p !== 'feedback' && p !== 'submitting')) {
      expect(expressionForRun(phase, { correct: true }), `${phase} after a correct answer`).toBe('idle');
      expect(expressionForRun(phase, { correct: false }), `${phase} after a wrong answer`).toBe('idle');
    }
  });

  it('only ever names one of the six canonical expressions, and all six are reachable', () => {
    const outputs = new Set([
      ...PHASES.map((phase) => expressionForPhase(phase)),
      ...PHASES.flatMap((phase) => [expressionForRun(phase, { correct: true }), expressionForRun(phase, { correct: false })]),
      expressionForAnswer({ correct: true }),
      expressionForAnswer({ correct: false }),
      expressionForResults({ newlyMastered: [] }),
      expressionForResults({ newlyMastered: ['x'] }),
    ]);
    for (const output of outputs) expect(EXPRESSION_STATES).toContain(output);
    expect([...outputs].sort()).toEqual([...EXPRESSION_STATES].sort());
  });

  it('reads only the outcome: extra fields (rewards, xp, coins, mastery) never change the picture', () => {
    const bare = expressionForAnswer({ correct: true });
    const loaded = expressionForAnswer({
      correct: true,
      fluent: true,
      xp: 999999,
      coins: 999999,
      rewards: [{ kind: 'xp', amount: 10 }],
      mastery: { mastered: true, box: 5 },
    } as { correct: boolean });
    expect(loaded).toBe(bare);
    const noXp = expressionForAnswer({ correct: false, xp: 0, coins: 0 } as { correct: boolean });
    const bigXp = expressionForAnswer({ correct: false, xp: 5000, coins: 5000 } as { correct: boolean });
    expect(bigXp).toBe(noXp);
    expect(expressionForResults({ newlyMastered: [], xpEarned: 0 } as { newlyMastered: [] })).toBe(
      expressionForResults({ newlyMastered: [], xpEarned: 100000 } as { newlyMastered: [] }),
    );
  });

  it('is pure: it never mutates its input, and the same input always gives the same expression', () => {
    const answer = Object.freeze({ correct: true });
    const results = Object.freeze({ newlyMastered: Object.freeze(['7 × 8']) });
    for (let i = 0; i < 3; i++) {
      expect(expressionForAnswer(answer)).toBe('happy');
      expect(expressionForResults(results)).toBe('discover');
      expect(expressionForRun('feedback', answer)).toBe('happy');
    }
    expect(answer).toEqual({ correct: true });
    expect(results).toEqual({ newlyMastered: ['7 × 8'] });
  });
});

describe('character expressions: all five starters behave identically, and Click stays out', () => {
  it('the mapping takes no character at all, so it cannot differ between starters', () => {
    expect(expressionForPhase.length).toBe(1);
    expect(expressionForAnswer.length).toBe(1);
    expect(expressionForResults.length).toBe(1);
    expect(expressionForRun.length).toBe(2); // (phase, answer): still no character
  });

  it('every starter has all six expressions, so every mapped state has art for every starter', () => {
    expect(STARTER_DEFINITIONS.map((d) => d.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco']);
    const mapped = [
      expressionForPhase('question'),
      expressionForPhase('submitting'),
      expressionForAnswer({ correct: true }),
      expressionForAnswer({ correct: false }),
      expressionForResults({ newlyMastered: [] }),
      expressionForResults({ newlyMastered: ['x'] }),
    ];
    for (const definition of STARTER_DEFINITIONS) {
      for (const state of mapped) {
        expect(definition.expressions, `${definition.id} -> ${state}`).toContain(state);
      }
    }
  });

  it('Click (host and guide) is not selectable and is not a gameplay character', () => {
    expect(HOST_DEFINITION.selectable).toBe(false);
    expect(STARTERS.map((s) => s.id)).not.toContain('click');
    expect(isCharacterId('click')).toBe(false);
    for (const file of ['RunScene.ts', 'ResultsScene.ts', 'MenuScene.ts']) {
      expect(sceneCode(file), `${file} must not draw Click`).not.toMatch(/['"]click['"]/);
    }
  });
});

describe('character expressions: presentation only (wiring)', () => {
  it('the mapping module is Phaser-free, imports only types, and touches no network, storage or page', () => {
    const code = codeOfPath('games/zoo-sprint/src/character-expression.ts');
    const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    expect(imports).toEqual(['./character-definitions']);
    expect(code).toMatch(/import type \{[^}]*\} from '\.\/character-definitions'/);
    expect(code).not.toMatch(/phaser/i);
    expect(code).not.toMatch(/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|window|document|navigator)\b/);
  });

  it('exports exactly the mapping API and nothing about scoring, XP, coins or mastery', () => {
    expect(Object.keys(expressionModule).sort()).toEqual(
      ['STABLE_EXPRESSION', 'expressionForAnswer', 'expressionForPhase', 'expressionForResults', 'expressionForRun'].sort(),
    );
  });

  it('the answer sent to the API still has exactly attemptId, questionId and response', () => {
    const code = sceneCode('RunScene.ts');
    const calls = [...code.matchAll(/submitAnswer\(([^;]*)\);/g)];
    expect(calls).toHaveLength(1);
    const argument = (calls[0] as RegExpMatchArray)[1] as string;
    expect(argument).toContain('attemptId, questionId: question.id, response: choice');
    expect(argument).not.toMatch(/expression|character|starter|mood|emotion|celebrat|wobble/i);
    // The only other request RunScene makes at the start of a run carries no character either.
    expect(code).toContain("startSession({ gameId: 'zoo-sprint', mode: 'multiplication' })");
  });

  it('no backend, contract, SDK, learning, database or client-transport code knows about expressions', () => {
    const roots = [
      'apps/api/src',
      'packages/contracts/src',
      'packages/game-sdk/src',
      'packages/learning-core/src',
      'packages/content-math',
      'database/schema',
      'database/migrations',
      'apps/play/src/platform.ts',
    ];
    let scanned = 0;
    for (const root of roots) {
      const full = join(REPO_ROOT, root);
      const files = full.endsWith('.ts') ? [full] : typeScriptFilesUnder(root);
      for (const file of files) {
        scanned += 1;
        const code = stripComments(readFileSync(file, 'utf8'));
        expect(code, file).not.toMatch(/\b(expressionState|expression|emotion|mood|tryAgain|celebrate|wobble)\b/i);
      }
    }
    expect(scanned).toBeGreaterThan(10);
  });

  it('the scenes change expressions only: no economy, grading or persistence is touched by the new code', () => {
    const run = sceneCode('RunScene.ts');
    const results = sceneCode('ResultsScene.ts');
    // The totals still come from the server's answer and are assigned exactly once, as before.
    expect(run.match(/ctx\.totals\s*=/g)).toHaveLength(1);
    expect(run).toContain('ctx.totals = result.totals');
    expect(results).not.toMatch(/ctx\.totals\s*=/);
    // Neither scene grades, stores, or sends anything because of an expression.
    for (const code of [run, results]) {
      expect(code).not.toMatch(/localStorage|sessionStorage|saveCharacter|XMLHttpRequest|\bfetch\(/);
    }
    // ResultsScene reads the server's results and makes no request at all.
    expect(results).not.toMatch(/ctx\.platform/);
  });

  it('switching expressions reuses loaded textures: the gameplay scenes never load assets', () => {
    for (const file of ['RunScene.ts', 'ResultsScene.ts', 'MenuScene.ts']) {
      const code = sceneCode(file);
      expect(code, file).not.toMatch(/\.load\.|addBase64|loadProductionCharacterArt|textures\.(add|create)/);
    }
    const characters = codeOfPath('games/zoo-sprint/src/characters.ts');
    expect(characters).not.toMatch(/\.load\.|addBase64|loadProductionCharacterArt/);
  });

  it('expression changes never rebuild the scene or restart anything', () => {
    const results = sceneCode('ResultsScene.ts');
    // The celebration timer is scheduled once, in create(), not on every render (a resize must not double it).
    const render = /private render\(\): void \{([\s\S]*?)\n  \}\n/.exec(results)?.[1] ?? '';
    expect(render, 'the render() body was found').toContain('new Character(');
    expect(render).not.toMatch(/delayedCall|celebrate\(/);
    expect(results.match(/delayedCall\(/g)).toHaveLength(1);
    // The run screen derives its expression from its own state when it draws, instead of storing a second copy.
    const run = sceneCode('RunScene.ts');
    expect(run).toMatch(/setExpression\(expressionForRun\(this\.phase, this\.feedback \? this\.feedback\.result : null\)\)/);
  });

  it('the menu keeps its selection hop exactly as before (celebrate() with no arguments)', () => {
    expect(sceneCode('MenuScene.ts')).toMatch(/\.celebrate\(\)/);
  });
});
