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
import { CAST_SCALE_FACTORS, EXPRESSION_STATES, HOST_DEFINITION, STARTER_DEFINITIONS, type CastId } from '../../games/zoo-sprint/src/character-definitions';
import { STARTERS, isCharacterId } from '../../games/zoo-sprint/src/roster';

/**
 * Checkpoints F3 + F4: the curated runtime art is real, traceable, verifiable, and small, for the
 * whole cast (six characters x six expressions = 36 files). Dino was proven first (F3); F4 runs
 * the same assertions once per character and adds the cast-wide ones (exact roster, exact factors,
 * frozen IDLE art, exactly 36 browser URLs, Click has art but is not selectable).
 * These tests read files only. They need neither Git LFS content nor a browser.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Cast order: the five starters, then the host. */
const CAST: readonly CastId[] = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];

/** The IDLE files the owner froze at M4. They must reach the browser byte-identical. */
const FROZEN_IDLE_SHA256: Readonly<Record<string, string>> = {
  click: '71432a630f4346e7bc7fd1298a8c6a6a788736c5ccaf05d3da7e489beb20e726',
  tarsier: 'dace8b6cc79e4be0c869807ecb6ae5158b8221094547545f7e958bcc544da2f0',
  dino: '95aa9a23772dbf312408f4c4e0d4e0097dd512a46bd7c9bd2762b9817e217f76',
  bronco: '950796e5799ed3d02c4a330b45aa96fddcf7d70e5bc1c7f3725c883b57a777c0',
  eagle: '2a35baf058d0f3ad7b5f0f4918fbbc2ebc08b5e521e758ee7049a7f2d6a1a78a',
};

/** Size budget: no single character above 450 kB (Tarsier's wide IDLE and TRY AGAIN are the largest), 2.1 MB for all 36. */
const MAX_CHARACTER_BYTES = 450_000;
const MAX_TOTAL_BYTES = 2_100_000;

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
interface M4Manifest {
  expressions: Record<string, { path: string; sha256: string; transform: { eye_line_src_y: number; core_box: number[]; crop_kind: string } } | number>;
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const runtimeDir = (id: CastId): string => join(REPO_ROOT, RUNTIME_ART_ROOT, id);
const runtimeFile = (id: CastId, state: string): string => join(runtimeDir(id), `${id}_${state}.png`);
const provenanceOf = (id: CastId): Provenance => JSON.parse(readFileSync(join(runtimeDir(id), 'PROVENANCE.json'), 'utf8')) as Provenance;

/** A Git LFS pointer is a ~130 byte text file; its `oid sha256:` is the hash of the real content. */
function lfsPointerOid(bytes: Buffer): string | null {
  if (bytes.length > 512) return null;
  const text = bytes.toString('utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1')) return null;
  return /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1] ?? null;
}

