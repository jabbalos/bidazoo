import Phaser from 'phaser';
import { backdropManifest, backdropTextureKey, hasPaintedBackdrop } from './basecamp-art';
import { paintedCrop, type PaintedView } from './presentation/backdrop-model';
import type { Box } from './presentation/surfaces';

/**
 * The painted Basecamp behind the other screens (Choose Your Buddy, the run, Results), so every
 * screen happens in the same painted place the buddy walks through. It reuses the Basecamp layers
 * (basecamp.json: the far sky/mountain layer and the transparent front layer), already loaded at
 * boot, and shows a deliberate crop of them per screen (backdrop-model.ts `PAINTED_VIEWS`):
 *
 *   select   the whole plaza, softened (a blurred copy baked once), behind the menu UI
 *   stage    a sharp crop of the lodge for the hero card
 *   run      a calm crop of the lantern canopy and tables behind the question card
 *   results  the paw-banner gate, warm, for the celebration
 *
 * Returns false when the painted layers are not loaded, so the scene draws its code-drawn backdrop
 * exactly as before. Presentation only: nothing here touches questions, grading, XP or coins.
 */
const SOFT_KEY = 'painted-backdrop-soft';
/** Width of the softened copy: small enough that scaling it up blurs it, large enough to stay a painting. */
const SOFT_W = 560;

/** True when the painted layers are loaded (the screens then use them). */
export function hasPaintedScene(scene: Phaser.Scene): boolean {
  return hasPaintedBackdrop(scene);
}

/** A low-resolution flattened copy of the layers; drawn scaled up it reads as an out-of-focus plaza. */
function softTexture(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(SOFT_KEY)) return SOFT_KEY;
  const m = backdropManifest();
  if (!m) return null;
  try {
    const front = scene.textures.get(backdropTextureKey(m.layers.at(-1)!.file)).getSourceImage() as HTMLImageElement;
    const h = Math.round((SOFT_W * front.height) / front.width);
    const canvas = scene.textures.createCanvas(SOFT_KEY, SOFT_W, h);
    if (!canvas) return null;
    const g = canvas.getContext();
    g.imageSmoothingQuality = 'high';
    for (const layer of m.layers) {
      const src = scene.textures.get(backdropTextureKey(layer.file)).getSourceImage() as HTMLImageElement;
      // every layer covers the copy, left- and bottom-aligned, as in Basecamp with the camera at rest
      const k = Math.max(SOFT_W / src.width, h / src.height);
      g.drawImage(src, 0, h - src.height * k, src.width * k, src.height * k);
    }
    canvas.refresh();
    return SOFT_KEY;
  } catch {
    return null;
  }
}

/**
 * Draws the painted crop `view` to cover `box` inside `into`. A box smaller than the screen is
 * clipped to a rounded rectangle of `radius` (unless `clip` is false: `into` is masked already). Returns false (and draws nothing) without painted art.
 */
export function addPaintedBackdrop(scene: Phaser.Scene, into: Phaser.GameObjects.Container, box: Box, view: PaintedView, radius = 0, clip = true): boolean {
  const m = backdropManifest();
  if (!m || !hasPaintedScene(scene)) return false;
  const holder = scene.add.container(0, 0);
  const crop = paintedCrop(view);
  if (crop.soft) {
    const key = softTexture(scene);
    if (!key) return false;
    const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    holder.add(coverImage(scene, key, src, box, crop.focusX, crop.focusY, crop.zoom));
  } else {
    const frontSrc = scene.textures.get(backdropTextureKey(m.layers.at(-1)!.file)).getSourceImage() as { width: number; height: number };
    // One placement computed on the front layer; every layer uses the same rectangle, so the painting
    // lines up exactly as it does in Basecamp with the camera at rest.
    const place = coverPlacement(frontSrc, box, crop.focusX, crop.focusY, crop.zoom);
    for (const layer of m.layers) {
      const key = backdropTextureKey(layer.file);
      const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
      // each layer fills the same height, left- and bottom-aligned (a wider far layer just runs on)
      const lw = Math.max(place.w, (src.width * place.h) / src.height);
      const lh = (src.height * lw) / src.width;
      const img = scene.add.image(place.x, place.y + place.h - lh, key).setOrigin(0, 0).setDisplaySize(lw, lh);
      holder.add(img);
    }
  }
  if (crop.tint) {
    const wash = scene.add.graphics();
    wash.fillStyle(crop.tint.color, crop.tint.alpha);
    wash.fillRect(box.x, box.y, box.w, box.h);
    holder.add(wash);
  }
  const full = box.x <= 0 && box.y <= 0 && box.w >= scene.scale.width && box.h >= scene.scale.height;
  if (!full && clip) {
    const shape = scene.make.graphics({ x: 0, y: 0 }, false);
    shape.fillStyle(0xffffff, 1);
    shape.fillRoundedRect(box.x, box.y, box.w, box.h, radius);
    holder.setMask(shape.createGeometryMask());
    holder.once(Phaser.GameObjects.Events.DESTROY, () => shape.destroy());
  }
  into.add(holder);
  return true;
}

/** Where a picture of `src` size goes so it covers `box`, `zoom` times larger, with (focusX, focusY) of it kept as central as the edges allow. */
function coverPlacement(src: { width: number; height: number }, box: Box, focusX: number, focusY: number, zoom: number): Box {
  const scale = Math.max(box.w / src.width, box.h / src.height) * zoom;
  const w = src.width * scale;
  const h = src.height * scale;
  const x = Phaser.Math.Clamp(box.x + box.w / 2 - focusX * w, box.x + box.w - w, box.x);
  const y = Phaser.Math.Clamp(box.y + box.h / 2 - focusY * h, box.y + box.h - h, box.y);
  return { x, y, w, h };
}

function coverImage(scene: Phaser.Scene, key: string, src: { width: number; height: number }, box: Box, fx: number, fy: number, zoom: number): Phaser.GameObjects.Image {
  const p = coverPlacement(src, box, fx, fy, zoom);
  return scene.add.image(p.x, p.y, key).setOrigin(0, 0).setDisplaySize(p.w, p.h);
}
