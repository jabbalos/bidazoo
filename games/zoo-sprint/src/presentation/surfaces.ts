import type Phaser from 'phaser';
import { EXP, mix } from '../theme';

/**
 * Shared "premium game UI" drawing helpers: soft shadows, parchment panels with brass trim, timber
 * signs, pills, glossy surfaces, a coin and a star. Everything is flat shapes in Phaser Graphics, so
 * it stays crisp at any size and needs no image files. Presentation only.
 */
type G = Phaser.GameObjects.Graphics;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A soft drop shadow: a few stacked, faint rounded rects offset downward. */
export function softShadow(g: G, b: Box, radius: number, spread = 10, alpha = 0.22): void {
  for (let i = 4; i >= 1; i--) {
    g.fillStyle(0x0b2233, alpha / (i + 1.2));
    const grow = (spread * i) / 4;
    g.fillRoundedRect(b.x - grow, b.y - grow * 0.4 + spread * 0.55, b.w + grow * 2, b.h + grow * 1.6, radius + grow);
  }
}

export interface PanelOptions {
  radius?: number;
  border?: number;
  fill?: number;
  edge?: number;
  shadow?: boolean;
}

/** A parchment card with a brass edge, an inner hairline and a soft top highlight. */
export function parchmentPanel(g: G, b: Box, opts: PanelOptions = {}): void {
  const radius = opts.radius ?? Math.min(26, b.h * 0.22);
  const border = opts.border ?? Math.max(3, Math.min(6, b.h * 0.035));
  const fill = opts.fill ?? EXP.parchment;
  if (opts.shadow !== false) softShadow(g, b, radius, Math.max(8, b.h * 0.06));
  g.fillStyle(EXP.brassDeep, 1);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, radius);
  g.fillStyle(opts.edge ?? EXP.brass, 1);
  g.fillRoundedRect(b.x, b.y, b.w, b.h - border * 0.5, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(b.x + border, b.y + border, b.w - border * 2, b.h - border * 2 - border * 0.5, Math.max(4, radius - border));
  // inner hairline, like a stitched border
  g.lineStyle(1.5, EXP.parchmentEdge, 0.75);
  g.strokeRoundedRect(b.x + border * 2, b.y + border * 2, b.w - border * 4, b.h - border * 4 - border * 0.5, Math.max(3, radius - border * 2));
  // soft light along the top
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(b.x + border * 1.5, b.y + border * 1.2, b.w - border * 3, Math.max(4, b.h * 0.16), Math.max(3, radius - border * 1.5));
}

/** A timber sign with two nails, for the question counter and tabs. */
export function timberSign(g: G, b: Box): void {
  const radius = Math.min(12, b.h * 0.3);
  softShadow(g, b, radius, 6, 0.28);
  g.fillStyle(EXP.timberDeep, 1);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, radius);
  g.fillStyle(EXP.timber, 1);
  g.fillRoundedRect(b.x + 2, b.y + 2, b.w - 4, b.h - 5, radius);
  g.fillStyle(EXP.timberLight, 0.55);
  g.fillRoundedRect(b.x + 4, b.y + 4, b.w - 8, b.h * 0.3, radius * 0.7);
  g.lineStyle(1.2, EXP.timberDeep, 0.5);
  for (let i = 1; i < 3; i++) g.lineBetween(b.x + 8, b.y + (b.h * i) / 3, b.x + b.w - 8, b.y + (b.h * i) / 3);
  g.fillStyle(EXP.brass, 1);
  g.fillCircle(b.x + 7, b.y + b.h / 2, 2.4);
  g.fillCircle(b.x + b.w - 7, b.y + b.h / 2, 2.4);
}

/** A rounded pill (XP, coins, trait chips). */
export function pill(g: G, b: Box, fill: number, edge: number, alpha = 1): void {
  const r = b.h / 2;
  g.fillStyle(edge, alpha);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, r);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4.5, Math.max(2, r - 2));
}

export interface GlossColors {
  top: number;
  fill: number;
  deep: number;
}

/** A glossy rounded surface: dark base, main color, lighter upper half, and a white gleam. */
export function glossy(g: G, b: Box, radius: number, c: GlossColors, lift: number): void {
  const bodyH = b.h - lift;
  g.fillStyle(c.deep, 1);
  g.fillRoundedRect(b.x, b.y + lift, b.w, bodyH, radius);
  g.fillStyle(c.fill, 1);
  g.fillRoundedRect(b.x, b.y, b.w, bodyH, radius);
  g.fillStyle(c.top, 1);
  g.fillRoundedRect(b.x + 3, b.y + 3, b.w - 6, bodyH * 0.52, Math.max(3, radius - 3));
  g.fillStyle(0xffffff, 0.2);
  g.fillRoundedRect(b.x + b.w * 0.07, b.y + 5, b.w * 0.5, Math.max(4, bodyH * 0.14), Math.max(2, bodyH * 0.07));
  g.lineStyle(2, mix(c.deep, 0x000000, 0.25), 0.9);
  g.strokeRoundedRect(b.x, b.y, b.w, bodyH, radius);
}

