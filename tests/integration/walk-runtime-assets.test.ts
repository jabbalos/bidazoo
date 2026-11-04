import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CastId } from '../../games/zoo-sprint/src/character-definitions';

/**
 * Checkpoint W1: the whole-body walking pictures are the SECOND narrow boundary onto the curated
 * library (the first is the 36 expression crops, character-runtime-assets.test.ts). Exactly one
 * canonical side-view turnaround per cast member, copied byte for byte, provenance recorded, stored
 * as real Git blobs, and nothing else from the library reachable.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WALK_ROOT = 'games/zoo-sprint/assets/world-expedition/walk';
const LIBRARY = 'docs/reference-art/world-expedition/production-v1.1/asset-library';
const CAST: readonly CastId[] = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_FILE_BYTES = 200_000;

interface Provenance {
  schemaVersion: number;
  runtimeDirectory: string;
  canonicalLibrary: string;
  facing: string;
  characters: Record<string, { runtimeFile: string; runtimeSha256: string; runtimeBytes: number; width: number; height: number; canonicalSourcePath: string; canonicalSha256: string; derivation: string; opaqueBox: number[] }>;
}

/** walk-art.ts imports Phaser (which needs a window), so its literals are checked as source text. */
const WALK_ART_SOURCE = readFileSync(join(REPO_ROOT, 'games/zoo-sprint/src/walk-art.ts'), 'utf8');
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const walkDir = join(REPO_ROOT, WALK_ROOT);
const provenance = JSON.parse(readFileSync(join(walkDir, 'PROVENANCE.json'), 'utf8')) as Provenance;
/** Width and height from the PNG IHDR chunk. */
const pngSize = (bytes: Buffer): { width: number; height: number } => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
/** An LFS pointer file is small text starting with this line; a real PNG never is. */
const isLfsPointer = (bytes: Buffer): boolean => bytes.subarray(0, 40).toString('utf8').startsWith('version https://git-lfs.github.com/spec/');

describe('walk art (W1): storage', () => {
  it('holds exactly one side-view PNG per cast member and the provenance record, nothing else', () => {
    const expected = [...CAST.map((id) => `${id}_walk_side.png`), 'PROVENANCE.json'].sort();
    expect(readdirSync(walkDir).sort()).toEqual(expected);
    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.runtimeDirectory).toBe(WALK_ROOT);
    expect(provenance.canonicalLibrary).toBe(LIBRARY);
    expect(provenance.facing).toMatch(/^right/);
    expect(Object.keys(provenance.characters).sort()).toEqual([...CAST].sort());
  });

  it('stores the PNGs as normal Git blobs, while the canonical library stays under LFS', () => {
    const paths = CAST.map((id) => `${WALK_ROOT}/${id}_walk_side.png`);
    const out = execFileSync('git', ['check-attr', 'filter', 'diff', 'merge', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' });
    for (const line of out.trim().split('\n')) expect(line, line).toMatch(/: (filter|diff|merge): unspecified$/);
    const canonical = execFileSync('git', ['check-attr', 'filter', '--', `${LIBRARY}/dino/dino_turnaround_side.png`], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(canonical).toMatch(/filter: lfs/);
  });

  it('does not touch the canonical library', () => {
    const diff = execFileSync('git', ['status', '--porcelain', '--', 'docs/reference-art'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(diff.trim()).toBe('');
  });
});

for (const id of CAST) {
  describe(`${id} walk art (W1)`, () => {
    const entry = provenance.characters[id]!;
    const bytes = readFileSync(join(walkDir, `${id}_walk_side.png`));

    it('is a real PNG of the recorded size and hash, small enough to ship', () => {
      expect(isLfsPointer(bytes)).toBe(false);
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(entry.runtimeFile).toBe(`${id}_walk_side.png`);
      expect(bytes.length).toBe(entry.runtimeBytes);
      expect(bytes.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
      expect(sha256(bytes)).toBe(entry.runtimeSha256);
      expect(pngSize(bytes)).toEqual({ width: entry.width, height: entry.height });
      // a whole body: taller than it is wide for everyone except the low, long tarsier pose
      if (id !== 'tarsier') expect(entry.height).toBeGreaterThan(entry.width * 0.95);
    });

    it('is the canonical side-view turnaround, byte for byte (derivation: copy)', () => {
      expect(entry.canonicalSourcePath).toBe(`${LIBRARY}/${id}/${id}_turnaround_side.png`);
      expect(entry.derivation).toBe('byte-for-byte copy');
      expect(entry.canonicalSha256).toBe(entry.runtimeSha256);
      // The library is under Git LFS: when the real bytes are present, they must match; a pointer
      // file (no `git lfs pull`) cannot be compared and is recorded as such, not as a pass.
      const canonical = readFileSync(join(REPO_ROOT, entry.canonicalSourcePath));
      if (isLfsPointer(canonical)) {
        expect(canonical.toString('utf8')).toContain(`oid sha256:${entry.canonicalSha256}`);
      } else {
        expect(sha256(canonical)).toBe(entry.canonicalSha256);
      }
    });

    it('is the file the game asks for, by string literal (so Vite emits and hashes exactly this file)', () => {
      expect(WALK_ART_SOURCE).toContain(`new URL('../assets/world-expedition/walk/${id}_walk_side.png', import.meta.url)`);
      expect(WALK_ART_SOURCE).toContain('return `walk-${id}`');
      // nothing else from the library is referenced by the runtime
      expect(WALK_ART_SOURCE).not.toMatch(/new URL\('[^']*(reference-art|asset-library|turnaround|_hero_)/);
    });
  });
}
