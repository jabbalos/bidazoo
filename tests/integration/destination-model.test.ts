import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALWAYS_UNLOCKED,
  DESTINATION_IDS,
  ENCOUNTER_NODES,
  artifactsCollected,
  artifactsTotal,
  beaconsShown,
  expeditionWorld,
  isUnlocked,
  manifestProblems,
  mapTiles,
  mark,
  newWalk,
  nextNode,
  nodeX,
  parseDestinationManifest,
  questionsFor,
  reachedNodes,
  ridgePoints,
  serverExpedition,
  summitFacts,
  type DestinationManifest,
} from '../../games/zoo-sprint/src/presentation/destination-model';
import { insideGate, stepPlayer } from '../../games/zoo-sprint/src/presentation/explore-model';

/**
 * Destination manifests (data) and the pure walk rules. The manifests are read from disk exactly as
 * shipped; nothing here touches Phaser, the browser or the server.
 */
const ROOT = join(fileURLToPath(new URL('../../', import.meta.url)), 'games/zoo-sprint/assets/world-expedition/destinations');
const load = (id: string): unknown => JSON.parse(readFileSync(join(ROOT, id, 'manifest.json'), 'utf8'));
const manifests = (): DestinationManifest[] => DESTINATION_IDS.map((id) => parseDestinationManifest(load(id))!);

describe('the seven shipped destination manifests', () => {
  it('has exactly the seven destination folders of docs/visual/12, each with a valid manifest', () => {
    const dirs = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory()).sort();
    expect(dirs).toEqual([...DESTINATION_IDS].sort());
    for (const id of DESTINATION_IDS) {
      expect(manifestProblems(load(id)), id).toEqual([]);
      expect(parseDestinationManifest(load(id))!.id).toBe(id);
    }
  });

  it('orders them 1 to 7 on the board and gives each five encounters, a boss last, and a challenger', () => {
    const all = manifests();
    expect(all.map((m) => m.order).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const m of all) {
      expect(m.nodes.filter((n) => n.type === 'encounter')).toHaveLength(ENCOUNTER_NODES);
      expect(m.nodes[m.nodes.length - 1]!.type).toBe('boss');
      expect(m.challenger.taunts.length).toBeGreaterThan(0);
      expect(m.layers.map((l) => l.id)).toEqual(['far', 'mid', 'near']);
    }
  });

  it('uses only the palette colors of docs/visual/12 as the destination palette (3 to 5 colors plus an accent)', () => {
    const doc = readFileSync(join(ROOT, '../../../../../docs/visual/12-destination-worlds.md'), 'utf8').toLowerCase();
    for (const m of manifests()) {
      for (const c of [...m.palette.colors, m.palette.accent]) expect(doc, `${m.id} ${c}`).toContain(c.toLowerCase());
    }
  });

  it('keeps Great Wall always unlocked and the rest of the unlocks as data (only Great Wall starts unlocked, owner decision)', () => {
    const all = manifests();
    expect(isUnlocked(all.find((m) => m.id === ALWAYS_UNLOCKED)!)).toBe(true);
    expect(all.filter((m) => isUnlocked(m)).map((m) => m.id)).toEqual(['great-wall']);
    // every locked one names a stamp it needs, and that destination exists
    for (const m of all.filter((x) => !x.unlock.startsUnlocked)) {
      expect(m.unlock.requires.length).toBeGreaterThan(0);
      for (const r of m.unlock.requires) expect(DESTINATION_IDS).toContain(r);
      expect(m.unlock.rule.length).toBeGreaterThan(0);
    }
  });

  it('ships gradient layers only for now: no picture files, so no provenance is needed', () => {
    for (const id of DESTINATION_IDS) {
      expect(readdirSync(join(ROOT, id)).filter((f) => /\.(png|jpe?g|webp)$/.test(f))).toEqual([]);
      for (const l of parseDestinationManifest(load(id))!.layers) {
        expect(l.file).toBeNull();
        expect(existsSync(join(ROOT, id, 'PROVENANCE.json'))).toBe(false);
      }
    }
  });
});