/** A gold coin with a paw mark. */
export function coinIcon(g: G, cx: number, cy: number, r: number): void {
  g.fillStyle(EXP.brassDeep, 1);
  g.fillCircle(cx, cy + r * 0.08, r);
  g.fillStyle(EXP.brass, 1);
  g.fillCircle(cx, cy, r);
  g.fillStyle(0xffe08a, 1);
  g.fillCircle(cx, cy, r * 0.74);
  g.fillStyle(EXP.brassDeep, 1);
  g.fillEllipse(cx, cy + r * 0.2, r * 0.5, r * 0.4);
  for (const dx of [-0.34, -0.12, 0.12, 0.34]) g.fillCircle(cx + dx * r, cy - r * (0.14 + (Math.abs(dx) > 0.2 ? 0 : 0.1)), r * 0.1);
}

/** A star (XP). */
export function starIcon(g: G, cx: number, cy: number, r: number, fill: number = EXP.brass): void {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  g.fillStyle(EXP.brassDeep, 1);
  g.fillPoints(pts.map((p) => ({ x: p.x, y: (p.y ?? 0) + r * 0.08 })), true);
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(cx - r * 0.22, cy - r * 0.22, r * 0.18);
}

/** A ribbon banner (the "Run complete!" header). */
export function ribbon(g: G, b: Box, fill: number, deep: number): void {
  const tail = Math.min(b.h * 0.55, b.w * 0.08);
  const drop = b.h * 0.22;
  g.fillStyle(deep, 1);
  g.fillPoints(
    [
      { x: b.x, y: b.y + drop },
      { x: b.x + tail * 1.5, y: b.y + drop },
      { x: b.x + tail * 1.5, y: b.y + b.h + drop * 0.6 },
      { x: b.x + tail * 0.5, y: b.y + b.h + drop * 0.6 },
      { x: b.x + tail * 0.9, y: b.y + b.h * 0.62 + drop },
      { x: b.x, y: b.y + b.h * 0.62 + drop },
    ],
    true,
  );
  g.fillPoints(
    [
      { x: b.x + b.w, y: b.y + drop },
      { x: b.x + b.w - tail * 1.5, y: b.y + drop },
      { x: b.x + b.w - tail * 1.5, y: b.y + b.h + drop * 0.6 },
      { x: b.x + b.w - tail * 0.5, y: b.y + b.h + drop * 0.6 },
      { x: b.x + b.w - tail * 0.9, y: b.y + b.h * 0.62 + drop },
      { x: b.x + b.w, y: b.y + b.h * 0.62 + drop },
    ],
    true,
  );
  glossy(g, { x: b.x + tail, y: b.y, w: b.w - tail * 2, h: b.h }, Math.min(14, b.h * 0.25), { top: mix(fill, 0xffffff, 0.28), fill, deep }, Math.max(3, b.h * 0.07));
}

/** A foreground ledge (grass-topped earth) that hides the flat crop at the bottom of a bust. */
export function grassLedge(g: G, b: Box): void {
  g.fillStyle(EXP.timberDeep, 1);
  g.fillRect(b.x, b.y + b.h * 0.25, b.w, b.h * 0.75);
  g.fillStyle(EXP.timber, 1);
  g.fillRect(b.x, b.y + b.h * 0.2, b.w, b.h * 0.8);
  g.fillStyle(EXP.terraceDark, 1);
  g.fillRoundedRect(b.x - 4, b.y, b.w + 8, b.h * 0.42, Math.min(14, b.h * 0.3));
  g.fillStyle(EXP.terraceLight, 1);
  g.fillRoundedRect(b.x - 4, b.y, b.w + 8, b.h * 0.22, Math.min(12, b.h * 0.2));
  // little tufts along the edge
  const step = Math.max(14, b.w / 18);
  g.fillStyle(EXP.terraceMid, 1);
  for (let x = b.x; x < b.x + b.w; x += step) {
    g.fillTriangle(x, b.y + 2, x + step * 0.3, b.y - b.h * 0.22, x + step * 0.6, b.y + 2);
  }
}
