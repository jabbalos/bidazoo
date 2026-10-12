import Phaser from 'phaser';
import { COLORS } from './theme';

export type AnimalKind = 'panda' | 'monkey' | 'lion';

export const ANIMALS: ReadonlyArray<{ kind: AnimalKind; name: string }> = [
  { kind: 'panda', name: 'Panda' },
  { kind: 'monkey', name: 'Monkey' },
  { kind: 'lion', name: 'Lion' },
];

export function isAnimalKind(value: unknown): value is AnimalKind {
  return ANIMALS.some((animal) => animal.kind === value);
}

/** Placeholder art: simple shapes only. Real artwork replaces this later without touching game logic. */
export function drawAnimal(g: Phaser.GameObjects.Graphics, kind: AnimalKind, r: number): void {
  g.clear();
  const eyes = (dx: number, dy: number, eyeR: number) => {
    for (const side of [-1, 1]) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(side * dx, dy, eyeR);
      g.fillStyle(0x111111, 1);
      g.fillCircle(side * dx, dy + eyeR * 0.1, eyeR * 0.55);
    }
  };

  if (kind === 'panda') {
    g.fillStyle(0x111111, 1);
    g.fillCircle(-r * 0.74, -r * 0.74, r * 0.34);
    g.fillCircle(r * 0.74, -r * 0.74, r * 0.34);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(Math.max(2, r * 0.05), 0xd8d8d8, 1);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0x111111, 1);
    g.fillEllipse(-r * 0.4, -r * 0.05, r * 0.4, r * 0.52);
    g.fillEllipse(r * 0.4, -r * 0.05, r * 0.4, r * 0.52);
    eyes(r * 0.4, -r * 0.08, r * 0.1);
    g.fillStyle(0x111111, 1);
    g.fillEllipse(0, r * 0.28, r * 0.3, r * 0.2);
    return;
  }

  if (kind === 'monkey') {
    g.fillStyle(0x8b5a2b, 1);
    g.fillCircle(-r * 1.0, 0, r * 0.34);
    g.fillCircle(r * 1.0, 0, r * 0.34);
    g.fillStyle(0xe8c39e, 1);
    g.fillCircle(-r * 1.0, 0, r * 0.2);
    g.fillCircle(r * 1.0, 0, r * 0.2);
    g.fillStyle(0x8b5a2b, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(0xe8c39e, 1);
    g.fillEllipse(0, r * 0.22, r * 1.3, r * 1.1);
    g.fillCircle(-r * 0.3, -r * 0.1, r * 0.3);
    g.fillCircle(r * 0.3, -r * 0.1, r * 0.3);
    eyes(r * 0.3, -r * 0.1, r * 0.12);
    g.fillStyle(0x5a3a1a, 1);
    g.fillCircle(-r * 0.08, r * 0.28, r * 0.05);
    g.fillCircle(r * 0.08, r * 0.28, r * 0.05);
    g.lineStyle(Math.max(2, r * 0.05), 0x5a3a1a, 1);
    g.beginPath();
    g.arc(0, r * 0.38, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokePath();
    return;
  }

  // lion
  g.fillStyle(0xc9731f, 1);
  g.fillCircle(0, 0, r * 1.28);
  g.fillStyle(0xe08a2d, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillCircle(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, r * 0.34);
  }
  g.fillStyle(0xf6c667, 1);
  g.fillCircle(-r * 0.62, -r * 0.7, r * 0.2);
  g.fillCircle(r * 0.62, -r * 0.7, r * 0.2);
  g.fillCircle(0, 0, r * 0.88);
  eyes(r * 0.32, -r * 0.14, r * 0.11);
  g.fillStyle(0xfbe6b0, 1);
  g.fillEllipse(0, r * 0.3, r * 0.7, r * 0.5);
  g.fillStyle(0xd4577a, 1);
  g.fillTriangle(-r * 0.12, r * 0.12, r * 0.12, r * 0.12, 0, r * 0.26);
  g.lineStyle(Math.max(2, r * 0.05), 0x7a4a14, 1);
  g.beginPath();
  g.arc(0, r * 0.34, r * 0.18, 0.1 * Math.PI, 0.9 * Math.PI);
  g.strokePath();
}

export class Animal extends Phaser.GameObjects.Container {
  private readonly art: Phaser.GameObjects.Graphics;
  private radius = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: AnimalKind, radius: number) {
    super(scene, x, y);
    this.art = scene.add.graphics();
    this.add(this.art);
    scene.add.existing(this);
    this.setRadius(radius);
  }

  setRadius(radius: number): this {
    if (Math.abs(radius - this.radius) > 0.5) {
      this.radius = radius;
      drawAnimal(this.art, this.kind, radius);
    }
    return this;
  }

  /** A happy hop. */
  celebrate(): void {
    this.scene.tweens.add({
      targets: this,
      y: this.y - this.radius * 0.9,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** A gentle head shake. Deliberately mild: a miss is not a punishment. */
  wobble(): void {
    this.scene.tweens.add({
      targets: this,
      angle: { from: -9, to: 9 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setAngle(0),
    });
  }
}

export { COLORS };
