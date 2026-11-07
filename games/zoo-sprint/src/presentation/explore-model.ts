/**
 * Pure movement, camera and portal rules for the walkable Basecamp (Checkpoint W1). No Phaser, no DOM, no network, no
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
  /** Half-width of the gate opening: standing this close to the gate's center is "inside" it. */
  gateCoreRadius: number;
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
    groundY: Math.round(viewH * 0.85),
    startX: Math.round(Math.max(viewW * 0.3, unit * 0.25)),
    minX: Math.round(unit * 0.12),
    maxX: width - Math.round(unit * 0.12),
    landmarks: [
      { id: 'signpost', label: 'Rice Terraces', x: Math.round(width * 0.3), radius: Math.round(unit * 0.22) },
      { id: 'gate', label: 'Basecamp Gate', x: gateX, radius: Math.round(unit * 0.28) },
    ],
    clickX: gateX + Math.round(unit * 0.24),
    gateCoreRadius: Math.round(unit * 0.09),
    unit,
  };
}

/** Where a buddy coming back from a run stands: just outside the gate, facing it, so one step re-enters. */
export function returnSpawnX(world: WorldSpec): number {
  const gate = world.landmarks.find((l) => l.id === 'gate');
  return gate ? Math.max(world.minX, gate.x - Math.round(world.unit * 0.5)) : world.startX;
}

/** Standing inside the gate opening for this long starts the run. */
export const PORTAL_DWELL_MS = 420;

/**
 * Portal progress 0..1: fills while the buddy stands inside the gate opening (within gateCoreRadius)
 * and drains twice as fast when it steps out, so brushing past the gate never starts a run.
 */
export function stepPortal(progress: number, playerX: number, world: WorldSpec, dtMs: number): number {
  const inside = insideGate(playerX, world);
  const dt = Math.min(100, Math.max(0, dtMs));
  const next = inside ? progress + dt / PORTAL_DWELL_MS : progress - (2 * dt) / PORTAL_DWELL_MS;
  return Math.min(1, Math.max(0, next));
}

/** Touch control: holding the left half of the screen walks left, the right half walks right. */
export function heldDirection(pointerScreenX: number | null, viewW: number): Direction {
  if (pointerScreenX === null) return 0;
  return pointerScreenX < viewW / 2 ? -1 : 1;
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

/** Inside the gate opening the buddy slows to this share of top speed, so a walk-through becomes a walk-in. */
export const GATE_DRAG = 0.35;

/** True when `x` is inside the gate opening. */
export function insideGate(x: number, world: WorldSpec): boolean {
  const gate = world.landmarks.find((l) => l.id === 'gate');
  return !!gate && Math.abs(x - gate.x) <= world.gateCoreRadius;
}

/** Advances the player by dtMs. Smooth start and stop, clamped to the world, slower inside the gate. Deterministic. */
export function stepPlayer(state: PlayerState, dir: Direction, dtMs: number, world: WorldSpec): PlayerState {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  const top = world.unit * SPEED_PER_HEIGHT;
  const target = dir * top;
  const k = Math.min(1, dt / ACCEL_TIME_S);
  let vx = state.vx + (target - state.vx) * k;
  if (dir === 0 && Math.abs(vx) < 4) vx = 0;
  // the gate opening holds the buddy: speed is capped at once while inside it
  if (insideGate(state.x, world)) vx = Math.max(-top * GATE_DRAG, Math.min(top * GATE_DRAG, vx));
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

/** Keyboard first (both arrows held cancel out); otherwise the held screen half decides. */
export function inputDirection(keys: { left: boolean; right: boolean }, pointerScreenX: number | null, viewW: number): Direction {
  if (keys.left !== keys.right) return keys.left ? -1 : 1;
  if (keys.left && keys.right) return 0;
  return heldDirection(pointerScreenX, viewW);
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
