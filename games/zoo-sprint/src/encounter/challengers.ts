/// <reference path="../vite-glob.d.ts" />
import type Phaser from 'phaser';
import type { DestinationId } from '../session-client';

/** Same type as `ChallengerId` in ./index.ts (the 2.6 contract); declared here so this file does not load the Phaser overlay. */
type ChallengerId = string;

/**
 * Challenger definitions (proposal Lane A, item A6): the destination creatures a buddy faces in an
 * encounter. Each one has a code-drawn picture that always works, and an optional painted picture
 * that replaces it once the owner has approved and integrated one (docs/art-requests/<destination>/,
 * proposal section 11).
 *
 * Challengers are destination creatures, never starters: they are not selectable, not in the roster,
 * and never stand in for the child's buddy (Character Bible, LOCKED rules 1 and 4). Their designs,
 * names and taunt lines are PENDING owner approval (rules 13 and 14; see REPORT.md "Copy (PENDING)").
 *
 * Presentation only. Nothing here knows about questions, grading, XP, coins or stamps.
 */

/** How the challenger looks right now. Only the eyes change; the reactions (flinch, hop) are tweens. */
export type ChallengerPose = 'idle' | 'hit' | 'cheer';

export interface ChallengerDef {
  id: ChallengerId;
  destination: DestinationId;
  role: 'node' | 'boss';
  /** PENDING owner approval. */
  name: string;
  /** PENDING owner approval. One is shown when the encounter opens. */
  taunts: readonly string[];
  /** The code-drawn picture, feet at (0, 0), facing left, `height` pixels tall. */
  draw(g: Phaser.GameObjects.Graphics, height: number, pose: ChallengerPose): void;
}

// ---------------------------------------------------------------------------
// Code-drawn pictures
// ---------------------------------------------------------------------------

/** Great Wall palette (docs/visual/12-destination-worlds.md section 1) plus coat colors. PROVISIONAL. */
const GW = {
  ridge: 0x5c7c6b,
  ridgeDeep: 0x435d4f,
  stone: 0xb9a98a,
  mist: 0xdfe9e4,
  dawn: 0xf3d9a8,
  autumn: 0xd9822b,
  autumnDeep: 0xa95f17,
} as const;

const INK = 0x2b2620;

/** Points in a 200 x 200 design box (feet at y = 200, centered on x = 100) mapped to the picture's own coordinates. */
type Pen = {
  g: Phaser.GameObjects.Graphics;
  s: number;
  x(v: number): number;
  y(v: number): number;
};

function pen(g: Phaser.GameObjects.Graphics, height: number): Pen {
  const s = height / 200;
  return { g, s, x: (v) => (v - 100) * s, y: (v) => (v - 200) * s };
}

/** An outlined ellipse: an ink rim, then the fill. */
function blob(p: Pen, cx: number, cy: number, w: number, h: number, fill: number, rim = 3): void {
  const o = rim * p.s;
  p.g.fillStyle(INK, 1);
  p.g.fillEllipse(p.x(cx), p.y(cy), w * p.s + o * 2, h * p.s + o * 2);
  p.g.fillStyle(fill, 1);
  p.g.fillEllipse(p.x(cx), p.y(cy), w * p.s, h * p.s);
}

/** An outlined polygon. */
function shape(p: Pen, pts: number[], fill: number, rim = 3): void {
  const points = [];
  for (let i = 0; i < pts.length; i += 2) points.push({ x: p.x(pts[i] as number), y: p.y(pts[i + 1] as number) });
  p.g.fillStyle(fill, 1);
  p.g.fillPoints(points, true);
  p.g.lineStyle(rim * p.s, INK, 1);
  p.g.strokePoints(points, true);
}

/** A thick outlined stroke through points (tails, horns). */
function limb(p: Pen, pts: number[], width: number, fill: number, rim = 3): void {
  const path = (w: number, color: number): void => {
    p.g.lineStyle(w * p.s, color, 1);
    p.g.beginPath();
    p.g.moveTo(p.x(pts[0] as number), p.y(pts[1] as number));
    for (let i = 2; i < pts.length; i += 2) p.g.lineTo(p.x(pts[i] as number), p.y(pts[i + 1] as number));
    p.g.strokePath();
  };
  path(width + rim * 2, INK);
  path(width, fill);
  // round the ends
  for (const i of [0, pts.length - 2]) {
    p.g.fillStyle(INK, 1);
    p.g.fillCircle(p.x(pts[i] as number), p.y(pts[i + 1] as number), ((width + rim * 2) / 2) * p.s);
    p.g.fillStyle(fill, 1);
    p.g.fillCircle(p.x(pts[i] as number), p.y(pts[i + 1] as number), (width / 2) * p.s);
  }
}

