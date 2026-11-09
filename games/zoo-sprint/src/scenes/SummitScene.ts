import Phaser from 'phaser';
import { destinationById } from '../basecamp/destinations';
import { getContext } from '../context';
import { ENCOUNTER_NODES, STAMP_BEACONS, summitFacts, type DestinationManifest } from '../presentation/destination-model';
import { bakeLayer } from '../presentation/layer-bake';
import { prefersReducedMotion } from '../presentation/motion';
import { parchmentPanel } from '../presentation/surfaces';
import { EXP, EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/**
 * SummitScene (B4): the existing results data presented as a card for one expedition. The beacons
 * lit and the passport stamp come ONLY from the server's session results (`beaconsLit`,
 * `stampEarned`); the client never counts them. Until the server sends those fields no beacons row
 * and no stamp are shown. Artifacts are the walk's own display (nothing is awarded for them here).
 *
 * PRESENTATION ONLY: XP, coins and the stamp are shown, never decided.
 */
export interface SummitEntry {
  destination: string;
  /** The server's results for the finished session, or null when they could not be fetched. */
  results: unknown;
  artifacts: number;
  artifactsTotal: number;
}

const hexNum = (h: string): number => parseInt(h.slice(1), 16);

export class SummitScene extends Phaser.Scene {
  private entry!: SummitEntry;
  private manifest: DestinationManifest | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private textureKeys: string[] = [];
  private leaving = false;

  constructor() {
    super('SummitScene');
  }

  init(data: SummitEntry): void {
    this.entry = data;
    this.manifest = data?.destination ? destinationById(data.destination) : null;
    this.objs = [];
    this.textureKeys = [];
    this.leaving = false;
  }

  create(): void {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
      for (const key of this.textureKeys) if (this.textures.exists(key)) this.textures.remove(key);
    });
  }

  private goBasecamp(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('BasecampScene', { from: 'trailhead' });
  }

  private again(): void {
    if (this.leaving || !this.manifest) return;
    this.leaving = true;
    this.scene.start('ExpeditionScene', { destination: this.manifest.id });
  }

  private build(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    const { width: w, height: h } = this.scale;
    const unit = Math.min(w, h);
    const m = this.manifest;
    const facts = summitFacts(this.entry.results);
    const ctx = getContext(this);
    const reduced = prefersReducedMotion();
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };

    // --- the destination's far layer as the backdrop (gradient fallback; painted art later) ---
    this.cameras.main.setBackgroundColor(m ? hexNum(m.palette.colors[3] ?? '#f3d9a8') : EXP.skyLow);
    if (m) {
      const far = m.layers[0]!;
      const key = bakeLayer(this, `summit-${m.id}-far`, far, h);
      if (!this.textureKeys.includes(key)) this.textureKeys.push(key);
      keep(this.add.tileSprite(0, 0, w, h, key).setOrigin(0, 0).setDepth(0));
      const mid = bakeLayer(this, `summit-${m.id}-mid`, m.layers[1]!, h);
      if (!this.textureKeys.includes(mid)) this.textureKeys.push(mid);
      keep(this.add.tileSprite(0, 0, w, h, mid).setOrigin(0, 0).setDepth(1));
    }

    // --- the card ---
    const cw = Math.min(w * 0.92, unit * 1.15);
    const bh = Math.max(52, Math.round(unit * 0.11));
    const ch = Math.min(h * 0.92, Math.max(unit * 1.0, bh * 2 + unit * 0.9));
    const box = { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
    const g = keep(this.add.graphics().setDepth(5));
    parchmentPanel(g, box, {});
    let y = box.y + ch * 0.05;
    const title = keep(text(this, m ? m.name : 'Summit', EXP_CSS.navy, { weight: 800, size: Math.round(Math.min(ch * 0.065, cw * 0.06)), align: 'center', wrapWidth: cw * 0.86 }).setOrigin(0.5, 0).setDepth(6));
    title.setPosition(w / 2, y);
    y += title.height + ch * 0.02;

    // beacons lit: the server's count, or nothing when the server did not report it
    const beaconSize = Math.round(Math.min(cw * 0.1, ch * 0.075));
    if (facts?.beaconsLit != null) {
      const bg = keep(this.add.graphics().setDepth(6));
      const gap = beaconSize * 0.4;
      const rowW = ENCOUNTER_NODES * beaconSize + (ENCOUNTER_NODES - 1) * gap;
      for (let i = 0; i < ENCOUNTER_NODES; i++) {
        const cx = w / 2 - rowW / 2 + i * (beaconSize + gap) + beaconSize / 2;
        const lit = i < facts.beaconsLit;
        bg.fillStyle(lit ? hexNum(m?.palette.accent ?? '#d9822b') : 0xb5ad92, 1);
        bg.fillCircle(cx, y + beaconSize / 2, beaconSize / 2);
        if (lit) {
          bg.fillStyle(0xfff2b8, 1);
          bg.fillCircle(cx, y + beaconSize / 2, beaconSize * 0.2);
        }
      }
      y += beaconSize + ch * 0.01;
      const count = keep(text(this, `${facts.beaconsLit} of ${ENCOUNTER_NODES} beacons lit`, EXP_CSS.navy, { weight: 800, size: Math.round(Math.min(ch * 0.045, cw * 0.045)) }).setOrigin(0.5, 0).setDepth(6));
      count.setPosition(w / 2, y);
      y += count.height + ch * 0.02;
    }

    // the stamp: only when the server says it was earned
    const stampR = Math.round(Math.min(cw * 0.13, ch * 0.11));
    if (facts?.stampEarned) {
      const stamp = keep(this.add.container(w / 2, y + stampR, []).setDepth(7));
      const sg = this.add.graphics();
      const accent = hexNum(m?.palette.accent ?? '#d9822b');
      sg.lineStyle(Math.max(4, stampR * 0.1), accent, 1);
      sg.strokeCircle(0, 0, stampR);
      sg.lineStyle(2, accent, 1);
      sg.strokeCircle(0, 0, stampR * 0.8);
      sg.fillStyle(accent, 1);
      sg.fillTriangle(0, -stampR * 0.5, stampR * 0.5, stampR * 0.3, -stampR * 0.5, stampR * 0.3);
      sg.fillTriangle(0, stampR * 0.5, stampR * 0.5, -stampR * 0.3, -stampR * 0.5, -stampR * 0.3);
      stamp.add(sg);
      if (reduced) stamp.setAngle(-8);
      else {
        // the stamp lands: big, then pressed down with a little turn
        stamp.setScale(2.4).setAlpha(0).setAngle(-24);
        this.tweens.add({ targets: stamp, scale: 1, alpha: 1, angle: -8, duration: 380, delay: 250, ease: 'Back.easeIn' });
      }
      y += stampR * 2 + ch * 0.02;
    }

    // XP, coins, answers
    const lines: Array<{ value: string; color: string; scale: number }> = [];
    if (facts) {
      lines.push({ value: `${facts.correct} of ${facts.total} correct`, color: EXP_CSS.navy, scale: 1.1 });
      lines.push({ value: `+${facts.xpEarned} XP    +${facts.coinsEarned} coins`, color: EXP_CSS.orangeDeep, scale: 1.1 });
    } else {
      lines.push({ value: 'Your results are not ready yet.', color: EXP_CSS.muted, scale: 1 });
    }
    if (this.entry.artifactsTotal > 0) lines.push({ value: `${this.entry.artifacts} of ${this.entry.artifactsTotal} artifacts found`, color: EXP_CSS.muted, scale: 0.95 });
    const base = Math.round(Math.min(ch * 0.05, cw * 0.05));
    for (const l of lines) {
      const t = keep(text(this, l.value, l.color, { weight: 800, size: Math.round(base * l.scale), align: 'center', wrapWidth: cw * 0.86 }).setOrigin(0.5, 0).setDepth(6));
      t.setPosition(w / 2, y);
      y += t.height + ch * 0.012;
    }

    // buttons: Back to Basecamp, Again
    const by = box.y + box.h - bh / 2 - ch * 0.05;
    const bw = Math.round(cw * 0.42);
    const back = keep(new TapButton(this, 'summit-basecamp', box.x + cw * 0.27, by, bw, bh, 'Basecamp', BUTTON_STYLES.card, () => this.goBasecamp()).setDepth(8));
    const targets: HitTarget[] = [back.hitTarget()];
    const actions = [{ id: 'summit-basecamp', label: 'Back to Basecamp', onClick: () => this.goBasecamp() }];
    if (m) {
      const again = keep(new TapButton(this, 'summit-again', box.x + cw * 0.73, by, bw, bh, 'Again', BUTTON_STYLES.primary, () => this.again()).setDepth(8));
      targets.push(again.hitTarget());
      actions.push({ id: 'summit-again', label: `Walk ${m.name} again`, onClick: () => this.again() });
    }

    const stampLine = facts?.stampEarned ? ` You earned a passport stamp (${STAMP_BEACONS} or more beacons).` : '';
    ctx.a11y.set(
      `${m ? m.name : 'Summit'}.${facts ? ` ${facts.correct} of ${facts.total} correct. ${facts.xpEarned} XP and ${facts.coinsEarned} coins.` : ' Results are not ready yet.'}${facts?.beaconsLit != null ? ` ${facts.beaconsLit} of ${ENCOUNTER_NODES} beacons lit.` : ''}${stampLine}`,
      actions,
    );
    publishSurface(ctx.parent, 'summit', targets, {
      destination: m?.id ?? '',
      beacons: facts?.beaconsLit != null ? String(facts.beaconsLit) : '',
      stamp: String(!!facts?.stampEarned),
      xp: String(facts?.xpEarned ?? 0),
      coins: String(facts?.coinsEarned ?? 0),
      artifacts: String(this.entry.artifacts),
    });
  }
}
