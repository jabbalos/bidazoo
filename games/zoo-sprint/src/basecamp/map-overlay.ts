import Phaser from 'phaser';
import { getContext } from '../context';
import { ENCOUNTER_NODES, EXPEDITION_UNLOCKED_KEY, mapTiles, serverUnlockedIds, type DestinationManifest, type MapTile } from '../presentation/destination-model';
import { parchmentPanel, softShadow } from '../presentation/surfaces';
import type { BasecampScene } from '../scenes/BasecampScene';
import { EXP, EXP_CSS, mix } from '../theme';
import { BUTTON_STYLES, TapButton, text } from '../ui';
import { allDestinations, destinationById } from './destinations';
import { mapBoardLayout, type Rect } from './map-layout';
import { registerOverlay } from './overlays';

/**
 * The map board (B2): seven destination tiles from the manifests, opened from the map pavilion in
 * Basecamp through the overlay registry. Locked tiles show a silhouette and the unlock rule. Tapping
 * an unlocked tile opens the trailhead card; "start" begins the expedition (ExpeditionScene).
 *
 * Which destinations are unlocked comes ONLY from the server: the scene registry key
 * 'expeditionUnlocked' (an array of destination ids, set by the shell from the server's expedition
 * progress when the map opens). The manifest supplies only the lock-screen text. Until the key is set,
 * only Great Wall is open. When the key changes while the board is open, the tiles update in place.
 * PRESENTATION ONLY: unlocking here never grants anything, the server does.
 */
const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/** The sky colors of a destination, drawn as soft bands. */
function paintTileArt(g: Phaser.GameObjects.Graphics, r: Rect, m: DestinationManifest, locked: boolean): void {
  const far = m.layers[0]!.shapes[0];
  const stops = far && far.kind === 'gradient' ? far.stops : [{ at: 0, color: m.palette.colors[0]! }, { at: 1, color: m.palette.colors[1]! }];
  const top = hexNum(stops[0]!.color);
  const bottom = hexNum(stops[stops.length - 1]!.color);
  const bands = 7;
  const artH = r.h * 0.58;
  for (let i = 0; i < bands; i++) {
    let c = mix(top, bottom, i / (bands - 1));
    if (locked) c = mix(c, 0x6b7a8c, 0.7);
    g.fillStyle(c, 1);
    g.fillRect(r.x, r.y + (artH * i) / bands, r.w, artH / bands + 1);
  }
  // the silhouette: a ridge of two peaks in the destination's colors (dark and flat when locked)
  const peak = locked ? 0x2b3a4d : hexNum(m.palette.colors[0]!);
  const near = locked ? 0x1f2b3a : hexNum(m.palette.colors[1]!);
  g.fillStyle(peak, 1);
  g.fillTriangle(r.x + r.w * 0.05, r.y + artH, r.x + r.w * 0.32, r.y + artH * 0.28, r.x + r.w * 0.62, r.y + artH);
  g.fillStyle(near, 1);
  g.fillTriangle(r.x + r.w * 0.4, r.y + artH, r.x + r.w * 0.7, r.y + artH * 0.4, r.x + r.w * 0.98, r.y + artH);
  if (!locked) {
    g.fillStyle(hexNum(m.palette.accent), 1);
    g.fillCircle(r.x + r.w * 0.82, r.y + artH * 0.22, Math.max(4, r.h * 0.05));
  }
}