/** Friendly eyes: open with a highlight; squeezed shut on a hit; happy arcs on a cheer. Never angry. */
function eye(p: Pen, cx: number, cy: number, r: number, iris: number, pose: ChallengerPose): void {
  const g = p.g;
  if (pose === 'idle') {
    g.fillStyle(INK, 1);
    g.fillCircle(p.x(cx), p.y(cy), (r + 1.5) * p.s);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(p.x(cx), p.y(cy), r * p.s);
    g.fillStyle(iris, 1);
    g.fillCircle(p.x(cx - r * 0.25), p.y(cy + r * 0.1), r * 0.68 * p.s);
    g.fillStyle(INK, 1);
    g.fillCircle(p.x(cx - r * 0.3), p.y(cy + r * 0.12), r * 0.4 * p.s);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(p.x(cx - r * 0.5), p.y(cy - r * 0.25), r * 0.22 * p.s);
    return;
  }
  g.lineStyle(2.6 * p.s, INK, 1);
  g.beginPath();
  if (pose === 'hit') {
    // a squeezed ">" shape: "oof", not hurt
    g.moveTo(p.x(cx - r), p.y(cy - r * 0.6));
    g.lineTo(p.x(cx + r * 0.5), p.y(cy));
    g.lineTo(p.x(cx - r), p.y(cy + r * 0.6));
  } else {
    g.arc(p.x(cx), p.y(cy + r * 0.3), r * p.s, Math.PI * 1.15, Math.PI * 1.85);
  }
  g.strokePath();
}

/** Great Wall node challenger: a sturdy golden takin (a goat-antelope of the Chinese mountains) in a ridge-green scarf. */
function drawTakin(g: Phaser.GameObjects.Graphics, height: number, pose: ChallengerPose): void {
  const p = pen(g, height);
  const coat = 0xd2a45e;
  const coatDeep = 0xa97a3c;
  const face = 0x6b4a2e;
  const horn = 0x4a3a2a;
  g.fillStyle(INK, 0.16);
  g.fillEllipse(p.x(106), p.y(197), 150 * p.s, 12 * p.s);
  // far legs, then the tail
  shape(p, [122, 138, 138, 138, 137, 190, 121, 190], coatDeep);
  shape(p, [80, 138, 96, 138, 96, 190, 80, 190], coatDeep);
  limb(p, [176, 108, 184, 122], 9, coatDeep);
  // body and hump
  blob(p, 114, 124, 132, 84, coat);
  blob(p, 128, 96, 70, 40, coat, 0);
  g.fillStyle(GW.dawn, 1);
  g.fillEllipse(p.x(110), p.y(146), 86 * p.s, 30 * p.s);
  // near legs with dark hooves
  for (const x0 of [58, 142]) {
    shape(p, [x0, 140, x0 + 22, 140, x0 + 21, 192, x0 + 1, 192], coat);
    shape(p, [x0 + 1, 184, x0 + 21, 184, x0 + 22, 194, x0, 194], face, 2);
  }
  // scarf (behind the head)
  shape(p, [66, 104, 98, 96, 102, 114, 70, 122], GW.ridge);
  shape(p, [88, 112, 101, 112, 104, 142, 91, 144], GW.ridgeDeep);
  // head: broad face and the dark arched nose
  limb(p, [50, 70, 38, 60, 30, 70], 8, horn);
  limb(p, [70, 68, 84, 56, 94, 64], 8, horn);
  shape(p, [80, 84, 98, 78, 88, 96], coatDeep);
  blob(p, 58, 96, 62, 56, coat);
  blob(p, 38, 112, 42, 34, face);
  g.fillStyle(INK, 1);
  g.fillCircle(p.x(26), p.y(114), 2.6 * p.s);
  eye(p, 54, 92, 7.5, 0x6a4a28, pose);
}

