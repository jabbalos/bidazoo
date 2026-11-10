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
export const sessionMix = { grade: IMPORTED_ITEM_GRADE };

export const IMPORTED_ITEMS: readonly ImportedItem[] = (data as { items: ImportedItem[] }).items;

const BY_ID = new Map(IMPORTED_ITEMS.map((item) => [item.id, item]));

export function importedItemById(id: string): ImportedItem | undefined {
  return BY_ID.get(id);
}
