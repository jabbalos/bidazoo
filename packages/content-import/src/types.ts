/**
 * An imported question. SERVER-ONLY: `key` and `rationale` are answers and must never reach a
 * client. The public shape (prompt, kind, choices) is built by the session service at serve time.
 */
export interface ImportedItem {
  /** Hop Quest item id, e.g. "M3-101". */
  id: string;
  /** Grade: 0 is kindergarten. */
  grade: number;
  domain: string;
  skill: string;
  teks: string;
  difficulty: number | null;
  /** Stimulus (if any) then stem, as one prompt. */
  prompt: string;
  /** `number` when every choice is a plain whole number in 0..100000, else `text`. */
  kind: 'number' | 'text';
  /** 3 or 4 choices, in bank order (the session service shuffles at serve time). */
  choices: number[] | string[];
  /** The server's answer key: the correct choice VALUE (same type as `choices` entries). */
  key: number | string;
  /** Server-side only: shown after grading, never before. */
  rationale: string;
  /** The bank item has a data table the prompt does not include; selection skips these. */
  needsTable: boolean;
}

export type RejectReason =
  | 'not_mc'
  | 'has_figure'
  | 'has_choice_figures'
  | 'choice_count'
  | 'bad_answer_index'
  | 'duplicate_choices'
  | 'empty_prompt'
  | 'malformed';

export interface Rejection {
  id: string;
  grade: number;
  reason: RejectReason;
  detail?: string;
}

export interface ImportReport {
  total: number;
  imported: number;
  rejected: Rejection[];
  /** Imported count per grade (0 is kindergarten). */
  perGrade: Record<string, number>;
  /** Imported count per "grade / skill". */
  perSkill: Record<string, number>;
  /** Rejected count per reason. */
  rejectedByReason: Record<string, number>;
  needsTable: number;
}

export interface ImportResult {
  items: ImportedItem[];
  report: ImportReport;
}
