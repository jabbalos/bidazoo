/**
 * Destination manifests and the pure rules of an expedition walk. No Phaser, no DOM, no network:
 * numbers in, numbers out, so every rule is testable without a renderer.
 *
 * A destination is DATA (proposal 2.2): `assets/world-expedition/destinations/<id>/manifest.json`
 * names its layers (far/mid/near), the path length in screens, the nodes along the path, the
 * challenger and the unlock rule. `ExpeditionScene` renders any manifest.
 *
 * PRESENTATION ONLY: nothing here decides a question, a grade, XP, coins, a stamp or a beacon.
 * Beacons lit and the stamp are the server's facts (SummitScene reads them from the session
 * results). The client's own win/lose marks below only light the path while it is walked.
 */
import type { WorldSpec } from './explore-model';

export const DESTINATION_IDS = [
  'great-wall',
  'petra-rose-canyon',
  'andes-cloud-terraces',
  'maya-jungle-observatory',
  'taj-garden',
  'nile-discovery-route',
  'philippine-highlands-harbor',
] as const;
export type KnownDestinationId = (typeof DESTINATION_IDS)[number];

/** Great Wall is the first real destination and is always unlocked. */
export const ALWAYS_UNLOCKED: KnownDestinationId = 'great-wall';

export type NodeType = 'encounter' | 'boss' | 'artifact' | 'rest';
export const NODE_TYPES: readonly NodeType[] = ['encounter', 'boss', 'artifact', 'rest'];

/** One expedition = five node encounters of two questions, then a boss of five (proposal 2.6 item 6). */
export const ENCOUNTER_NODES = 5;
export const NODE_QUESTIONS = 2;
export const BOSS_QUESTIONS = 5;
/** Stamp threshold (display wording only; the server decides). */
export const STAMP_BEACONS = 3;

export interface DestinationNode {
  id: string;
  /** Fraction along the path, 0 < at < 1. */
  at: number;
  type: NodeType;
}

export interface GradientStop {
  /** 0 = top of the layer, 1 = bottom. */
  at: number;
  color: string;
}

/** A shape painted into a layer, back to front. All code-drawn: no picture needed. */
export type LayerShape =
  | { kind: 'gradient'; stops: GradientStop[] }
  | {
      kind: 'ridge';
      /** Fill color at the top edge of the ridge. */
      color: string;
      /** Fill color at the bottom (defaults to `color`). */
      colorBottom?: string;
      /** Baseline height of the ridge (0 top .. 1 bottom). */
      base: number;
      /** Peak-to-baseline amplitude as a fraction of the layer height. */
      amp: number;
      /** Whole cycles per tile (at least 1), so the tile repeats without a seam. */
      waves: number;
      phase?: number;
    };

export interface LayerSpec {
  id: 'far' | 'mid' | 'near';
  /** 1 moves with the world; below 1 scrolls slower; above 1 passes faster (foreground). */
  parallax: number;
  /** Painted picture (a file in the destination folder), or null: the shapes are drawn instead (the fallback rule). */
  file: string | null;
  shapes: LayerShape[];
}

export interface Challenger {
  id: string;
  name: string;
  /** Kid-facing lines: PENDING owner approval (rule 14). */
  taunts: string[];
}

