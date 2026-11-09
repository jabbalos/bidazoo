import type { ImportReport, ImportResult, ImportedItem, RejectReason, Rejection } from './types';

export interface BankFile {
  grade: number;
  items: Record<string, unknown>[];
}

const MAX_NUMBER = 100000;

/** Same parse as Hop Quest's lib/bank.js: the JSON between `.push(` and the final `)`. */
export function parseBankSource(source: string): BankFile {
  const start = source.indexOf('.push(');
  const end = source.lastIndexOf(')');
  if (start < 0 || end <= start) throw new Error('not a bank file: no .push( ... ) found');
  const json = JSON.parse(source.slice(start + 6, end)) as { grade?: unknown; items?: unknown };
  if (typeof json.grade !== 'number' || !Array.isArray(json.items)) {
    throw new Error('bank file has no numeric grade or no items array');
  }
  return { grade: json.grade, items: json.items as Record<string, unknown>[] };
}

const PLAIN_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/;

function asWholeNumber(choice: string): number | null {
  const t = choice.trim();
  if (!PLAIN_NUMBER.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isSafeInteger(n) && n <= MAX_NUMBER ? n : null;
}

type Converted = { ok: true; item: ImportedItem } | { ok: false; reason: RejectReason; detail?: string };

export function convertItem(grade: number, raw: Record<string, unknown>): Converted {
  const reject = (reason: RejectReason, detail?: string): Converted => ({
    ok: false,
    reason,
    ...(detail ? { detail } : {}),
  });
  if (raw['type'] !== 'mc') return reject('not_mc', String(raw['type']));
  if (raw['figure'] !== undefined && raw['figure'] !== null) return reject('has_figure');
  if (raw['choiceFigures'] !== undefined && raw['choiceFigures'] !== null) return reject('has_choice_figures');
  const choices = raw['choices'];
  if (!Array.isArray(choices) || choices.some((c) => typeof c !== 'string')) return reject('malformed', 'choices');
  if (choices.length !== 3 && choices.length !== 4) return reject('choice_count', String(choices.length));
  const answer = raw['answer'];
  if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) {
    return reject('bad_answer_index', String(answer));
  }
  const text = choices as string[];
  const stem = typeof raw['stem'] === 'string' ? raw['stem'].trim() : '';
  const stimulus = typeof raw['stimulus'] === 'string' ? raw['stimulus'].trim() : '';
  if (!stem) return reject('empty_prompt');
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  if (!id) return reject('malformed', 'id');

  const numbers = text.map(asWholeNumber);
  const allNumbers = numbers.every((n) => n !== null);
  const kind = allNumbers ? 'number' : 'text';
  const values: (number | string)[] = allNumbers ? (numbers as number[]) : text.map((c) => c.trim());
  if (new Set(values).size !== values.length) return reject('duplicate_choices');

  const item: ImportedItem = {
    id,
    grade,
    domain: String(raw['domain'] ?? ''),
    skill: String(raw['skill'] ?? ''),
    teks: String(raw['teks'] ?? ''),
    difficulty: typeof raw['difficulty'] === 'number' ? raw['difficulty'] : null,
    prompt: stimulus ? `${stimulus}\n${stem}` : stem,
    kind,
    choices: values as number[] | string[],
    key: values[answer] as number | string,
    rationale: String(raw['rationale'] ?? ''),
    needsTable: raw['table'] !== undefined && raw['table'] !== null,
  };
  return { ok: true, item };
}

/** Converts parsed bank files (any order) to items plus the import report. Deterministic order. */
export function importBanks(files: BankFile[]): ImportResult {
  const items: ImportedItem[] = [];
  const rejected: Rejection[] = [];
  let total = 0;
  for (const file of [...files].sort((a, b) => a.grade - b.grade)) {
    for (const raw of file.items) {
      total += 1;
      const result = convertItem(file.grade, raw);
      if (result.ok) items.push(result.item);
      else {
        rejected.push({
          id: typeof raw['id'] === 'string' ? raw['id'] : '(no id)',
          grade: file.grade,
          reason: result.reason,
          ...(result.detail ? { detail: result.detail } : {}),
        });
      }
    }
  }
  return { items, report: buildReport(total, items, rejected) };
}

function buildReport(total: number, items: ImportedItem[], rejected: Rejection[]): ImportReport {
  const perGrade: Record<string, number> = {};
  const perSkill: Record<string, number> = {};
  const rejectedByReason: Record<string, number> = {};
  for (const item of items) {
    perGrade[String(item.grade)] = (perGrade[String(item.grade)] ?? 0) + 1;
    const key = `${item.grade} / ${item.skill}`;
    perSkill[key] = (perSkill[key] ?? 0) + 1;
  }
  for (const r of rejected) rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
  return {
    total,
    imported: items.length,
    rejected,
    perGrade,
    perSkill,
    rejectedByReason,
    needsTable: items.filter((i) => i.needsTable).length,
  };
}

/** Human-readable report. `rejectedLimit` caps the rejected list for the terminal (0 = no cap). */
export function formatReport(report: ImportReport, rejectedLimit = 0): string {
  const lines: string[] = [];
  lines.push(`Import report: ${report.imported} imported of ${report.total} math items.`);
  lines.push('', 'Imported per grade (0 = kindergarten):');
  for (const g of Object.keys(report.perGrade).sort((a, b) => Number(a) - Number(b))) {
    lines.push(`  grade ${g}: ${report.perGrade[g]}`);
  }
  lines.push('', 'Imported per grade / skill:');
  for (const k of Object.keys(report.perSkill).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    lines.push(`  ${k}: ${report.perSkill[k]}`);
  }
  lines.push('', `Imported items whose bank entry has a table the prompt cannot show: ${report.needsTable} (kept, flagged needsTable)`);
  lines.push('', `Rejected: ${report.rejected.length}`);
  for (const reason of Object.keys(report.rejectedByReason).sort()) {
    lines.push(`  ${reason}: ${report.rejectedByReason[reason]}`);
  }
  const shown = rejectedLimit > 0 ? report.rejected.slice(0, rejectedLimit) : report.rejected;
  for (const r of shown) {
    lines.push(`  - ${r.id} (grade ${r.grade}): ${r.reason}${r.detail ? ` [${r.detail}]` : ''}`);
  }
  if (shown.length < report.rejected.length) {
    lines.push(`  ... ${report.rejected.length - shown.length} more (full list in the report file)`);
  }
  return lines.join('\n');
}
