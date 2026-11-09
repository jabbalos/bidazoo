import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importBanks, parseBankSource } from './import';
import type { ImportResult, ImportedItem } from './types';

const MATH_FILE = /^bank-math-g[K0-8]\.js$/;

/** Reads the nine `bank-math-g*.js` files in `dir`. READ-ONLY: nothing is ever written there. */
export function importMathBank(dir: string): ImportResult {
  const names = readdirSync(dir).filter((n) => MATH_FILE.test(n));
  if (names.length === 0) throw new Error(`no bank-math-g*.js files found in ${dir}`);
  return importBanks(names.map((n) => parseBankSource(readFileSync(join(dir, n), 'utf8'))));
}

/** Loads a previously written items file (the `--out` of the CLI). */
export function loadImportedItems(file: string): ImportedItem[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { items: ImportedItem[] }).items;
}
