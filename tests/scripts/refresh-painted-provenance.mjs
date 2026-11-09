// Refreshes the PROVENANCE.json of the drop-in painted-art folders after pictures are replaced:
//   games/zoo-sprint/assets/world-expedition/basecamp/            (backdrop layers, named by basecamp.json)
//   games/zoo-sprint/assets/world-expedition/walk-painted/        (<id>_walk_side / <id>_idle_front, .webp or .png)
//   games/zoo-sprint/assets/world-expedition/characters-painted/  (<id>/<id>_<state>, the six painted expressions)
// Usage: node tests/scripts/refresh-painted-provenance.mjs [--status=FINAL|PLACEHOLDER]
// Records size, bytes and SHA-256 of every picture present (the client bundle scan and
// tests/integration/basecamp-painted-assets.test.ts check them), drops entries for removed files,
// and stamps --status (default FINAL) on files that are new or changed (a changed file loses its `note`,
// which described the old picture; edit role/openArtHistoryId/derivation by hand when they change).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const status = (process.argv.find((a) => a.startsWith('--status=')) ?? '--status=FINAL').slice(9);
if (!['FINAL', 'PLACEHOLDER'].includes(status)) throw new Error(`unknown status ${status}`);

/** Width and height of a PNG, JPEG or WebP. */
export function imageSize(b) {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length; ) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  throw new Error('not a PNG, JPEG or WebP');
}

/** Files directly in `dir`, or (nested) `<sub>/<file>` one level down. */
function listFiles(dir, nested) {
  if (!nested) return readdirSync(dir);
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    .flatMap((d) => readdirSync(join(dir, d)).map((f) => `${d}/${f}`));
}

function refresh(dir, key, pattern, nested = false) {
  const path = join(dir, 'PROVENANCE.json');
  if (!existsSync(path)) return;
  const prov = JSON.parse(readFileSync(path, 'utf8'));
  const old = prov[key] ?? {};
  const next = {};
  for (const file of listFiles(dir, nested).filter((f) => pattern.test(f)).sort()) {
    const bytes = readFileSync(join(dir, file));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const id = file;
    const prev = old[id] ?? {};
    const changed = prev.runtimeSha256 !== sha256;
    // a replaced picture keeps its descriptive fields; a `note` about the old picture goes
    const base = { ...prev };
    if (changed) delete base.note;
    next[id] = { ...base, runtimeFile: file, runtimeSha256: sha256, runtimeBytes: bytes.length, ...imageSize(bytes), status: changed ? status : (prev.status ?? status) };
    console.log(`${changed ? 'UPDATED' : 'same   '} ${dir}/${file} ${next[id].width}x${next[id].height} ${bytes.length} B ${next[id].status}`);
  }
  prov[key] = next;
  writeFileSync(path, `${JSON.stringify(prov, null, 2)}\n`);
}

const ROOT = 'games/zoo-sprint/assets/world-expedition';
refresh(`${ROOT}/basecamp`, 'files', /\.(jpe?g|webp|png)$/);
refresh(`${ROOT}/walk-painted`, 'files', /^[a-z]+_(walk_side|idle_front)\.(png|webp)$/);
refresh(`${ROOT}/characters-painted`, 'files', /^([a-z]+)\/\1_(idle|happy|thinking|cheer|discover|tryAgain)\.(png|webp)$/, true);
// Destination layers (Lane B, B7): `destinations/<id>/{far,mid,near}.<ext>` once a painted layer is approved.
// A destination folder without a PROVENANCE.json is skipped (its layers are still drawn from the manifest's gradients).
for (const id of ['great-wall', 'petra-rose-canyon', 'andes-cloud-terraces', 'maya-jungle-observatory', 'taj-garden', 'nile-discovery-route', 'philippine-highlands-harbor']) {
  refresh(`${ROOT}/destinations/${id}`, 'files', /^(far|mid|near)\.(jpe?g|webp|png)$/);
}
