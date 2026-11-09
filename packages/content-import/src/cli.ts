/**
 * npm run content:import -- <bank-dir> [--out <items.json>] [--report <report.json>]
 *
 * Reads <bank-dir>/bank-math-g*.js (read-only), writes the answer-keyed items to --out
 * (default: packages/content-import/data/math-items.json) and prints the import report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport } from './import';
import { importMathBank } from './load';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const dir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]?.startsWith('--')));
if (!dir) {
  console.error('usage: npm run content:import -- <bank-dir> [--out <items.json>] [--report <report.json>]');
  process.exit(2);
}
const out = resolve(flag('--out') ?? resolve(here, '../data/math-items.json'));
const reportFile = resolve(flag('--report') ?? resolve(here, '../data/import-report.json'));

const { items, report } = importMathBank(resolve(dir));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ items }, null, 1)}\n`);
writeFileSync(reportFile, `${JSON.stringify(report, null, 1)}\n`);
console.log(formatReport(report, 40));
console.log(`\nWrote ${items.length} items to ${out}\nWrote report to ${reportFile}`);