describe('manifest validation', () => {
  const good = (): Record<string, any> => structuredClone(load('great-wall') as Record<string, any>);
  it('accepts the shipped manifest and names the field of what it refuses', () => {
    expect(manifestProblems(good())).toEqual([]);
    const noBoss = good();
    noBoss.nodes = noBoss.nodes.filter((n: { type: string }) => n.type !== 'boss');
    expect(manifestProblems(noBoss).join()).toContain('boss');
    const early = good();
    early.nodes[early.nodes.length - 1].at = 0.3;
    expect(manifestProblems(early).join()).toMatch(/after the previous node|last node/);
    const four = good();
    four.nodes = four.nodes.filter((n: { id: string }) => n.id !== 'e5');
    expect(manifestProblems(four).join()).toContain('encounter');
    const badColor = good();
    badColor.palette.colors[0] = 'green';
    expect(manifestProblems(badColor).join()).toContain('palette.colors');
    const seam = good();
    seam.layers[1].shapes[0].waves = 2.5;
    expect(manifestProblems(seam).join()).toContain('whole number');
    const layers = good();
    layers.layers = layers.layers.slice(0, 2);
    expect(manifestProblems(layers).join()).toContain('layers');
    expect(parseDestinationManifest({})).toBeNull();
    expect(parseDestinationManifest(null)).toBeNull();
  });
});

describe('the map board tiles', () => {
  it('lists seven tiles in board order, one open, six locked with their rule', () => {
    const tiles = mapTiles(manifests());
    expect(tiles).toHaveLength(7);
    expect(tiles.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tiles.filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall']);
    for (const t of tiles.filter((x) => !x.unlocked)) expect(t.rule.length).toBeGreaterThan(5);
  });

  it('opens a locked destination once every destination it requires has a stamp', () => {
    const andes = manifests().find((m) => m.id === 'andes-cloud-terraces')!;
    expect(isUnlocked(andes)).toBe(false);
    expect(isUnlocked(andes, new Set(['petra-rose-canyon']))).toBe(false);
    expect(isUnlocked(andes, new Set(andes.unlock.requires))).toBe(true);
  });

  it('never locks Great Wall, even if its manifest said otherwise', () => {
    const gw = { ...manifests()[0]!, unlock: { startsUnlocked: false, requires: ['andes-cloud-terraces'], rule: 'x' } };
    expect(isUnlocked(gw)).toBe(true);
  });
});

describe('walking a manifest', () => {
  const gw = manifests().find((m) => m.id === 'great-wall')!;
  const world = expeditionWorld(gw, 800, 600);

  it('lays the path out as pathLength screens, inside walking limits, with feet on the walk line', () => {
    expect(world.width).toBe(800 * gw.pathLength);
    expect(world.minX).toBeGreaterThan(0);
    expect(world.maxX).toBeLessThan(world.width);
    expect(world.groundY).toBe(Math.round(600 * gw.groundY));
    expect(world.landmarks).toEqual([]);
    expect(insideGate(world.startX, world)).toBe(false); // no gate on a path: the portal can never fire
  });

  it('places nodes in order along the path and the boss at the far end', () => {
    const xs = gw.nodes.map((n) => nodeX(n, world));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]!).toBeGreaterThan(world.startX);
    expect(xs[xs.length - 1]!).toBeLessThan(world.maxX);
  });

  it('reaches a node once, in order, even when a step jumps past several', () => {
    const nodes = [{ id: 'a', x: 100 }, { id: 'b', x: 300 }, { id: 'c', x: 900 }];
    expect(reachedNodes(0, 50, nodes, new Set(), 10)).toEqual([]);
    expect(reachedNodes(0, 95, nodes, new Set(), 10)).toEqual(['a']);
    expect(reachedNodes(0, 500, nodes, new Set(), 10)).toEqual(['a', 'b']);
    expect(reachedNodes(0, 500, nodes, new Set(['a']), 10)).toEqual(['b']);
    expect(reachedNodes(500, 0, nodes, new Set(['a', 'b']), 10)).toEqual([]); // walking back triggers nothing new
  });

  it('reaches every node when walked at real speed, frame by frame, from start to summit', () => {
    const places = gw.nodes.map((n) => ({ id: n.id, x: nodeX(n, world) }));
    const radius = Math.round(world.unit * 0.05);
    const seen = new Set<string>();
    const order: string[] = [];
    let p = { x: world.startX, vx: 0, facing: 1 as 1 | -1 };
    for (let frame = 0; frame < 60 * 120 && seen.size < places.length; frame++) {
      const next = stepPlayer(p, 1, 16, world);
      for (const id of reachedNodes(p.x, next.x, places, seen, radius)) {
        seen.add(id);
        order.push(id);
      }
      p = next;
    }
    expect(order).toEqual(gw.nodes.map((n) => n.id));
  });

  it('asks 2 questions at an encounter and 5 at the boss', () => {
    expect(questionsFor('encounter')).toBe(2);
    expect(questionsFor('boss')).toBe(5);
  });

  it('counts the beacons shown and artifacts found from the walk, and finds the next stop', () => {
    let p = newWalk();
    expect(nextNode(gw, p)!.id).toBe(gw.nodes[0]!.id);
    p = mark(p, 'e1', 'won');
    p = mark(p, 'e2', 'lost');
    p = mark(p, 'a1', 'collected');
    expect(beaconsShown(gw, p)).toBe(1);
    expect(artifactsCollected(gw, p)).toBe(1);
    expect(artifactsTotal(gw)).toBe(4);
    expect(nextNode(gw, p)!.id).toBe('a2');
    for (const n of gw.nodes) p = mark(p, n.id, 'rested');
    expect(nextNode(gw, p)).toBeNull();
  });
});

