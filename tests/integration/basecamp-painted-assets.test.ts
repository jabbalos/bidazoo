import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { backdropX, backdropY, layoutBackdrop, parseBackdropManifest } from '../../games/zoo-sprint/src/presentation/backdrop-model';
import { insideGate, nearLandmark, paintedWorldSpec, returnSpawnX } from '../../games/zoo-sprint/src/presentation/explore-model';

/**
 * Painted Basecamp: two drop-in folders whose pictures replace the code-drawn scenery and the
 * canonical walking picture when present. Swapping in final art is a file replacement plus
 * `node tests/scripts/refresh-painted-provenance.mjs`; this file proves the manifest, the files and
 * the provenance agree, the weight is reasonable, and the painted world still plays by W1's rules.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = 'games/zoo-sprint/assets/world-expedition';
const BASECAMP = join(REPO_ROOT, ROOT, 'basecamp');
const WALK_PAINTED = join(REPO_ROOT, ROOT, 'walk-painted');
const MAX_BACKDROP_BYTES = 1_500_000;
const CAST = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];

interface Entry { runtimeFile: string; runtimeSha256: string; runtimeBytes: number; format: string; width: number; height: number; status: string }
const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** Width, height and format of a PNG, JPEG or WebP (enough of each header to read the size). */
function imageInfo(b: Buffer): { format: string; width: number; height: number; alpha: boolean } {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const colorType = b[25]!;
    return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 || b.includes(Buffer.from('tRNS')) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length; ) {
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), alpha: false };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), alpha: (b[20]! & 0x10) !== 0 };
    if (kind === 'VP8 ') return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, alpha: false };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: true };
    }
  }
  throw new Error('not a PNG, JPEG or WebP');
}

const pictures = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : []);

describe('painted Basecamp backdrop: manifest, files and provenance', () => {
  const files = pictures(BASECAMP);
  const raw = JSON.parse(readFileSync(join(BASECAMP, 'basecamp.json'), 'utf8')) as unknown;
  const manifest = parseBackdropManifest(raw, files);
  const provenance = JSON.parse(readFileSync(join(BASECAMP, 'PROVENANCE.json'), 'utf8')) as { runtimeDirectory: string; source: string; files: Record<string, Entry> };

  it('basecamp.json is valid and names only pictures that exist (else the game falls back to the code-drawn Basecamp)', () => {
    expect(manifest).not.toBeNull();
    expect(manifest!.layers.at(-1)!.parallax).toBe(1);
    expect(manifest!.walkMinX).toBeLessThan(manifest!.lodgeDoorX);
    expect(manifest!.gateX).toBeGreaterThan(manifest!.lodgeDoorX);
    // every picture shipped in the folder is a layer (Vite emits all of them)
    expect([...new Set(manifest!.layers.map((l) => l.file))].sort()).toEqual(files);
  });

  it('every picture is recorded in PROVENANCE.json by size, bytes and hash, as a normal Git blob', () => {
    expect(provenance.runtimeDirectory).toBe(`${ROOT}/basecamp`);
    expect(provenance.source).toMatch(/OpenArt/);
    expect(Object.keys(provenance.files).sort()).toEqual(files);
    let total = 0;
    for (const file of files) {
      const bytes = readFileSync(join(BASECAMP, file));
      const info = imageInfo(bytes);
      const e = provenance.files[file]!;
      total += bytes.length;
      expect(e.runtimeFile).toBe(file);
      expect(sha256(bytes), `${file}: run node tests/scripts/refresh-painted-provenance.mjs`).toBe(e.runtimeSha256);
      expect(bytes.length).toBe(e.runtimeBytes);
      expect({ format: info.format, width: info.width, height: info.height }).toEqual({ format: e.format, width: e.width, height: e.height });
      expect(e.status, `${file} is still marked PLACEHOLDER`).toBe('FINAL');
      // PNG only for layers that need transparency; opaque pictures are JPEG or WebP; layers behind
      // the front one may be opaque, the front one must be see-through only if there is a back one
      if (info.format === 'png') expect(info.alpha, `${file} is an opaque PNG: use JPEG or WebP`).toBe(true);
      if (manifest!.layers.length > 1 && file === manifest!.layers.at(-1)!.file) expect(info.alpha, 'the front layer must be transparent where the far layer shows').toBe(true);
      // WebGL texture limit on older phones
      expect(info.width).toBeLessThanOrEqual(4096);
      expect(info.height).toBeLessThanOrEqual(4096);
    }
    expect(total).toBeLessThanOrEqual(MAX_BACKDROP_BYTES);
    if (files.length > 0) {
      const out = execFileSync('git', ['check-attr', 'filter', '--', ...files.map((f) => `${ROOT}/basecamp/${f}`)], { cwd: REPO_ROOT, encoding: 'utf8' });
      for (const line of out.trim().split('\n')) expect(line).toMatch(/: filter: unspecified$/);
    }
  });

  it.each([
    [390, 844],
    [844, 390],
    [1440, 900],
    [1920, 1080],
    [3000, 900],
  ])('%ix%i: the painting fills the view and the painted gate, Click and the walk keep the W1 rules', (w, h) => {
    const sizes = manifest!.layers.map((l) => provenance.files[l.file]!);
    const layout = layoutBackdrop(w, h, sizes, manifest!.layers.map((l) => l.parallax));
    expect(layout.worldW).toBeGreaterThanOrEqual(w);
    for (const l of layout.layers) {
      expect(l.y + l.h).toBeCloseTo(h, 5); // bottom-aligned, no gap under the ground
      expect(l.y).toBeLessThanOrEqual(0.0001); // no gap at the top
      expect(l.w).toBeGreaterThanOrEqual(w + (layout.worldW - w) * l.parallax - 0.5); // covers its scroll range
    }
    const world = paintedWorldSpec(w, h, {
      width: layout.worldW,
      groundY: backdropY(layout, manifest!.groundY),
      gateX: backdropX(layout, manifest!.gateX),
      signpostX: manifest!.signpostX === null ? null : backdropX(layout, manifest!.signpostX),
      clickX: backdropX(layout, manifest!.lodgeDoorX),
      minX: backdropX(layout, manifest!.walkMinX),
      maxX: backdropX(layout, manifest!.walkMaxX),
    });
    const gate = world.landmarks.find((l) => l.id === 'gate')!;
    expect(world.groundY).toBeGreaterThan(h * 0.5);
    expect(world.groundY).toBeLessThanOrEqual(h);
    expect(world.startX).toBeGreaterThanOrEqual(world.minX);
    expect(nearLandmark(world.startX, world.landmarks)?.id ?? null).not.toBe('gate');
    expect(gate.x + world.gateCoreRadius).toBeLessThanOrEqual(world.maxX + world.gateCoreRadius);
    expect(insideGate(Math.min(world.maxX, gate.x), world)).toBe(true);
    const back = returnSpawnX(world);
    expect(insideGate(back, world)).toBe(false);
    expect(back).toBeGreaterThanOrEqual(world.minX);
    const sign = world.landmarks.find((l) => l.id === 'signpost');
    if (sign) expect(sign.x + sign.radius).toBeLessThan(gate.x - gate.radius + 1);
  });
});

