import type Phaser from 'phaser';
import { EXP, mix } from '../theme';
import { RECIPES, frond, paintClouds, paintSky, polygon, rng } from './environment';
import { grassLedge, ribbon, timberSign } from './surfaces';

/**
 * The World Expedition scenery as SEPARATE layers, for a world you walk through. The look is the
 * approved one (docs/visual/11-environment-style.md): the same palette, the same sky, ridges,
 * paddy-water terraces, framing fronds, hanging lanterns and grass-topped timber ledge that the
 * Character Select, gameplay and results screens use. Here each depth band is its own texture so
 * the camera can move them at different speeds. Presentation only; nothing here carries meaning.
 *
 * Layers that scroll forever (ridges, terraces, lanterns, ledge) are TILEABLE: every wave uses a
 * whole number of cycles per tile, so the right edge meets the left edge without a seam.
 */
type G = Phaser.GameObjects.Graphics;
type Scene = Phaser.Scene;

export const TILE_W = 1024;
/** Room above the ledge for its grass tufts. */
export const LEDGE_MARGIN = 40;

function bake(scene: Scene, key: string, w: number, h: number, paint: (g: G) => void): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  paint(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

const TAU = Math.PI * 2;

/** A whole-number-of-cycles ridge line: far and near mountains. Height `h`, peaks near `baseY`. */
function paintRidgeTile(g: G, w: number, h: number, baseY: number, amp: number, color: number, cycles: number, phase: number): void {
  const pts: number[] = [-16, h];
  for (let x = -16; x <= w + 16; x += 8) {
    const t = (x / w) * TAU;
    const y = baseY - amp * (0.5 + 0.28 * Math.sin(t * cycles + phase) + 0.17 * Math.sin(t * cycles * 2 + phase * 2.1) + 0.08 * Math.sin(t * cycles * 5 + phase * 0.7));
    pts.push(x, y);
  }
  pts.push(w + 16, h);
  g.fillStyle(color, 1);
  polygon(g, pts);
}

/** Terrace bands with paddy water, tileable, fading into haze toward the top (`haze` 0..1). */
function paintTerraceTile(g: G, w: number, h: number, bands: number, cycles: number, phase: number, haze: number, warmth: number): void {
  const curve = (i: number, x: number): number => {
    const t = i / bands;
    const y = h * Math.pow(t, 1.25);
    const amp = 4 + t * 18;
    return y + Math.sin((x / w) * TAU * cycles + phase + i * 0.9) * amp + Math.sin((x / w) * TAU * cycles * 2 + i) * amp * 0.25;
  };
  for (let i = 0; i < bands; i++) {
    const paddy = i % 4 === 2;
    const tone = [EXP.terraceMid, EXP.terraceLight, EXP.terraceDark][i % 3] as number;
    const base = mix(paddy ? EXP.paddy : tone, 0xffd27a, warmth * (i / bands));
    const fill = mix(base, EXP.skyLow, haze * (1 - i / bands));
    const top: number[] = [];
    const bottom: number[] = [];
    for (let x = -12; x <= w + 12; x += 12) {
      top.push(x, curve(i, x));
      bottom.unshift(x, curve(i + 1, x) + 2);
    }
    g.fillStyle(fill, 1);
    polygon(g, [...top, ...bottom]);
    if (paddy) {
      g.fillStyle(0xffffff, 0.22);
      const a: number[] = [];
      const b: number[] = [];
      for (let x = -12; x <= w + 12; x += 12) {
        const y0 = curve(i, x);
        const y1 = curve(i + 1, x);
        a.push(x, y0 + (y1 - y0) * 0.18);
        b.unshift(x, y0 + (y1 - y0) * 0.46);
      }
      polygon(g, [...a, ...b]);
    }
    g.lineStyle(Math.max(2, 1 + i * 0.4), 0xffffff, 0.32);
    g.beginPath();
    g.moveTo(-12, curve(i, -12));
    for (let x = 0; x <= w + 12; x += 12) g.lineTo(x, curve(i, x));
    g.strokePath();
  }
}

/** One lantern hanging from (x, y). */
export function paintLantern(g: G, x: number, y: number, rad: number): void {
  g.fillStyle(EXP.lanternGlow, 0.22);
  g.fillCircle(x, y + rad * 1.4, rad * 2.6);
  g.fillStyle(EXP.lantern, 1);
  g.fillEllipse(x, y + rad * 1.4, rad * 1.7, rad * 2.1);
  g.fillStyle(0xfff0c0, 0.7);
  g.fillEllipse(x - rad * 0.2, y + rad * 1.2, rad * 0.6, rad * 1.0);
  g.fillStyle(EXP.timberDeep, 1);
  g.fillRect(x - rad * 0.5, y + rad * 0.2, rad, rad * 0.35);
  g.fillRect(x - rad * 0.4, y + rad * 2.3, rad * 0.8, rad * 0.3);
}

/** A string of lanterns with two gentle sags per tile, ends level so tiles join. */
function paintLanternTile(g: G, w: number, h: number, unit: number): void {
  const y0 = h * 0.2;
  const sag = unit * 0.05;
  g.lineStyle(1.6, EXP.timberDeep, 0.7);
  g.beginPath();
  g.moveTo(0, y0);
  for (let i = 1; i <= 48; i++) {
    const t = i / 48;
    g.lineTo(w * t, y0 + Math.abs(Math.sin(t * Math.PI * 2)) * sag);
  }
  g.strokePath();
  const count = 6;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const lx = w * t;
    paintLantern(g, lx, y0 + Math.abs(Math.sin(t * Math.PI * 2)) * sag + 2, unit * (0.026 + (i % 3) * 0.004));
  }
}

