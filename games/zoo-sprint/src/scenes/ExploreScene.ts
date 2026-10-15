import Phaser from 'phaser';
import { Character } from '../characters';
import { loadProductionCharacterArt } from '../character-art';
import { getContext } from '../context';
import { cameraTargetScroll, easeCamera, inputDirection, nearLandmark, stepPlayer, worldSpec, type PlayerState, type WorldSpec } from '../presentation/explore-model';
import { buildMedallion } from '../presentation/hero-stage';
import { prefersReducedMotion } from '../presentation/motion';
import { parchmentPanel, pill, ribbon, softShadow } from '../presentation/surfaces';
import { LEDGE_MARGIN, TILE_W, bakeGate, bakeSignpost, bakeWorldLayers } from '../presentation/world-layers';
import { EXP, EXP_CSS } from '../theme';
import { publishSurface, text } from '../ui';
import { BUDDY_PROFILES } from '../presentation/traits';
import { characterName, type CharacterId } from '../roster';

/**
 * DEVELOPER-ONLY exploration feasibility spike (build mode `world-hub-spike`, never in a normal build).
 *
 * A physical, walkable stretch of the World Expedition: the selected buddy walks along a path in
 * front of layered rice-terrace scenery, the camera follows, a signpost and a gate stand in the
 * world, and Click, the host, waits next to the gate. It uses the approved production art and the
 * presentation layer from the visual recovery (palette, surfaces, lanterns, terraces, fronds, HUD).
 *
 * PRESENTATION ONLY: no platform calls, no questions, no XP or coins, nothing saved or sent.
 */
const PARALLAX = { ridgeFar: 0.08, ridgeNear: 0.16, terraceFar: 0.32, lanterns: 0.55, terraceMid: 0.7 } as const;
const CANOPY_FACTOR = 1.25;

