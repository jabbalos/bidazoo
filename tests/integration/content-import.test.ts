import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { gradeAnswer } from '@bidazoo/learning-core';
import { formatReport, importMathBank, loadImportedItems } from '../../packages/content-import/src/index';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/bank', import.meta.url));
const cliPath = join(repo, 'packages/content-import/src/cli.ts');
const tmp = mkdtempSync(join(tmpdir(), 'content-import-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('content import: fixture bank', () => {
  const { items, report } = importMathBank(fixtureDir);
  const byId = (id: string) => items.find((i) => i.id === id);

  it('reads only bank-math files (the reading decoy is ignored)', () => {
    expect(report.total).toBe(13);
    expect(items.some((i) => i.id.startsWith('R3'))).toBe(false);
  });

  it('imports only mc, no figure, 3 or 4 choices, with a valid unambiguous answer', () => {
    expect(items.map((i) => i.id)).toEqual(['FK-001', 'F3-001', 'F3-002', 'F3-003', 'F3-010', 'F3-011']);
    expect(report.imported).toBe(6);
  });

  it('rejects the rest with the right reason', () => {
    const reason = Object.fromEntries(report.rejected.map((r) => [r.id, r.reason]));
    expect(reason).toEqual({
      'F3-004': 'has_figure',
      'F3-005': 'not_mc',
      'F3-006': 'choice_count',
      'F3-007': 'choice_count',
      'F3-008': 'bad_answer_index',
      'F3-009': 'duplicate_choices',
      'F3-012': 'not_mc',
    });
    expect(report.rejectedByReason).toEqual({
      has_figure: 1,
      not_mc: 2,
      choice_count: 2,
      bad_answer_index: 1,
      duplicate_choices: 1,
    });
  });

  it('converts the answer index to the server key (the choice value)', () => {
    expect(byId('F3-001')).toMatchObject({ kind: 'number', choices: [36, 42, 48, 49], key: 42 });
    expect(byId('F3-002')).toMatchObject({ kind: 'text', choices: ['3/4', '1/2', '2/3'], key: '3/4' });
    // Comma-grouped whole numbers become numbers; the key is the number, not the index.
    expect(byId('F3-003')).toMatchObject({ kind: 'number', choices: [3000, 3200, 4000], key: 3000 });
    expect(byId('FK-001')).toMatchObject({ kind: 'number', choices: [4, 14, 41], key: 14, grade: 0 });
  });

  it('keeps grade, domain, skill, teks and rationale, and puts the stimulus in the prompt', () => {
    expect(byId('F3-002')).toMatchObject({
      grade: 3,
      domain: 'Number and Operations',
      skill: 'Skill B',
      teks: '3.1A',
      rationale: 'Because F3-002',
    });
    expect(byId('F3-011')?.prompt).toBe('Ava has 4 bags.\nEach bag has 3 pens. How many pens?');
  });

  it('flags items with a table so selection can skip them', () => {
    expect(byId('F3-010')?.needsTable).toBe(true);
    expect(byId('F3-001')?.needsTable).toBe(false);
    expect(report.needsTable).toBe(1);
  });

  it('counts per grade and per skill', () => {
    expect(report.perGrade).toEqual({ '0': 1, '3': 5 });
    expect(report.perSkill).toEqual({ '0 / Counting': 1, '3 / Skill A': 4, '3 / Skill B': 1 });
  });

  it('the imported key grades correctly through the real grader (number and text)', () => {
    for (const item of items) {
      const choices = item.choices as (number | string)[];
      expect(gradeAnswer(choices, item.key, item.key)).toEqual({ kind: 'graded', correct: true });
      const wrong = choices.find((c) => c !== item.key) as number | string;
      expect(gradeAnswer(choices, item.key, wrong)).toEqual({ kind: 'graded', correct: false });
    }
  });

  it('the printed report lists counts and every rejected item with its reason', () => {
    const text = formatReport(report);
    expect(text).toContain('6 imported of 13');
    expect(text).toContain('grade 3: 5');
    expect(text).toContain('3 / Skill A: 4');
    expect(text).toContain('F3-004 (grade 3): has_figure');
    expect(text).toContain('F3-008 (grade 3): bad_answer_index [3]');
  });

  it('is deterministic', () => {
    expect(importMathBank(fixtureDir)).toEqual({ items, report });
  });

  it('fails clearly when the folder has no math bank', () => {
    expect(() => importMathBank(tmp)).toThrow(/no bank-math-g/);
  });
});

