/**
 * Pure movement and camera rules for the exploration spike. No Phaser, no DOM, no network, no
 * storage: numbers in, numbers out, so the feel of walking is testable without a renderer.
 *
 * PRESENTATION ONLY. Walking around the expedition world is cosmetic movement of a picture on
 * screen. It never reads or changes questions, grading, mastery, XP, coins, progression or any
 * server state.
 */

export interface WorldSpec {
  /** Total walkable width of the world in px. */
  width: number;
  /** Viewport height the world was laid out for. */
  height: number;
  /** y of the ground line: characters stand here, hidden below it by the foreground ledge. */
  groundY: number;
  /** Where the player starts. */
  startX: number;
  /** Left and right limits for the player's x. */
  minX: number;
  maxX: number;
  landmarks: Landmark[];
  /** Click, the host, stands in the world next to the gate. */
  clickX: number;
  /** The length all distances scale with: the viewport height, but never more than 1.4 x its width, so a tall phone still feels close. */
  unit: number;
}

export interface Landmark {
  id: 'signpost' | 'gate';
  label: string;
  x: number;
  /** How close the player must be to be "at" the landmark. */
  radius: number;
}

export function worldSpec(viewW: number, viewH: number): WorldSpec {
  const unit = Math.min(viewH, viewW * 1.4);
  const width = Math.round(Math.max(unit * 6.5, viewW * 3));
  const gateX = Math.round(width * 0.62);
  return {
    width,
    height: viewH,
    groundY: Math.round(viewH * 0.8),
    startX: Math.round(Math.max(viewW * 0.3, unit * 0.25)),
    minX: Math.round(unit * 0.12),
    maxX: width - Math.round(unit * 0.12),
    landmarks: [
      { id: 'signpost', label: 'Rice Terraces', x: Math.round(width * 0.3), radius: Math.round(unit * 0.22) },
      { id: 'gate', label: 'Basecamp Gate', x: gateX, radius: Math.round(unit * 0.28) },
    ],
    clickX: gateX + Math.round(unit * 0.36),
    unit,
  };
}

export interface PlayerState {
  x: number;
  /** Current horizontal speed in px/s (signed). */
  vx: number;
  /** Which way the buddy faces: 1 = right, -1 = left. Keeps its last value when stopped. */
  facing: 1 | -1;
}

export type Direction = -1 | 0 | 1;

/** Top speed as a multiple of the viewport height per second. */
export const SPEED_PER_HEIGHT = 0.62;
const ACCEL_TIME_S = 0.14;

/** Advances the player by dtMs. Smooth start and stop, clamped to the world. Deterministic. */
export function stepPlayer(state: PlayerState, dir: Direction, dtMs: number, world: WorldSpec): PlayerState {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  const top = world.unit * SPEED_PER_HEIGHT;
  const target = dir * top;
  const k = Math.min(1, dt / ACCEL_TIME_S);
  let vx = state.vx + (target - state.vx) * k;
  if (dir === 0 && Math.abs(vx) < 4) vx = 0;
  let x = state.x + vx * dt;
  if (x <= world.minX) {
    x = world.minX;
    vx = Math.max(0, vx);
  } else if (x >= world.maxX) {
    x = world.maxX;
    vx = Math.min(0, vx);
  }
  const facing: 1 | -1 = dir !== 0 ? dir : state.facing;
  return { x, vx, facing };
}

/** Keyboard first; otherwise a held pointer walks toward where it is held (with a dead zone). */
export function inputDirection(keys: { left: boolean; right: boolean }, pointerWorldX: number | null, playerX: number, deadZone: number): Direction {
  if (keys.left !== keys.right) return keys.left ? -1 : 1;
  if (keys.left && keys.right) return 0;
  if (pointerWorldX === null) return 0;
  const delta = pointerWorldX - playerX;
  if (Math.abs(delta) <= deadZone) return 0;
  return delta < 0 ? -1 : 1;
}

/** The landmark the player is at, if any (the nearest one wins). */
export function nearLandmark(x: number, landmarks: readonly Landmark[]): Landmark | null {
  let best: Landmark | null = null;
  let bestDist = Infinity;
  for (const l of landmarks) {
    const d = Math.abs(x - l.x);
    if (d <= l.radius && d < bestDist) {
      best = l;
      bestDist = d;
    }
  }
  return best;
}

/** Where the camera wants to be: the player slightly off-center with a little look-ahead, never past the world's edges. */
export function cameraTargetScroll(playerX: number, facing: 1 | -1, viewW: number, worldW: number): number {
  const lookAhead = viewW * 0.08 * facing;
  const wanted = playerX + lookAhead - viewW / 2;
  return Math.min(Math.max(0, wanted), Math.max(0, worldW - viewW));
}

/** Eases the camera toward its target (frame-rate independent). */
export function easeCamera(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-Math.min(100, dtMs) / 1000 * 7);
  return current + (target - current) * k;
}