/** One hanging cluster of fronds for the very front of the scene (drawn from the top edge). */
function paintCanopy(g: G, w: number, h: number, seed: number): void {
  const rand = rng(seed);
  const unit = h;
  for (let i = 0; i < 6; i++) {
    const rootX = w * (0.08 + 0.84 * (i / 5)) + (rand() - 0.5) * unit * 0.1;
    const a = Math.PI / 2 + (rand() - 0.5) * 1.5;
    frond(g, rootX, -unit * 0.05, unit * (0.7 + rand() * 0.35), a, unit * 0.2, i % 2 ? EXP.foliage : EXP.foliageDeep);
  }
}

export interface WorldTextures {
  sky: string;
  ridgeFar: string;
  ridgeNear: string;
  terraceFar: string;
  terraceMid: string;
  lanterns: string;
  ledge: string;
  canopy: string;
  ledgeH: number;
  horizonY: number;
}

/** Bakes every layer for a viewport of (viewW x viewH) with the ground line at groundY. */
export function bakeWorldLayers(scene: Scene, viewW: number, viewH: number, groundY: number): WorldTextures {
  const recipe = RECIPES.basecamp;
  const horizonY = Math.round(viewH * 0.42);
  const unit = Math.min(viewW, viewH);
  const ledgeH = viewH - groundY;
  const skyKey = bake(scene, 'bz-w-sky', viewW, horizonY + 40, (g) => {
    const rand = rng(recipe.seed + viewW);
    paintSky(g, viewW, horizonY + 40, { ...recipe, horizon: horizonY / (horizonY + 40) });
    paintClouds(g, viewW, horizonY * 1.1, rand);
  });
  const ridgeH = Math.round(viewH * 0.3);
  const ridgeFar = bake(scene, 'bz-w-ridge-far', TILE_W, ridgeH, (g) => paintRidgeTile(g, TILE_W, ridgeH, ridgeH * 0.72, ridgeH * 0.62, EXP.mountainFar, 3, 0.4));
  const ridgeNear = bake(scene, 'bz-w-ridge-near', TILE_W, ridgeH, (g) => paintRidgeTile(g, TILE_W, ridgeH, ridgeH * 0.8, ridgeH * 0.45, EXP.mountainNear, 4, 2.1));
  const terraceH = groundY - horizonY + Math.round(viewH * 0.06);
  const terraceFar = bake(scene, 'bz-w-terrace-far', TILE_W, terraceH, (g) => {
    paintTerraceTile(g, TILE_W, terraceH, 7, 2, 0.8, 0.5, 0.1);
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(0, 0, TILE_W, terraceH * 0.1);
  });
  const terraceMid = bake(scene, 'bz-w-terrace-mid', TILE_W, terraceH, (g) => paintTerraceTile(g, TILE_W, terraceH, 9, 3, 2.4, 0.12, 0.2));
  const lanternH = Math.round(viewH * 0.26);
  const lanterns = bake(scene, 'bz-w-lanterns', TILE_W, lanternH, (g) => paintLanternTile(g, TILE_W, lanternH, unit));
  const ledgeW = 512;
  const ledge = bake(scene, 'bz-w-ledge', ledgeW, ledgeH + LEDGE_MARGIN, (g) => grassLedge(g, { x: -20, y: LEDGE_MARGIN, w: ledgeW + 40, h: ledgeH }));
  const canopyH = Math.round(viewH * 0.3);
  const canopy = bake(scene, 'bz-w-canopy', 900, canopyH, (g) => paintCanopy(g, 900, canopyH, 77));
  return { sky: skyKey, ridgeFar, ridgeNear, terraceFar, terraceMid, lanterns, ledge, canopy, ledgeH: ledgeH + LEDGE_MARGIN, horizonY };
}

