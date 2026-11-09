import Phaser from 'phaser';
import { destinationById } from '../basecamp/destinations';
import { loadBasecampArt } from '../basecamp-art';
import { getContext } from '../context';
import { startEncounter, type EncounterOutcome } from '../encounter';
import {
  ENCOUNTER_NODES,
  artifactsCollected,
  artifactsTotal,
  beaconsShown,
  expeditionWorld,
  mark,
  newWalk,
  nextNode,
  nodeX,
  questionsFor,
  reachedNodes,
  type DestinationManifest,
  type DestinationNode,
  type NodeMark,
  type WalkProgress,
} from '../presentation/destination-model';
import { cameraTargetScroll, easeCamera, stepPlayer, type PlayerState, type WorldSpec } from '../presentation/explore-model';
import { bakeLayer } from '../presentation/layer-bake';
import { prefersReducedMotion } from '../presentation/motion';
import { ParallaxLayers } from '../presentation/parallax';
import { parchmentPanel, pill, ribbon, softShadow, starIcon } from '../presentation/surfaces';
import { WalkInput, spawnDust } from '../presentation/walk-input';
import { Walker } from '../presentation/walker';
import { characterName } from '../roster';
import { createSessionClient, type SessionClient } from '../session-client';
import { EXP, EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/**
 * ExpeditionScene (B1): renders any destination manifest. The buddy walks a path of `pathLength`
 * screens through three code-drawn layers (far, mid, near; painted pictures replace them later);
 * nodes along the path are reached by walking. An encounter node (and the boss at the summit) calls
 * Lane A's `startEncounter` over the one play session this expedition owns; an artifact is
 * collected by walking through it; a rest node is a bench with a one-line quip.
 *
 * PRESENTATION ONLY. Questions, grading, XP, coins, beacons lit and the stamp are decided by the
 * server. The beacons shown while walking are the client's own display of won encounters; the
 * summit card shows the server's count. Timer expiry has no effect anywhere here.
 *
 * The world scrolls by moving one container, never the camera, so any overlay a lane adds to this
 * scene (the encounter) is drawn in plain screen coordinates.
 */
export interface ExpeditionEntry {
  destination: string;
}

/** Placeholder quip on the rest bench. PENDING owner approval (rule 14). */
export const REST_QUIP = 'Nice view. Ready to go on?';

const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/** One node's drawing, with the way it changes when it is done. */
interface NodeView {
  node: DestinationNode;
  x: number;
  root: Phaser.GameObjects.Container;
  apply(mark: NodeMark | undefined): void;
}

export class ExpeditionScene extends Phaser.Scene {
  private manifest!: DestinationManifest;
  private world!: WorldSpec;
  private player: PlayerState = { x: 0, vx: 0, facing: 1 };
  private camX = 0;
  private buddy: Walker | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private textureKeys: string[] = [];
  private parallax = new ParallaxLayers();
  private worldRoot: Phaser.GameObjects.Container | null = null;
  private views: NodeView[] = [];
  private hud: Phaser.GameObjects.Container | null = null;
  private beaconDots: Phaser.GameObjects.Graphics | null = null;
  private artifactLabel: Phaser.GameObjects.Text | null = null;
  private chip: Phaser.GameObjects.Container | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private walkInput!: WalkInput;
  private progress: WalkProgress = newWalk();
  /** Nodes already triggered (a node fires once). */
  private seen = new Set<string>();
  private queue: DestinationNode[] = [];
  private busy = false;
  private moved = false;
  private ready = false;
  private leaving = false;
  private reduced = false;
  private sessionState: 'starting' | 'ready' | 'error' = 'starting';
  private client: SessionClient | null = null;
  private lastPublish = '';
  private lastBuiltSize = '';

  constructor() {
    super('ExpeditionScene');
  }

  init(data: ExpeditionEntry): void {
    const found = data?.destination ? destinationById(data.destination) : null;
    if (found) this.manifest = found;
    this.player = { x: 0, vx: 0, facing: 1 };
    this.progress = newWalk();
    this.seen = new Set();
    this.queue = [];
    this.busy = false;
    this.moved = false;
    this.ready = false;
    this.leaving = false;
    this.objs = [];
    this.textureKeys = [];
    this.parallax = new ParallaxLayers();
    this.views = [];
    this.hud = null;
    this.panel = null;
    this.sessionState = 'starting';
    this.client = null;
  }

  create(): void {
    if (!this.manifest) {
      // an unknown destination never leaves a blank screen
      this.scene.start('BasecampScene');
      return;
    }
    this.reduced = prefersReducedMotion();
    this.walkInput = new WalkInput(this);
    this.walkInput.enabled = false; // walking starts once the session is open
    const ctx = getContext(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.input.removeAllListeners();
      for (const key of this.textureKeys) if (this.textures.exists(key)) this.textures.remove(key);
    });
    const late = (): void => {
      if (this.sys.isActive() && this.ready && !this.leaving) this.build(false);
    };
    void loadBasecampArt(this, [ctx.character], late)
      .catch(() => undefined)
      .then(() => {
        if (!this.sys.isActive()) return;
        this.ready = true;
        this.build(true);
        this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
        void this.openSession();
      });
  }

  private onResize(): void {
    const { width, height } = this.scale;
    if (this.ready && `${width}x${height}` !== this.lastBuiltSize) this.build(false);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  // ---------------------------------------------------------------------------
  // The session (one expedition = one play session)
  // ---------------------------------------------------------------------------

  private async openSession(): Promise<void> {
    const ctx = getContext(this);
    this.sessionState = 'starting';
    this.refreshA11y();
    try {
      this.client = createSessionClient(ctx.platform);
      const session = await this.client.startSession({ gameId: 'zoo-sprint', mode: 'multiplication', destination: this.manifest.id });
      if (!this.sys.isActive()) return;
      ctx.activeSessionId = session.id;
      this.sessionState = 'ready';
      this.walkInput.enabled = true;
      this.refreshA11y();
      this.lastPublish = '';
    } catch {
      if (!this.sys.isActive()) return;
      this.sessionState = 'error';
      this.showPanel('The expedition could not start.', [
        { id: 'expedition-retry', label: 'Try again', style: 'primary', run: () => void this.openSession() },
        { id: 'expedition-home', label: 'Back to Basecamp', style: 'card', run: () => this.goHome() },
      ]);
    }
  }

  private goHome(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('BasecampScene', { from: 'trailhead' });
  }

  // ---------------------------------------------------------------------------
  // Building the scene
  // ---------------------------------------------------------------------------

  private build(initial: boolean): void {
    const { width: w, height: h } = this.scale;
    this.lastBuiltSize = `${w}x${h}`;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.parallax.clear();
    this.views = [];
    this.hud?.destroy();
    this.hud = null;
    this.chip = null;
    this.panel = null;
    const prev = this.world as WorldSpec | undefined;
    const keepFrac = !initial && prev && prev.maxX > prev.minX ? (this.player.x - prev.minX) / (prev.maxX - prev.minX) : 0;
    this.world = expeditionWorld(this.manifest, w, h);
    const ctx = getContext(this);
    const world = this.world;
    this.cameras.main.setBackgroundColor(hexNum(this.manifest.palette.colors[3] ?? '#f3d9a8'));

    // --- the three layers, back to front (the near layer passes in front of the buddy) ---
    const depths = { far: 0, mid: 3, near: 12 } as const;
    for (const layer of this.manifest.layers) {
      const key = bakeLayer(this, `exp-${this.manifest.id}-${layer.id}`, layer, h);
      if (!this.textureKeys.includes(key)) this.textureKeys.push(key);
      const ts = this.keep(this.add.tileSprite(0, 0, w, h, key).setOrigin(0, 0).setDepth(depths[layer.id]));
      this.parallax.add(ts, layer.parallax);
    }

    // --- the world: nodes and the buddy, moved as one container ---
    const root = this.keep(this.add.container(0, 0).setDepth(5));
    this.worldRoot = root;
    const unit = world.unit;
    for (const node of this.manifest.nodes) {
      const view = this.buildNode(node, nodeX(node, world), world.groundY, unit);
      view.apply(this.progress.marks[node.id]);
      root.add(view.root);
      this.views.push(view);
    }
    const walkerH = Math.round(Math.min(h * 0.3, w * 0.55));
    const buddy = new Walker(this, ctx.character, walkerH, w * 0.55);
    const half = Math.ceil(buddy.bodyW / 2) + 2;
    const minX = Math.min(world.maxX, Math.max(world.minX, half));
    this.world = { ...world, minX, startX: Math.max(minX, world.startX) };
    this.player = initial
      ? { x: this.world.startX, vx: 0, facing: 1 }
      : { ...this.player, x: Math.round(minX + Math.min(1, Math.max(0, keepFrac)) * (this.world.maxX - minX)) };
    buddy.setPosition(this.player.x, this.world.groundY + Math.round(unit * 0.01)).setDepth(10);
    buddy.face(this.player.facing);
    this.buddy = buddy;
    root.add(buddy);
    this.camX = cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width);
    this.placeWorld();

    this.buildHud(w, h);
    this.refreshA11y();
    this.lastPublish = '';
    this.publish(true);
  }

  /** Scrolls the layers and the world container to the current camera position. */
  private placeWorld(): void {
    const scroll = Math.round(this.camX);
    this.parallax.update(scroll);
    this.worldRoot?.setX(-scroll);
  }

  private buildNode(node: DestinationNode, x: number, groundY: number, unit: number): NodeView {
    const pal = this.manifest.palette;
    const stone = hexNum(pal.colors[1] ?? '#b9a98a');
    const accent = hexNum(pal.accent);
    const root = this.add.container(x, groundY);
    const g = this.add.graphics();
    root.add(g);
    let artifactTween: Phaser.Tweens.Tween | null = null;
    const apply = (m: NodeMark | undefined): void => {
      g.clear();
      const s = unit * (node.type === 'boss' ? 0.34 : 0.22);
      if (node.type === 'encounter' || node.type === 'boss') {
        const lit = m === 'won';
        const baseW = s * (node.type === 'boss' ? 0.5 : 0.42);
        // stone tower, bowl, flame
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(0, 4, baseW * 1.5, s * 0.08);
        g.fillStyle(stone, 1);
        g.fillTriangle(-baseW / 2, 0, baseW / 2, 0, baseW * 0.3, -s * 0.7);
        g.fillTriangle(-baseW / 2, 0, -baseW * 0.3, -s * 0.7, baseW * 0.3, -s * 0.7);
        g.fillStyle(EXP.timberDeep, 1);
        g.fillRoundedRect(-baseW * 0.45, -s * 0.78, baseW * 0.9, s * 0.1, 4);
        if (lit) {
          g.fillStyle(accent, 0.28);
          g.fillCircle(0, -s * 0.95, s * 0.42);
          g.fillStyle(accent, 1);
          g.fillTriangle(-s * 0.1, -s * 0.78, s * 0.1, -s * 0.78, 0, -s * 1.12);
          g.fillStyle(0xfff2b8, 1);
          g.fillTriangle(-s * 0.05, -s * 0.78, s * 0.05, -s * 0.78, 0, -s * 0.97);
        } else {
          g.fillStyle(m === 'lost' ? EXP.amberDeep : EXP.dimDeep, 1);
          g.fillTriangle(-s * 0.07, -s * 0.78, s * 0.07, -s * 0.78, 0, -s * 0.92);
        }
        if (node.type === 'boss') {
          // the summit banner
          g.fillStyle(EXP.timberDeep, 1);
          g.fillRect(baseW * 0.7, -s * 1.15, 4, s * 1.15);
          g.fillStyle(accent, 1);
          g.fillTriangle(baseW * 0.7 + 4, -s * 1.15, baseW * 0.7 + 4 + s * 0.32, -s * 1.03, baseW * 0.7 + 4, -s * 0.9);
        }
      } else if (node.type === 'artifact') {
        artifactTween?.stop();
        artifactTween = null;
        if (m === 'collected') return;
        const r = unit * 0.05;
        g.fillStyle(accent, 0.25);
        g.fillCircle(0, -unit * 0.16, r * 1.8);
        g.fillStyle(EXP.brass, 1);
        g.fillTriangle(0, -unit * 0.16 - r, r * 0.8, -unit * 0.16, 0, -unit * 0.16 + r);
        g.fillTriangle(0, -unit * 0.16 - r, -r * 0.8, -unit * 0.16, 0, -unit * 0.16 + r);
        g.fillStyle(0xfff2b8, 0.8);
        g.fillTriangle(0, -unit * 0.16 - r, -r * 0.8, -unit * 0.16, 0, -unit * 0.16);
        if (!this.reduced) artifactTween = this.tweens.add({ targets: g, y: -unit * 0.015, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else {
        // a rest bench: plank on two posts
        const bw = unit * 0.2;
        g.fillStyle(0x000000, 0.16);
        g.fillEllipse(0, 3, bw * 1.1, unit * 0.02);
        g.fillStyle(EXP.timberDeep, 1);
        g.fillRect(-bw * 0.4, -unit * 0.07, unit * 0.025, unit * 0.07);
        g.fillRect(bw * 0.4 - unit * 0.025, -unit * 0.07, unit * 0.025, unit * 0.07);
        g.fillStyle(EXP.timber, 1);
        g.fillRoundedRect(-bw / 2, -unit * 0.1, bw, unit * 0.035, 4);
        g.fillStyle(EXP.timberLight, 1);
        g.fillRoundedRect(-bw / 2, -unit * 0.1, bw, unit * 0.012, 4);
      }
    };
    return { node, x, root, apply };
  }

  private buildHud(w: number, h: number): void {
    const unit = Math.min(w, h);
    const pad = Math.round(unit * 0.035);
    const hud = this.add.container(0, 0).setDepth(50);
    this.hud = hud;
    this.keep(hud);

    // destination ribbon, top left
    const title = text(this, this.manifest.name, '#ffffff', { weight: 800, size: Math.round(unit * 0.036), stroke: '#7a3004', strokeWidth: 4 }).setOrigin(0.5);
    const rw = Math.min(w - pad * 2 - 64, title.width + unit * 0.12);
    const rh = Math.round(unit * 0.08);
    const rg = this.add.graphics();
    ribbon(rg, { x: pad, y: pad, w: rw, h: rh }, EXP.orange, EXP.orangeDeep);
    title.setPosition(pad + rw / 2, pad + rh / 2);
    if (title.width > rw - unit * 0.06) title.setScale((rw - unit * 0.06) / title.width);
    hud.add([rg, title]);

    // beacons and artifacts counter (B3), under the ribbon
    const cy = pad + rh + pad * 0.7;
    const plate = this.add.graphics();
    const dot = Math.max(14, Math.round(unit * 0.034));
    const gap = Math.round(dot * 0.55);
    const pw = ENCOUNTER_NODES * (dot + gap) + gap + Math.round(dot * 4.2);
    const ph = Math.round(dot * 2);
    softShadow(plate, { x: pad, y: cy, w: pw, h: ph }, ph / 2, 5, 0.22);
    pill(plate, { x: pad, y: cy, w: pw, h: ph }, EXP.navy, EXP.brass);
    hud.add(plate);
    this.beaconDots = this.add.graphics();
    hud.add(this.beaconDots);
    this.artifactLabel = text(this, '', '#ffffff', { weight: 800, size: Math.round(dot * 0.95) }).setOrigin(0, 0.5);
    this.artifactLabel.setPosition(pad + gap + ENCOUNTER_NODES * (dot + gap) + dot * 1.3, cy + ph / 2);
    hud.add(this.artifactLabel);
    this.hudGeometry = { x: pad + gap, cy: cy + ph / 2, dot, gap, iconX: pad + gap + ENCOUNTER_NODES * (dot + gap) + dot * 0.5 };
    this.drawCounter();

    // home button, top right (never under the 48 px tap floor)
    const bs = Math.max(48, Math.round(unit * 0.1));
    hud.add(new TapButton(this, 'expedition-home', w - pad - bs / 2, pad + bs / 2, bs, bs, 'X', BUTTON_STYLES.card, () => this.goHome(), 0.5));

    // prompt chip, bottom center
    this.chip = this.add.container(w / 2, h - pad - Math.max(30, Math.round(unit * 0.05)));
    hud.add(this.chip);
    this.setChip(this.moved ? null : 'Hold left or right to walk');
  }

  private hudGeometry = { x: 0, cy: 0, dot: 0, gap: 0, iconX: 0 };

  /** Five beacon dots (lit as encounters are won) and the artifact count. */
  private drawCounter(): void {
    const g = this.beaconDots;
    if (!g) return;
    const { x, cy, dot, gap, iconX } = this.hudGeometry;
    const lit = beaconsShown(this.manifest, this.progress);
    g.clear();
    for (let i = 0; i < ENCOUNTER_NODES; i++) {
      const cx = x + i * (dot + gap) + dot / 2;
      g.fillStyle(i < lit ? hexNum(this.manifest.palette.accent) : 0x5b6c82, 1);
      g.fillCircle(cx, cy, dot / 2);
      if (i < lit) {
        g.fillStyle(0xfff2b8, 1);
        g.fillCircle(cx, cy, dot * 0.22);
      }
    }
    starIcon(g, iconX, cy, dot * 0.55);
    this.artifactLabel?.setText(`${artifactsCollected(this.manifest, this.progress)}/${artifactsTotal(this.manifest)}`);
  }

  private setChip(line: string | null): void {
    const chip = this.chip;
    if (!chip) return;
    chip.removeAll(true);
    if (!line) return;
    const unit = Math.min(this.scale.width, this.scale.height);
    const t = text(this, line, EXP_CSS.navy, { weight: 800, size: Math.round(unit * 0.036), align: 'center', wrapWidth: this.scale.width * 0.86 }).setOrigin(0.5);
    const bw = t.width + unit * 0.12;
    const bh = t.height + unit * 0.05;
    const g = this.add.graphics();
    parchmentPanel(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh }, {});
    chip.add([g, t]);
  }

  /** A modal message with buttons (an error, or a retry). Screen coordinates, on top of the world. */
  private showPanel(message: string, buttons: Array<{ id: string; label: string; style: 'primary' | 'card'; run: () => void }>): void {
    this.panel?.destroy(true);
    const { width: w, height: h } = this.scale;
    const unit = Math.min(w, h);
    const c = this.add.container(0, 0).setDepth(100);
    this.panel = c;
    c.add(this.add.rectangle(w / 2, h / 2, w, h, 0x0b2233, 0.5).setInteractive());
    const pw = Math.min(w * 0.88, unit * 1.1);
    const bh = Math.max(52, Math.round(unit * 0.11));
    const ph = Math.round(unit * 0.22 + buttons.length * (bh + 12) + unit * 0.06);
    const box = { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph };
    const g = this.add.graphics();
    parchmentPanel(g, box, {});
    c.add(g);
    const msg = text(this, message, EXP_CSS.navy, { weight: 800, size: Math.round(unit * 0.045), align: 'center', wrapWidth: pw * 0.84 }).setOrigin(0.5, 0);
    msg.setPosition(w / 2, box.y + unit * 0.06);
    c.add(msg);
    buttons.forEach((b, i) => {
      const y = box.y + ph - unit * 0.04 - (buttons.length - i) * (bh + 12) + bh / 2 + 12;
      c.add(new TapButton(this, b.id, w / 2, y, Math.round(pw * 0.8), bh, b.label, b.style === 'primary' ? BUTTON_STYLES.primary : BUTTON_STYLES.card, () => { this.closePanel(); b.run(); }));
    });
    this.keep(c);
    getContext(this).a11y.set(
      message,
      buttons.map((b) => ({ id: b.id, label: b.label, onClick: () => { this.closePanel(); b.run(); } })),
    );
    this.lastPublish = '';
  }

  private closePanel(): void {
    this.panel?.destroy(true);
    this.panel = null;
    this.refreshA11y();
  }

  private refreshA11y(): void {
    const ctx = getContext(this);
    const name = characterName(ctx.character);
    const next = nextNode(this.manifest, this.progress);
    const status =
      this.sessionState === 'starting'
        ? `${this.manifest.name}. Getting the expedition ready.`
        : `${this.manifest.name}. ${name} is on the path. Walk with the arrow keys, or hold the left or right side of the screen. ${beaconsShown(this.manifest, this.progress)} of ${ENCOUNTER_NODES} beacons lit.`;
    const actions: Array<{ id: string; label: string; onClick: () => void }> = [{ id: 'expedition-home', label: 'Back to Basecamp', onClick: () => this.goHome() }];
    if (this.sessionState === 'ready' && next) actions.unshift({ id: 'next-stop', label: 'Go to the next stop', onClick: () => this.walkToNext() });
    ctx.a11y.set(status, actions);
  }

  /** The screen-reader way to travel: stand at the next stop (any stops passed on the way still happen, in order). */
  private walkToNext(): void {
    if (this.busy || this.sessionState !== 'ready' || this.leaving) return;
    const next = nextNode(this.manifest, this.progress);
    if (!next) return;
    this.advanceTo(nodeX(next, this.world));
  }

  // ---------------------------------------------------------------------------
  // Walking and nodes
  // ---------------------------------------------------------------------------

  private advanceTo(x: number): void {
    const prev = this.player.x;
    this.player = { ...this.player, x: Math.min(this.world.maxX, Math.max(this.world.minX, x)), vx: 0, facing: x >= prev ? 1 : -1 };
    this.collectReached(prev);
  }

  private collectReached(prevX: number): void {
    if (this.sessionState !== 'ready') return;
    const radius = Math.round(this.world.unit * 0.05);
    const places = this.manifest.nodes.map((n) => ({ id: n.id, x: nodeX(n, this.world) }));
    for (const id of reachedNodes(prevX, this.player.x, places, this.seen, radius)) {
      const node = this.manifest.nodes.find((n) => n.id === id)!;
      this.seen.add(id);
      this.queue.push(node);
    }
    void this.drain();
  }

  /** Handles queued nodes one at a time (an encounter blocks until it is over). */
  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length > 0 && !this.leaving) {
        const node = this.queue.shift()!;
        await this.handleNode(node);
      }
    } finally {
      this.busy = false;
      if (this.sessionState === 'ready' && !this.leaving && !this.panel) this.walkInput.enabled = true;
      this.lastPublish = '';
    }
  }

  private setMark(node: DestinationNode, m: NodeMark): void {
    this.progress = mark(this.progress, node.id, m);
    this.views.find((v) => v.node.id === node.id)?.apply(m);
    this.drawCounter();
    this.refreshA11y();
  }

  private async handleNode(node: DestinationNode): Promise<void> {
    const ctx = getContext(this);
    if (node.type === 'artifact') {
      this.setMark(node, 'collected');
      this.sparkle(nodeX(node, this.world), this.world.groundY - this.world.unit * 0.16);
      return;
    }
    if (node.type === 'rest') {
      this.setMark(node, 'rested');
      this.say(REST_QUIP);
      return;
    }
    // an encounter or the boss: the walk stops while the overlay runs
    this.walkInput.enabled = false;
    this.walkInput.release();
    const client = this.client;
    if (!client) return;
    let outcome: EncounterOutcome;
    try {
      outcome = await startEncounter(this, {
        session: client,
        questions: questionsFor(node.type),
        kind: node.type === 'boss' ? 'boss' : 'node',
        challenger: this.manifest.challenger.id,
        buddy: ctx.character,
      });
    } catch {
      // the encounter could not run: offer the same node again, or the way home
      this.seen.delete(node.id);
      this.queue = [];
      this.showPanel('Something went wrong with the question.', [
        { id: 'expedition-retry', label: 'Try again', style: 'primary', run: () => { this.seen.add(node.id); this.queue.push(node); void this.drain(); } },
        { id: 'expedition-home', label: 'Back to Basecamp', style: 'card', run: () => this.goHome() },
      ]);
      return;
    }
    this.setMark(node, outcome.won ? 'won' : 'lost');
    if (node.type === 'boss') await this.finish();
  }

  /** The summit is done: the server's results go to the summit card. */
  private async finish(): Promise<void> {
    const ctx = getContext(this);
    let results = null as Awaited<ReturnType<SessionClient['results']>>;
    for (let attempt = 0; attempt < 3 && this.client; attempt++) {
      try {
        results = await this.client.results();
      } catch {
        results = null;
      }
      if (results) break;
      await new Promise<void>((resolve) => this.time.delayedCall(500, () => resolve()));
    }
    if (!this.sys.isActive() || this.leaving) return;
    ctx.activeSessionId = null;
    this.leaving = true;
    this.scene.start('SummitScene', {
      destination: this.manifest.id,
      results,
      artifacts: artifactsCollected(this.manifest, this.progress),
      artifactsTotal: artifactsTotal(this.manifest),
    });
  }

  private sparkle(x: number, y: number): void {
    if (this.reduced || !this.worldRoot) return;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = this.add.circle(x, y, this.world.unit * 0.012, 0xfff2b8, 1);
      this.worldRoot.add(p);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * this.world.unit * 0.09, y: y + Math.sin(a) * this.world.unit * 0.09, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  /** A one-line bubble above the buddy for a few seconds. */
  private say(line: string): void {
    if (!this.buddy || !this.worldRoot) return;
    const unit = this.world.unit;
    const t = text(this, line, EXP_CSS.navy, { weight: 800, size: Math.round(unit * 0.036), align: 'center', wrapWidth: this.scale.width * 0.7 }).setOrigin(0.5, 1);
    const bw = t.width + unit * 0.06;
    const bh = t.height + unit * 0.03;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-bw / 2, -bh, bw, bh, 14);
    g.lineStyle(2, EXP.parchmentEdge, 1);
    g.strokeRoundedRect(-bw / 2, -bh, bw, bh, 14);
    t.setPosition(0, -unit * 0.012);
    const bubble = this.add.container(this.buddy.x, this.buddy.y - this.buddy.bodyH - unit * 0.03, [g, t]).setDepth(11);
    this.worldRoot.add(bubble);
    this.time.delayedCall(3500, () => bubble.destroy());
    getContext(this).a11y.set(line, [{ id: 'expedition-home', label: 'Back to Basecamp', onClick: () => this.goHome() }]);
    this.time.delayedCall(3600, () => this.refreshA11y());
  }

  override update(_time: number, delta: number): void {
    if (!this.ready || !this.buddy || this.leaving) return;
    const w = this.scale.width;
    const prevX = this.player.x;
    const dir = this.walkInput.direction(w);
    this.player = stepPlayer(this.player, dir, delta, this.world);
    const top = this.world.unit * 0.62;
    const speed = Math.min(1, Math.abs(this.player.vx) / top);
    if (speed > 0.08 && !this.moved) {
      this.moved = true;
      this.time.delayedCall(2200, () => this.setChip(null));
    }
    this.camX = easeCamera(this.camX, cameraTargetScroll(this.player.x, this.player.facing, w, this.world.width), delta);
    this.placeWorld();
    this.buddy.setX(this.player.x);
    this.buddy.face(this.player.facing);
    if (this.buddy.puppet(delta, speed, this.player.facing, this.reduced)) {
      spawnDust(this, this.world.unit, this.player.x, this.buddy.y, this.player.facing, this.worldRoot ? { parent: this.worldRoot } : {});
    }
    if (this.player.x !== prevX) this.collectReached(prevX);
    this.publish(false);
  }

  private publish(force: boolean): void {
    const ctx = getContext(this);
    const key = `${Math.round(this.player.x / 8)}|${Math.round(this.camX / 8)}|${this.busy}|${this.sessionState}|${JSON.stringify(this.progress.marks)}|${this.world.width}`;
    if (!force && key === this.lastPublish) return;
    this.lastPublish = key;
    const targets: HitTarget[] = [];
    publishSurface(ctx.parent, 'expedition', targets, {
      destination: this.manifest.id,
      session: this.sessionState,
      'player-x': String(Math.round(this.player.x)),
      'camera-x': String(Math.round(this.camX)),
      'world-w': String(this.world.width),
      busy: String(this.busy),
      beacons: String(beaconsShown(this.manifest, this.progress)),
      artifacts: String(artifactsCollected(this.manifest, this.progress)),
      'artifacts-total': String(artifactsTotal(this.manifest)),
      marks: JSON.stringify(this.progress.marks),
      nodes: JSON.stringify(this.manifest.nodes.map((n) => ({ id: n.id, type: n.type, x: nodeX(n, this.world) }))),
      layers: String(this.parallax.count),
      backdrop: 'gradient',
    });
  }
}