describe('cast runtime assets (F4): the whole set', () => {
  it('has exactly the six cast folders and nothing else under the runtime art root', () => {
    expect(readdirSync(join(REPO_ROOT, RUNTIME_ART_ROOT)).sort()).toEqual([...CAST].sort());
    expect(Object.keys(RUNTIME_ART)).toEqual([...CAST]);
  });

  it('maps all 36 cast x expression pairs to a runtime file, and each file is a distinct image', () => {
    const hashes = new Set<string>();
    let mappings = 0;
    for (const id of CAST) {
      expect(hasRuntimeArt(id), id).toBe(true);
      for (const state of EXPRESSION_STATES) {
        expect(getRuntimeExpression(id, state)?.file, `${id} ${state}`).toBe(`${id}_${state}.png`);
        hashes.add(sha256(readFileSync(runtimeFile(id, state))));
        mappings += 1;
      }
    }
    expect(mappings).toBe(36);
    expect(hashes.size).toBe(36);
  });

  it('keeps all 36 files well under the total size budget', () => {
    const total = CAST.reduce((sum, id) => sum + EXPRESSION_STATES.reduce((inner, state) => inner + statSync(runtimeFile(id, state)).size, 0), 0);
    expect(total).toBe(CAST.reduce((sum, id) => sum + provenanceOf(id).totalRuntimeBytes, 0));
    expect(total).toBeLessThan(MAX_TOTAL_BYTES);
  });

  it('ships the frozen IDLE art byte-identical (Click, Tarsier, Dino, Bronco, Eagle)', () => {
    for (const [id, expected] of Object.entries(FROZEN_IDLE_SHA256)) {
      expect(sha256(readFileSync(runtimeFile(id as CastId, 'idle'))), `${id} idle`).toBe(expected);
    }
  });

  it('applies the approved cast-relative factors exactly (Eagle 1.000, Click and Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57)', () => {
    expect(CAST_SCALE_FACTORS).toEqual({ eagle: 1.0, click: 0.92, bronco: 0.92, dino: 0.85, koala: 0.76, tarsier: 0.57 });
    for (const definition of [...STARTER_DEFINITIONS, HOST_DEFINITION]) expect(definition.scaleFactor).toBe(CAST_SCALE_FACTORS[definition.id]);
  });

  it('gives Click art without making him selectable: five starters, Click is the host and guide only', () => {
    expect(hasRuntimeArt('click')).toBe(true);
    expect(STARTERS.map((starter) => starter.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco']);
    expect(STARTER_DEFINITIONS.map((definition) => definition.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco']);
    expect(isCharacterId('click')).toBe(false);
    expect(HOST_DEFINITION.selectable).toBe(false);
    expect(HOST_DEFINITION.role).toBe('host-guide');
  });

  it('does not touch the canonical M4 library or the immutable production-v1', () => {
    const diff = execFileSync('git', ['status', '--porcelain', '--', 'docs/reference-art'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(diff.trim()).toBe('');
  });
});

for (const id of CAST) {
  const provenance = provenanceOf(id);

  describe(`${id} runtime assets (F3/F4): storage`, () => {
    it('holds exactly the six PNGs and the provenance record, nothing else', () => {
      const expected = [...EXPRESSION_STATES.map((state) => `${id}_${state}.png`), 'PROVENANCE.json'].sort();
      expect(readdirSync(runtimeDir(id)).sort()).toEqual(expected);
    });

    it('stores the PNGs as normal Git blobs: no Git LFS rule matches the runtime folder', () => {
      const paths = EXPRESSION_STATES.map((state) => `${RUNTIME_ART_ROOT}/${id}/${id}_${state}.png`);
      const out = execFileSync('git', ['check-attr', 'filter', 'diff', 'merge', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' });
      for (const line of out.trim().split('\n')) expect(line, line).toMatch(/: (filter|diff|merge): unspecified$/);
      expect(out).not.toMatch(/lfs/);
      // ...while the canonical M4 library IS under LFS, which is why the runtime copies are real bytes.
      const canonical = execFileSync('git', ['check-attr', 'filter', '--', `${M4_SOURCE_ROOT}/${EXPRESSION_SOURCE_FILES[id].idle}`], { cwd: REPO_ROOT, encoding: 'utf8' });
      expect(canonical).toMatch(/filter: lfs/);
    });
  });

  describe(`${id} runtime assets (F3/F4): real image bytes`, () => {
    for (const state of EXPRESSION_STATES) {
      it(`${state}: is a real PNG, not Git LFS pointer text`, () => {
        const bytes = readFileSync(runtimeFile(id, state));
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

    it(`keeps the ${id} runtime payload small (six files)`, () => {
      const total = EXPRESSION_STATES.reduce((sum, state) => sum + statSync(runtimeFile(id, state)).size, 0);
      expect(total).toBe(provenance.totalRuntimeBytes);
      expect(total).toBeLessThan(MAX_CHARACTER_BYTES);
    });
  });

  describe(`${id} runtime assets (F3/F4): provenance`, () => {
    it('declares itself for this character with a byte-for-byte derivation', () => {
      expect(provenance.schemaVersion).toBe(1);
      expect(provenance.character).toBe(id);
      expect(provenance.runtimeDirectory).toBe(`${RUNTIME_ART_ROOT}/${id}`);
      expect(provenance.canonicalLibrary).toBe(M4_SOURCE_ROOT);
      expect(provenance.canonicalManifest).toBe(`${M4_SOURCE_ROOT}/renderer/final-manifests/${id}.json`);
      expect(provenance.derivation).toMatch(/byte-for-byte/);
      expect(Object.keys(provenance.expressions)).toEqual([...EXPRESSION_STATES]);
    });

    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, provenance.canonicalManifest), 'utf8')) as M4Manifest;

    for (const state of EXPRESSION_STATES) {
      it(`${state}: runtime file hash matches PROVENANCE.json and equals the canonical M4 file`, () => {
        const entry = provenance.expressions[state] as ProvenanceEntry;
        const runtime = readFileSync(runtimeFile(id, state));
        expect(entry.runtimeFile).toBe(`${id}_${state}.png`);
        expect(entry.runtimeBytes).toBe(runtime.length);
        expect(sha256(runtime)).toBe(entry.runtimeSha256);
        expect(entry.derivation).toBe('byte-for-byte copy');
        // A byte-for-byte copy means the two hashes are identical.
        expect(entry.runtimeSha256).toBe(entry.canonicalSha256);
      });

      it(`${state}: traces to the canonical M4 source named by the F2 contract`, () => {
        const entry = provenance.expressions[state] as ProvenanceEntry;
        expect(entry.canonicalSourcePath).toBe(`${M4_SOURCE_ROOT}/${EXPRESSION_SOURCE_FILES[id][state]}`);
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
        const runtime = getRuntimeExpression(id, state);
        const m4 = manifest.expressions[state] as { transform: { eye_line_src_y: number; core_box: number[]; crop_kind: string } };
        expect(runtime?.file).toBe(entry.runtimeFile);
        expect([runtime?.width, runtime?.height]).toEqual([entry.width, entry.height]);
        expect(runtime?.eyeLineY).toBe(entry.anchor.eyeLineSrcY);
        expect(runtime?.eyeLineY).toBe(m4.transform.eye_line_src_y);
        expect([...(runtime?.coreBox ?? [])]).toEqual(entry.anchor.coreBox);
        expect([...(runtime?.coreBox ?? [])]).toEqual(m4.transform.core_box);
        expect(entry.anchor.cropKind).toBe(m4.transform.crop_kind);
        // The anchor lies inside the picture it anchors.
        const [x0, y0, x1, y1] = entry.anchor.coreBox as [number, number, number, number];
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(y0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(entry.width);
        expect(y1).toBeLessThanOrEqual(entry.height);
        expect(x1).toBeGreaterThan(x0);
        expect(y1).toBeGreaterThan(y0);
        expect(entry.anchor.eyeLineSrcY).toBeGreaterThan(0);
        expect(entry.anchor.eyeLineSrcY).toBeLessThan(entry.height);
      });
    }

    it('uses the M4 head_scale for this character', () => {
      const m4 = JSON.parse(readFileSync(join(REPO_ROOT, provenance.canonicalManifest), 'utf8')) as { expressions: { head_scale: number } };
      expect(RUNTIME_ART[id]?.headScale).toBe(m4.expressions.head_scale);
      expect(provenance.headScale).toBe(m4.expressions.head_scale);
    });
  });
}

describe('cast runtime assets (F4): the browser never needs the docs tree', () => {
  // Strip comments so prose that mentions a path is not mistaken for a reference.
  const code = readFileSync(join(REPO_ROOT, 'games/zoo-sprint/src/character-art.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('character-art.ts resolves exactly the 36 runtime files, as literal Vite asset URLs', () => {
    const literals = [...code.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)].map((m) => m[1] as string);
    const expected = CAST.flatMap((id) => EXPRESSION_STATES.map((state) => `../assets/world-expedition/characters/${id}/${id}_${state}.png`));
    expect(literals.sort()).toEqual(expected.sort());
    expect(literals).toHaveLength(36);
    for (const literal of literals) expect(existsSync(join(REPO_ROOT, 'games/zoo-sprint/src', literal)), literal).toBe(true);
  });

  it('never mentions the reference-art tree, the M4 library, or production-v1', () => {
    expect(code).not.toMatch(/reference-art|production-v1|expression-batch|asset-library|docs\//);
  });

  it('texture keys for the 36 expressions are unique and namespaced away from the code-drawn art', () => {
    const keys = CAST.flatMap((id) => EXPRESSION_STATES.map((state) => expressionTextureKey(id, state)));
    expect(new Set(keys).size).toBe(36);
    for (const key of keys) expect(key).toMatch(/^bz-we-character-(dino|koala|tarsier|eagle|bronco|click)-[A-Za-z]+$/);
  });
});
