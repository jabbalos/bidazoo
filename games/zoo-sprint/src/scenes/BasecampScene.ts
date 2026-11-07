import Phaser from 'phaser';
import { Character } from '../characters';
import { HOST_DEFINITION } from '../character-definitions';
import { getContext } from '../context';
import {
  PORTAL_DWELL_MS,
  cameraTargetScroll,
  easeCamera,
  inputDirection,
  nearLandmark,
  returnSpawnX,
  stepPlayer,
  stepPortal,
  worldSpec,
  type PlayerState,
  type WorldSpec,
} from '../presentation/explore-model';
import { buildMedallion } from '../presentation/hero-stage';
import { prefersReducedMotion } from '../presentation/motion';
import { parchmentPanel, pill, ribbon, softShadow } from '../presentation/surfaces';
import { BUDDY_PROFILES } from '../presentation/traits';
import { LEDGE_MARGIN, bakeGate, bakeSignpost, bakeWorldLayers } from '../presentation/world-layers';
import { characterName, type CharacterId } from '../roster';
import { EXP, EXP_CSS } from '../theme';
import { publishSurface, text, type HitTarget } from '../ui';
import { hasWalkArt, loadWalkArt, walkTextureKey } from '../walk-art';

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
const WALKER_HEIGHT = 0.3;
const WALKER_MAX_UPSCALE = 1.3;

export interface BasecampEntry {
  /** Where the buddy appears: the trailhead (first visit) or just outside the gate (back from a run). */
  from?: 'trailhead' | 'gate';
}

/**
 * The walking buddy: one full-body picture, flipped to face the way it walks, animated as a puppet
 * (a step bob, a lean into the walk, a little squash on each footfall, dust at the feet). Falls back
 * to the expression-art Character when the walking picture is not available.
 */
class Walker extends Phaser.GameObjects.Container {
  readonly id: CharacterId | 'click';
  private readonly figure: Phaser.GameObjects.Image | Character;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  readonly bodyH: number;
  readonly bodyW: number;
  /** The picture's resting scale; every per-frame squash is computed from this, never compounded. */
  private readonly baseScale: number;
  private clock = 0;
  private lastStepSign = 1;
  private idleClock = Math.random() * 10;

  constructor(scene: Phaser.Scene, id: CharacterId | 'click', targetH: number, maxW: number) {
    super(scene, 0, 0);
    this.id = id;
    if (hasWalkArt(scene, id)) {
      const img = scene.add.image(0, 0, walkTextureKey(id)).setOrigin(0.5, 1);
      const src = scene.textures.get(walkTextureKey(id)).getSourceImage() as { width: number; height: number };
      const scale = Math.min(targetH / src.height, maxW / src.width, WALKER_MAX_UPSCALE);
      img.setScale(scale);
      this.figure = img;
      this.baseScale = scale;
      this.bodyH = src.height * scale;
      this.bodyW = src.width * scale;
    } else {
      // No walking picture: the head-and-shoulders art stands in, sized the same way.
      const c = new Character(scene, 0, 0, id, 100);
      c.placeInBox(-maxW / 2, -targetH, maxW, targetH, { visibleHeight: targetH * 0.8, fillWidth: 0.95, maxScale: 3.4, overlap: 0 });
      c.setExpression('idle');
      this.figure = c;
      this.baseScale = 1;
      this.bodyH = targetH;
      this.bodyW = maxW;
    }
    this.shadow = scene.add.ellipse(0, 0, this.bodyW * 0.7, this.bodyH * 0.08, 0x2a1a08, 0.22);
    this.add([this.shadow, this.figure]);
    scene.add.existing(this);
  }

  /** Face +1 (right) or -1 (left). The canonical pictures face right. */
  face(dir: 1 | -1): void {
    if (this.figure instanceof Phaser.GameObjects.Image) this.figure.setFlipX(dir === -1);
    else this.figure.setScale(dir * Math.abs(this.figure.scaleX), this.figure.scaleY);
  }

