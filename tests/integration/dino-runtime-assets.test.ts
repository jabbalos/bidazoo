import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXPRESSION_SOURCE_FILES,
  M4_SOURCE_ROOT,
  RUNTIME_ART,
  RUNTIME_ART_ROOT,
  expressionTextureKey,
  getRuntimeExpression,
  hasRuntimeArt,
} from '../../games/zoo-sprint/src/character-assets';
import { EXPRESSION_STATES, type CastId } from '../../games/zoo-sprint/src/character-definitions';

/**
 * Checkpoint F3, Lane C: the curated runtime Dino art is real, traceable, verifiable, and small.
 * These tests read files only. They need neither Git LFS content nor a browser.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUNTIME_DIR = join(REPO_ROOT, RUNTIME_ART_ROOT, 'dino');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface ProvenanceEntry {
  runtimeFile: string;
  runtimeSha256: string;
  runtimeBytes: number;
  width: number;
  height: number;
  canonicalSourcePath: string;
  canonicalSha256: string;
  derivation: string;
  anchor: { eyeLineSrcY: number; coreBox: number[]; cropKind: string };
}
interface Provenance {
  schemaVersion: number;
  character: string;
  runtimeDirectory: string;
  canonicalLibrary: string;
  canonicalManifest: string;
  derivation: string;
  headScale: number;
  totalRuntimeBytes: number;
  expressions: Record<string, ProvenanceEntry>;
}

const provenance = JSON.parse(readFileSync(join(RUNTIME_DIR, 'PROVENANCE.json'), 'utf8')) as Provenance;
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const dinoFile = (state: string): string => join(RUNTIME_DIR, `dino_${state}.png`);

/** A Git LFS pointer is a ~130 byte text file; its `oid sha256:` is the hash of the real content. */
function lfsPointerOid(bytes: Buffer): string | null {
  if (bytes.length > 512) return null;
  const text = bytes.toString('utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1')) return null;
  return /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1] ?? null;
}