describe('content import: the CLI (npm run content:import)', () => {
  it('writes the items and the report, and never writes into the bank folder', () => {
    const out = join(tmp, 'items.json');
    const reportFile = join(tmp, 'report.json');
    const before = readdirSync(fixtureDir).map((n) => `${n}:${statSync(join(fixtureDir, n)).mtimeMs}`);
    const stdout = execFileSync(
      process.execPath,
      ['--import', 'tsx', cliPath, fixtureDir, '--out', out, '--report', reportFile],
      { cwd: join(repo, 'packages/content-import'), encoding: 'utf8' },
    );
    expect(stdout).toContain('Import report: 6 imported of 13');
    expect(stdout).toContain('Rejected: 7');
    expect(loadImportedItems(out)).toHaveLength(6);
    expect(JSON.parse(readFileSync(reportFile, 'utf8')).imported).toBe(6);
    const after = readdirSync(fixtureDir).map((n) => `${n}:${statSync(join(fixtureDir, n)).mtimeMs}`);
    expect(after).toEqual(before);
  });

  it('exits non-zero with usage when no folder is given', () => {
    expect(() =>
      execFileSync(process.execPath, ['--import', 'tsx', cliPath], {
        cwd: join(repo, 'packages/content-import'),
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Answers and rationales never reach the client
// ---------------------------------------------------------------------------

function listFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listFiles(path, out);
    else out.push(path);
  }
  return out;
}

describe('imported content stays server-side', () => {
  // Everything that ships to (or is compiled into) a browser.
  const clientRoots = [
    'apps/play/src',
    'apps/play/dist',
    'apps/play/package.json',
    'games',
    'packages/ui',
    'packages/game-sdk',
    'packages/contracts',
    'packages/assets',
  ].map((p) => join(repo, p));
  const clientFiles = clientRoots.flatMap((p) =>
    existsSync(p) && statSync(p).isFile() ? [p] : listFiles(p),
  ).filter((f) => /\.(ts|tsx|js|mjs|json|html|css)$/.test(f));

  it('finds client files to scan (the scan is not vacuous)', () => {
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it('no client file or manifest references content-import or its data', () => {
    const offenders = clientFiles.filter((f) => /content-import|math-items\.json|ImportedItem/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(repo, f))).toEqual([]);
  });

  it('no client file contains an imported answer rationale', () => {
    const dataFile = join(repo, 'packages/content-import/data/math-items.json');
    const rationales = (existsSync(dataFile) ? loadImportedItems(dataFile) : importMathBank(fixtureDir).items)
      .map((i) => i.rationale.trim())
      .filter((r) => r.length >= 40)
      .map((r) => r.slice(0, 40));
    expect(rationales.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of clientFiles) {
      const text = readFileSync(f, 'utf8');
      for (const r of rationales) if (text.includes(r)) offenders.push(`${relative(repo, f)}: ${r}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the learning-core package (imported by the server only) does not import content-import, and the content-import package imports no client package', () => {
    const core = listFiles(join(repo, 'packages/learning-core/src')).filter((f) => f.endsWith('.ts'));
    for (const f of core) expect(readFileSync(f, 'utf8'), relative(repo, f)).not.toMatch(/content-import/);
    const own = listFiles(join(repo, 'packages/content-import/src')).filter((f) => f.endsWith('.ts'));
    for (const f of own) {
      expect(readFileSync(f, 'utf8'), relative(repo, f)).not.toMatch(/from\s+'@bidazoo\/(ui|game-sdk|assets)|phaser|apps\/play/);
    }
  });
});
