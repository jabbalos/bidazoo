import { describe, expect, it } from 'vitest';
import {
  GATE_DRAG,
  PORTAL_DWELL_MS,
  SPEED_PER_HEIGHT,
  cameraTargetScroll,
  easeCamera,
  heldDirection,
  inputDirection,
  insideGate,
  nearLandmark,
  returnSpawnX,
  stepPlayer,
  stepPortal,
  worldSpec,
  type PlayerState,
} from '../../games/zoo-sprint/src/presentation/explore-model';

/**
 * Checkpoint W1: the walkable Basecamp's pure rules (no Phaser, no DOM). Everything here is
 * presentation: where a picture stands and when the gate opens. Nothing touches the server.
 */
const VIEWPORTS: Array<[number, number]> = [
  [360, 640],
  [390, 844],
  [412, 915],
  [820, 1180],
  [844, 390],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

/** Walks `ms` milliseconds in 16 ms frames. */
function walk(state: PlayerState, dir: -1 | 0 | 1, ms: number, world: ReturnType<typeof worldSpec>): PlayerState {
  let s = state;
  for (let t = 0; t < ms; t += 16) s = stepPlayer(s, dir, 16, world);
  return s;
}

describe('basecamp world layout', () => {
  it.each(VIEWPORTS)('%ix%i: the world is wider than the screen, the gate is far from the start and Click stands past it', (w, h) => {
    const world = worldSpec(w, h);
    expect(world.width).toBeGreaterThanOrEqual(w * 3);
    expect(world.minX).toBeLessThan(world.startX);
    expect(world.maxX).toBeLessThanOrEqual(world.width);
    const gate = world.landmarks.find((l) => l.id === 'gate')!;
    const sign = world.landmarks.find((l) => l.id === 'signpost')!;
    expect(sign.x).toBeGreaterThan(world.startX);
    expect(gate.x).toBeGreaterThan(sign.x + sign.radius + gate.radius);
    expect(gate.x - world.startX).toBeGreaterThan(h);
    expect(world.clickX).toBeGreaterThan(gate.x);
    expect(world.clickX).toBeLessThan(world.maxX);
    expect(world.gateCoreRadius).toBeLessThan(gate.radius);
    // the ground line leaves room for a whole-body character above the ledge
    expect(world.groundY).toBeGreaterThan(h * 0.7);
    expect(world.groundY).toBeLessThan(h);
  });

  it('a buddy returning from a run stands just outside the gate, inside the world', () => {
    for (const [w, h] of VIEWPORTS) {
      const world = worldSpec(w, h);
      const gate = world.landmarks.find((l) => l.id === 'gate')!;
      const x = returnSpawnX(world);
      expect(x).toBeGreaterThanOrEqual(world.minX);
      expect(x).toBeLessThan(gate.x - world.gateCoreRadius);
      expect(insideGate(x, world)).toBe(false);
      expect(nearLandmark(x, world.landmarks)?.id ?? null).not.toBe('signpost');
    }
  });
});

describe('walking', () => {
  const world = worldSpec(390, 844);

  it('accelerates smoothly to a top speed set by the screen, and glides to a stop', () => {
    let s: PlayerState = { x: world.startX, vx: 0, facing: 1 };
    s = stepPlayer(s, 1, 16, world);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vx).toBeLessThan(world.unit * SPEED_PER_HEIGHT);
    s = walk(s, 1, 600, world);
    expect(s.vx).toBeGreaterThan(world.unit * SPEED_PER_HEIGHT * 0.98);
    expect(s.vx).toBeLessThanOrEqual(world.unit * SPEED_PER_HEIGHT);
    const moving = s.x;
    s = walk(s, 0, 600, world);
    expect(s.vx).toBe(0);
    expect(s.x).toBeGreaterThan(moving);
    expect(s.x - moving).toBeLessThan(world.unit * 0.2);
  });

  it('is deterministic and frame-rate independent enough: 60 fps and 15 fps land within a step of each other', () => {
    const a = walk({ x: world.startX, vx: 0, facing: 1 }, 1, 2000, world);
    let b: PlayerState = { x: world.startX, vx: 0, facing: 1 };
    for (let t = 0; t < 2000; t += 66) b = stepPlayer(b, 1, 66, world);
    expect(Math.abs(a.x - b.x)).toBeLessThan(world.unit * 0.1);
  });

  it('never leaves the world and keeps facing the last direction when stopped', () => {
    let s = walk({ x: world.startX, vx: 0, facing: 1 }, -1, 5000, world);
    expect(s.x).toBe(world.minX);
    expect(s.vx).toBe(0);
    expect(s.facing).toBe(-1);
    s = walk(s, 0, 300, world);
    expect(s.facing).toBe(-1);
    s = walk(s, 1, 60_000, world);
    expect(s.x).toBe(world.maxX);
  });

  it('slows down inside the gate opening so a walk-through becomes a walk-in', () => {
    const gate = world.landmarks.find((l) => l.id === 'gate')!;
    const outside = stepPlayer({ x: gate.x - world.gateCoreRadius * 3, vx: world.unit * SPEED_PER_HEIGHT, facing: 1 }, 1, 16, world);
    const inside = stepPlayer({ x: gate.x, vx: world.unit * SPEED_PER_HEIGHT, facing: 1 }, 1, 16, world);
    expect(inside.vx).toBeLessThan(outside.vx);
    // a buddy that keeps walking spends at least the dwell time inside the opening
    let s: PlayerState = { x: gate.x - world.gateCoreRadius - 1, vx: world.unit * SPEED_PER_HEIGHT, facing: 1 };
    let msInside = 0;
    let progress = 0;
    let opened = false; // the scene starts the run the moment progress reaches 1
    for (let t = 0; t < 4000 && !(s.x > gate.x + world.gateCoreRadius); t += 16) {
      s = stepPlayer(s, 1, 16, world);
      if (insideGate(s.x, world)) msInside += 16;
      progress = stepPortal(progress, s.x, world, 16);
      if (progress >= 1) opened = true;
    }
    expect(msInside).toBeGreaterThanOrEqual(PORTAL_DWELL_MS * 1.5);
    expect(opened).toBe(true);
    expect(GATE_DRAG).toBeLessThan(0.5);
  });
});

