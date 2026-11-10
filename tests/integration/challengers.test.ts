import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHALLENGERS, challengerFor, challengerTextureKey, paintedChallengerUrl, type ChallengerPose } from '../../games/zoo-sprint/src/encounter/challengers';
import { STARTERS } from '../../games/zoo-sprint/src/roster';

/**
 * Challenger definitions (A6). The code-drawn pictures are checked with a recording stand-in for
 * Phaser's Graphics (Phaser cannot load in Node): every shape is finite, stands on the ground line,
 * stays inside its box, and the face is on the left (facing the buddy).
 */

type Point = { x: number; y: number };

class RecordingGraphics {
  readonly points: Point[] = [];
  /** x of every eye-sized white circle (the eye whites), to tell which way the face looks. */
  readonly whites: number[] = [];
  private fill = 0;
  fillStyle(color: number): this {
    this.fill = color;
    return this;
  }
  lineStyle(): this {
    return this;
  }
  private add(...pts: Point[]): void {
    for (const p of pts) this.points.push(p);
  }
  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.add({ x: x - w / 2, y: y - h / 2 }, { x: x + w / 2, y: y + h / 2 });
    return this;
  }
  fillCircle(x: number, y: number, r: number): this {
    if (this.fill === 0xffffff && r > 3) this.whites.push(x);
    this.add({ x: x - r, y: y - r }, { x: x + r, y: y + r });
    return this;
  }
  strokeCircle(x: number, y: number, r: number): this {
    return this.fillCircle(x, y, r);
  }
  fillPoints(pts: Point[]): this {
    this.add(...pts);
    return this;
  }
  strokePoints(pts: Point[]): this {
    return this.fillPoints(pts);
  }
  beginPath(): this {
    return this;
  }
  moveTo(x: number, y: number): this {
    this.add({ x, y });
    return this;
  }
  lineTo(x: number, y: number): this {
    return this.moveTo(x, y);
  }
  arc(x: number, y: number, r: number): this {
    this.add({ x: x - r, y: y - r }, { x: x + r, y: y + r });
    return this;
  }
  strokePath(): this {
    return this;
  }
}

const HEIGHT = 300;
const POSES: ChallengerPose[] = ['idle', 'hit', 'cheer'];

describe('challengers', () => {
  it('the Great Wall has a node challenger and a boss, and neither is a starter or Click', () => {
    const greatWall = Object.values(CHALLENGERS).filter((c) => c.destination === 'great-wall');
    expect(greatWall.map((c) => c.role).sort()).toEqual(['boss', 'node']);
    const starters = new Set<string>([...STARTERS.map((s) => s.id), 'click']);
    for (const c of Object.values(CHALLENGERS)) {
      expect(starters.has(c.id)).toBe(false);
      expect(c.id.startsWith(`${c.destination}-`)).toBe(true);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.taunts.length).toBeGreaterThan(0);
    }
  });

  it('an unknown id gets the default challenger for its kind, so an encounter always has one', () => {
    expect(challengerFor('no-such-challenger', 'node').role).toBe('node');
    expect(challengerFor('no-such-challenger', 'boss').role).toBe('boss');
    expect(challengerFor('great-wall-snow-leopard', 'node').id).toBe('great-wall-snow-leopard');
  });

  it('every code-drawn picture, in every pose, stands on the ground inside its box and faces left', () => {
    for (const c of Object.values(CHALLENGERS)) {
      for (const pose of POSES) {
        const g = new RecordingGraphics();
        c.draw(g as unknown as Phaser.GameObjects.Graphics, HEIGHT, pose);
        const label = `${c.id} ${pose}`;
        expect(g.points.length, label).toBeGreaterThan(20);
        for (const p of g.points) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y), label).toBe(true);
          expect(Math.abs(p.x), label).toBeLessThanOrEqual(HEIGHT * 0.62);
          expect(p.y, label).toBeLessThanOrEqual(HEIGHT * 0.02);
          expect(p.y, label).toBeGreaterThanOrEqual(-HEIGHT * 1.02);
        }
        const bottom = Math.max(...g.points.map((p) => p.y));
        expect(bottom, `${label}: feet on the ground line`).toBeGreaterThan(-HEIGHT * 0.06);
        if (pose === 'idle') {
          expect(g.whites.length, label).toBeGreaterThan(0);
          expect(Math.max(...g.whites), `${label}: eyes on the left half`).toBeLessThan(0);
        }
      }
    }
  });

  it('no painted challenger is in this build yet: the code-drawn pictures ship (art requests are pending)', () => {
    for (const c of Object.values(CHALLENGERS)) {
      expect(paintedChallengerUrl(c.id)).toBeUndefined();
      expect(challengerTextureKey(c.id)).toBe(`bz-we-challenger-${c.id}`);
    }
  });

  it('challenger code is presentation only: no network, storage, grading, XP or coins', () => {
    const file = fileURLToPath(new URL('../../games/zoo-sprint/src/encounter/challengers.ts', import.meta.url));
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|platform|submitAnswer|xp|coins)\b/i);
  });
});
