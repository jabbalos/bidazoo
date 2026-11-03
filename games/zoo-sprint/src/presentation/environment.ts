import type Phaser from 'phaser';
import { EXP, mix } from '../theme';

/**
 * The World Expedition backdrop: a soft-focus, warm-light basecamp-and-terraces scene drawn
 * procedurally (docs/visual/11-environment-style.md): far sky and ridges, mid rice terraces with
 * paddy water, near framing foliage, a few hanging lanterns as the subtle heritage cue, and haze.
 * Presentation only: decorative, deterministic, and carrying no gameplay meaning.
 *
 * It is painted ONCE per (variant, size) into a texture and then shown as one image, so it costs a
 * single quad per frame no matter how many shapes it took to draw. Re-baking on resize replaces the
 * previous texture, so a window being dragged never piles up textures.
 *
 * Rules honored from the style guide: three depth layers; grounded, horizontal, terraced forms;
 * warm directional light with haze; no glitter, no neon, no castles; the middle band stays calm and
 * light so characters and UI read against it.
 */
export type EnvVariant = 'basecamp' | 'trail' | 'summit';

interface Recipe {
  skyTop: number;
  skyMid: number;
  skyLow: number;
  /** 0..1 of the height where sky meets terraces. */
  horizon: number;
  sunX: number;
  sunY: number;
  sunGlow: number;
  lanterns: boolean;
  foliage: boolean;
  /** Warm light wash over the lower terraces, 0..1. */
  warmth: number;
  seed: number;
}

const RECIPES: Readonly<Record<EnvVariant, Recipe>> = {
  basecamp: { skyTop: EXP.skyTop, skyMid: EXP.skyMid, skyLow: EXP.skyLow, horizon: 0.52, sunX: 0.8, sunY: 0.2, sunGlow: EXP.sun, lanterns: true, foliage: true, warmth: 0.18, seed: 11 },
  trail: { skyTop: 0x6bbde8, skyMid: 0xb4e1f4, skyLow: 0xeaf6e0, horizon: 0.42, sunX: 0.18, sunY: 0.16, sunGlow: 0xfff6c8, lanterns: false, foliage: true, warmth: 0.1, seed: 23 },
  summit: { skyTop: 0xf3a45e, skyMid: 0xffcf8c, skyLow: 0xfff0c8, horizon: 0.56, sunX: 0.5, sunY: 0.3, sunGlow: 0xffe9a8, lanterns: true, foliage: true, warmth: 0.3, seed: 37 },
};

type G = Phaser.GameObjects.Graphics;