/** Great Wall boss: a snow leopard of the high ridges, sitting tall, in an autumn-orange scarf. */
function drawSnowLeopard(g: Phaser.GameObjects.Graphics, height: number, pose: ChallengerPose): void {
  const p = pen(g, height);
  const coat = 0xdcdcd2;
  const coatDeep = 0xb9b9ad;
  const cream = 0xf6f3ea;
  const spot = 0x5f625c;
  g.fillStyle(INK, 0.16);
  g.fillEllipse(p.x(112), p.y(197), 160 * p.s, 12 * p.s);
  // the long thick tail curling up behind
  limb(p, [150, 188, 178, 182, 190, 160, 186, 132, 172, 118], 20, coatDeep);
  for (const [x, y] of [[176, 182], [189, 152], [180, 126]] as const) {
    g.lineStyle(2.4 * p.s, spot, 1);
    g.strokeCircle(p.x(x), p.y(y), 4.5 * p.s);
  }
  // body, chest, legs
  blob(p, 122, 140, 104, 112, coat);
  g.fillStyle(cream, 1);
  g.fillEllipse(p.x(98), p.y(144), 46 * p.s, 76 * p.s);
  for (const [x, y, r] of [[140, 116, 6], [150, 142, 5], [132, 166, 6], [156, 166, 4.5], [124, 96, 4]] as const) {
    g.lineStyle(2.6 * p.s, spot, 1);
    g.strokeCircle(p.x(x), p.y(y), r * p.s);
  }
  for (const x0 of [70, 98]) {
    shape(p, [x0, 140, x0 + 22, 140, x0 + 21, 186, x0 + 1, 186], coat);
    blob(p, x0 + 10, 190, 32, 14, cream, 2.5);
  }
  // scarf
  shape(p, [56, 100, 108, 98, 110, 116, 58, 120], GW.autumn);
  shape(p, [92, 114, 106, 114, 112, 146, 98, 148], GW.autumnDeep);
  // head
  blob(p, 60, 42, 20, 20, coat);
  blob(p, 100, 42, 20, 20, coat);
  g.fillStyle(spot, 1);
  g.fillCircle(p.x(60), p.y(43), 5 * p.s);
  g.fillCircle(p.x(100), p.y(43), 5 * p.s);
  blob(p, 80, 72, 74, 66, coat);
  for (const [x, y] of [[104, 66], [96, 50], [68, 50]] as const) {
    g.fillStyle(spot, 1);
    g.fillCircle(p.x(x), p.y(y), 2.6 * p.s);
  }
  g.fillStyle(cream, 1);
  g.fillEllipse(p.x(68), p.y(88), 38 * p.s, 24 * p.s);
  shape(p, [62, 80, 74, 80, 68, 87], 0xa86e5e, 2);
  eye(p, 64, 68, 6.5, 0x7fb08a, pose);
  eye(p, 90, 68, 6.5, 0x7fb08a, pose);
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const CHALLENGERS: Readonly<Record<ChallengerId, ChallengerDef>> = Object.freeze({
  'great-wall-takin': {
    id: 'great-wall-takin',
    destination: 'great-wall',
    role: 'node',
    name: 'Ridge Takin',
    taunts: ['Can you climb past me?', 'These steps are mine to guard!', 'Show me your best math!'],
    draw: drawTakin,
  },
  'great-wall-snow-leopard': {
    id: 'great-wall-snow-leopard',
    destination: 'great-wall',
    role: 'boss',
    name: 'Summit Snow Leopard',
    taunts: ['Only the bravest reach the top!', 'Five questions stand between you and the summit.'],
    draw: drawSnowLeopard,
  },
});

/** The default challengers when a caller passes an id this build does not know. */
const DEFAULT_FOR: Readonly<Record<'node' | 'boss', ChallengerId>> = { node: 'great-wall-takin', boss: 'great-wall-snow-leopard' };

/** The definition for `id`; an unknown id gets the default node or boss challenger, so an encounter always has one. */
export function challengerFor(id: ChallengerId, kind: 'node' | 'boss'): ChallengerDef {
  return CHALLENGERS[id] ?? (CHALLENGERS[DEFAULT_FOR[kind]] as ChallengerDef);
}

// ---------------------------------------------------------------------------
// Painted pictures (optional): loaded like the painted expressions in character-art.ts
// ---------------------------------------------------------------------------

/**
 * Painted challenger files: `assets/world-expedition/destinations/<destination>/challengers/<challenger id>.webp|png`,
 * full body, facing left, transparent, feet on the bottom edge (docs/art-requests/<destination>/). Until a file is
 * approved and exported there, this finds nothing and the code-drawn picture ships. `import.meta.glob` emits exactly
 * the files present, content-hashed, never inlined.
 */
const PAINTED_FILES = import.meta.glob<string>('../../assets/world-expedition/destinations/*/challengers/*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const paintedUrls = new Map<ChallengerId, string>();
for (const [path, url] of Object.entries(PAINTED_FILES)) {
  const m = /\/destinations\/([a-z0-9-]+)\/challengers\/([a-z0-9-]+)\.(png|webp)$/.exec(path);
  const def = m ? CHALLENGERS[m[2] as string] : undefined;
  if (m && def && def.destination === m[1]) paintedUrls.set(def.id, url);
}

export function challengerTextureKey(id: ChallengerId): string {
  return `bz-we-challenger-${id}`;
}

/** The URL of a challenger's painted picture, or undefined when this build has none. */
export function paintedChallengerUrl(id: ChallengerId): string | undefined {
  return paintedUrls.get(id);
}

/** True when the painted picture of `id` is loaded and can replace the code-drawn one. */
export function hasPaintedChallenger(scene: Phaser.Scene, id: ChallengerId): boolean {
  return scene.textures.exists(challengerTextureKey(id));
}

/** Longest an encounter waits for painted challenger art before it opens with the code-drawn picture. */
export const CHALLENGER_LOAD_TIMEOUT_MS = 4000;

/**
 * Loads the painted pictures of `ids` that this build has and that are not loaded yet. Resolves when the
 * loader is done or the timeout passes, failed files included; never rejects: a missing picture never
 * stops a child from playing.
 */
export function loadChallengerArt(scene: Phaser.Scene, ids: readonly ChallengerId[]): Promise<void> {
  const loader = scene.load;
  let queued = 0;
  for (const id of ids) {
    const url = paintedUrls.get(id);
    if (url && !scene.textures.exists(challengerTextureKey(id))) {
      loader.image(challengerTextureKey(id), url);
      queued += 1;
    }
  }
  if (queued === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loader.off('complete', finish);
      resolve();
    };
    const timer = setTimeout(finish, CHALLENGER_LOAD_TIMEOUT_MS);
    loader.once('complete', finish);
    if (!loader.isLoading()) loader.start();
  });
}