describe('painted cast pictures (drop-in)', () => {
  const files = pictures(WALK_PAINTED);
  const provenance = JSON.parse(readFileSync(join(WALK_PAINTED, 'PROVENANCE.json'), 'utf8')) as { facing: string; source: string; files: Record<string, Entry & { openArtHistoryId?: string }> };

  it('holds only <cast id>_walk_side / _idle_front pictures with transparency, each recorded in PROVENANCE.json', () => {
    expect(provenance.facing).toMatch(/^right/);
    expect(provenance.source).toMatch(/OpenArt/);
    const allowed = CAST.flatMap((id) => ['walk_side', 'idle_front'].flatMap((pose) => [`${id}_${pose}.png`, `${id}_${pose}.webp`]));
    for (const f of files) expect(allowed).toContain(f);
    // never two formats of one pose (the game would pick one at random)
    expect(new Set(files.map((f) => f.replace(/\.\w+$/, ''))).size).toBe(files.length);
    expect(Object.keys(provenance.files).sort()).toEqual(files);
    let total = 0;
    for (const f of files) {
      const bytes = readFileSync(join(WALK_PAINTED, f));
      const info = imageInfo(bytes);
      const e = provenance.files[f]!;
      total += bytes.length;
      expect(['png', 'webp']).toContain(info.format);
      expect(info.alpha, `${f} needs transparency`).toBe(true);
      expect(sha256(bytes), `${f}: run node tests/scripts/refresh-painted-provenance.mjs`).toBe(e.runtimeSha256);
      expect({ format: info.format, width: info.width, height: info.height }).toEqual({ format: e.format, width: e.width, height: e.height });
      expect(e.status).toBe('FINAL');
      expect(bytes.length).toBeLessThanOrEqual(300_000);
      expect(info.height).toBeLessThanOrEqual(2048);
    }
    expect(total).toBeLessThanOrEqual(1_000_000);
  });

  it('when present, the painted walking pictures cover the whole cast', () => {
    const walking = files.filter((f) => f.includes('_walk_side.')).map((f) => f.replace(/_walk_side\.\w+$/, ''));
    if (walking.length > 0) expect(walking.sort()).toEqual([...CAST].sort());
  });
});

describe('parseBackdropManifest falls back (null) on anything inconsistent', () => {
  const ok = { layers: [{ file: 'a.jpg', parallax: 1 }], groundY: 0.86, gateX: 0.93, gateTopY: 0.45, lodgeDoorX: 0.33, walkMinX: 0.03, walkMaxX: 0.97 };
  it('accepts the documented shape and defaults the optional fields', () => {
    expect(parseBackdropManifest(ok, ['a.jpg'])).toMatchObject({ signpostX: null, walkerHeight: 0.3 });
  });
  it.each([
    ['a missing file', ok, []],
    ['no layers', { ...ok, layers: [] }, ['a.jpg']],
    ['a fraction out of range', { ...ok, groundY: 1.2 }, ['a.jpg']],
    ['a gate outside the walk', { ...ok, gateX: 0.99 }, ['a.jpg']],
    ['a gate top below the ground', { ...ok, gateTopY: 0.9 }, ['a.jpg']],
    ['a parallax above 1', { ...ok, layers: [{ file: 'a.jpg', parallax: 1.5 }] }, ['a.jpg']],
    ['not an object', 'x', ['a.jpg']],
  ])('%s', (_why, raw, files) => {
    expect(parseBackdropManifest(raw, files as string[])).toBeNull();
  });
});