describe('Dino runtime assets (F3): storage', () => {
  it('holds exactly the six PNGs and the provenance record, nothing else', () => {
    const expected = [...EXPRESSION_STATES.map((state) => `dino_${state}.png`), 'PROVENANCE.json'].sort();
    expect(readdirSync(RUNTIME_DIR).sort()).toEqual(expected);
  });

  it('is only a Dino folder: no other character has runtime art yet', () => {
    expect(Object.keys(RUNTIME_ART)).toEqual(['dino']);
    for (const other of ['koala', 'tarsier', 'eagle', 'bronco', 'click'] as CastId[]) {
      expect(hasRuntimeArt(other)).toBe(false);
      expect(getRuntimeExpression(other, 'idle')).toBeUndefined();
    }
    expect(readdirSync(join(REPO_ROOT, RUNTIME_ART_ROOT))).toEqual(['dino']);
  });

  it('stores the PNGs as normal Git blobs: no Git LFS rule matches the runtime folder', () => {
    const paths = EXPRESSION_STATES.map((state) => `${RUNTIME_ART_ROOT}/dino/dino_${state}.png`);
    const out = execFileSync('git', ['check-attr', 'filter', 'diff', 'merge', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' });
    for (const line of out.trim().split('\n')) expect(line, line).toMatch(/: (filter|diff|merge): unspecified$/);
    expect(out).not.toMatch(/lfs/);
    // ...while the canonical M4 library IS under LFS, which is why the runtime copies are real bytes.
    const canonical = execFileSync('git', ['check-attr', 'filter', '--', `${M4_SOURCE_ROOT}/expression-batch/dino/dino_idle.png`], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(canonical).toMatch(/filter: lfs/);
  });
});

describe('Dino runtime assets (F3): real image bytes', () => {
  for (const state of EXPRESSION_STATES) {
    it(`${state}: is a real PNG, not Git LFS pointer text`, () => {
      const bytes = readFileSync(dinoFile(state));
      expect(lfsPointerOid(bytes), 'LFS pointer text shipped as a PNG').toBeNull();
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'PNG signature').toBe(true);
      expect(bytes.length).toBeGreaterThan(5_000);
      expect(bytes.subarray(0, 40).toString('latin1')).not.toMatch(/git-lfs/);
      // IHDR: width and height are big-endian at bytes 16 and 20; color type 6 is RGBA.
      expect(bytes.subarray(12, 16).toString('latin1')).toBe('IHDR');
      expect(bytes.readUInt32BE(16)).toBe(provenance.expressions[state]?.width);
      expect(bytes.readUInt32BE(20)).toBe(provenance.expressions[state]?.height);
      expect(bytes[25], 'RGBA (transparent background)').toBe(6);
    });
  }

  it('keeps the whole Dino runtime payload small (six files, under 400 kB)', () => {
    const total = EXPRESSION_STATES.reduce((sum, state) => sum + statSync(dinoFile(state)).size, 0);
    expect(total).toBe(provenance.totalRuntimeBytes);
    expect(total).toBeLessThan(400_000);
  });
});

describe('Dino runtime assets (F3): provenance', () => {
  it('declares itself for dino with a byte-for-byte derivation', () => {
    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.character).toBe('dino');
    expect(provenance.runtimeDirectory).toBe(`${RUNTIME_ART_ROOT}/dino`);
    expect(provenance.canonicalLibrary).toBe(M4_SOURCE_ROOT);
    expect(provenance.derivation).toMatch(/byte-for-byte/);
    expect(Object.keys(provenance.expressions)).toEqual([...EXPRESSION_STATES]);
  });

  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, provenance.canonicalManifest), 'utf8')) as {
    expressions: Record<string, { path: string; sha256: string; transform: { eye_line_src_y: number; core_box: number[]; crop_kind: string } } | number>;
  };

  for (const state of EXPRESSION_STATES) {
    it(`${state}: runtime file hash matches PROVENANCE.json and equals the canonical M4 file`, () => {
      const entry = provenance.expressions[state] as ProvenanceEntry;
      const runtime = readFileSync(dinoFile(state));
      expect(entry.runtimeFile).toBe(`dino_${state}.png`);
      expect(entry.runtimeBytes).toBe(runtime.length);
      expect(sha256(runtime)).toBe(entry.runtimeSha256);
      expect(entry.derivation).toBe('byte-for-byte copy');
      // A byte-for-byte copy means the two hashes are identical.
      expect(entry.runtimeSha256).toBe(entry.canonicalSha256);
    });

    it(`${state}: traces to the canonical M4 source named by the F2 contract`, () => {
      const entry = provenance.expressions[state] as ProvenanceEntry;
      expect(entry.canonicalSourcePath).toBe(`${M4_SOURCE_ROOT}/${EXPRESSION_SOURCE_FILES.dino[state]}`);
      const canonicalPath = join(REPO_ROOT, entry.canonicalSourcePath);
      expect(existsSync(canonicalPath)).toBe(true);
      // The M4 manifest carries the same file and the same hash.
      const m4 = manifest.expressions[state] as { path: string; sha256: string };
      expect(`${M4_SOURCE_ROOT}/${m4.path}`).toBe(entry.canonicalSourcePath);
      expect(m4.sha256).toBe(entry.canonicalSha256);
      // The canonical file is Git LFS content: depending on the checkout it is the real PNG or a
      // pointer, and both name the same sha256. Either way the hash is checkable.
      const canonical = readFileSync(canonicalPath);
      const actual = lfsPointerOid(canonical) ?? sha256(canonical);
      expect(actual).toBe(entry.canonicalSha256);
    });

    it(`${state}: anchor numbers in the contract equal PROVENANCE.json and the M4 manifest`, () => {
      const entry = provenance.expressions[state] as ProvenanceEntry;
      const runtime = getRuntimeExpression('dino', state);
      const m4 = manifest.expressions[state] as { transform: { eye_line_src_y: number; core_box: number[]; crop_kind: string } };
      expect(runtime?.file).toBe(entry.runtimeFile);
      expect([runtime?.width, runtime?.height]).toEqual([entry.width, entry.height]);
      expect(runtime?.eyeLineY).toBe(entry.anchor.eyeLineSrcY);
      expect(runtime?.eyeLineY).toBe(m4.transform.eye_line_src_y);
      expect([...(runtime?.coreBox ?? [])]).toEqual(entry.anchor.coreBox);
      expect([...(runtime?.coreBox ?? [])]).toEqual(m4.transform.core_box);
      expect(entry.anchor.cropKind).toBe(m4.transform.crop_kind);
    });
  }

  it('uses the M4 head_scale for Dino', () => {
    const m4 = JSON.parse(readFileSync(join(REPO_ROOT, provenance.canonicalManifest), 'utf8')) as { expressions: { head_scale: number } };
    expect(RUNTIME_ART.dino?.headScale).toBe(m4.expressions.head_scale);
    expect(provenance.headScale).toBe(m4.expressions.head_scale);
  });

  it('does not touch the canonical M4 library or the immutable production-v1', () => {
    const diff = execFileSync('git', ['status', '--porcelain', '--', 'docs/reference-art'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(diff.trim()).toBe('');
  });
});

describe('Dino runtime assets (F3): the browser never needs the docs tree', () => {
  // Strip comments so prose that mentions a path is not mistaken for a reference.
  const code = readFileSync(join(REPO_ROOT, 'games/zoo-sprint/src/character-art.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('character-art.ts resolves exactly the six runtime files, as literal Vite asset URLs', () => {
    const literals = [...code.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)].map((m) => m[1] as string);
    expect(literals.sort()).toEqual(EXPRESSION_STATES.map((state) => `../assets/world-expedition/characters/dino/dino_${state}.png`).sort());
    for (const literal of literals) expect(existsSync(join(REPO_ROOT, 'games/zoo-sprint/src', literal)), literal).toBe(true);
  });

  it('never mentions the reference-art tree, the M4 library, or production-v1', () => {
    expect(code).not.toMatch(/reference-art|production-v1|expression-batch|asset-library|docs\//);
  });

  it('texture keys for the six states are unique and namespaced away from the code-drawn art', () => {
    const keys = EXPRESSION_STATES.map((state) => expressionTextureKey('dino', state));
    expect(new Set(keys).size).toBe(6);
    for (const key of keys) expect(key).toMatch(/^bz-we-character-dino-[A-Za-z]+$/);
  });
});