  /**
   * One animation step. `speed` is 0..1 of top speed. Returns true on a footfall (for dust).
   * With reduced motion the picture slides without bobbing.
   */
  puppet(deltaMs: number, speed: number, facing: 1 | -1, reduced: boolean): boolean {
    this.idleClock += deltaMs / 1000;
    if (reduced) {
      this.figure.setPosition(0, 0);
      this.figure.setRotation(0);
      return false;
    }
    const moving = speed > 0.08;
    if (moving) this.clock += (deltaMs / 1000) * (7 + 5 * speed);
    const stepPhase = Math.sin(this.clock);
    const bob = moving ? Math.abs(stepPhase) * this.bodyH * 0.055 * speed : 0;
    const breathe = moving ? 0 : Math.sin(this.idleClock * 1.6) * 0.012;
    const squash = moving ? Math.abs(Math.cos(this.clock)) * 0.035 * speed : 0;
    this.figure.setPosition(0, -bob);
    if (this.figure instanceof Phaser.GameObjects.Image) {
      this.figure.setScale(this.baseScale * (1 + squash * 0.6), this.baseScale * (1 - squash + breathe));
    }
    this.figure.setRotation(moving ? stepPhase * 0.06 * facing : 0);
    this.shadow.setScale(1 - bob / Math.max(1, this.bodyH) * 2, 1);
    this.shadow.setAlpha(0.22 - (bob / Math.max(1, this.bodyH)) * 1.2);
    const sign = stepPhase >= 0 ? 1 : -1;
    const footfall = moving && sign !== this.lastStepSign;
    this.lastStepSign = sign;
    return footfall;
  }

  hop(): void {
    this.scene.tweens.add({ targets: this.figure, y: -this.bodyH * 0.12, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
  }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }
}

export class BasecampScene extends Phaser.Scene {
  private world!: WorldSpec;
  private player: PlayerState = { x: 0, vx: 0, facing: 1 };
  private camX = 0;
  private buddy: Walker | null = null;
  private click: Walker | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tiles: Array<{ sprite: Phaser.GameObjects.TileSprite; factor: number }> = [];
  private hud: Phaser.GameObjects.Container | null = null;
  private chip: Phaser.GameObjects.Container | null = null;
  private chipTarget: HitTarget | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleW = 0;
  private gateGlow: Phaser.GameObjects.Ellipse | null = null;
  private gateX = 0;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private keys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = { left: [], right: [] };
  private heldX: number | null = null;
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
    this.tiles = [];
    this.hud = null;
  }