/** Small deterministic generator, so a given size always paints the same scene. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygon(g: G, pts: number[]): void {
  const points: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < pts.length; i += 2) points.push({ x: pts[i] as number, y: pts[i + 1] as number });
  g.fillPoints(points, true);
}

function paintSky(g: G, w: number, h: number, r: Recipe): void {
  const horizonY = h * r.horizon;
  const strips = Math.max(24, Math.ceil(horizonY / 6));
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const color = t < 0.55 ? mix(r.skyTop, r.skyMid, t / 0.55) : mix(r.skyMid, r.skyLow, (t - 0.55) / 0.45);
    g.fillStyle(color, 1);
    g.fillRect(0, (horizonY * i) / strips, w, horizonY / strips + 1.5);
  }
  // below the horizon starts as haze so the first terrace never meets a hard line
  g.fillStyle(r.skyLow, 1);
  g.fillRect(0, horizonY, w, h - horizonY);

  // sun glow: concentric, very soft
  const sx = w * r.sunX;
  const sy = h * r.sunY;
  const base = Math.min(w, h) * 0.5;
  for (let i = 0; i < 9; i++) {
    g.fillStyle(r.sunGlow, 0.045 + i * 0.012);
    g.fillCircle(sx, sy, base * (1 - i * 0.1));
  }
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(sx, sy, base * 0.1);
}

function paintClouds(g: G, w: number, h: number, rand: () => number): void {
  const count = Math.max(2, Math.round(w / 220));
  for (let i = 0; i < count; i++) {
    const cx = (w * (i + 0.3 + rand() * 0.5)) / count;
    const cy = h * (0.08 + rand() * 0.16);
    const s = Math.min(w, h) * (0.1 + rand() * 0.08);
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(cx, cy, s * 2.4, s * 0.62);
    g.fillEllipse(cx - s * 0.6, cy + s * 0.08, s * 1.5, s * 0.5);
    g.fillEllipse(cx + s * 0.7, cy + s * 0.05, s * 1.7, s * 0.55);
  }
}

function paintRidge(g: G, w: number, baseY: number, amp: number, color: number, alpha: number, rand: () => number): void {
  const step = Math.max(24, w / 9);
  const pts: number[] = [0, baseY + amp * 2];
  let x = -step * 0.3;
  while (x < w + step) {
    const peak = baseY - amp * (0.3 + rand() * 0.9);
    pts.push(x, peak);
    x += step * (0.5 + rand() * 0.5);
    pts.push(x, baseY - amp * (0.05 + rand() * 0.35));
    x += step * (0.35 + rand() * 0.4);
  }
  pts.push(w, baseY + amp * 2);
  g.fillStyle(color, alpha);
  polygon(g, pts);
}

/** Curved terrace bands from the horizon down: alternating greens, some paddy water, soft shadows. */
function paintTerraces(g: G, w: number, h: number, r: Recipe, rand: () => number): void {
  const horizonY = h * r.horizon;
  const bands = clampBands(Math.round((h - horizonY) / 46));
  const phase = rand() * Math.PI * 2;
  const curve = (i: number, x: number): number => {
    const t = i / bands;
    const y = horizonY + (h - horizonY) * Math.pow(t, 1.35);
    const amp = 6 + t * 26;
    const freq = (Math.PI * 2) / (w * (0.9 - t * 0.35));
    return y + Math.sin(x * freq + phase + i * 0.9) * amp + Math.sin(x * freq * 2.3 + i) * amp * 0.25;
  };
  for (let i = 0; i < bands; i++) {
    const paddy = i % 4 === 2;
    const tone = [EXP.terraceMid, EXP.terraceLight, EXP.terraceDark][i % 3] as number;
    const fill = paddy ? EXP.paddy : tone;
    const warm = mix(fill, 0xffd27a, r.warmth * (i / bands));
    const top: number[] = [];
    const bottom: number[] = [];
    for (let x = 0; x <= w + 12; x += 12) {
      top.push(x, curve(i, x));
      bottom.unshift(x, curve(i + 1, x) + 2);
    }
    g.fillStyle(warm, 1);
    polygon(g, [...top, ...bottom]);
    if (paddy) {
      // a pale sky sheen on the water
      g.fillStyle(0xffffff, 0.22);
      const sheen: number[] = [];
      const sheenB: number[] = [];
      for (let x = 0; x <= w + 12; x += 12) {
        const y0 = curve(i, x);
        const y1 = curve(i + 1, x);
        sheen.push(x, y0 + (y1 - y0) * 0.18);
        sheenB.unshift(x, y0 + (y1 - y0) * 0.46);
      }
      polygon(g, [...sheen, ...sheenB]);
    }
    // the bund (the little earth wall) catching light, then its soft shadow
    g.lineStyle(Math.max(2, 1 + i * 0.5), 0xffffff, 0.34);
    g.beginPath();
    g.moveTo(0, curve(i, 0));
    for (let x = 12; x <= w + 12; x += 12) g.lineTo(x, curve(i, x));
    g.strokePath();
    g.lineStyle(Math.max(2, 1 + i * 0.6), 0x2c5a30, 0.2);
    g.beginPath();
    g.moveTo(0, curve(i, 0) + Math.max(3, i * 0.7));
    for (let x = 12; x <= w + 12; x += 12) g.lineTo(x, curve(i, x) + Math.max(3, i * 0.7));
    g.strokePath();
  }
}

function clampBands(n: number): number {
  return Math.min(14, Math.max(5, n));
}

function paintMist(g: G, w: number, h: number, r: Recipe): void {
  const y = h * r.horizon;
  for (let i = 0; i < 3; i++) {
    g.fillStyle(0xffffff, 0.2);
    g.fillEllipse(w * (0.2 + i * 0.3), y + (i - 1) * h * 0.025, w * 0.8, h * 0.07);
  }
  g.fillStyle(0xffffff, 0.16);
  g.fillRect(0, y - h * 0.02, w, h * 0.05);
}

/** A palm-like frond: tapered curved leaf as a polygon from a root point. */
function frond(g: G, x: number, y: number, len: number, angle: number, width: number, color: number): void {
  const steps = 8;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = angle + t * t * 0.55;
    const px = x + Math.cos(a) * len * t;
    const py = y + Math.sin(a) * len * t;
    const half = width * Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.5 + 0.5;
    left.push(px - Math.sin(a) * half, py + Math.cos(a) * half);
    right.unshift(px + Math.sin(a) * half, py - Math.cos(a) * half);
  }
  g.fillStyle(color, 1);
  polygon(g, [...left, ...right]);
}

