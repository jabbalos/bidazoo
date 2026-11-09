import type Phaser from 'phaser';
import { ridgePoints, type LayerSpec } from './destination-model';

/** Width of the repeating tile every layer is drawn into (each ridge uses whole cycles, so it repeats without a seam). */
export const TILE_W = 1024;

/** Draws one layer's shapes into a repeating tile texture. A layer with a picture file falls back to these shapes until the picture is loaded (B7). */
export function bakeLayer(scene: Phaser.Scene, key: string, layer: LayerSpec, h: number): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, TILE_W, Math.max(2, h));
  if (!tex) return key;
  const g = tex.getContext();
  for (const shape of layer.shapes) {
    if (shape.kind === 'gradient') {
      const grad = g.createLinearGradient(0, 0, 0, h);
      for (const s of shape.stops) grad.addColorStop(s.at, s.color);
      g.fillStyle = grad;
      g.fillRect(0, 0, TILE_W, h);
    } else {
      const pts = ridgePoints(TILE_W, h, shape);
      const top = Math.min(...pts.map((p) => p[1]));
      const grad = g.createLinearGradient(0, top, 0, h);
      grad.addColorStop(0, shape.color);
      grad.addColorStop(1, shape.colorBottom ?? shape.color);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, h);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(TILE_W, h);
      g.closePath();
      g.fill();
    }
  }
  tex.refresh();
  return key;
}