export interface DestinationManifest {
  id: string;
  name: string;
  /** Position on the map board, 1..7. */
  order: number;
  /** Path length in screens (view widths). */
  pathLength: number;
  /** Walk line (fraction of the view height) where feet stand. */
  groundY: number;
  palette: { colors: string[]; accent: string };
  layers: LayerSpec[];
  nodes: DestinationNode[];
  challenger: Challenger;
  unlock: {
    /** Unlocked from the first visit. Which ones: PENDING with the owner (Great Wall always is). */
    startsUnlocked: boolean;
    /** Destinations that need a passport stamp first. */
    requires: string[];
    /** Kid-facing rule shown on a locked tile: PENDING owner approval (rule 14). */
    rule: string;
  };
  audio: { track: string | null };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Every problem found in a raw manifest (empty = valid). Messages name the field. */
export function manifestProblems(raw: unknown): string[] {
  const out: string[] = [];
  const m = rec(raw);
  if (!m) return ['manifest is not an object'];
  if (!isStr(m['id']) || !/^[a-z][a-z0-9-]*$/.test(m['id'] as string)) out.push('id must be a lowercase slug');
  if (!isStr(m['name'])) out.push('name is required');
  if (!Number.isInteger(m['order']) || !isNum(m['order'], 1, 7)) out.push('order must be an integer 1..7');
  if (!isNum(m['pathLength'], 3, 12)) out.push('pathLength must be 3..12 screens');
  if (!isNum(m['groundY'], 0.5, 0.95)) out.push('groundY must be 0.5..0.95');
  const palette = rec(m['palette']);
  if (!palette || !Array.isArray(palette['colors']) || palette['colors'].length < 3 || palette['colors'].length > 5 || !palette['colors'].every(isHex)) out.push('palette.colors must be 3 to 5 hex colors');
  if (!palette || !isHex(palette['accent'])) out.push('palette.accent must be a hex color');

  const layers = m['layers'];
  if (!Array.isArray(layers) || layers.length !== 3) out.push('layers must be exactly far, mid, near');
  else {
    (['far', 'mid', 'near'] as const).forEach((id, i) => {
      const l = rec(layers[i]);
      if (!l || l['id'] !== id) return void out.push(`layers[${i}] must be "${id}"`);
      if (!isNum(l['parallax'], 0, 2)) out.push(`${id}.parallax must be 0..2`);
      if (l['file'] !== null && !(isStr(l['file']) && /\.(jpe?g|webp|png)$/.test(l['file']))) out.push(`${id}.file must be null or a picture file name`);
      const shapes = l['shapes'];
      if (!Array.isArray(shapes) || shapes.length === 0) return void out.push(`${id}.shapes must not be empty`);
      for (const [j, s] of shapes.entries()) {
        const sh = rec(s);
        if (!sh) out.push(`${id}.shapes[${j}] is not an object`);
        else if (sh['kind'] === 'gradient') {
          const stops = sh['stops'];
          const okStops = Array.isArray(stops) && stops.length >= 2 && stops.every((st) => { const r = rec(st); return !!r && isNum(r['at'], 0, 1) && isHex(r['color']); });
          if (!okStops) out.push(`${id}.shapes[${j}].stops need 2+ {at,color}`);
        } else if (sh['kind'] === 'ridge') {
          if (!isHex(sh['color']) || (sh['colorBottom'] !== undefined && !isHex(sh['colorBottom']))) out.push(`${id}.shapes[${j}] ridge colors must be hex`);
          if (!isNum(sh['base'], 0, 1) || !isNum(sh['amp'], 0, 0.5)) out.push(`${id}.shapes[${j}] base 0..1 and amp 0..0.5`);
          if (!Number.isInteger(sh['waves']) || !isNum(sh['waves'], 1, 16)) out.push(`${id}.shapes[${j}].waves must be a whole number 1..16 (seamless tile)`);
        } else out.push(`${id}.shapes[${j}].kind must be gradient or ridge`);
      }
    });
  }

  const nodes = m['nodes'];
  if (!Array.isArray(nodes)) out.push('nodes must be an array');
  else {
    const ids = new Set<string>();
    let last = 0;
    let encounters = 0;
    let bosses = 0;
    let bossAt = -1;
    for (const [i, n] of nodes.entries()) {
      const node = rec(n);
      if (!node || !isStr(node['id']) || !NODE_TYPES.includes(node['type'] as NodeType) || !isNum(node['at'], 0.02, 0.98)) {
        out.push(`nodes[${i}] needs id, type and at 0.02..0.98`);
        continue;
      }
      if (ids.has(node['id'])) out.push(`nodes[${i}] duplicate id ${node['id']}`);
      ids.add(node['id']);
      if (node['at'] <= last) out.push(`nodes[${i}] must come after the previous node`);
      last = node['at'];
      if (node['type'] === 'encounter') encounters += 1;
      if (node['type'] === 'boss') {
        bosses += 1;
        bossAt = node['at'];
      }
    }
    if (encounters !== ENCOUNTER_NODES) out.push(`exactly ${ENCOUNTER_NODES} encounter nodes are required`);
    if (bosses !== 1) out.push('exactly one boss node is required');
    if (bosses === 1 && bossAt < last) out.push('the boss must be the last node (the summit)');
  }

  const ch = rec(m['challenger']);
  if (!ch || !isStr(ch['id']) || !isStr(ch['name']) || !Array.isArray(ch['taunts']) || !ch['taunts'].every(isStr)) out.push('challenger needs id, name and taunts[]');
  const un = rec(m['unlock']);
  if (!un || typeof un['startsUnlocked'] !== 'boolean' || !Array.isArray(un['requires']) || !un['requires'].every(isStr) || !isStr(un['rule'])) out.push('unlock needs startsUnlocked, requires[] and rule');
  const au = rec(m['audio']);
  if (!au || !(au['track'] === null || isStr(au['track']))) out.push('audio.track must be null or a string');
  return out;
}

/** The validated manifest, or null when anything is wrong. */
export function parseDestinationManifest(raw: unknown): DestinationManifest | null {
  return manifestProblems(raw).length === 0 ? (raw as DestinationManifest) : null;
}

// ---------------------------------------------------------------------------
// Unlocking (map board)
// ---------------------------------------------------------------------------

/**
 * Unlocked when the manifest says it starts unlocked, when it is Great Wall, or when every
 * destination it requires has a stamp. `stamped` is whatever Lane C's progress reports; with no
 * progress the board shows only the destinations that start unlocked.
 */
export function isUnlocked(m: DestinationManifest, stamped: ReadonlySet<string> = new Set()): boolean {
  if (m.id === ALWAYS_UNLOCKED || m.unlock.startsUnlocked) return true;
  return m.unlock.requires.length > 0 && m.unlock.requires.every((id) => stamped.has(id));
}

export interface MapTile {
  id: string;
  name: string;
  order: number;
  unlocked: boolean;
  /** The unlock rule, for locked tiles. */
  rule: string;
}

/** The map board's tiles in board order, from the manifests. */
export function mapTiles(manifests: readonly DestinationManifest[], stamped: ReadonlySet<string> = new Set()): MapTile[] {
  return [...manifests]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ id: m.id, name: m.name, order: m.order, unlocked: isUnlocked(m, stamped), rule: m.unlock.rule }));
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/** The walkable world of a manifest for a view: `pathLength` screens wide, feet on the walk line. No landmarks (no gate). */
export function expeditionWorld(m: DestinationManifest, viewW: number, viewH: number): WorldSpec {
  const unit = Math.min(viewH, viewW * 1.4);
  const width = Math.round(viewW * m.pathLength);
  const edge = Math.round(Math.max(viewW * 0.12, unit * 0.12));
  return {
    width,
    height: viewH,
    groundY: Math.round(viewH * m.groundY),
    startX: edge,
    minX: edge,
    maxX: width - edge,
    landmarks: [],
    clickX: 0,
    gateCoreRadius: 0,
    unit,
  };
}