function open(scene: BasecampScene): Phaser.GameObjects.Container {
  const ctx = getContext(scene);
  const manifests = allDestinations();
  const readTiles = (): MapTile[] => mapTiles(manifests, serverUnlockedIds(scene.registry.get(EXPEDITION_UNLOCKED_KEY)));
  let tiles = readTiles();
  const root = scene.add.container(0, 0);
  const TAP_BUTTON_H = 48;
  // laid out again on every resize (a turn of the device); the open trailhead card survives it
  let L = mapBoardLayout(scene.scale.width, scene.scale.height, tiles.length);
  let surface: Phaser.GameObjects.Container | null = null;
  let card: Phaser.GameObjects.Container | null = null;
  let cardFor: DestinationManifest | null = null;

  const setA11y = (extra: Array<{ id: string; label: string; onClick: () => void }>): void =>
    ctx.a11y.set('Map board. Choose a destination to start an expedition.', [...extra, { id: 'map-close', label: 'Close the map', onClick: () => scene.closeOverlay() }]);

  const closeCard = (): void => {
    card?.destroy(true);
    card = null;
    cardFor = null;
    setA11yTiles();
  };

  const startExpedition = (m: DestinationManifest): void => {
    // the scene is registered by the game shell; without it nothing happens (never a half-start)
    if (!scene.scene.get('ExpeditionScene')) return;
    scene.closeOverlay();
    scene.scene.start('ExpeditionScene', { destination: m.id });
  };

  const openCard = (m: DestinationManifest): void => {
    const { width: w, height: h } = scene.scale;
    const unit = Math.min(w, h);
    card?.destroy(true);
    const c = scene.add.container(0, 0);
    card = c;
    cardFor = m;
    c.add(scene.add.rectangle(w / 2, h / 2, w, h, 0x0b2233, 0.35).setInteractive());
    const cw = Math.min(w * 0.9, unit * 1.1);
    const ch = Math.min(h * 0.8, cw * 0.95);
    const box: Rect = { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
    const g = scene.add.graphics();
    parchmentPanel(g, box, {});
    paintTileArt(g, { x: box.x + ch * 0.04, y: box.y + ch * 0.04, w: box.w - ch * 0.08, h: ch * 0.4 }, m, false);
    c.add(g);
    const name = text(scene, m.name, EXP_CSS.navy, { weight: 800, size: Math.round(Math.min(ch * 0.08, cw * 0.07)), align: 'center', wrapWidth: box.w * 0.86 }).setOrigin(0.5, 0);
    name.setPosition(box.x + box.w / 2, box.y + ch * 0.47);
    const line = text(scene, `Light ${ENCOUNTER_NODES} beacons, then reach the summit.`, EXP_CSS.muted, { weight: 700, size: Math.round(Math.min(ch * 0.055, cw * 0.05)), align: 'center', wrapWidth: box.w * 0.86 }).setOrigin(0.5, 0);
    line.setPosition(box.x + box.w / 2, name.y + name.height + ch * 0.02);
    c.add([name, line]);
    const bh = Math.max(TAP_BUTTON_H, Math.round(ch * 0.13));
    const bw = Math.round(box.w * 0.42);
    const by = box.y + box.h - bh * 0.5 - ch * 0.06;
    c.add(new TapButton(scene, 'trailhead-back', box.x + box.w * 0.27, by, bw, bh, 'Back', BUTTON_STYLES.card, closeCard));
    c.add(new TapButton(scene, 'trailhead-start', box.x + box.w * 0.73, by, bw, bh, 'Start', BUTTON_STYLES.primary, () => startExpedition(m)));
    root.add(c);
    ctx.a11y.set(`${m.name}. Light ${ENCOUNTER_NODES} beacons, then reach the summit.`, [
      { id: 'trailhead-start', label: `Start the ${m.name} expedition`, onClick: () => startExpedition(m) },
      { id: 'trailhead-back', label: 'Back to the map', onClick: closeCard },
    ]);
  };

  const drawTiles = (): void => {
    const into = surface;
    if (!into) return;
    into.removeAll(true);
    tiles.forEach((t: MapTile, i) => {
      const r = L.tiles[i]!;
      const m = destinationById(t.id)!;
      const cell = scene.add.container(r.x, r.y);
      const g = scene.add.graphics();
      softShadow(g, { x: 0, y: 0, w: r.w, h: r.h }, 14, 6, 0.25);
      g.fillStyle(t.unlocked ? EXP.brass : EXP.dimDeep, 1);
      g.fillRoundedRect(-2, -2, r.w + 4, r.h + 4, 14);
      // art, clipped to the tile by drawing inside it
      paintTileArt(g, { x: 0, y: 0, w: r.w, h: r.h }, m, !t.unlocked);
      g.fillStyle(t.unlocked ? EXP.parchment : EXP.dim, 1);
      g.fillRect(0, r.h * 0.58, r.w, r.h * 0.42);
      cell.add(g);
      const nameSize = Math.max(11, Math.round(Math.min(r.h * 0.12, r.w * 0.085)));
      const name = text(scene, t.name, t.unlocked ? EXP_CSS.navy : EXP_CSS.muted, { weight: 800, size: nameSize, align: 'center', wrapWidth: r.w * 0.92 }).setOrigin(0.5, 0);
      name.setPosition(r.w / 2, r.h * 0.6);
      cell.add(name);
      if (!t.unlocked) {
        const rule = text(scene, t.rule, EXP_CSS.muted, { weight: 700, size: Math.max(10, Math.round(nameSize * 0.82)), align: 'center', wrapWidth: r.w * 0.9 }).setOrigin(0.5, 0);
        rule.setPosition(r.w / 2, name.y + name.height + 2);
        cell.add(rule);
      }
      cell.setSize(r.w, r.h).setInteractive(new Phaser.Geom.Rectangle(0, 0, r.w, r.h), Phaser.Geom.Rectangle.Contains);
      if (t.unlocked) {
        cell.input!.cursor = 'pointer';
        cell.on('pointerup', () => openCard(m));
      }
      into.add(cell);
    });
  };

  const setA11yTiles = (): void =>
    setA11y(tiles.map((t) => ({ id: `map-tile-${t.id}`, label: t.unlocked ? `${t.name}. Open.` : `${t.name}. Locked. ${t.rule}`, onClick: () => { if (t.unlocked) openCard(destinationById(t.id)!); } })));
  // test and debugging hook: which tile is open or locked, and where each one is on screen
  const publishHook = (): void =>
    ctx.parent.setAttribute('data-map-tiles', JSON.stringify(tiles.map((t, i) => ({ id: t.id, unlocked: t.unlocked, x: Math.round(L.tiles[i]!.x), y: Math.round(L.tiles[i]!.y), w: L.tiles[i]!.w, h: L.tiles[i]!.h }))));

  /** The board for the current view: the dim, the panel, the title, Close and the tiles (and the card again, if one was open). */
  const layout = (): void => {
    const { width: w, height: h } = scene.scale;
    const unit = Math.min(w, h);
    L = mapBoardLayout(w, h, tiles.length);
    root.removeAll(true);
    card = null;
    // a dim backdrop that also swallows taps, so nothing behind the board is touched
    root.add(scene.add.rectangle(w / 2, h / 2, w, h, 0x0b2233, 0.55).setInteractive());
    const panel = scene.add.graphics();
    parchmentPanel(panel, L.panel, {});
    root.add(panel);
    const title = text(scene, 'Choose your expedition', EXP_CSS.navy, { weight: 800, size: Math.round(Math.min(L.title.h * 0.55, unit * 0.06)) }).setOrigin(0, 0.5);
    title.setPosition(L.title.x, L.title.y + L.title.h / 2);
    root.add(title);
    root.add(new TapButton(scene, 'map-close', L.close.x + L.close.w / 2, L.close.y + L.close.h / 2, L.close.w, L.close.h, 'X', BUTTON_STYLES.card, () => scene.closeOverlay(), 0.5));
    surface = scene.add.container(0, 0);
    root.add(surface);
    drawTiles();
    publishHook();
    if (cardFor) openCard(cardFor);
    else setA11yTiles();
  };
  layout();

  // the server's list changed while the board is open: update the tiles in place (no close and reopen)
  const onUnlockedChange = (_parent: unknown, key: string): void => {
    if (key !== EXPEDITION_UNLOCKED_KEY) return;
    tiles = readTiles();
    drawTiles();
    publishHook();
    if (!card) setA11yTiles();
  };
  // Phaser emits 'setdata' when the key is first set and 'changedata' when it changes later
  scene.registry.events.on('setdata', onUnlockedChange);
  scene.registry.events.on('changedata', onUnlockedChange);
  // a turn of the device: the same board, laid out for the new size (the scene no longer re-opens it)
  const onResize = (): void => {
    if (root.active) layout();
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  root.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.registry.events.off('setdata', onUnlockedChange);
    scene.registry.events.off('changedata', onUnlockedChange);
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    ctx.parent.removeAttribute('data-map-tiles');
  });

  // Unlocks come from the server's records (GET /api/v1/me/expedition), fetched when the board opens,
  // never at Basecamp start. The board only shows them (Gemini review 4, Medium): the server's
  // progress.unlocked goes into the registry and the listener above updates the tiles in place.
  const platform = ctx.platform;
  if (platform.getExpedition) {
    void platform
      .getExpedition()
      .then((progress) => {
        scene.registry.set(EXPEDITION_UNLOCKED_KEY, [...progress.unlocked]);
      })
      .catch(() => {
        // Offline or signed out: the board keeps what it drew (Great Wall, or the last server list).
      });
  }
  return root;
}

let registered = false;
/** Registers the map board once (the registry throws on a second registration). */
export function registerMapOverlay(): void {
  if (registered) return;
  registered = true;
  registerOverlay('map', { hotspot: 'map-board', open });
}

registerMapOverlay();