describe('layer drawing math', () => {
  it('draws every ridge so its tile repeats without a seam', () => {
    for (const m of manifests()) {
      for (const l of m.layers) {
        for (const s of l.shapes) {
          if (s.kind !== 'ridge') continue;
          const pts = ridgePoints(1024, 600, s);
          expect(pts[0]![1], `${m.id} ${l.id}`).toBe(pts[pts.length - 1]![1]);
          expect(pts[pts.length - 1]![0]).toBe(1024);
        }
      }
    }
  });

  it('keeps a ridge with no amplitude perfectly flat (the walking ground)', () => {
    const ys = new Set(ridgePoints(1024, 600, { base: 0.82, amp: 0, waves: 1 }).map((p) => p[1]));
    expect([...ys]).toEqual([Math.round(600 * 0.82)]);
  });
});

describe('the summit reads beacons and the stamp only from the server', () => {
  const base = { correct: 12, total: 15, fluent: 3, xpEarned: 80, coinsEarned: 25, bonus: { xp: 0, coins: 0 }, newlyMastered: [], answers: [] };

  it('shows no beacons and no stamp while the results lack the server fields', () => {
    expect(serverExpedition(base)).toEqual({ beaconsLit: null, stampEarned: false });
    expect(serverExpedition(null)).toEqual({ beaconsLit: null, stampEarned: false });
    expect(summitFacts(base)).toMatchObject({ correct: 12, total: 15, xpEarned: 80, coinsEarned: 25, beaconsLit: null, stampEarned: false });
  });

  it('shows the server stamp only when 3 or more beacons are lit and the server says earned', () => {
    expect(serverExpedition({ ...base, beaconsLit: 3, stampEarned: true })).toEqual({ beaconsLit: 3, stampEarned: true });
    expect(serverExpedition({ ...base, beaconsLit: 2, stampEarned: false }).stampEarned).toBe(false);
    // a client never infers a stamp from a count, and a stamp claim without a valid count is ignored
    expect(serverExpedition({ ...base, beaconsLit: 4 }).stampEarned).toBe(false);
    expect(serverExpedition({ ...base, stampEarned: true }).stampEarned).toBe(false);
    expect(serverExpedition({ ...base, beaconsLit: 2, stampEarned: true }).stampEarned).toBe(false);
  });

  it('refuses out-of-range or non-integer beacon counts', () => {
    for (const bad of [-1, 6, 2.5, '3', NaN]) expect(serverExpedition({ ...base, beaconsLit: bad }).beaconsLit).toBeNull();
  });

  it('has no facts at all without results', () => {
    expect(summitFacts(null)).toBeNull();
  });
});
