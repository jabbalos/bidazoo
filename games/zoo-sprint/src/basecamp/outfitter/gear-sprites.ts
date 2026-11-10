import Phaser from 'phaser';
import { gearPlacements, type FracRect, type GearLook, type GearPlacement, type GearView } from './gear-model';

/**
 * Gear drawn in code (Lane C item C3, "code-drawn day 2, painted later"): flat Phaser Graphics
 * shapes anchored on the painted walker and bust. No image file is loaded or added. Presentation
 * only: what the buddy wears never reaches grading, XP or coins.
 *
 * MINIMAL code-drawn version from the owner-confirmed art references (REPORT.md "Art references"):
 * simple shapes in each item's colors, placed inside anchors that clear every Character Bible
 * LOCKED feature (gear-model.ts). Painted gear replaces this later.
 */

/** A picture's box in the layer's own coordinates (pixels). */
export interface PictureBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toPixels(rect: FracRect, box: PictureBox): PictureBox {
  return {
    x: box.x + rect.x0 * box.w,
    y: box.y + rect.y0 * box.h,
    w: (rect.x1 - rect.x0) * box.w,
    h: (rect.y1 - rect.y0) * box.h,
  };
}

const OUTLINE = 0x3a210c;

function hat(g: Phaser.GameObjects.Graphics, b: PictureBox, look: GearLook): void {
  const brimH = Math.max(3, b.h * 0.22);
  const crownW = b.w * (look.detail === 'pompom' ? 0.62 : 0.56);
  const crownX = b.x + (b.w - crownW) / 2;
  const crownTop = b.y + b.h * (look.detail === 'pompom' ? 0.3 : 0.12);
  const brimY = b.y + b.h - brimH;
  const line = Math.max(1.5, b.h * 0.035);
  g.lineStyle(line, OUTLINE, 0.9);
  if (look.detail !== 'pompom') {
    // brim (wide for the sun hat)
    const brimW = look.detail === 'brim' ? b.w : b.w * 0.86;
    g.fillStyle(look.main, 1);
    g.fillEllipse(b.x + b.w / 2, brimY + brimH / 2, brimW, brimH);
    g.strokeEllipse(b.x + b.w / 2, brimY + brimH / 2, brimW, brimH);
  }
  g.fillStyle(look.main, 1);
  g.fillRoundedRect(crownX, crownTop, crownW, brimY - crownTop + brimH * 0.5, Math.min(crownW, b.h) * 0.35);
  g.strokeRoundedRect(crownX, crownTop, crownW, brimY - crownTop + brimH * 0.5, Math.min(crownW, b.h) * 0.35);
  // band or pompom
  if (look.detail === 'pompom') {
    g.fillStyle(look.accent, 1);
    g.fillCircle(b.x + b.w / 2, crownTop, Math.max(3, b.h * 0.16));
    g.fillRect(crownX, brimY + brimH * 0.1, crownW, brimH * 0.4);
  } else {
    g.fillStyle(look.accent, 1);
    g.fillRect(crownX, brimY - brimH * 0.55, crownW, brimH * 0.55);
  }
  // soft highlight
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(crownX + crownW * 0.15, crownTop + (brimY - crownTop) * 0.12, crownW * 0.25, (brimY - crownTop) * 0.45, 3);
}

function scarf(g: Phaser.GameObjects.Graphics, b: PictureBox, look: GearLook): void {
  const bandH = b.h * 0.6;
  const radius = Math.min(bandH * 0.45, b.w * 0.2);
  const line = Math.max(1.5, b.h * 0.05);
  g.lineStyle(line, OUTLINE, 0.85);
  // the knot's tail hangs at the back (the art faces right, so the back is the left), inside the anchor
  const tailW = b.w * 0.22;
  g.fillStyle(look.main, 1);
  g.fillRoundedRect(b.x + b.w * 0.08, b.y + bandH * 0.6, tailW, b.h - bandH * 0.6, 3);
  g.strokeRoundedRect(b.x + b.w * 0.08, b.y + bandH * 0.6, tailW, b.h - bandH * 0.6, 3);
  g.fillRoundedRect(b.x, b.y, b.w, bandH, radius);
  g.strokeRoundedRect(b.x, b.y, b.w, bandH, radius);
  g.fillStyle(look.accent, 1);
  if (look.detail === 'stripes') {
    for (let i = 1; i <= 3; i++) g.fillRect(b.x + (b.w * i) / 4 - b.w * 0.04, b.y + line, b.w * 0.08, bandH - line * 2);
    g.fillRect(b.x + b.w * 0.08, b.y + b.h - (b.h - bandH * 0.6) * 0.35, tailW, line * 1.5);
  } else if (look.detail === 'weave') {
    g.fillRect(b.x + radius * 0.5, b.y + bandH * 0.42, b.w - radius, Math.max(1.5, bandH * 0.16));
    for (let i = 1; i < 6; i++) g.fillRect(b.x + (b.w * i) / 6, b.y + bandH * 0.2, Math.max(1, b.w * 0.02), bandH * 0.6);
  } else {
    g.fillStyle(look.accent, 0.8);
    g.fillRect(b.x + radius * 0.5, b.y + bandH * 0.72, b.w - radius, Math.max(1.5, bandH * 0.14));
  }
  g.fillStyle(0xffffff, 0.2);
  g.fillRoundedRect(b.x + radius * 0.6, b.y + bandH * 0.12, b.w * 0.5, bandH * 0.2, 2);
}