  create(): void {
    this.reduced = prefersReducedMotion();
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    const kb = this.input.keyboard;
    this.keys = {
      left: [kb?.addKey('LEFT'), kb?.addKey('A')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
      right: [kb?.addKey('RIGHT'), kb?.addKey('D')].filter((k): k is Phaser.Input.Keyboard.Key => !!k),
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.heldX = p.x));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.heldX !== null && p.isDown) this.heldX = p.x;
    });
    const release = (): void => {
      this.heldX = null;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', release);

    const ctx = getContext(this);
    void loadWalkArt(this, [ctx.character, HOST_DEFINITION.id])
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
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.tiles = [];
    this.hud?.destroy();
    this.hud = null;
    this.chip = null;
    this.chipTarget = null;
    this.bubble = null;
    this.gateGlow = null;
    const ctx = getContext(this);
    const keepX = this.player.x;
    this.world = worldSpec(w, h);
    if (initial) {
      const x = this.entry.from === 'gate' ? returnSpawnX(this.world) : this.world.startX;
      this.player = { x, vx: 0, facing: 1 };
    } else {
      this.player = { ...this.player, x: Math.min(this.world.maxX, Math.max(this.world.minX, keepX)) };
    }
    const unit = this.world.unit;
    const lu = Math.round(Math.min(unit * 0.95, w));
    const g = this.world.groundY;
    const tex = bakeWorldLayers(this, w, h, g);
    const cam = this.cameras.main;
    cam.setBackgroundColor(0xfff0cf);

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
    const gateLm = this.world.landmarks.find((l) => l.id === 'gate')!;
    this.gateX = gateLm.x;
    // the gate towers over the buddy: about 1.75 buddy heights tall, never wider than the screen
    const walkerH = Math.round(Math.min(h * WALKER_HEIGHT, w * 0.55));
    const gateH = Math.round(walkerH * 1.75);
    const gateW = Math.round(Math.min(w * 0.92, gateH * 1.15));
    const gate = bakeGate(this, lu, gateW, gateH);
    // a warm glow inside the gate opening that breathes when the buddy is close
    this.gateGlow = this.keep(this.add.ellipse(gateLm.x, g - gate.h * 0.45, gate.w * 0.55, gate.h * 0.85, EXP.lanternGlow, 0.0).setDepth(7));
    const gateImg = this.keep(this.add.image(gateLm.x, g + 6, gate.key).setOrigin(0.5, 1).setDepth(8));
    const gateText = this.keep(text(this, 'Basecamp', EXP_CSS.parchment, { weight: 800, size: lu * 0.05, stroke: '#3b2410', strokeWidth: 4 })).setOrigin(0.5).setDepth(9);
    gateText.setPosition(gateLm.x, gateImg.y - gate.h + gate.h * 0.2 + lu * 0.05);

    // --- characters: sized from the screen height, capped by width and by the art's sharpness ---
    const targetH = walkerH;
    const feetY = g + 10; // toes in the grass tufts of the ledge
    const click = new Walker(this, HOST_DEFINITION.id, targetH, w * 0.5);
    click.setPosition(this.world.clickX, feetY).setDepth(9);
    click.face(-1);
    this.click = this.keep(click);
    this.bubble = this.keep(this.buildBubble(unit, ctx.activeSessionId ? 'Your run is waiting!' : 'Walk into the gate!'));
    // above the gate's lintel, so it never covers the name board; clamped on screen in update()
    this.bubble.setPosition(this.world.clickX, feetY - gate.h - unit * 0.02).setDepth(11).setAlpha(0);
    this.bubbleW = this.bubble.getBounds().width;

    const buddy = new Walker(this, ctx.character, targetH, w * 0.55);
    buddy.setPosition(this.player.x, feetY).setDepth(10);
    buddy.face(this.player.facing);
    this.buddy = this.keep(buddy);

    // --- foreground: the grass-topped ledge, then fronds passing in front of everything ---
    const ledge = this.keep(this.add.tileSprite(0, g - LEDGE_MARGIN, w, tex.ledgeH, tex.ledge).setOrigin(0, 0).setScrollFactor(0).setDepth(12));
    this.tiles.push({ sprite: ledge, factor: 1 });
    const span = CANOPY_FACTOR * (this.world.width - w) + w;
    for (let x = -100, i = 0; x < span; x += 1500, i++) {
      this.keep(this.add.image(x, -unit * 0.03, tex.canopy).setOrigin(0, 0).setScrollFactor(CANOPY_FACTOR).setDepth(14).setFlipX(i % 2 === 1).setAlpha(0.96));
    }

    // --- HUD on its own camera, so it never scrolls ---
    this.buildHud(w, h, ctx.character);
    cam.ignore(this.hud!);
    this.uiCam.ignore(this.objs);
    this.camX = cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width);
    cam.setScroll(this.camX, 0);
    const name = characterName(ctx.character);
    ctx.a11y.set(
      `Expedition Basecamp. ${name} is here. Walk with the arrow keys, or hold the left or right side of the screen. Click is waiting by the Basecamp Gate. Enter the gate to ${ctx.activeSessionId ? 'continue your run' : 'start a run'}.`,
      [{ id: 'enter-gate', label: ctx.activeSessionId ? 'Enter the gate and continue your run' : 'Enter the gate and start a run', onClick: () => this.enterGate() }],
    );
    this.lastPublish = '';
    this.publish(true);
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

  private setChip(line: string | null, kind: 'hint' | 'landmark' | 'gate' = 'landmark'): void {
    const chip = this.chip;
    if (!chip) return;
    chip.removeAll(true);
    chip.disableInteractive();
    this.chipTarget = null;
    if (!line) return;
    const unit = Math.min(this.scale.width, this.scale.height);
    const t = text(this, line, kind === 'gate' ? '#ffffff' : EXP_CSS.navy, { weight: 800, size: Math.round(unit * (kind === 'hint' ? 0.036 : 0.042)), ...(kind === 'gate' ? { stroke: '#7a3004', strokeWidth: 3 } : {}) }).setOrigin(0.5);
    // the gate prompt is a real button: never below the 48 px tap floor, wider than the text by a thumb
    const bw = kind === 'gate' ? Math.max(t.width + unit * 0.16, unit * 0.46) : t.width + unit * 0.12;
    const bh = kind === 'gate' ? Math.max(48, t.height + unit * 0.06) : t.height + unit * 0.05;
    const g = this.add.graphics();
    if (kind === 'gate') {
      softShadow(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, bh / 2, 6, 0.25);
      pill(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, EXP.orange, EXP.orangeDeep);
      chip.setSize(bw, bh).setInteractive({ useHandCursor: true });
      chip.on('pointerup', () => this.enterGate());
      this.chipTarget = { id: 'enter-gate', label: line, x: chip.x - bw / 2, y: chip.y - bh / 2, w: bw, h: bh };
    } else {
      parchmentPanel(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, {});
    }
    chip.add([g, t]);
  }

  /** The portal: a warm flash from the gate, then the run. Idempotent. */
  private enterGate(): void {
    if (this.leaving || !this.ready) return;
    this.leaving = true;
    this.heldX = null;
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

  private spawnDust(x: number, y: number, facing: 1 | -1): void {
    const unit = this.world.unit;
    for (let i = 0; i < 3; i++) {
      const puff = this.add.circle(x - facing * unit * (0.02 + i * 0.012), y - unit * 0.004, unit * (0.012 + Math.random() * 0.008), 0xf1dfbb, 0.55).setDepth(11);
      this.uiCam.ignore(puff);
      this.tweens.add({
        targets: puff,
        x: puff.x - facing * unit * 0.05,
        y: puff.y - unit * (0.02 + Math.random() * 0.02),
        scale: 1.8,
        alpha: 0,
        duration: 380 + i * 60,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  override update(_time: number, delta: number): void {
    if (!this.ready || !this.buddy || this.leaving) return;
    const cam = this.cameras.main;
    const w = this.scale.width;
    const dir = inputDirection({ left: this.keys.left.some((k) => k.isDown), right: this.keys.right.some((k) => k.isDown) }, this.heldX, w);
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
    for (const t of this.tiles) t.sprite.tilePositionX = cam.scrollX * t.factor;

    // the buddy walks
    this.buddy.setX(this.player.x);
    this.buddy.face(this.player.facing);
    const footfall = this.buddy.puppet(delta, speed, this.player.facing, this.reduced);
    if (footfall) this.spawnDust(this.player.x, this.buddy.y, this.player.facing);
    this.click?.puppet(delta, 0, -1, this.reduced);

    // landmarks, Click and the gate react to where the buddy is
    const ctx = getContext(this);
    const near = nearLandmark(this.player.x, this.world.landmarks);
    const nearId = near?.id ?? null;
    const clickNear = Math.abs(this.player.x - this.world.clickX) < this.world.unit * 0.6;
    if (nearId !== this.lastNear) {
      this.lastNear = nearId;
      if (near?.id === 'gate') this.setChip(ctx.activeSessionId ? 'Continue your run' : 'Start your run', 'gate');
      else if (near?.id === 'signpost') this.setChip('Rice Terraces: coming soon');
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
      const nearGate = near?.id === 'gate' ? 1 : 0;
      this.gateGlow.setAlpha(0.12 * nearGate + 0.18 * pulse * nearGate + 0.6 * this.portal);
      this.gateGlow.setScale(1 + 0.08 * pulse + 0.35 * this.portal, 1 + 0.05 * pulse + 0.2 * this.portal);
    }
    if (this.portal >= 1) this.enterGate();
    this.publish(false);
  }

  private publish(force: boolean): void {
    const ctx = getContext(this);
    const cam = this.cameras.main;
    const key = `${Math.round(this.player.x / 8)}|${Math.round(cam.scrollX / 8)}|${this.lastNear}|${this.moved}|${Math.round(this.portal * 10)}`;
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
      'gate-x': String(this.gateX),
      'gate-core': String(this.world.gateCoreRadius),
      near: this.lastNear ?? '',
      moved: String(this.moved),
      facing: String(this.player.facing),
      portal: this.portal.toFixed(2),
      'walk-art': String(this.buddy ? hasWalkArt(this, ctx.character) : false),
      'buddy-rect': screenRect(this.buddy?.rect()),
      'click-rect': screenRect(this.click?.rect()),
      layers: String(this.tiles.length),
    });
  }
}
