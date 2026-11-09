/**
 * Skill keys for imported (Hop Quest) questions.
 *
 * Mastery for an imported question is tracked per Hop Quest skill tag, per grade:
 *   imp:<grade>:<skill tag>      e.g. "imp:3:Place value to 100,000"   (grade 0 = kindergarten)
 * The key carries the tag text itself, so the label lookup needs no table: the label is the tag.
 * Multiplication keys are `mul:AxB` and never start with `imp:`.
 */

const IMPORTED_KEY = /^imp:(\d{1,2}):(.+)$/;

export function importedSkillKey(grade: number, skill: string): string {
  if (!Number.isInteger(grade) || grade < 0 || grade > 12) throw new RangeError(`Invalid grade ${grade}`);
  const tag = skill.trim();
  if (!tag) throw new RangeError('Empty skill tag');
  return `imp:${grade}:${tag}`;
}

/** Null for anything that is not an imported skill key. */
export function parseImportedSkillKey(skillKey: string): { grade: number; skill: string } | null {
  const match = IMPORTED_KEY.exec(skillKey);
  if (!match) return null;
  return { grade: Number(match[1]), skill: match[2] as string };
}

export function isImportedSkillKey(skillKey: string): boolean {
  return parseImportedSkillKey(skillKey) !== null;
}