function stick(g: Phaser.GameObjects.Graphics, b: PictureBox, look: GearLook): void {
  const poleW = Math.max(3, b.w * 0.38);
  const cx = b.x + b.w / 2;
  const topperR = Math.min(b.w * 0.5, b.h * 0.06);
  const poleTop = b.y + (look.detail === 'plain' ? 0 : topperR * 1.6);
  const line = Math.max(1.2, poleW * 0.22);
  g.lineStyle(line, OUTLINE, 0.9);
  g.fillStyle(look.main, 1);
  g.fillRoundedRect(cx - poleW / 2, poleTop, poleW, b.y + b.h - poleTop, poleW / 2);
  g.strokeRoundedRect(cx - poleW / 2, poleTop, poleW, b.y + b.h - poleTop, poleW / 2);
  // grip wrap and joints
  g.fillStyle(look.accent, 1);
  g.fillRect(cx - poleW / 2, poleTop + (b.h - (poleTop - b.y)) * 0.18, poleW, Math.max(2, b.h * 0.05));
  if (look.detail === 'plain' && look.main === 0x9cbf4a) {
    for (const f of [0.45, 0.7]) g.fillRect(cx - poleW / 2, b.y + b.h * f, poleW, Math.max(1, b.h * 0.012));
  }
  if (look.detail === 'lantern') {
    g.fillStyle(0xffd27a, 0.45);
    g.fillCircle(cx, b.y + topperR, topperR);
    g.fillStyle(look.accent, 1);
    g.fillRoundedRect(cx - topperR * 0.7, b.y, topperR * 1.4, topperR * 2, topperR * 0.4);
    g.strokeRoundedRect(cx - topperR * 0.7, b.y, topperR * 1.4, topperR * 2, topperR * 0.4);
  } else if (look.detail === 'compass') {
    g.fillStyle(look.accent, 1);
    g.fillCircle(cx, b.y + topperR, topperR);
    g.strokeCircle(cx, b.y + topperR, topperR);
    g.fillStyle(0xfdf3d6, 1);
    g.fillCircle(cx, b.y + topperR, topperR * 0.65);
    g.fillStyle(0xdc5a08, 1);
    g.fillTriangle(cx, b.y + topperR * 0.45, cx - topperR * 0.2, b.y + topperR, cx + topperR * 0.2, b.y + topperR);
  }
}

/** Draws one placement into `g`, inside its anchor mapped onto `box`. */
export function drawPlacement(g: Phaser.GameObjects.Graphics, placement: GearPlacement, box: PictureBox): void {
  const b = toPixels(placement.rect, box);
  if (placement.slot === 'hat') hat(g, b, placement.look);
  else if (placement.slot === 'scarf') scarf(g, b, placement.look);
  else stick(g, b, placement.look);
}

/** Draws an item as a shop icon centered in `box` (the outfitter's cards). */
export function drawGearIcon(g: Phaser.GameObjects.Graphics, look: GearLook, box: PictureBox): void {
  const rect: FracRect =
    look.slot === 'hat' ? { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 } : look.slot === 'scarf' ? { x0: 0.08, y0: 0.3, x1: 0.92, y1: 0.75 } : { x0: 0.42, y0: 0.05, x1: 0.58, y1: 0.95 };
  drawPlacement(g, { itemId: '', slot: look.slot, look, rect }, box);
}

/**
 * A gear layer for a painted picture. `box` is the picture's box in the layer's coordinates:
 * for the walker, the opaque body with its feet at (0, 0), i.e. { x: -bodyW / 2, y: -bodyH, w:
 * bodyW, h: bodyH }; for a bust, the displayed picture's bounds. Returns an empty container when
 * nothing applies (Click, no gear, or no anchor clear of the LOCKED features).
 */
export function buildGearLayer(
  scene: Phaser.Scene,
  cast: string,
  view: GearView,
  equipped: readonly string[],
  box: PictureBox,
): Phaser.GameObjects.Container {
  const layer = scene.add.container(0, 0);
  layer.setName('gear');
  const placements = gearPlacements(cast, view, equipped);
  if (placements.length > 0) {
    const g = scene.add.graphics();
    for (const placement of placements) drawPlacement(g, placement, box);
    layer.add(g);
  }
  layer.setData('gear', placements.map((p) => p.itemId).join(','));
  return layer;
}

/**
 * Keeps a walker's gear layer on the walking picture each frame: same position, rotation and
 * squash as the figure, mirrored when the buddy faces left.
 */
export function syncGearLayer(
  layer: Phaser.GameObjects.Container,
  figure: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
  baseScale: number,
  facing: 1 | -1,
): void {
  const base = Math.abs(baseScale) || 1;
  layer.setPosition(figure.x, figure.y);
  layer.setRotation(figure.rotation);
  layer.setScale((facing * Math.abs(figure.scaleX)) / base, Math.abs(figure.scaleY) / base);
}