/** The Basecamp Gate: two timber posts, a lintel with a name board, bunting and hanging lanterns. */
export function bakeGate(scene: Scene, unit: number): { key: string; w: number; h: number } {
  const w = Math.round(unit * 0.74);
  const h = Math.round(unit * 0.62);
  const key = bake(scene, 'bz-w-gate', w, h, (g) => {
    const post = Math.round(unit * 0.06);
    // posts
    for (const px of [unit * 0.03, w - unit * 0.03 - post]) {
      g.fillStyle(EXP.timberDeep, 1);
      g.fillRoundedRect(px, h * 0.16, post, h * 0.84, 5);
      g.fillStyle(EXP.timber, 1);
      g.fillRoundedRect(px + 2, h * 0.16, post - 5, h * 0.84, 4);
      g.fillStyle(EXP.timberLight, 0.5);
      g.fillRoundedRect(px + 4, h * 0.18, post * 0.25, h * 0.8, 3);
      g.fillStyle(EXP.brass, 1);
      g.fillRoundedRect(px - 3, h * 0.2, post + 6, unit * 0.022, 3);
    }
    // roof beam with upturned ends
    g.fillStyle(EXP.timberDeep, 1);
    g.fillRoundedRect(0, h * 0.06, w, unit * 0.075, 8);
    g.fillStyle(EXP.orangeDeep, 1);
    g.fillRoundedRect(unit * 0.01, h * 0.02, w - unit * 0.02, unit * 0.06, 10);
    g.fillStyle(EXP.orange, 1);
    g.fillRoundedRect(unit * 0.02, h * 0.02, w - unit * 0.04, unit * 0.04, 8);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(unit * 0.05, h * 0.03, w - unit * 0.1, unit * 0.012, 5);
    // name board
    timberSign(g, { x: w * 0.2, y: h * 0.2, w: w * 0.6, h: unit * 0.1 });
    // bunting
    const flags = [EXP.orange, EXP.amber, 0xffffff, 0x3fbf7f, 0x38b6c8];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const fx = w * (0.1 + (0.8 * i) / (n - 1));
      const fy = h * 0.37 + Math.sin((i / (n - 1)) * Math.PI) * unit * 0.025;
      g.fillStyle(flags[i % flags.length] as number, 1);
      g.fillTriangle(fx - unit * 0.02, fy, fx + unit * 0.02, fy, fx, fy + unit * 0.045);
    }
    g.lineStyle(2, EXP.timberDeep, 0.7);
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.36);
    for (let i = 1; i <= 24; i++) g.lineTo(w * (0.1 + 0.8 * (i / 24)), h * 0.36 + Math.sin((i / 24) * Math.PI) * unit * 0.025);
    g.strokePath();
    // lanterns under the roof
    paintLantern(g, w * 0.17, h * 0.12, unit * 0.03);
    paintLantern(g, w * 0.83, h * 0.12, unit * 0.03);
  });
  return { key, w, h };
}

/** A timber signpost with an arrow board and a ribbon flag. */
export function bakeSignpost(scene: Scene, unit: number): { key: string; w: number; h: number } {
  const w = Math.round(unit * 0.36);
  const h = Math.round(unit * 0.5);
  const key = bake(scene, 'bz-w-signpost', w, h, (g) => {
    const pw = unit * 0.045;
    g.fillStyle(EXP.timberDeep, 1);
    g.fillRoundedRect(w / 2 - pw / 2, h * 0.08, pw, h * 0.92, 4);
    g.fillStyle(EXP.timber, 1);
    g.fillRoundedRect(w / 2 - pw / 2 + 2, h * 0.08, pw - 4, h * 0.92, 3);
    timberSign(g, { x: w * 0.04, y: h * 0.14, w: w * 0.92, h: unit * 0.1 });
    g.fillStyle(EXP.amber, 1);
    g.fillTriangle(w * 0.78, h * 0.18, w * 0.78, h * 0.18 + unit * 0.06, w * 0.95, h * 0.18 + unit * 0.03);
    ribbon(g, { x: w * 0.1, y: h * 0.42, w: w * 0.8, h: unit * 0.07 }, EXP.orange, EXP.orangeDeep);
    paintLantern(g, w * 0.5, 0, unit * 0.022);
  });
  return { key, w, h };
}
