import Phaser from 'phaser';
import { walkPicture, type PaintedPose } from '../basecamp-art';
import { castPresence } from '../character-definitions';
import { Character } from '../characters';
import type { CharacterId } from '../roster';

/** Shared by BasecampScene and ExpeditionScene (extracted from BasecampScene, not copied). */
export const WALKER_MAX_UPSCALE = 1.3;
/** Painted walking pictures are made large; past 2x they would only get blurrier. */
export const PAINTED_MAX_UPSCALE = 2;

/**
 * The walking buddy: one full-body picture, flipped to face the way it walks, animated as a puppet
 * (a step bob, a lean into the walk, a little squash on each footfall, dust at the feet). Falls back
 * to the expression-art Character when the walking picture is not available.
 */
export class Walker extends Phaser.GameObjects.Container {
  readonly id: CharacterId | 'click';
  readonly painted: boolean;
  private readonly figure: Phaser.GameObjects.Image | Character;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  readonly bodyH: number;
  readonly bodyW: number;
  /** The picture's resting scale; every per-frame squash is computed from this, never compounded. */
  private readonly baseScale: number;
  private clock = 0;
  private lastStepSign = 1;
  private idleClock = Math.random() * 10;

  constructor(scene: Phaser.Scene, id: CharacterId | 'click', targetH: number, maxW: number, pose: PaintedPose = 'walk_side') {
    super(scene, 0, 0);
    this.id = id;
    const pic = walkPicture(scene, id, pose);
    this.painted = !!pic?.painted;
    if (pic) {
      // anchored at the feet: the bottom-center of the opaque body (painted art may carry padding)
      const { box } = pic;
      const img = scene.add.image(0, 0, pic.key).setOrigin((box.x + box.w / 2) / pic.width, (box.y + box.h) / pic.height);
      // painted pictures are all trimmed to one height, so the approved cast-relative presence
      // (Eagle largest ... Tarsier smallest, castPresence) is applied here; the canonical side views
      // keep their W1 sizing unchanged
      const h = pic.painted ? targetH * castPresence(id) : targetH;
      const scale = Math.min(h / box.h, maxW / box.w, pic.painted ? PAINTED_MAX_UPSCALE : WALKER_MAX_UPSCALE);
      img.setScale(scale);
      this.figure = img;
      this.baseScale = scale;
      this.bodyH = box.h * scale;
      this.bodyW = box.w * scale;
    } else {
      // No walking picture: the head-and-shoulders art stands in, sized the same way.
      const c = new Character(scene, 0, 0, id, 100);
      c.placeInBox(-maxW / 2, -targetH, maxW, targetH, { visibleHeight: targetH * 0.8, fillWidth: 0.95, maxScale: 3.4, overlap: 0 });
      c.setExpression('idle');
      this.figure = c;
      this.baseScale = 1;
      this.bodyH = targetH;
      this.bodyW = maxW;
    }
    this.shadow = scene.add.ellipse(0, 0, this.bodyW * 0.7, this.bodyH * 0.08, 0x2a1a08, 0.22);
    this.add([this.shadow, this.figure]);
    scene.add.existing(this);
  }

  /** Face +1 (right) or -1 (left). The canonical pictures face right. */
  face(dir: 1 | -1): void {
    if (this.figure instanceof Phaser.GameObjects.Image) this.figure.setFlipX(dir === -1);
    else this.figure.setScale(dir * Math.abs(this.figure.scaleX), this.figure.scaleY);
  }

  /**
   * One animation step. `speed` is 0..1 of top speed. Returns true on a footfall (for dust).
   * With reduced motion the picture slides without bobbing.
   */
  puppet(deltaMs: number, speed: number, facing: 1 | -1, reduced: boolean): boolean {
    this.idleClock += deltaMs / 1000;
    if (reduced) {
      this.figure.setPosition(0, 0);
      this.figure.setRotation(0);
      return false;
    }
    const moving = speed > 0.08;
    if (moving) this.clock += (deltaMs / 1000) * (7 + 5 * speed);
    const stepPhase = Math.sin(this.clock);
    const bob = moving ? Math.abs(stepPhase) * this.bodyH * 0.055 * speed : 0;
    const breathe = moving ? 0 : Math.sin(this.idleClock * 1.6) * 0.012;
    const squash = moving ? Math.abs(Math.cos(this.clock)) * 0.035 * speed : 0;
    this.figure.setPosition(0, -bob);
    if (this.figure instanceof Phaser.GameObjects.Image) {
      this.figure.setScale(this.baseScale * (1 + squash * 0.6), this.baseScale * (1 - squash + breathe));
    }
    this.figure.setRotation(moving ? stepPhase * 0.06 * facing : 0);
    this.shadow.setScale(1 - bob / Math.max(1, this.bodyH) * 2, 1);
    this.shadow.setAlpha(0.22 - (bob / Math.max(1, this.bodyH)) * 1.2);
    const sign = stepPhase >= 0 ? 1 : -1;
    const footfall = moving && sign !== this.lastStepSign;
    this.lastStepSign = sign;
    return footfall;
  }

  hop(): void {
    this.scene.tweens.add({ targets: this.figure, y: -this.bodyH * 0.12, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
  }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }
}