describe('input', () => {
  it('keyboard wins over touch; both arrows cancel; a held screen half picks the direction', () => {
    expect(inputDirection({ left: true, right: false }, 300, 390)).toBe(-1);
    expect(inputDirection({ left: false, right: true }, 10, 390)).toBe(1);
    expect(inputDirection({ left: true, right: true }, 300, 390)).toBe(0);
    expect(inputDirection({ left: false, right: false }, null, 390)).toBe(0);
    expect(heldDirection(100, 390)).toBe(-1);
    expect(heldDirection(300, 390)).toBe(1);
    expect(heldDirection(194, 390)).toBe(-1);
    expect(heldDirection(195, 390)).toBe(1);
  });
});

describe('landmarks and the portal', () => {
  const world = worldSpec(360, 640);
  const gate = world.landmarks.find((l) => l.id === 'gate')!;

  it('names the landmark the buddy is at, nearest first, and nothing in between', () => {
    expect(nearLandmark(world.startX, world.landmarks)).toBeNull();
    expect(nearLandmark(gate.x + gate.radius * 0.5, world.landmarks)?.id).toBe('gate');
    expect(nearLandmark(gate.x + gate.radius + 1, world.landmarks)).toBeNull();
  });

  it('fills while standing in the opening, drains faster when stepping out, and never overshoots', () => {
    let p = 0;
    for (let t = 0; t < PORTAL_DWELL_MS - 16; t += 16) p = stepPortal(p, gate.x, world, 16);
    expect(p).toBeGreaterThan(0.9);
    expect(p).toBeLessThan(1);
    p = stepPortal(p, gate.x, world, 16);
    expect(p).toBe(1);
    p = stepPortal(p, gate.x, world, 1000);
    expect(p).toBe(1);
    const half = stepPortal(0.5, gate.x + world.gateCoreRadius + 1, world, 16);
    const fill = stepPortal(0.5, gate.x, world, 16);
    expect(0.5 - half).toBeCloseTo((fill - 0.5) * 2, 6);
    expect(stepPortal(0.1, gate.x + world.gateCoreRadius + 1, world, 10_000)).toBe(0);
  });

  it('brushing past the edge of the gate radius never opens the portal', () => {
    let p = 0;
    const x = gate.x - gate.radius * 0.8; // "near" the gate, not inside the opening
    expect(nearLandmark(x, world.landmarks)?.id).toBe('gate');
    for (let t = 0; t < 10_000; t += 16) p = stepPortal(p, x, world, 16);
    expect(p).toBe(0);
  });
});

describe('camera', () => {
  it('keeps the buddy a little off-center toward where it faces and never shows past the world', () => {
    const world = worldSpec(390, 844);
    expect(cameraTargetScroll(world.startX, 1, 390, world.width)).toBe(0);
    const mid = world.width / 2;
    expect(cameraTargetScroll(mid, 1, 390, world.width)).toBeGreaterThan(cameraTargetScroll(mid, -1, 390, world.width));
    expect(cameraTargetScroll(world.maxX, 1, 390, world.width)).toBe(world.width - 390);
    let c = 0;
    for (let i = 0; i < 120; i++) c = easeCamera(c, 1000, 16);
    expect(c).toBeGreaterThan(990);
    expect(c).toBeLessThanOrEqual(1000);
  });
});
