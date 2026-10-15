import type Phaser from 'phaser';
import type { GlyphName } from './traits';

/**
 * A tiny set of flat icon glyphs drawn with Phaser Graphics (no image files, no fonts), used for the
 * trait chips and the feedback badges. Each glyph is drawn centered on (cx, cy) inside a square of
 * `s` pixels, in one `color`, so it stays legible at 16 px.
 */
type G = Phaser.GameObjects.Graphics;

function poly(g: G, pts: number[]): void {
  const points: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < pts.length; i += 2) points.push({ x: pts[i] as number, y: pts[i + 1] as number });
  g.fillPoints(points, true);
}

export function drawGlyph(g: G, name: GlyphName, cx: number, cy: number, s: number, color: number): void {
  const r = s / 2;
  const lw = Math.max(1.6, s * 0.12);
  g.fillStyle(color, 1);
  g.lineStyle(lw, color, 1);
  switch (name) {
    case 'compass': {
      g.strokeCircle(cx, cy, r * 0.86);
      poly(g, [cx, cy - r * 0.62, cx + r * 0.26, cy, cx, cy + r * 0.62, cx - r * 0.26, cy]);
      break;
    }
    case 'magnifier': {
      g.strokeCircle(cx - r * 0.12, cy - r * 0.12, r * 0.58);
      g.lineBetween(cx + r * 0.3, cy + r * 0.3, cx + r * 0.88, cy + r * 0.88);
      break;
    }
    case 'sun': {
      g.fillCircle(cx, cy, r * 0.42);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
      }
      break;
    }
    case 'book': {
      poly(g, [cx - r * 0.9, cy - r * 0.6, cx - r * 0.06, cy - r * 0.42, cx - r * 0.06, cy + r * 0.72, cx - r * 0.9, cy + r * 0.52]);
      poly(g, [cx + r * 0.9, cy - r * 0.6, cx + r * 0.06, cy - r * 0.42, cx + r * 0.06, cy + r * 0.72, cx + r * 0.9, cy + r * 0.52]);
      break;
    }
    case 'bulb': {
      g.fillCircle(cx, cy - r * 0.2, r * 0.56);
      g.fillRect(cx - r * 0.26, cy + r * 0.4, r * 0.52, r * 0.2);
      g.fillRect(cx - r * 0.18, cy + r * 0.66, r * 0.36, r * 0.16);
      break;
    }
    case 'heart': {
      g.fillCircle(cx - r * 0.34, cy - r * 0.2, r * 0.42);
      g.fillCircle(cx + r * 0.34, cy - r * 0.2, r * 0.42);
      poly(g, [cx - r * 0.74, cy - r * 0.04, cx + r * 0.74, cy - r * 0.04, cx, cy + r * 0.82]);
      break;
    }
    case 'eye': {
      g.beginPath();
      g.moveTo(cx - r * 0.95, cy);
      g.lineTo(cx, cy - r * 0.55);
      g.lineTo(cx + r * 0.95, cy);
      g.lineTo(cx, cy + r * 0.55);
      g.closePath();
      g.strokePath();
      g.fillCircle(cx, cy, r * 0.27);
      break;
    }
    case 'smile': {
      g.strokeCircle(cx, cy, r * 0.86);
      g.fillCircle(cx - r * 0.3, cy - r * 0.18, r * 0.1);
      g.fillCircle(cx + r * 0.3, cy - r * 0.18, r * 0.1);
      g.beginPath();
      g.arc(cx, cy + r * 0.04, r * 0.46, 0.15 * Math.PI, 0.85 * Math.PI, false);
      g.strokePath();
      break;
    }
    case 'bolt': {
      poly(g, [cx + r * 0.18, cy - r * 0.95, cx - r * 0.55, cy + r * 0.12, cx - r * 0.04, cy + r * 0.12, cx - r * 0.18, cy + r * 0.95, cx + r * 0.58, cy - r * 0.2, cx + r * 0.06, cy - r * 0.2]);
      break;
    }
    case 'flag': {
      g.lineBetween(cx - r * 0.6, cy - r * 0.9, cx - r * 0.6, cy + r * 0.9);
      poly(g, [cx - r * 0.6, cy - r * 0.84, cx + r * 0.85, cy - r * 0.4, cx - r * 0.6, cy + r * 0.06]);
      break;
    }
    case 'shield': {
      poly(g, [cx - r * 0.78, cy - r * 0.8, cx + r * 0.78, cy - r * 0.8, cx + r * 0.78, cy + r * 0.1, cx, cy + r * 0.92, cx - r * 0.78, cy + r * 0.1]);
      break;
    }
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 0.98 : r * 0.42;
        pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      poly(g, pts);
      break;
    }
    case 'ball': {
      g.strokeCircle(cx, cy, r * 0.86);
      g.beginPath();
      g.arc(cx - r * 0.95, cy, r * 0.8, -0.5, 0.5, false);
      g.strokePath();
      g.beginPath();
      g.arc(cx + r * 0.95, cy, r * 0.8, Math.PI - 0.5, Math.PI + 0.5, false);
      g.strokePath();
      break;
    }
  }
}

/** A check mark, for "correct". Drawn centered in a square of `s`. */
export function drawCheck(g: G, cx: number, cy: number, s: number, color: number): void {
  g.lineStyle(Math.max(3, s * 0.2), color, 1);
  g.beginPath();
  g.moveTo(cx - s * 0.3, cy + s * 0.02);
  g.lineTo(cx - s * 0.08, cy + s * 0.26);
  g.lineTo(cx + s * 0.34, cy - s * 0.24);
  g.strokePath();
}

/** A circular arrow, for "try again" (never an X, never red: docs/visual/10-ui-component-style.md). */
export function drawRetry(g: G, cx: number, cy: number, s: number, color: number): void {
  const rad = s * 0.3;
  g.lineStyle(Math.max(3, s * 0.17), color, 1);
  g.beginPath();
  g.arc(cx, cy, rad, -2.4, 1.9, false);
  g.strokePath();
  const a = -2.4;
  const tipX = cx + Math.cos(a) * rad;
  const tipY = cy + Math.sin(a) * rad;
  g.fillStyle(color, 1);
  g.fillTriangle(tipX - s * 0.2, tipY - s * 0.02, tipX + s * 0.12, tipY - s * 0.2, tipX + s * 0.1, tipY + s * 0.18);
}
