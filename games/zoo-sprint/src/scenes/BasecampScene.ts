import Phaser from 'phaser';
import { HOST_DEFINITION } from '../character-definitions';
import { getContext } from '../context';
import {
  cameraTargetScroll,
  easeCamera,
  nearLandmark,
  paintedWorldSpec,
  returnSpawnX,
  stepPlayer,
  stepPortal,
  worldSpec,
  type PlayerState,
  type WorldSpec,
} from '../presentation/explore-model';
import { buildMedallion } from '../presentation/hero-stage';
import { HOTSPOT_PROMPTS, overlaysAt, type OverlayHotspot, type OverlayId } from '../basecamp/overlays';
import '../basecamp/map-overlay';
import { hotspotPlaces, interactionAt, type HotspotPlace, type Interaction } from '../presentation/hotspot-model';
import { ParallaxLayers } from '../presentation/parallax';
import { Walker } from '../presentation/walker';
import { WalkInput, spawnDust } from '../presentation/walk-input';
import { prefersReducedMotion } from '../presentation/motion';
import { parchmentPanel, pill, ribbon, softShadow } from '../presentation/surfaces';
import { BUDDY_PROFILES } from '../presentation/traits';
import { LEDGE_MARGIN, bakeGate, bakeSignpost, bakeWorldLayers } from '../presentation/world-layers';
import { characterName, type CharacterId } from '../roster';
import { EXP, EXP_CSS } from '../theme';
import { publishSurface, text, type HitTarget } from '../ui';
import { backdropManifest, backdropTextureKey, hasPaintedBackdrop, loadBasecampArt } from '../basecamp-art';
import { backdropX, backdropY, layoutBackdrop, DEFAULT_WALKER_HEIGHT } from '../presentation/backdrop-model';
import { hasWalkArt } from '../walk-art';

/**
 * Expedition Basecamp (Checkpoint W1): the home of the game after "Choose Your Buddy".
 *
 * The chosen buddy stands in the World Expedition scenery as a whole body and walks left or right
 * (hold either half of the screen, or the arrow keys). The camera follows through layered terraces.
 * Click, the host, waits beside the Basecamp Gate. Walking INTO the gate opening is the portal: the
 * screen warms up and the Zoo Sprint run starts, exactly the run the server already owns. Results
 * bring the buddy back here, just outside the gate.
 *
 * PRESENTATION ONLY. Nothing here talks to the server, reads or decides questions, XP, coins,
 * mastery or progression. Walking is the movement of a picture. The gate only starts the same
 * RunScene the old "Choose" button started.
 */
const PARALLAX = { ridgeFar: 0.08, ridgeNear: 0.16, terraceFar: 0.32, lanterns: 0.55, terraceMid: 0.7 } as const;
const CANOPY_FACTOR = 1.25;
/** Walking picture height as a share of the screen height, capped by width and by source sharpness. */
const WALKER_HEIGHT = DEFAULT_WALKER_HEIGHT;

interface PaintedStage {
  layout: ReturnType<typeof layoutBackdrop>;
  world: WorldSpec;
  keys: string[];
  gateTopY: number;
  walkerHeight: number;
}

export interface BasecampEntry {
  /** Where the buddy appears: the trailhead (first visit) or just outside the gate (back from a run). */
  from?: 'trailhead' | 'gate';
}

export class BasecampScene extends Phaser.Scene {
  private world!: WorldSpec;
  private player: PlayerState = { x: 0, vx: 0, facing: 1 };
  private camX = 0;
  private buddy: Walker | null = null;
  private click: Walker | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private parallax = new ParallaxLayers();
  private hud: Phaser.GameObjects.Container | null = null;
  private chip: Phaser.GameObjects.Container | null = null;
  private chipTarget: HitTarget | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleW = 0;
  private gateGlow: Phaser.GameObjects.Ellipse | null = null;
  private gateX = 0;
  /** Painted backdrop layers on screen (0 = the code-drawn fallback). */
  private backdropLayers = 0;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private walkInput!: WalkInput;
  private places: HotspotPlace[] = [];
  private overlay: { id: OverlayId; container: Phaser.GameObjects.Container } | null = null;
  private chipKind: string | null = null;
  private paintedStage = false;
  private moved = false;
  private portal = 0;
  private leaving = false;
  private lastNear: string | null = null;
  private lastPublish = '';
  private ready = false;
  private entry: BasecampEntry = {};
  private reduced = false;

