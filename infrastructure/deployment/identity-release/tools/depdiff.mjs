// Compares two package-lock.json files (old new) and prints added / removed / changed packages.
// Read-only. Usage: node depdiff.mjs <old-lock.json> <new-lock.json>
import { readFileSync } from 'node:fs';

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error('usage: node depdiff.mjs <old-lock.json> <new-lock.json>');
  process.exit(2);
}
const load = (p) => {
  const lock = JSON.parse(readFileSync(p, 'utf8'));
  const out = new Map();
  for (const [key, val] of Object.entries(lock.packages ?? {})) {
    if (key === '') continue;
    out.set(key, val.version ?? (val.link ? 'link' : '?'));
  }
  return out;
};
const a = load(oldPath);
const b = load(newPath);
const added = [...b.keys()].filter((k) => !a.has(k)).sort();
const removed = [...a.keys()].filter((k) => !b.has(k)).sort();
const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)).sort();
const cap = (list, fmt) => {
  for (const k of list.slice(0, 60)) console.log('  ' + fmt(k));
  if (list.length > 60) console.log(`  ... and ${list.length - 60} more`);
};
console.log(`old packages: ${a.size}   new packages: ${b.size}`);
console.log(`ADDED (${added.length}):`);
cap(added, (k) => `${k} ${b.get(k)}`);
console.log(`REMOVED (${removed.length}):`);
cap(removed, (k) => `${k} ${a.get(k)}`);
console.log(`VERSION CHANGED (${changed.length}):`);
cap(changed, (k) => `${k} ${a.get(k)} -> ${b.get(k)}`);