export class ExploreScene extends Phaser.Scene {
  private world!: WorldSpec;
  private player: PlayerState = { x: 0, vx: 0, facing: 1 };
  private camX = 0;
  private buddy: Character | null = null;
  private click: Character | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tiles: Array<{ sprite: Phaser.GameObjects.TileSprite; factor: number }> = [];
  private hud: Phaser.GameObjects.Container | null = null;
  private chip: Phaser.GameObjects.Container | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private keys!: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] };
  private held = false;
  private moved = false;
  private walkClock = 0;
  private lastNear: string | null = null;
  private lastPublish = '';
  private ready = false;
  private buddyBase = { x: 0, y: 0 };

  constructor() {
    super('ExploreScene');
  }

  create(): void {
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    const kb = this.input.keyboard;
    this.keys = {
      left: [kb?.addKey('LEFT'), kb?.addKey('A')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
      right: [kb?.addKey('RIGHT'), kb?.addKey('D')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
    };
    this.input.on('pointerdown', () => (this.held = true));
    this.input.on('pointerup', () => (this.held = false));
    this.input.on('pointerupoutside', () => (this.held = false));
    const first = this.player.x === 0;
    void loadProductionCharacterArt(this)
      .catch(() => undefined)
      .then(() => document.fonts?.load('800 20px "Nunito Sans"').catch(() => undefined))
      .then(() => {
        this.ready = true;
        this.build(first);
        this.scale.on(Phaser.Scale.Events.RESIZE, () => this.build(false), this);
      });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE));
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private build(initial: boolean): void {
    const { width: w, height: h } = this.scale;
    this.uiCam.setSize(w, h);
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.tiles = [];
    this.hud?.destroy();
    this.chip = null;
    this.bubble = null;
    const ctx = getContext(this);
    const keepX = this.player.x;
    this.world = worldSpec(w, h);
    if (initial || keepX === 0) this.player = { x: this.world.startX, vx: 0, facing: 1 };
    else this.player = { ...this.player, x: Math.min(this.world.maxX, Math.max(this.world.minX, keepX)) };
    const unit = this.world.unit; // landmarks and distances scale with this; the HUD uses its own sizes
    const lu = Math.round(Math.min(unit * 0.95, w)); // landmark size: big, but never wider than the screen
    const g = this.world.groundY;
    const tex = bakeWorldLayers(this, w, h, g);
    const cam = this.cameras.main;
    cam.setBackgroundColor(0xfff0cf);

    // --- distance: sky, ridges, terraces, lanterns (each its own speed) ---
    const sky = this.keep(this.add_image(0, 0, tex.sky, 0));
    sky.setDepth(0);
    const ridgeH = this.textures.get(tex.ridgeFar).getSourceImage().height;
    this.layer(tex.ridgeFar, tex.horizonY - ridgeH * 0.72, ridgeH, w, PARALLAX.ridgeFar, 1);
    this.layer(tex.ridgeNear, tex.horizonY - ridgeH * 0.62, ridgeH, w, PARALLAX.ridgeNear, 2);
    const terraceH = this.textures.get(tex.terraceFar).getSourceImage().height;
    this.layer(tex.terraceFar, tex.horizonY, terraceH, w, PARALLAX.terraceFar, 3);
    this.layer(tex.lanterns, 0, this.textures.get(tex.lanterns).getSourceImage().height, w, PARALLAX.lanterns, 4);
    this.layer(tex.terraceMid, tex.horizonY + h * 0.06, terraceH, w, PARALLAX.terraceMid, 5);

    // --- the walkway: landmarks stand ON the ground line; the ledge in front hides their feet ---
    const sign = bakeSignpost(this, lu);
    const signLm = this.world.landmarks.find((l) => l.id === 'signpost')!;
    const signImg = this.keep(this.add_image(signLm.x, g + 6, sign.key, 1)).setOrigin(0.5, 1).setDepth(8);
    const signText = this.keep(text(this, 'Terraces', EXP_CSS.parchment, { weight: 800, size: lu * 0.034, stroke: '#3b2410', strokeWidth: 3 })).setOrigin(0.5).setDepth(9);
    signText.setPosition(signLm.x - sign.w * 0.04, signImg.y - sign.h + sign.h * 0.14 + lu * 0.05);
    const gateLm = this.world.landmarks.find((l) => l.id === 'gate')!;
    const gate = bakeGate(this, lu);
    const gateImg = this.keep(this.add_image(gateLm.x, g + 6, gate.key, 1)).setOrigin(0.5, 1).setDepth(8);
    const gateText = this.keep(text(this, 'Basecamp', EXP_CSS.parchment, { weight: 800, size: lu * 0.05, stroke: '#3b2410', strokeWidth: 4 })).setOrigin(0.5).setDepth(9);
    gateText.setPosition(gateLm.x, gateImg.y - gate.h + gate.h * 0.2 + lu * 0.05);

    // --- Click, the host, physically in the world beside the gate ---
    // Characters are sized from the screen height (and capped by the width) so a tall phone still shows them large.
    const bw = Math.round(Math.min(h * 0.34, w * 0.62));
    const bh = bw;
    const click = new Character(this, 0, 0, 'click', 100);
    click.placeInBox(this.world.clickX - bw / 2, g - bh, bw, bh, { visibleHeight: bh * 0.8, fillWidth: 0.95, maxScale: 3.4, overlap: Math.round(unit * 0.03) });
    click.setExpression('idle').setDepth(9);
    click.startIdleLoop(prefersReducedMotion());
    this.click = this.keep(click);
    this.bubble = this.buildBubble(unit, 'Welcome to basecamp!');
    this.keep(this.bubble);
    this.bubble.setPosition(this.world.clickX, g - bh * 1.04).setDepth(11).setAlpha(0);

    // --- the selected buddy (presentation-only choice from the Character Select) ---
    const id = ctx.character;
    const buddy = new Character(this, 0, 0, id, 100);
    buddy.placeInBox(-bw / 2, g - bh, bw, bh, { visibleHeight: bh * 0.8, fillWidth: 0.95, maxScale: 3.4, overlap: Math.round(unit * 0.03) });
    buddy.setDepth(10);
    this.buddyBase = { x: buddy.x, y: buddy.y };
    buddy.setExpression('idle');
    buddy.startIdleLoop(prefersReducedMotion());
    this.buddy = this.keep(buddy);

    // --- foreground: the grass-topped ledge, then fronds passing in front of everything ---
    const ledge = this.keep(this.add.tileSprite(0, g - LEDGE_MARGIN, w, tex.ledgeH, tex.ledge).setOrigin(0, 0).setScrollFactor(0).setDepth(12));
    this.tiles.push({ sprite: ledge, factor: 1 });
    const span = CANOPY_FACTOR * (this.world.width - w) + w;
    for (let x = -100, i = 0; x < span; x += 1500, i++) {
      this.keep(this.add_image(x, -unit * 0.03, tex.canopy, CANOPY_FACTOR).setOrigin(0, 0).setDepth(14).setFlipX(i % 2 === 1).setAlpha(0.96));
    }

    // --- HUD on its own camera, so it never scrolls ---
    this.buildHud(w, h, Math.min(w, h), id);
    cam.ignore(this.hud!);
    this.uiCam.ignore(this.objs);
    this.camX = cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width);
    cam.setScroll(this.camX, 0);
    getContext(this).a11y.set(
      `Expedition basecamp. ${characterName(id)} can walk left and right with the arrow keys, or by holding the screen. Click is waiting near the gate.`,
      [],
    );
    this.lastPublish = '';
    this.publish(true);
  }

  private add_image(x: number, y: number, key: string, factor: number): Phaser.GameObjects.Image {
    return this.add.image(x, y, key).setOrigin(0, 0).setScrollFactor(factor);
  }

  private layer(key: string, y: number, h: number, w: number, factor: number, depth: number): void {
    const ts = this.add.tileSprite(0, y, w, h, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.objs.push(ts);
    this.tiles.push({ sprite: ts, factor });
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

  private buildHud(w: number, h: number, unit: number, id: CharacterId): void {
    const pad = Math.round(Math.min(w, h) * 0.035);
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

    // zone ribbon, top right
    const zone = text(this, 'Expedition Basecamp', '#ffffff', { weight: 800, size: Math.round(unit * 0.04), stroke: '#7a3004', strokeWidth: 4 }).setOrigin(0.5);
    const rw = zone.width + unit * 0.14;
    const rh = Math.round(unit * 0.085);
    const rx = w - pad - rw;
    const rg = this.add.graphics();
    ribbon(rg, { x: rx, y: pad, w: rw, h: rh }, EXP.orange, EXP.orangeDeep);
    zone.setPosition(rx + rw / 2, pad + rh / 2);
    hud.add([rg, zone]);

    // prompt chip, bottom center (hint first, then the landmark you are at)
    this.chip = this.add.container(w / 2, h - pad - Math.round(unit * 0.045));
    hud.add(this.chip);
    this.setChip(this.moved ? null : 'Hold left or right to walk', 'hint');
  }

  private setChip(line: string | null, kind: 'hint' | 'landmark' = 'landmark'): void {
    const chip = this.chip;
    if (!chip) return;
    chip.removeAll(true);
    if (!line) return;
    const unit = Math.min(this.scale.width, this.scale.height);
    const t = text(this, line, EXP_CSS.navy, { weight: 800, size: Math.round(unit * (kind === 'hint' ? 0.036 : 0.042)) }).setOrigin(0.5);
    const bw = t.width + unit * 0.12;
    const bh = t.height + unit * 0.045;
    const g = this.add.graphics();
    parchmentPanel(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, {});
    chip.add([g, t]);
  }

  override update(_time: number, delta: number): void {
    if (!this.ready || !this.buddy) return;
    const cam = this.cameras.main;
    const unit = Math.min(this.scale.width, this.scale.height);
    const pointer = this.input.activePointer;
    const dir = inputDirection(
      { left: this.keys.left.some((k) => k.isDown), right: this.keys.right.some((k) => k.isDown) },
      this.held ? pointer.x + cam.scrollX : null,
      this.player.x,
      unit * 0.05,
    );
    this.player = stepPlayer(this.player, dir, delta, this.world);
    const moving = Math.abs(this.player.vx) > 6;
    if (moving && !this.moved) {
      this.moved = true;
      this.hintTimer();
    }

    // camera follow, eased, with a little look-ahead
    this.camX = easeCamera(this.camX, cameraTargetScroll(this.player.x, this.player.facing, this.scale.width, this.world.width), delta);
    cam.setScroll(Math.round(this.camX), 0);
    for (const t of this.tiles) t.sprite.tilePositionX = cam.scrollX * t.factor;

    // the buddy: a walking bob and a gentle lean, facing the way it walks
    this.walkClock += moving ? delta * 0.016 * (Math.abs(this.player.vx) / (this.world.unit * 0.62)) : 0;
    const bob = moving ? Math.abs(Math.sin(this.walkClock)) * unit * 0.016 : 0;
    this.buddy.setPosition(this.buddyBase.x + this.player.x, this.buddyBase.y - bob);
    this.buddy.setScale(this.player.facing, 1 + (moving ? Math.sin(this.walkClock * 2) * 0.012 : 0));
    this.buddy.setRotation(moving ? Math.sin(this.walkClock) * 0.035 * this.player.facing : 0);

    // landmarks and Click react to where the buddy is
    const near = nearLandmark(this.player.x, this.world.landmarks);
    const nearId = near?.id ?? null;
    const clickNear = Math.abs(this.player.x - this.world.clickX) < this.world.unit * 0.55;
    if (nearId !== this.lastNear) {
      this.lastNear = nearId;
      this.setChip(near ? (near.id === 'gate' ? 'Basecamp Gate' : 'Rice Terraces: coming soon') : this.moved ? null : 'Hold left or right to walk');
    }
    this.bubble?.setAlpha(Phaser.Math.Linear(this.bubble.alpha, clickNear ? 1 : 0, 0.18));
    this.click?.setExpression(clickNear ? 'happy' : 'idle');
    this.click?.setScale(this.player.x < this.world.clickX ? -1 : 1, 1);
    this.publish(false);
  }

  private hintTimer(): void {
    this.time.delayedCall(2200, () => {
      if (!this.lastNear) this.setChip(null);
    });
  }

  private publish(force: boolean): void {
    const ctx = getContext(this);
    const cam = this.cameras.main;
    const br = this.buddy?.worldRect();
    const cr = this.click?.worldRect();
    const key = `${Math.round(this.player.x / 8)}|${Math.round(cam.scrollX / 8)}|${this.lastNear}|${this.moved}`;
    if (!force && key === this.lastPublish) return;
    this.lastPublish = key;
    const rect = (r: { x: number; y: number; w: number; h: number } | undefined, dx: number): string =>
      r ? JSON.stringify({ x: Math.round(r.x + dx - cam.scrollX), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }) : '';
    publishSurface(ctx.parent, 'explore', [], {
      character: ctx.character,
      'player-x': String(Math.round(this.player.x)),
      'camera-x': String(Math.round(cam.scrollX)),
      'world-w': String(this.world.width),
      near: this.lastNear ?? '',
      moved: String(this.moved),
      facing: String(this.player.facing),
      'buddy-rect': rect(br, this.player.x),
      'click-rect': rect(cr, 0),
      'layers': String(this.tiles.length),
    });
  }
}
