import Phaser from 'phaser';
import type { Character } from '../characters';
import { HOST_DEFINITION } from '../character-definitions';
import { getContext } from '../context';
import { bakeEnvironment } from '../presentation/environment';
import { buildGuideChip, buildHeroStage, buildMedallion } from '../presentation/hero-stage';
import { selectLayout } from '../presentation/layout';
import { GUIDE_LINE } from '../presentation/traits';
import { STARTERS, characterName, saveCharacter, type CharacterId } from '../roster';
import { EXP, EXP_CSS } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/** How long the celebration after "Choose [Name]" plays before the run starts. */
const CELEBRATION_MS = 1000;

/**
 * "Choose Your Buddy". One large hero card shows the highlighted buddy (default Dino) with its role
 * and three traits; five round medallions browse the starters; Click, the host, speaks from the
 * side and is NOT selectable; a full-width "Choose [Name]" button confirms, celebrates for about a
 * second, then starts the run.
 *
 * Which buddy is chosen is presentation only: it is saved locally as before, never sent to the
 * API, and never changes questions, grading, mastery, XP or coins. Nothing here touches the server.
 */
export class MenuScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private hero: Character | null = null;
  private justSelected: CharacterId | null = null;
  private starting = false;
  private startTarget: HitTarget | null = null;
  private pickTargets: HitTarget[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.starting = false;
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
    });
  }

  /** Highlights a buddy (a tap on a medallion). It is saved as before; the run does not start yet. */
  private select(id: CharacterId): void {
    if (this.starting) return;
    const ctx = getContext(this);
    ctx.character = id;
    saveCharacter(id);
    this.justSelected = id;
    this.render();
  }

  /** "Choose [Name]": a short celebration, then the run. */
  private start(): void {
    if (this.starting) return;
    this.starting = true;
    const hero = this.hero;
    if (hero?.active) {
      hero.setExpression('cheer');
      hero.celebrate('cheer', 'cheer');
      this.pulseRing();
    }
    this.time.delayedCall(CELEBRATION_MS, () => this.scene.start('RunScene'));
  }

  /** One soft ring that grows and fades behind the buddy while it celebrates. */
  private pulseRing(): void {
    const rect = this.hero?.worldRect();
    if (!rect) return;
    const ring = this.add.graphics();
    ring.lineStyle(8, EXP.orange, 0.9);
    ring.strokeCircle(0, 0, Math.max(40, rect.w * 0.3));
    ring.setPosition(rect.x + rect.w / 2, rect.y + rect.h * 0.45);
    ring.setScale(0.5);
    this.layer.add(ring);
    this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: CELEBRATION_MS - 100, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  // ---------------------------------------------------------------------------
  // Layout and drawing (rebuilt from state on every change and every resize)
  // ---------------------------------------------------------------------------

  private render(): void {
    const ctx = getContext(this);
    this.layer.removeAll(true);
    const { width: w, height: h } = this.scale;
    const layout = selectLayout(w, h);
    const id = ctx.character;
    const name = characterName(id);

    // calm, cool backdrop for the whole screen (the warm scene lives inside the hero card)
    const bgKey = bakeEnvironment(this, 'select-page', 'trail', w, h);
    this.layer.add(this.add.image(0, 0, bgKey).setOrigin(0, 0));
    const veil = this.add.graphics();
    veil.fillStyle(0x0d2d4a, 0.34);
    veil.fillRect(0, 0, w, h);
    this.layer.add(veil);

    // title
    const title = text(this, 'Choose Your Buddy', '#ffffff', {
      weight: 800,
      size: layout.titleSize,
      stroke: EXP_CSS.navy,
      strokeWidth: Math.max(5, Math.round(layout.titleSize * 0.2)),
    }).setOrigin(0.5);
    title.setPosition(layout.title.x + layout.title.w / 2, layout.title.y + layout.title.h / 2);
    title.setShadow(0, Math.max(3, layout.titleSize * 0.08), '#08203a', 4, false, true);
    this.layer.add(title);

    // Click: host and guide, never selectable (no hit target below belongs to it)
    this.layer.add(buildGuideChip(this, HOST_DEFINITION.id, layout.guide, layout.guideAvatar, GUIDE_LINE));

    // the hero card
    const stage = buildHeroStage(this, {
      stage: layout.stage,
      charBox: layout.charBox,
      plaque: layout.plaque,
      nameSize: layout.nameSize,
      roleSize: layout.roleSize,
      chipH: layout.chipH,
      chipSize: layout.chipSize,
      id,
    });
    this.hero = stage.hero;
    this.layer.add(stage.container);

    // five medallions
    const pickTargets: HitTarget[] = [];
    STARTERS.forEach((starter, index) => {
      const slot = layout.medallions[index];
      if (!slot) return;
      const selected = starter.id === id;
      const d = selected ? slot.d * 1.1 : slot.d;
      const medallion = buildMedallion(this, { id: starter.id, cx: slot.cx, cy: slot.cy, d, selected });
      this.layer.add(medallion.container);
      const hit = slot.d + 10;
      const zone = this.add.zone(slot.cx, slot.cy, hit, hit).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.select(starter.id));
      this.layer.add(zone);
      pickTargets.push({ id: `character-${starter.id}`, label: starter.name, x: slot.cx - hit / 2, y: slot.cy - hit / 2, w: hit, h: hit });
    });
    this.pickTargets = pickTargets;

    // the CTA
    const label = ctx.activeSessionId ? `Continue with ${name}` : `Choose ${name}`;
    const cta = new TapButton(
      this,
      'start-run',
      layout.cta.x + layout.cta.w / 2,
      layout.cta.y + layout.cta.h / 2,
      layout.cta.w,
      layout.cta.h,
      label,
      BUTTON_STYLES.primary,
      () => this.start(),
      0.42,
    );
    this.layer.add(cta);
    this.startTarget = cta.hitTarget();

    // a medallion tap hops the highlighted buddy once, exactly like the old card tap
    if (this.justSelected === id && this.hero.active) this.hero.celebrate();
    this.justSelected = null;

    this.publish(layout, stage.fit);

    ctx.a11y.set(
      `BidaZoo. Choose your buddy. ${name} selected. XP ${ctx.totals.xp}, coins ${ctx.totals.coins}.`,
      [
        ...STARTERS.map((starter) => ({ id: `character-${starter.id}`, label: starter.name, onClick: () => this.select(starter.id) })),
        { id: 'start-run', label, onClick: () => this.start() },
      ],
    );
  }

  /** Where every tap target is right now, for tests, debugging, and the page's data attributes. */
  private publish(layout: ReturnType<typeof selectLayout>, fit: { scale: number; upscale: number } | null): void {
    const ctx = getContext(this);
    const targets: HitTarget[] = [...this.pickTargets];
    if (this.startTarget) targets.push(this.startTarget);
    const rect = this.hero?.worldRect();
    publishSurface(ctx.parent, 'menu', targets, {
      character: ctx.character,
      // Nothing scrolls any more; kept so older tooling that reads it still sees "no scroll".
      scroll: '0/0',
      layout: `${layout.frame.composition}/${layout.frame.form}`,
      guide: HOST_DEFINITION.id,
      'hero-rect': rect ? JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }) : '',
      'hero-stage': JSON.stringify({ x: Math.round(layout.stage.x), y: Math.round(layout.stage.y), w: Math.round(layout.stage.w), h: Math.round(layout.stage.h) }),
      'hero-upscale': fit ? fit.upscale.toFixed(2) : '',
    });
  }
}