/** Where a node stands in the world, between the walking limits. */
export function nodeX(node: DestinationNode, world: WorldSpec): number {
  return Math.round(world.minX + node.at * (world.maxX - world.minX));
}

/**
 * Nodes, in the order they come, that are not done and that the buddy reached walking from `prevX`
 * to `x` (within `radius` of the step). A node reached once is marked done by the caller and never
 * triggers again.
 */
export function reachedNodes(prevX: number, x: number, nodes: ReadonlyArray<{ id: string; x: number }>, done: ReadonlySet<string>, radius: number): string[] {
  const lo = Math.min(prevX, x) - radius;
  const hi = Math.max(prevX, x) + radius;
  return nodes
    .filter((n) => !done.has(n.id) && n.x >= lo && n.x <= hi)
    .sort((a, b) => a.x - b.x)
    .map((n) => n.id);
}

export type NodeMark = 'won' | 'lost' | 'collected' | 'rested';

export interface WalkProgress {
  marks: Record<string, NodeMark>;
}

export const newWalk = (): WalkProgress => ({ marks: {} });

export function mark(p: WalkProgress, id: string, m: NodeMark): WalkProgress {
  return { marks: { ...p.marks, [id]: m } };
}

/** Beacons shown lit while walking: the client's own display of won encounters. The SUMMIT uses the server's count. */
export function beaconsShown(m: DestinationManifest, p: WalkProgress): number {
  return m.nodes.filter((n) => n.type === 'encounter' && p.marks[n.id] === 'won').length;
}

export function artifactsCollected(m: DestinationManifest, p: WalkProgress): number {
  return m.nodes.filter((n) => n.type === 'artifact' && p.marks[n.id] === 'collected').length;
}

export function artifactsTotal(m: DestinationManifest): number {
  return m.nodes.filter((n) => n.type === 'artifact').length;
}

export function questionsFor(type: NodeType): number {
  return type === 'boss' ? BOSS_QUESTIONS : NODE_QUESTIONS;
}

/** The next node the buddy has not finished, or null at the end of the path. */
export function nextNode(m: DestinationManifest, p: WalkProgress): DestinationNode | null {
  return m.nodes.find((n) => p.marks[n.id] === undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Layer drawing math
// ---------------------------------------------------------------------------

/**
 * Ridge outline points across one tile: a sum of two whole-cycle sines, so y at x = 0 equals y at
 * x = width (the tile repeats without a seam). Returns [x, y] pairs in px.
 */
export function ridgePoints(width: number, height: number, shape: { base: number; amp: number; waves: number; phase?: number }, step = 16): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const phase = shape.phase ?? 0;
  const n = Math.max(2, Math.round(width / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.sin((t * shape.waves + phase) * Math.PI * 2);
    const b = Math.sin((t * (shape.waves * 2 + 1) + phase * 1.7) * Math.PI * 2) * 0.35;
    pts.push([Math.round(t * width), Math.round(height * (shape.base - shape.amp * ((a + b) / 1.35)))]);
  }
  return pts;
}

/**
 * The server's beacons and stamp, read defensively from the session results. Lane C adds
 * `beaconsLit` and `stampEarned`; until they exist both read as "not known" and no stamp shows.
 */
export function serverExpedition(results: unknown): { beaconsLit: number | null; stampEarned: boolean } {
  const r = rec(results);
  const lit = r?.['beaconsLit'];
  const beaconsLit = typeof lit === 'number' && Number.isInteger(lit) && lit >= 0 && lit <= ENCOUNTER_NODES ? lit : null;
  // the stamp shows only when the server says so; never inferred from the client's own count
  const stampEarned = r?.['stampEarned'] === true && beaconsLit !== null && beaconsLit >= STAMP_BEACONS;
  return { beaconsLit, stampEarned };
}
