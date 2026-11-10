/**
 * Server-side access to the imported Hop Quest math items (answers and rationales included).
 * This module is imported only by the API. The game never imports it, and a test proves it.
 *
 * The data file is produced by `npm run content:import` (packages/content-import) and is bundled
 * into the API by esbuild. It is read through a relative path, so no new workspace link is needed.
 */
import type { ImportedItem } from '../../../../../packages/content-import/src/types';
import data from '../../../../../packages/content-import/data/math-items.json';

/**
 * Which grade's imported items a player gets. PENDING with the owner: this constant is the one
 * place to change it (0 = kindergarten). Until the owner decides, grade 3 (where multiplication
 * is taught).
 */
export const IMPORTED_ITEM_GRADE = 3;

/**
 * The session mix applies to EXPEDITION sessions only (mode 'expedition'); the multiplication gate
 * quiz stays all generated multiplication. `sessionMix.grade` is the grade the mix draws from.
 */
/**
 * Whether expedition sessions mix in imported items. Owner decision (November 9, 2026): the mix stays
 * OFF in any deploy until text-choice tiles (A9) are merged and a Playwright test shows a child can see
 * and answer a text question in an expedition. So: EXPEDITION_MIX=1 or 0 decides when set; otherwise it
 * is off under NODE_ENV=production and on in development and test (where the mix is built and tested).
 * When off, an expedition session is all generated multiplication (still 15 questions).
 */
export function expeditionMixEnabled(source: Record<string, string | undefined> = process.env): boolean {
  const raw = source['EXPEDITION_MIX']?.trim().toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return source['NODE_ENV'] !== 'production';
}

export const sessionMix = { grade: IMPORTED_ITEM_GRADE, enabled: expeditionMixEnabled() };

export const IMPORTED_ITEMS: readonly ImportedItem[] = (data as { items: ImportedItem[] }).items;

const BY_ID = new Map(IMPORTED_ITEMS.map((item) => [item.id, item]));

export function importedItemById(id: string): ImportedItem | undefined {
  return BY_ID.get(id);
}
