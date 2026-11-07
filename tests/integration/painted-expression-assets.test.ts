import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computePaintedFit } from '../../games/zoo-sprint/src/character-assets';
import { PAINTED_VIEWS } from '../../games/zoo-sprint/src/presentation/backdrop-model';

/**
 * Painted expressions (drop-in folder `characters-painted/<id>/<id>_<state>.webp|png`): a character
 * switches to them only when all six exist, so the folder must hold complete sets, each recorded in
 * PROVENANCE.json, one canvas size per character (no jump when the expression changes), transparent,
 * and light enough for phones. The approved production expressions stay untouched (their own tests).
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = join(REPO_ROOT, 'games/zoo-sprint/assets/world-expedition/characters-painted');
const CAST = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];
const STATES = ['idle', 'happy', 'thinking', 'cheer', 'discover', 'tryAgain'];

interface Entry { runtimeFile: string; runtimeSha256: string; runtimeBytes: number; format: string; width: number; height: number; status: string }

function webpOrPngInfo(b: Buffer): { format: string; width: number; height: number; alpha: boolean } {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const colorType = b[25]!;
    return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), alpha: (b[20]! & 0x10) !== 0 };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: true };
    }
    return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, alpha: false };
  }
  throw new Error('not a PNG or WebP');
}

const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((d) => statSync(join(DIR, d)).isDirectory())
      .flatMap((d) => readdirSync(join(DIR, d)).map((f) => `${d}/${f}`))
      .sort()
  : [];

describe('painted expressions (drop-in)', () => {
  it('holds only complete sets of six <id>/<id>_<state> pictures with transparency, each recorded in PROVENANCE.json', () => {
    if (files.length === 0) return;
    const provenance = JSON.parse(readFileSync(join(DIR, 'PROVENANCE.json'), 'utf8')) as { source: string; runtimeDirectory: string; files: Record<string, Entry> };
    expect(provenance.source).toMatch(/OpenArt/);
    expect(provenance.runtimeDirectory).toBe('games/zoo-sprint/assets/world-expedition/characters-painted');
    expect(Object.keys(provenance.files).sort()).toEqual(files);
    const byId = new Map<string, Array<{ width: number; height: number }>>();
    let total = 0;
    for (const f of files) {
      const m = /^([a-z]+)\/([a-z]+)_([A-Za-z]+)\.(webp|png)$/.exec(f);
      expect(m, f).not.toBeNull();
      expect(m![1]).toBe(m![2]);
      expect(CAST).toContain(m![1]);
      expect(STATES).toContain(m![3]);
      const bytes = readFileSync(join(DIR, f));
      const info = webpOrPngInfo(bytes);
      const e = provenance.files[f]!;
      total += bytes.length;
      expect(info.alpha, `${f} needs transparency`).toBe(true);
      expect(createHash('sha256').update(bytes).digest('hex'), `${f}: run node tests/scripts/refresh-painted-provenance.mjs`).toBe(e.runtimeSha256);
      expect({ format: info.format, width: info.width, height: info.height }).toEqual({ format: e.format, width: e.width, height: e.height });
      expect(e.status).toBe('FINAL');
      expect(bytes.length).toBeLessThanOrEqual(150_000);
      expect(info.height).toBeLessThanOrEqual(1024);
      byId.set(m![1]!, [...(byId.get(m![1]!) ?? []), { width: info.width, height: info.height }]);
    }
    expect(total).toBeLessThanOrEqual(2_500_000);
    for (const [id, sizes] of byId) {
      // all six, never two formats of one state, and one shared canvas (the head never jumps)
      expect(sizes, id).toHaveLength(6);
      expect(new Set(sizes.map((s) => `${s.width}x${s.height}`)).size, `${id}: one canvas size`).toBe(1);
    }
  });
});

describe('computePaintedFit', () => {
  const sizes = [{ width: 455, height: 512 }];
  it('bottom-anchors the bust on the box bottom, overlap below it, centered', () => {
    const fit = computePaintedFit(sizes, { width: 300, height: 400 }, { overlap: 8 })!;
    expect(fit.anchorX).toBe(150);
    expect(fit.anchorY).toBe(408);
    expect(fit.cutY).toBe(408);
    expect(fit.topY).toBeGreaterThanOrEqual(-0.001);
  });
  it('visibleHeight sets the size, width only guards', () => {
    const fit = computePaintedFit(sizes, { width: 1000, height: 400 }, { visibleHeight: 300, overlap: 10 })!;
    expect(fit.scale * 512).toBeCloseTo(310, 5);
    const narrow = computePaintedFit(sizes, { width: 100, height: 400 }, { visibleHeight: 300, overlap: 10, fillWidth: 0.9 })!;
    expect(narrow.scale).toBeLessThan(fit.scale);
  });
  it('never enlarges a painting past 1.5x and returns undefined for no space', () => {
    expect(computePaintedFit(sizes, { width: 5000, height: 5000 })!.scale).toBeLessThanOrEqual(1.5);
    expect(computePaintedFit(sizes, { width: 0, height: 10 })).toBeUndefined();
    expect(computePaintedFit([], { width: 10, height: 10 })).toBeUndefined();
  });
});

describe('painted Basecamp crops behind the other screens', () => {
  it('every crop aims inside the painting', () => {
    for (const [view, c] of Object.entries(PAINTED_VIEWS)) {
      expect(c.focusX, view).toBeGreaterThanOrEqual(0);
      expect(c.focusX, view).toBeLessThanOrEqual(1);
      expect(c.focusY, view).toBeGreaterThanOrEqual(0);
      expect(c.focusY, view).toBeLessThanOrEqual(1);
      expect(c.zoom, view).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('computePaintedFit width guard', () => {
  it('the whole picture is never wider than the box', () => {
    const fit = computePaintedFit([{ width: 800, height: 754 }], { width: 300, height: 700 }, { visibleHeight: 600, fillWidth: 0.94 })!;
    expect(fit.scale * 800).toBeLessThanOrEqual(300 + 1e-6);
  });
});