  constructor() {
    super('BasecampScene');
  }

  init(data: BasecampEntry): void {
    this.entry = data ?? {};
    this.player = { x: 0, vx: 0, facing: 1 };
    this.portal = 0;
    this.leaving = false;
    this.moved = false;
    this.lastNear = null;
    this.ready = false;
    this.objs = [];
    this.parallax = new ParallaxLayers();
    this.hud = null;
    this.overlay = null;
    this.chipKind = null;
  }

  create(): void {
    this.reduced = prefersReducedMotion();
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.walkInput = new WalkInput(this);

    const ctx = getContext(this);
    // painted art that arrives after the timeout (slow network) replaces the code-drawn stand-in
    const late = (): void => {
      if (this.sys.isActive() && this.ready && !this.leaving) this.build(false);
    };
    void loadBasecampArt(this, [ctx.character, HOST_DEFINITION.id], late)
      .catch(() => undefined)
      .then(() => {
        if (!this.sys.isActive()) return;
        this.ready = true;
        this.build(true);
        this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
      });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.input.removeAllListeners();
    });
  }

  private onResize(): void {
    if (this.ready) this.build(false);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private build(initial: boolean): void {
    const { width: w, height: h } = this.scale;
    this.uiCam.setSize(w, h);
    // an open overlay was laid out for the old size: it is closed and opened again at the end
    const reopen = this.overlay?.id ?? null;
    this.closeOverlay();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.parallax.clear();
    this.backdropLayers = 0;
    this.hud?.destroy();
    this.hud = null;
    this.chip = null;
    this.chipTarget = null;
    this.bubble = null;
    this.gateGlow = null;
    const ctx = getContext(this);
    // On a rebuild (rotation, window resize) the buddy keeps its RELATIVE spot in Basecamp: the world
    // is laid out from the view size, so its pixel width changes, and a pixel x kept from a taller
    // view can land past the end of a shorter, narrower one. The fraction is applied once the walk
    // limits are final (below, after the buddy's body width is known).
    const prev = this.world as WorldSpec | undefined;
    const keepFrac = !initial && prev && prev.maxX > prev.minX ? (this.player.x - prev.minX) / (prev.maxX - prev.minX) : 0;
    const painted = this.paintedLayout(w, h);
    this.world = painted ? painted.world : worldSpec(w, h);
    if (initial) {
      const x = this.entry.from === 'gate' ? returnSpawnX(this.world) : this.world.startX;
      this.player = { x, vx: 0, facing: 1 };
    }
    const unit = this.world.unit;
    const cam = this.cameras.main;
    cam.setBackgroundColor(0xfff0cf);
    // the walker is sized from the screen height (capped by width and by the art's sharpness)
    const walkerH = Math.round(Math.min(h * (painted?.walkerHeight ?? WALKER_HEIGHT), w * 0.55));
    this.gateX = this.world.landmarks.find((l) => l.id === 'gate')!.x;
    const stage = painted ? this.buildPainted(painted) : this.buildCodeDrawn(w, h, walkerH);

    // --- characters ---
    const targetH = walkerH;
    const feetY = stage.feetY;
    // Click stands at the lodge door on the painted backdrop: the painted standing pose when present
    const click = new Walker(this, HOST_DEFINITION.id, targetH, w * 0.5, painted ? 'idle_front' : 'walk_side');
    click.setPosition(this.world.clickX, feetY).setDepth(9);
    click.face(-1);
    this.click = this.keep(click);
    this.bubble = this.keep(this.buildBubble(unit, ctx.activeSessionId ? 'Your run is waiting!' : 'Walk into the gate!'));
    // code-drawn: above the gate's lintel, so it never covers the name board; painted: above Click.
    // Clamped on screen in update().
    this.bubble.setPosition(this.world.clickX, stage.bubbleY ?? feetY - click.bodyH - unit * 0.03).setDepth(11).setAlpha(0);
    this.bubbleW = this.bubble.getBounds().width;

    const buddy = new Walker(this, ctx.character, targetH, w * 0.55);
    // The walking limits are feet positions. Pull them in by half the buddy's body so the buddy is
    // never clipped at either end of the picture when the camera reaches its end stop (a painted
    // backdrop barely wider than a landscape view; the code-drawn margins already cover this).
    const halfBody = Math.ceil(buddy.bodyW / 2) + 2;
    const minX = Math.min(this.world.maxX, Math.max(this.world.minX, halfBody));
    const maxX = Math.max(minX, Math.min(this.world.maxX, this.world.width - halfBody));
    if (minX !== this.world.minX || maxX !== this.world.maxX) {
      this.world = { ...this.world, minX, maxX, startX: Math.min(maxX, Math.max(minX, this.world.startX)) };
    }
    if (initial) {
      this.player = { ...this.player, x: Math.min(maxX, Math.max(minX, this.player.x)) };
    } else {
      this.player = { ...this.player, x: Math.round(minX + Math.min(1, Math.max(0, keepFrac)) * (maxX - minX)) };
    }
    this.places = hotspotPlaces(this.world, !!painted);
    buddy.setPosition(this.player.x, feetY).setDepth(10);
    buddy.face(this.player.facing);
    this.buddy = this.keep(buddy);

    // --- HUD on its own camera, so it never scrolls ---
    this.buildHud(w, h, ctx.character);
    cam.ignore(this.hud!);
    this.uiCam.ignore(this.objs);
    this.camX = cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width);
    cam.setScroll(this.camX, 0);
    this.paintedStage = !!painted;
    this.publishA11y();
    this.lastPublish = '';
    this.publish(true);
    if (reopen) this.openOverlay(reopen);
  }

  /** The painted backdrop laid out for this view, or null when it is not available (code-drawn fallback). */
  private paintedLayout(w: number, h: number): PaintedStage | null {
    const m = backdropManifest();
    if (!m || !hasPaintedBackdrop(this)) return null;
    const sizes = m.layers.map((l) => {
      const src = this.textures.get(backdropTextureKey(l.file)).getSourceImage() as { width: number; height: number };
      return { width: src.width, height: src.height };
    });
    const layout = layoutBackdrop(w, h, sizes, m.layers.map((l) => l.parallax));
    const world = paintedWorldSpec(w, h, {
      width: layout.worldW,
      groundY: backdropY(layout, m.groundY),
      gateX: backdropX(layout, m.gateX),
      signpostX: m.signpostX === null ? null : backdropX(layout, m.signpostX),
      clickX: backdropX(layout, m.lodgeDoorX),
      minX: backdropX(layout, m.walkMinX),
      maxX: backdropX(layout, m.walkMaxX),
    });
    return { layout, world, keys: m.layers.map((l) => backdropTextureKey(l.file)), gateTopY: backdropY(layout, m.gateTopY), walkerHeight: m.walkerHeight };
  }

  /** Painted backdrop: the pictures, back to front, and a warm glow inside the PAINTED gate opening. */
  private buildPainted(p: PaintedStage): { feetY: number; bubbleY: number | null } {
    p.layout.layers.forEach((l, i) => {
      const img = this.add.image(Math.round(l.x), Math.round(l.y), p.keys[i]!).setOrigin(0, 0).setScale(l.scale).setScrollFactor(l.parallax, 1).setDepth(i);
      this.keep(img);
    });
    this.backdropLayers = p.layout.layers.length;
    const g = this.world.groundY;
    const openingH = Math.max(1, g - p.gateTopY);
    this.gateGlow = this.keep(this.add.ellipse(this.gateX, g - openingH * 0.45, Math.max(this.world.gateCoreRadius * 2.4, openingH * 0.45), openingH * 0.85, EXP.lanternGlow, 0).setDepth(7));
    return { feetY: g, bubbleY: null };
  }

  /** The code-drawn W1 Basecamp (the fallback): parallax layers, signpost, gate, ledge and fronds. */
  private buildCodeDrawn(w: number, h: number, walkerH: number): { feetY: number; bubbleY: number | null } {
    const unit = this.world.unit;
    const lu = Math.round(Math.min(unit * 0.95, w));
    const g = this.world.groundY;
    const tex = bakeWorldLayers(this, w, h, g);

    // --- distance: sky, ridges, terraces, lanterns (each its own speed) ---
    this.keep(this.add.image(0, 0, tex.sky).setOrigin(0, 0).setScrollFactor(0).setDepth(0));
    const ridgeH = this.textures.get(tex.ridgeFar).getSourceImage().height;
    this.layer(tex.ridgeFar, tex.horizonY - ridgeH * 0.72, ridgeH, w, PARALLAX.ridgeFar, 1);
    this.layer(tex.ridgeNear, tex.horizonY - ridgeH * 0.62, ridgeH, w, PARALLAX.ridgeNear, 2);
    const terraceH = this.textures.get(tex.terraceFar).getSourceImage().height;
    this.layer(tex.terraceFar, tex.horizonY, terraceH, w, PARALLAX.terraceFar, 3);
    // a full-width haze band where the far terraces meet the sky (replaces the old per-tile mist)
    const haze = this.keep(this.add.graphics().setScrollFactor(0).setDepth(3));
    haze.fillStyle(0xffffff, 0.18);
    haze.fillRect(0, tex.horizonY - 2, w, Math.round(h * 0.05));
    this.layer(tex.lanterns, 0, this.textures.get(tex.lanterns).getSourceImage().height, w, PARALLAX.lanterns, 4);
    this.layer(tex.terraceMid, tex.horizonY + h * 0.06, terraceH, w, PARALLAX.terraceMid, 5);

    // --- landmarks stand ON the ground line; the ledge in front hides their bases ---
    const sign = bakeSignpost(this, lu);
    const signLm = this.world.landmarks.find((l) => l.id === 'signpost')!;
    const signImg = this.keep(this.add.image(signLm.x, g + 6, sign.key).setOrigin(0.5, 1).setDepth(8));
    const signText = this.keep(text(this, 'Terraces', EXP_CSS.parchment, { weight: 800, size: lu * 0.034, stroke: '#3b2410', strokeWidth: 3 })).setOrigin(0.5).setDepth(9);
    signText.setPosition(signLm.x - sign.w * 0.04, signImg.y - sign.h + sign.h * 0.14 + lu * 0.05);
    // the gate towers over the buddy: about 1.75 buddy heights tall, never wider than the screen
    const gateH = Math.round(walkerH * 1.75);
    const gateW = Math.round(Math.min(w * 0.92, gateH * 1.15));
    const gate = bakeGate(this, lu, gateW, gateH);
    // a warm glow inside the gate opening that breathes when the buddy is close
    this.gateGlow = this.keep(this.add.ellipse(this.gateX, g - gate.h * 0.45, gate.w * 0.55, gate.h * 0.85, EXP.lanternGlow, 0.0).setDepth(7));
    const gateImg = this.keep(this.add.image(this.gateX, g + 6, gate.key).setOrigin(0.5, 1).setDepth(8));
    const gateText = this.keep(text(this, 'Basecamp', EXP_CSS.parchment, { weight: 800, size: lu * 0.05, stroke: '#3b2410', strokeWidth: 4 })).setOrigin(0.5).setDepth(9);
    gateText.setPosition(this.gateX, gateImg.y - gate.h + gate.h * 0.2 + lu * 0.05);
    const feetY = g + 10; // toes in the grass tufts of the ledge

    // --- foreground: the grass-topped ledge, then fronds passing in front of everything ---
    const ledge = this.keep(this.add.tileSprite(0, g - LEDGE_MARGIN, w, tex.ledgeH, tex.ledge).setOrigin(0, 0).setScrollFactor(0).setDepth(12));
    this.parallax.add(ledge, 1);
    const span = CANOPY_FACTOR * (this.world.width - w) + w;
    for (let x = -100, i = 0; x < span; x += 1500, i++) {
      this.keep(this.add.image(x, -unit * 0.03, tex.canopy).setOrigin(0, 0).setScrollFactor(CANOPY_FACTOR).setDepth(14).setFlipX(i % 2 === 1).setAlpha(0.96));
    }
    return { feetY, bubbleY: feetY - gate.h - unit * 0.02 };
  }

  private layer(key: string, y: number, h: number, w: number, factor: number, depth: number): void {
    const ts = this.add.tileSprite(0, y, w, h, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.objs.push(ts);
    this.parallax.add(ts, factor);
  }

  private buildBubble(unit: number, line: string): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const size = Math.round(unit * 0.036);
    const label = text(this, line, EXP_CSS.navy, { weight: 800, size });
    const bw = label.width + unit * 0.07;
    const bh = label.height + unit * 0.04;
    const g = this.add.graphics();
    softShadow(g, { x: -bw / 2, y: -bh, w: bw, h: bh }, 16, 6, 0.2);
    g.fillStyle(EXP.parchmentEdge, 1);
    g.fillRoundedRect(-bw / 2 - 2, -bh - 2, bw + 4, bh + 4, 18);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-bw / 2, -bh, bw, bh, 16);
    g.fillStyle(EXP.parchmentEdge, 1);
    g.fillTriangle(-9, 1, 9, 1, 0, 14);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-7, -1, 7, -1, 0, 11);
    label.setOrigin(0.5).setPosition(0, -bh / 2);
    c.add([g, label]);
    return c;
  }

  private buildHud(w: number, h: number, id: CharacterId): void {
    const unit = Math.min(w, h);
    const pad = Math.round(unit * 0.035);
    const hud = this.add.container(0, 0).setDepth(50);
    this.hud = hud;
    const avatar = Math.round(unit * 0.12);
    const pillH = Math.round(avatar * 0.74);
    const name = text(this, characterName(id), '#ffffff', { weight: 800, size: Math.round(pillH * 0.42) }).setOrigin(0, 0.5);
    const role = text(this, BUDDY_PROFILES[id].role, '#ffd9a0', { weight: 700, size: Math.round(pillH * 0.26) }).setOrigin(0, 0.5);
    const pw = avatar * 0.94 + Math.max(name.width, role.width) + pillH * 0.5;
    const px = pad;
    const py = pad;
    const bg = this.add.graphics();
    softShadow(bg, { x: px, y: py + (avatar - pillH) / 2, w: pw, h: pillH }, pillH / 2, 6, 0.25);
    pill(bg, { x: px, y: py + (avatar - pillH) / 2, w: pw, h: pillH }, EXP.navy, EXP.brass);
    hud.add(bg);
    name.setPosition(px + avatar * 0.94, py + avatar / 2 - pillH * 0.13);
    role.setPosition(px + avatar * 0.94, py + avatar / 2 + pillH * 0.22);
    const medal = buildMedallion(this, { id, cx: px + avatar / 2, cy: py + avatar / 2, d: avatar, selected: false });
    hud.add([medal.container, name, role]);

    // zone ribbon, top right (drops under the name pill when the two would collide)
    const zone = text(this, 'Expedition Basecamp', '#ffffff', { weight: 800, size: Math.round(unit * 0.04), stroke: '#7a3004', strokeWidth: 4 }).setOrigin(0.5);
    const rw = zone.width + unit * 0.14;
    const rh = Math.round(unit * 0.085);
    const rx = w - pad - rw;
    const ry = rx < px + pw + pad ? py + avatar + pad * 0.6 : pad;
    const rg = this.add.graphics();
    ribbon(rg, { x: rx, y: ry, w: rw, h: rh }, EXP.orange, EXP.orangeDeep);
    zone.setPosition(rx + rw / 2, ry + rh / 2);
    hud.add([rg, zone]);

    // prompt chip, bottom center: the hint first, then the landmark you are at
    this.chip = this.add.container(w / 2, h - pad - Math.max(30, Math.round(unit * 0.05)));
    hud.add(this.chip);
    this.setChip(this.moved ? null : 'Hold left or right to walk', 'hint');
  }

  private setChip(line: string | null, kind: 'hint' | 'landmark' | 'gate' | 'action' = 'landmark', onTap: () => void = () => this.enterGate(), targetId = 'enter-gate'): void {
    const chip = this.chip;
    if (!chip) return;
    chip.removeAll(true);
    chip.disableInteractive();
    this.chipTarget = null;
    if (!line) return;
    const unit = Math.min(this.scale.width, this.scale.height);
    const button = kind === 'gate' || kind === 'action';
    this.chipKind = kind;
    const t = text(this, line, button ? '#ffffff' : EXP_CSS.navy, { weight: 800, size: Math.round(unit * (kind === 'hint' ? 0.036 : 0.042)), ...(button ? { stroke: '#7a3004', strokeWidth: 3 } : {}) }).setOrigin(0.5);
    // the gate prompt is a real button: never below the 48 px tap floor, wider than the text by a thumb
    const bw = button ? Math.max(t.width + unit * 0.16, unit * 0.46) : t.width + unit * 0.12;
    const bh = button ? Math.max(48, t.height + unit * 0.06) : t.height + unit * 0.05;
    const g = this.add.graphics();
    if (button) {
      softShadow(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, bh / 2, 6, 0.25);
      pill(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, EXP.orange, EXP.orangeDeep);
      chip.setSize(bw, bh).setInteractive({ useHandCursor: true });
      chip.on('pointerup', onTap);
      this.chipTarget = { id: targetId, label: line, x: chip.x - bw / 2, y: chip.y - bh / 2, w: bw, h: bh };
    } else {
      parchmentPanel(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, {});
    }
    chip.add([g, t]);
  }

  /** The screen-reader mirror of Basecamp: the status line and the real buttons (the gate, each overlay). */
  private publishA11y(): void {
    const ctx = getContext(this);
    const name = characterName(ctx.character);
    const clickAt = this.paintedStage ? 'Click is waiting by the lodge.' : 'Click is waiting by the Basecamp Gate.';
    ctx.a11y.set(
      `Expedition Basecamp. ${name} is here. Walk with the arrow keys, or hold the left or right side of the screen. ${clickAt} Enter the gate to ${ctx.activeSessionId ? 'continue your run' : 'start a run'}.`,
      [
        { id: 'enter-gate', label: ctx.activeSessionId ? 'Enter the gate and continue your run' : 'Enter the gate and start a run', onClick: () => this.enterGate() },
        ...this.overlayActions(),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Overlays (proposal 2.6 item 3): the registry decides what exists, this scene owns the hotspots
  // ---------------------------------------------------------------------------

  private activeHotspots(): Set<OverlayHotspot> {
    const active = new Set<OverlayHotspot>();
    for (const h of ['map-board', 'lodge-door', 'banner'] as const) if (overlaysAt(h).length > 0) active.add(h);
    return active;
  }

  private overlayActions(): Array<{ id: string; label: string; onClick: () => void }> {
    return (['map-board', 'lodge-door', 'banner'] as const).flatMap((h) => overlaysAt(h).map(({ id }) => ({ id: `open-${id}`, label: `Open the ${id}`, onClick: () => this.openOverlay(id) })));
  }

  private openHotspot(hotspot: OverlayHotspot): void {
    const first = overlaysAt(hotspot)[0];
    if (first) this.openOverlay(first.id);
  }

  /** Opens a registered overlay on the fixed UI camera and pauses walking until it closes. Idempotent. */
  openOverlay(id: OverlayId): void {
    if (this.overlay || this.leaving || !this.ready) return;
    const def = (['map-board', 'lodge-door', 'banner'] as const).flatMap((h) => overlaysAt(h)).find((o) => o.id === id)?.def;
    if (!def) return;
    this.walkInput.release();
    this.walkInput.enabled = false;
    const container = def.open(this).setDepth(200);
    this.cameras.main.ignore(container);
    this.overlay = { id, container };
    this.lastPublish = '';
    this.publish(true);
  }

  /** Called by an overlay (or the scene) to close the open overlay and let the buddy walk again. */
  closeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.container.destroy(true);
    this.overlay = null;
    this.walkInput.enabled = true;
    this.publishA11y();
    this.lastPublish = '';
    this.publish(true);
  }

  /** The portal: a warm flash from the gate, then the run. Idempotent. */
  private enterGate(): void {
    if (this.leaving || !this.ready) return;
    this.closeOverlay();
    this.leaving = true;
    this.walkInput.release();
    const ctx = getContext(this);
    const cam = this.cameras.main;
    this.buddy?.hop();
    this.click?.hop();
    if (this.reduced) {
      this.time.delayedCall(120, () => this.scene.start('RunScene'));
      return;
    }
    this.tweens.add({ targets: this.gateGlow, alpha: 0.9, scaleX: 2.2, scaleY: 1.6, duration: 420, ease: 'Quad.easeIn' });
    cam.zoomTo(1.18, 520, 'Quad.easeIn', true);
    cam.pan(this.gateX, this.world.groundY - this.world.unit * 0.25, 520, 'Quad.easeIn', true);
    this.time.delayedCall(380, () => cam.fadeOut(260, 255, 214, 160));
    this.time.delayedCall(660, () => {
      cam.resetFX();
      cam.setZoom(1);
      this.scene.start('RunScene');
    });
    ctx.a11y.set(`Entering the Basecamp Gate. ${ctx.activeSessionId ? 'Continuing your run.' : 'Starting a run.'}`, []);
  }

  override update(_time: number, delta: number): void {
    if (!this.ready || !this.buddy || this.leaving) return;
    const cam = this.cameras.main;
    const w = this.scale.width;
    const dir = this.walkInput.direction(w);
    this.player = stepPlayer(this.player, dir, delta, this.world);
    const top = this.world.unit * 0.62;
    const speed = Math.min(1, Math.abs(this.player.vx) / top);
    const moving = speed > 0.08;
    if (moving && !this.moved) {
      this.moved = true;
      this.time.delayedCall(2200, () => {
        if (!this.lastNear) this.setChip(null);
      });
    }

    // camera follow, eased, with a little look-ahead
    this.camX = easeCamera(this.camX, cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width), delta);
    cam.setScroll(Math.round(this.camX), 0);
    this.parallax.update(cam.scrollX);

    // the buddy walks
    this.buddy.setX(this.player.x);
    this.buddy.face(this.player.facing);
    const footfall = this.buddy.puppet(delta, speed, this.player.facing, this.reduced);
    if (footfall) spawnDust(this, this.world.unit, this.player.x, this.buddy.y, this.player.facing, { uiCam: this.uiCam });
    this.click?.puppet(delta, 0, -1, this.reduced);

    // landmarks, Click and the gate react to where the buddy is
    const ctx = getContext(this);
    const near = nearLandmark(this.player.x, this.world.landmarks);
    const it: Interaction = interactionAt(this.player.x, this.world, near, this.places, this.activeHotspots());
    const nearId = it ? (it.kind === 'landmark' ? it.id : it.hotspot) : null;
    let clickNear = Math.abs(this.player.x - this.world.clickX) < this.world.unit * 0.6;
    // on the painted backdrop Click is far from the gate: the bubble only speaks while Click is in view
    if (this.backdropLayers > 0 && this.click) clickNear &&= Math.abs(this.click.x - (cam.scrollX + w / 2)) < w / 2 + this.click.bodyW * 0.1;
    if (nearId !== this.lastNear) {
      this.lastNear = nearId;
      if (it?.kind === 'landmark' && it.id === 'gate') this.setChip(ctx.activeSessionId ? 'Continue your run' : 'Start your run', 'gate');
      else if (it?.kind === 'landmark' && it.id === 'signpost') this.setChip('Rice Terraces: coming soon');
      else if (it?.kind === 'hotspot') this.setChip(HOTSPOT_PROMPTS[it.hotspot], 'action', () => this.openHotspot(it.hotspot), `open-${it.hotspot}`);
      else this.setChip(this.moved ? null : 'Hold left or right to walk', 'hint');
    }
    if (this.bubble) {
      this.bubble.setAlpha(Phaser.Math.Linear(this.bubble.alpha, clickNear ? 1 : 0, 0.18));
      // keep the bubble on screen: its tail may drift off Click a little, the words never do
      const half = this.bubbleW / 2 + 8;
      this.bubble.setX(Math.min(cam.scrollX + w - half, Math.max(cam.scrollX + half, this.world.clickX)));
    }
    this.click?.face(this.player.x < this.world.clickX ? -1 : 1);

    // the portal fills while the buddy stands in the gate opening
    this.portal = stepPortal(this.portal, this.player.x, this.world, delta);
    if (this.gateGlow) {
      const pulse = this.reduced ? 0 : (Math.sin(_time / 420) + 1) * 0.5;
      const nearGate = it?.kind === 'landmark' && it.id === 'gate' ? 1 : 0;
      this.gateGlow.setAlpha(0.12 * nearGate + 0.18 * pulse * nearGate + 0.6 * this.portal);
      this.gateGlow.setScale(1 + 0.08 * pulse + 0.35 * this.portal, 1 + 0.05 * pulse + 0.2 * this.portal);
    }
    if (this.portal >= 1) this.enterGate();
    this.publish(false);
  }

  private publish(force: boolean): void {
    const ctx = getContext(this);
    const cam = this.cameras.main;
    const key = `${Math.round(this.player.x / 8)}|${Math.round(cam.scrollX / 8)}|${this.lastNear}|${this.moved}|${Math.round(this.portal * 10)}|${this.world.width}`;
    if (!force && key === this.lastPublish) return;
    this.lastPublish = key;
    const screenRect = (r: { x: number; y: number; w: number; h: number } | undefined): string =>
      r ? JSON.stringify({ x: Math.round(r.x - cam.scrollX), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }) : '';
    const targets: HitTarget[] = this.chipTarget ? [this.chipTarget] : [];
    publishSurface(ctx.parent, 'basecamp', targets, {
      character: ctx.character,
      'player-x': String(Math.round(this.player.x)),
      'camera-x': String(Math.round(cam.scrollX)),
      'world-w': String(this.world.width),
      'walk-min-x': String(this.world.minX),
      'walk-max-x': String(this.world.maxX),
      'gate-x': String(this.gateX),
      'gate-core': String(this.world.gateCoreRadius),
      near: this.lastNear ?? '',
      overlay: this.overlay?.id ?? '',
      moved: String(this.moved),
      facing: String(this.player.facing),
      portal: this.portal.toFixed(2),
      'walk-art': String(this.buddy ? hasWalkArt(this, ctx.character) : false),
      'walk-art-painted': String(this.buddy?.painted ?? false),
      backdrop: this.backdropLayers > 0 ? 'painted' : 'code',
      'buddy-rect': screenRect(this.buddy?.rect()),
      'click-rect': screenRect(this.click?.rect()),
      layers: String(this.backdropLayers > 0 ? this.backdropLayers : this.parallax.count),
    });
  }
}