function paintFoliage(g: G, w: number, h: number, rand: () => number): void {
  const unit = Math.min(w, h);
  // top corners: hanging fronds framing the scene
  for (const side of [-1, 1] as const) {
    const rootX = side < 0 ? -unit * 0.04 : w + unit * 0.04;
    for (let i = 0; i < 4; i++) {
      const a = side < 0 ? 0.25 + i * 0.28 : Math.PI - 0.25 - i * 0.28;
      frond(g, rootX, -unit * 0.03, unit * (0.5 + rand() * 0.22), a, unit * 0.12, i % 2 ? EXP.foliage : EXP.foliageDeep);
    }
  }
  // bottom corners: low leafy shrubs
  for (const side of [-1, 1] as const) {
    const cx = side < 0 ? 0 : w;
    g.fillStyle(EXP.foliageDeep, 1);
    g.fillEllipse(cx, h + unit * 0.02, unit * 0.78, unit * 0.34);
    g.fillStyle(EXP.foliage, 1);
    g.fillEllipse(cx + side * unit * -0.1, h + unit * 0.05, unit * 0.52, unit * 0.22);
    for (let i = 0; i < 3; i++) {
      frond(g, cx + side * unit * -0.04 * i, h + unit * 0.03, unit * (0.26 + rand() * 0.1), side < 0 ? -0.9 - i * 0.28 : -Math.PI + 0.9 + i * 0.28, unit * 0.07, EXP.foliage);
    }
  }
}

function paintLanterns(g: G, w: number, h: number, rand: () => number): void {
  const unit = Math.min(w, h);
  const strings = w > h * 1.1 ? 2 : 1;
  for (let s = 0; s < strings; s++) {
    const y0 = unit * (0.06 + s * 0.05);
    const sag = unit * 0.07;
    const x0 = w * (s === 0 ? 0.04 : 0.3);
    const x1 = w * (s === 0 ? 0.96 : 0.9);
    g.lineStyle(1.5, EXP.timberDeep, 0.65);
    g.beginPath();
    g.moveTo(x0, y0);
    const n = 24;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      g.lineTo(x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI) * sag);
    }
    g.strokePath();
    const count = Math.max(4, Math.round((x1 - x0) / (unit * 0.2)));
    for (let i = 1; i < count; i++) {
      const t = (i + (rand() - 0.5) * 0.3) / count;
      const lx = x0 + (x1 - x0) * t;
      const ly = y0 + Math.sin(t * Math.PI) * sag + 2;
      const rad = unit * (0.026 + rand() * 0.01);
      g.fillStyle(EXP.lanternGlow, 0.22);
      g.fillCircle(lx, ly + rad * 1.4, rad * 2.6);
      g.fillStyle(EXP.lantern, 1);
      g.fillEllipse(lx, ly + rad * 1.4, rad * 1.7, rad * 2.1);
      g.fillStyle(0xfff0c0, 0.7);
      g.fillEllipse(lx - rad * 0.2, ly + rad * 1.2, rad * 0.6, rad * 1.0);
      g.fillStyle(EXP.timberDeep, 1);
      g.fillRect(lx - rad * 0.5, ly + rad * 0.2, rad, rad * 0.35);
      g.fillRect(lx - rad * 0.4, ly + rad * 2.3, rad * 0.8, rad * 0.3);
    }
  }
}

/** Paints the whole scene into `g` (which must be a free Graphics, in texture coordinates). */
export function paintEnvironment(g: G, w: number, h: number, variant: EnvVariant): void {
  const recipe = RECIPES[variant];
  const rand = rng(recipe.seed + Math.round(w) * 7 + Math.round(h) * 13);
  paintSky(g, w, h, recipe);
  paintClouds(g, w, h, rand);
  const horizonY = h * recipe.horizon;
  paintRidge(g, w, horizonY + h * 0.01, h * 0.16, EXP.mountainFar, 0.9, rand);
  paintRidge(g, w, horizonY + h * 0.03, h * 0.1, EXP.mountainNear, 0.92, rand);
  paintTerraces(g, w, h, recipe, rand);
  paintMist(g, w, h, recipe);
  if (recipe.foliage) paintFoliage(g, w, h, rand);
  if (recipe.lanterns) paintLanterns(g, w, h, rand);
}

const baked = new Map<string, string>();

/**
 * Bakes (or reuses) the backdrop texture for a size. `slot` names the on-screen use ("select-stage",
 * "run-scene", ...): the previous bake in the same slot is removed when the size changes.
 */
export function bakeEnvironment(scene: Phaser.Scene, slot: string, variant: EnvVariant, width: number, height: number): string {
  const w = Math.max(16, Math.min(2048, Math.round(width)));
  const h = Math.max(16, Math.min(2048, Math.round(height)));
  const key = `bz-env-${slot}-${variant}-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const previous = baked.get(slot);
  if (previous && previous !== key && scene.textures.exists(previous)) scene.textures.remove(previous);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  paintEnvironment(g, w, h, variant);
  g.generateTexture(key, w, h);
  g.destroy();
  baked.set(slot, key);
  return key;
}
